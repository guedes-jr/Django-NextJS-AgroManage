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
