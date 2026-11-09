"""Reviewed online stock receipts/withdrawals without altering legacy launch routes."""
from datetime import date
from decimal import Decimal

from django.core import signing
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import ItemEstoque, LoteEstoque, MovimentacaoEstoque
from .services import StockCountConflict

SALT = "inventory.stock-launch.v1"
MAX_BALANCE = Decimal("99999999.99")
MAX_PAYABLE = Decimal("99999999999999.99")


def authorize(user):
    if user.role not in ("admin", "manager") or not user.organization_id or getattr(user, "force_password_change", False):
        raise PermissionDenied()


def canonical(values):
    def scalar(v):
        if hasattr(v, "pk"):
            return str(v.pk)
        if isinstance(v, date):
            return v.isoformat()
        if isinstance(v, Decimal):
            return str(v)
        return v
    return {key: scalar(value) for key, value in values.items()}


def evaluate(user, values, *, lock=False):
    authorize(user)
    items = ItemEstoque.objects.filter(organization=user.organization)
    if lock:
        items = items.select_for_update()
    item = items.filter(pk=values["item"].pk).first()
    if item is None:
        raise StockCountConflict(_("O produto mudou ou não está mais disponível."))
    if not item.ativo:
        raise ValidationError({"item": _("O produto não está ativo.")})
    if item.unidade_medida != values["unidade_esperada"]:
        raise StockCountConflict(_("A unidade mudou. Reabra o formulário antes de lançar."))
    kind, qty = values["tipo"], values["quantidade"]
    today = timezone.localdate()
    lot = None
    if values.get("lote"):
        lots = LoteEstoque.objects.filter(item=item)
        if lock:
            lots = lots.select_for_update()
        lot = lots.filter(pk=values["lote"].pk).first()
        if lot is None:
            raise StockCountConflict(_("O lote mudou ou não está mais disponível."))
        if not lot.ativo or lot.data_entrada > today or (lot.data_validade and lot.data_validade < today):
            raise ValidationError({"lote": _("Selecione um lote ativo, recebido e dentro da validade. Baixas especiais continuam no fluxo próprio.")})
    else:
        if LoteEstoque.objects.filter(item=item, numero_lote=values["numero_lote"]).exists():
            raise ValidationError({"numero_lote": _("O número já existe neste produto. Selecione o lote existente ou informe outro número.")})
        if values["data_entrada"] > today or (values.get("data_fabricacao") and values["data_fabricacao"] > values["data_entrada"]):
            raise ValidationError({"data_entrada": _("Confira as datas de recebimento e fabricação.")})
        if values.get("data_validade") and (values["data_validade"] < values["data_entrada"] or values["data_validade"] < today):
            raise ValidationError({"data_validade": _("Recebimentos pelo app exigem validade não anterior à entrada e ao dia atual.")})
    before = lot.quantidade_atual if lot else Decimal("0")
    if kind == "saida" and qty > before:
        raise ValidationError({"quantidade": _("A quantidade excede o saldo do lote.")})
    after = before - qty if kind == "saida" else before + qty
    item_balance = item.lotes.filter(ativo=True).aggregate(total=Sum("quantidade_atual"))["total"] or Decimal("0")
    if kind != "saida" and item_balance + qty > MAX_BALANCE:
        raise ValidationError({"quantidade": _("O saldo total do produto excede a precisão permitida.")})
    if after > MAX_BALANCE:
        raise ValidationError({"quantidade": _("O saldo resultante excede a precisão permitida.")})
    farm, supplier = values.get("farm"), values.get("fornecedor")
    if farm:
        farm.refresh_from_db()
        if farm.organization_id != user.organization_id or not farm.is_active:
            raise ValidationError({"farm": _("A fazenda não está ativa ou não pertence à organização.")})
    if supplier:
        supplier.refresh_from_db()
        if supplier.organization_id != user.organization_id or not supplier.ativo:
            raise ValidationError({"fornecedor": _("O fornecedor não está ativo ou não pertence à organização.")})
    amount = None
    if kind == "compra":
        amount = (qty * values["custo_unitario"]).quantize(Decimal("0.01"))
        if amount < Decimal("0.01") or amount > MAX_PAYABLE:
            raise ValidationError({"custo_unitario": _("O total da compra está fora da precisão financeira permitida.")})
    snapshot = {"item": str(item.pk), "item_nome": item.nome, "item_updated_at": item.updated_at.isoformat(), "unidade": item.unidade_medida,
                "lote": str(lot.pk) if lot else None, "numero_lote": lot.numero_lote if lot else values["numero_lote"], "lote_updated_at": lot.updated_at.isoformat() if lot else None,
                "tipo": kind, "quantidade": str(qty), "saldo_anterior": str(before), "saldo_posterior": str(after),
                "farm": str(farm.pk) if farm else None, "farm_nome": farm.name if farm else None,
                "fornecedor": str(supplier.pk) if supplier else None, "fornecedor_nome": supplier.nome if supplier else None,
                "total_pendente": str(amount) if amount is not None else None}
    return snapshot, item, lot


def preview(user, values):
    snapshot, _, _ = evaluate(user, values)
    token = signing.dumps({"actor": str(user.pk), "org": str(user.organization_id), "command": canonical(values), "snapshot": snapshot}, salt=SALT, compress=True)
    return {**snapshot, "command": canonical(values), "preview_token": token}


def decode(user, token):
    authorize(user)
    try:
        intent = signing.loads(token, salt=SALT, max_age=900)
    except signing.BadSignature:
        raise StockCountConflict(_("A revisão expirou ou é inválida. Confira os dados novamente."))
    if intent.get("actor") != str(user.pk) or intent.get("org") != str(user.organization_id):
        raise PermissionDenied()
    return intent


@transaction.atomic
def confirm(user, intent, values):
    try:
        snapshot, item, lot = evaluate(user, values, lock=True)
    except ValidationError as error:
        # This command was valid when signed; failed eligibility now invalidates its review.
        raise StockCountConflict(_("Os dados mudaram após a revisão. Confira novamente antes de confirmar.")) from error
    if snapshot != intent["snapshot"] or canonical(values) != intent["command"]:
        raise StockCountConflict(_("Os dados mudaram após a revisão. Confira novamente antes de confirmar."))
    if lot is None:
        lot = LoteEstoque(item=item, numero_lote=values["numero_lote"], data_entrada=values["data_entrada"],
                          data_fabricacao=values.get("data_fabricacao"), data_validade=values.get("data_validade"),
                          quantidade_inicial=values["quantidade"], quantidade_atual=Decimal("0"),
                          custo_unitario=values.get("custo_unitario"), local_armazenamento=values.get("local_armazenamento", ""),
                          fornecedor=values.get("fornecedor"), nota_fiscal=values.get("nota_fiscal", ""))
        lot._skip_finance_transaction = True
        lot.save()
    note = values["motivo"] + ("\n" + values["observacao"] if values.get("observacao") else "")
    movement = MovimentacaoEstoque.objects.create(item=item, lote=lot, tipo=values["tipo"], quantidade=values["quantidade"],
                                                 farm=values.get("farm"), responsavel=user, destino=values.get("destino", ""), observacao=note)
    lot.quantidade_atual = Decimal(snapshot["saldo_posterior"])
    lot.save(update_fields=["quantidade_atual", "updated_at"])
    payable = None
    if values["tipo"] == "compra":
        from apps.finance.services import record_stock_purchase
        payable = record_stock_purchase(movement, user, due_date=values["purchase_due_date"], paid=False)
    return {"id": str(movement.pk), "lote": str(lot.pk), "payable": str(payable.pk) if payable else None}
