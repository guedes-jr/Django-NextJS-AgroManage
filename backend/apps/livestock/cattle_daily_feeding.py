"""Daily cattle feeding uses existing batches, feed formulas and consumption records."""
from decimal import Decimal
from django.db.models import Prefetch
from django.utils import timezone
from apps.inventory.models import ConsumoRacao, FormulaRacao, ItemEstoque
from .models import AnimalBatch, CattleGrazing


def daily_feeding(organization):
    today = timezone.localdate()
    batches = AnimalBatch.objects.filter(farm__organization=organization, species__code="bovinos", status="active", quantity__gt=0, entry_date__lte=today).select_related("farm").prefetch_related(
        Prefetch("grazings", queryset=CattleGrazing.objects.filter(exit_date__isnull=True).select_related("pasture"), to_attr="today_grazings"),
        Prefetch("consumos", queryset=ConsumoRacao.objects.filter(organization=organization, data_inicio=today, data_fim=today).select_related("usuario", "item_estoque"), to_attr="today_feeds"),
    ).order_by("farm__name", "batch_code", "id")
    rows = []
    for batch in batches:
        rows.append({"id": str(batch.pk), "batch_code": batch.batch_code, "farm": str(batch.farm_id), "farm_name": batch.farm.name, "head_count": batch.quantity,
            "pasture": ", ".join(row.pasture.name for row in batch.today_grazings) or None,
            "supplied_kg": sum((row.quantidade for row in batch.today_feeds), Decimal(0)),
            "deliveries": [{"id": str(row.pk), "quantity_kg": row.quantidade, "item_name": row.item_estoque.nome,
                            "recorded_by": row.usuario.full_name if row.usuario else "", "created_at": row.created_at, "notes": row.observacao} for row in batch.today_feeds]})
    formulas = list(FormulaRacao.objects.filter(organization=organization, ativa=True, especie_animal__in=["", "bovino", "multiplo"]).order_by("nome").values("id", "nome", "item_final_id"))
    products = list(ItemEstoque.objects.filter(organization=organization, ativo=True, categoria__in=["racao", "suplemento", "nucleo"], unidade_medida="kg", especie_animal__in=["", "bovino", "multiplo"]).order_by("nome").values("id", "nome"))
    return {"date": today, "results": rows, "formulas": formulas, "products": products}


def mobile_daily_feeding(request):
    """Paged, cost-free mobile projection; legacy GET stays unchanged."""
    from django.conf import settings
    from django.db.models import Q, Sum, Value, DecimalField
    from django.db.models.functions import Coalesce
    from rest_framework import serializers
    from common.pagination import StandardResultsPagination
    from .cattle_improvements import filter_purpose

    class Query(serializers.Serializer):
        resource = serializers.ChoiceField(choices=['batches', 'products', 'formulas', 'deliveries'], default='batches')
        production = serializers.ChoiceField(choices=['beef', 'dairy'])
        farm = serializers.UUIDField(required=False)
        batch = serializers.UUIDField(required=False)
        search = serializers.CharField(max_length=100, allow_blank=True, default='')

    params = Query(data=request.query_params)
    params.is_valid(raise_exception=True)
    value = params.validated_data
    org, today = request.user.organization, timezone.localdate()
    batches = filter_purpose(AnimalBatch.objects.filter(farm__organization=org, species__code='bovinos', status='active', quantity__gt=0, entry_date__lte=today), value['production'])
    if value.get('farm'):
        batches = batches.filter(farm_id=value['farm'])
    if value.get('batch'):
        batches = batches.filter(pk=value['batch'])
    kind = value['resource']
    if kind == 'batches':
        qs = batches.select_related('farm').filter(Q(batch_code__icontains=value['search']) | Q(name__icontains=value['search']) | Q(farm__name__icontains=value['search'])).annotate(
            supplied=Coalesce(Sum('consumos__quantidade', filter=Q(consumos__data_inicio=today, consumos__data_fim=today, consumos__organization=org)), Value(Decimal('0')), output_field=DecimalField(max_digits=18, decimal_places=2)),
        ).order_by('farm__name', 'batch_code', 'id')
        def row(obj):
            return {'id': str(obj.pk), 'batch_code': obj.batch_code, 'name': obj.name or '', 'farm': str(obj.farm_id), 'farm_name': obj.farm.name,
                    'production': obj.cattle_purpose, 'head_count': obj.quantity, 'supplied_kg': str(obj.supplied)}
    elif kind == 'deliveries':
        if not value.get('batch'):
            raise serializers.ValidationError({'batch': 'Selecione o lote.'})
        qs = ConsumoRacao.objects.filter(organization=org, lote_animal__in=batches, data_inicio=today, data_fim=today).select_related('usuario', 'item_estoque').order_by('-created_at', '-id')
        def row(obj):
            return {'id': str(obj.pk), 'batch': str(obj.lote_animal_id), 'quantity_kg': str(obj.quantidade), 'item': str(obj.item_estoque_id),
                    'item_name': obj.item_estoque.nome, 'recorded_by': obj.usuario.full_name if obj.usuario_id else '', 'created_at': obj.created_at.isoformat(), 'notes': obj.observacao}
    else:
        eligible = ItemEstoque.objects.filter(organization=org, ativo=True, categoria__in=['racao','suplemento','nucleo'], unidade_medida='kg', especie_animal__in=['','bovino','multiplo'])
        if kind == 'products':
            qs = eligible.filter(nome__icontains=value['search']).order_by('nome','id')
            def row(obj):
                return {'id': str(obj.pk), 'name': obj.nome, 'unit': obj.unidade_medida}
        else:
            qs = FormulaRacao.objects.filter(organization=org, ativa=True, especie_animal__in=['','bovino','multiplo'], item_final__in=eligible, nome__icontains=value['search']).select_related('item_final').order_by('nome','id')
            def row(obj):
                return {'id': str(obj.pk), 'name': obj.nome, 'item': str(obj.item_final_id), 'item_name': obj.item_final.nome}
    pagination = StandardResultsPagination()
    page = pagination.paginate_queryset(qs, request)
    response = pagination.get_paginated_response([row(obj) for obj in page])
    response.data.update(date=str(today), timezone=settings.TIME_ZONE)
    return response
