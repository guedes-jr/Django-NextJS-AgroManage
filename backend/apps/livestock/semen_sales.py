"""Sales of doses from a swine semen collection."""
import json
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import OrganizationRolePermission

from apps.finance.models import FinancialCategory, Transaction
from apps.inventory.models import ItemEstoque, LoteEstoque
from apps.inventory.services import registrar_movimentacao

from .models import SemenCollection


PREFIX = "SALE-SEMEN-"


def sale_metadata(title):
    try:
        data = json.loads(title.notes or "{}")
    except (TypeError, ValueError):
        return None
    if isinstance(data, dict) and isinstance(data.get("receipt"), dict):
        return data
    return None


class SaleConflict(APIException):
    status_code = 409
    default_detail = "A venda ou o saldo do lote mudou. Atualize e revise os dados."


class SaleInput(serializers.Serializer):
    request_key = serializers.UUIDField()
    collection = serializers.UUIDField()
    expected_balance = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=99999999)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    buyer = serializers.CharField(max_length=100)
    date = serializers.DateField()
    due_date = serializers.DateField()


def eligible(organization, today):
    return SemenCollection.objects.filter(
        farm__organization=organization, animal__species__code="suinos", animal__farm__organization=organization,
        stock_lot__item__organization=organization, stock_lot__item__ativo=True,
        stock_lot__item__categoria="semen", stock_lot__item__unidade_medida="dose",
        stock_lot__ativo=True, stock_lot__data_entrada__lte=today, stock_lot__quantidade_atual__gte=1,
    ).exclude(stock_lot__data_validade__lt=today)


@transaction.atomic
def sell(user, command):
    org = user.organization
    reference = PREFIX + str(command["request_key"])
    snapshot = {key: str(value) for key, value in command.items()}
    # Serialize keys across lots, so a retry or a concurrent submission cannot post twice.
    type(org).objects.select_for_update(no_key=True).only("id").get(pk=org.pk)
    existing = Transaction.all_objects.filter(organization=org, reference=reference).first()
    if existing:
        metadata = sale_metadata(existing)
        if not metadata or metadata.get("command") != snapshot:
            raise SaleConflict()
        return metadata["receipt"], False

    today = timezone.localdate()
    collection = eligible(org, today).select_related("animal", "farm", "stock_lot").filter(pk=command["collection"]).first()
    if collection is None:
        raise NotFound()
    item = ItemEstoque.objects.select_for_update().get(pk=collection.stock_lot.item_id, organization=org)
    lot = LoteEstoque.objects.select_for_update().get(pk=collection.stock_lot_id, item=item)
    if not eligible(org, today).filter(pk=collection.pk, stock_lot=lot).exists():
        raise SaleConflict()
    if int(lot.quantidade_atual) != command["expected_balance"] or command["quantity"] > lot.quantidade_atual:
        raise SaleConflict()
    if not collection.collection_date <= command["date"] <= today or command["due_date"] < command["date"]:
        raise ValidationError({"date": "Confira a data da coleta, da venda e do vencimento."})

    amount = command["quantity"] * command["price"]
    if amount > Decimal("99999999999999.99"):
        raise ValidationError({"price": "O total da venda excede o limite permitido."})
    category, _ = FinancialCategory.objects.get_or_create(
        organization=org, name="Venda de Doses de Sêmen", category_type="revenue",
    )
    registrar_movimentacao(item, lote=lot, tipo="venda", quantidade=command["quantity"], responsavel=user,
                           destino=command["buyer"], farm=collection.farm, observacao=reference)
    receipt = {
        "reference": reference, "collection": str(collection.pk), "lot": lot.numero_lote,
        "breeder": collection.animal.identifier, "quantity": command["quantity"],
        "buyer": command["buyer"], "date": command["date"].isoformat(), "due_date": command["due_date"].isoformat(),
        "amount": format(amount, ".2f"), "remaining": int(lot.quantidade_atual),
    }
    Transaction.objects.create(
        organization=org, farm=collection.farm, species=collection.animal.species, segmento="suinos", category=category,
        description=f"Venda de doses de sêmen: {lot.numero_lote} · {command['buyer']}",
        amount=amount, due_date=command["due_date"], status=Transaction.Status.PENDING,
        reference=reference, notes=json.dumps({"command": snapshot, "receipt": receipt}), created_by=user,
    )
    return receipt, True


class SemenSalesView(APIView):
    permission_classes = [OrganizationRolePermission]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.user.role not in ("admin", "manager"):
            raise PermissionDenied()

    def get(self, request):
        org = request.user.organization
        today = timezone.localdate()
        lots = eligible(org, today).select_related("animal", "stock_lot", "farm")
        sales = Transaction.objects.filter(organization=org, reference__startswith=PREFIX).order_by("-created_at")[:100]
        return Response({
            "today": today,
            "lots": [{
                "collection": str(row.pk), "lot": row.stock_lot.numero_lote, "breeder": row.animal.identifier,
                "farm": row.farm.name, "balance": int(row.stock_lot.quantidade_atual), "date": row.collection_date,
            } for row in lots],
            "sales": [metadata["receipt"] | {"status": row.status} for row in sales if (metadata := sale_metadata(row))],
        })

    def post(self, request):
        values = SaleInput(data=request.data)
        values.is_valid(raise_exception=True)
        receipt, created = sell(request.user, values.validated_data)
        return Response(receipt, status=201 if created else 200)
