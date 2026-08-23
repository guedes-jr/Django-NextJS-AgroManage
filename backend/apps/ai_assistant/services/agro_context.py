from dataclasses import dataclass

from django.db.models import Sum


class AgroContextNotFound(Exception):
    pass


@dataclass(frozen=True)
class AgroContext:
    context_type: str
    record_id: str
    text: str


def _value(value, fallback="Não informado"):
    return fallback if value in (None, "") else str(value)


def _lines(title, values):
    return "\n".join([f"Registro: {title}", *(f"{label}: {_value(value)}" for label, value in values)])


def build_agro_context(*, user, context_type=None, context_id=None):
    if not context_type and not context_id:
        return None
    if not context_type or not context_id or not user.organization_id:
        raise AgroContextNotFound("O contexto solicitado não foi encontrado.")
    builders = {
        "planting": _planting_context,
        "animal": _animal_context,
        "animal_batch": _animal_batch_context,
        "farm": _farm_context,
    }
    builder = builders.get(context_type)
    if builder is None:
        raise AgroContextNotFound("O contexto solicitado não foi encontrado.")
    text = builder(organization_id=user.organization_id, record_id=context_id)
    return AgroContext(context_type=context_type, record_id=str(context_id), text=text)


def _planting_context(*, organization_id, record_id):
    from apps.crops.models import PlantingCycle

    planting = (
        PlantingCycle.objects.select_related("farm", "field", "sector")
        .filter(id=record_id, organization_id=organization_id)
        .first()
    )
    if not planting:
        raise AgroContextNotFound("A plantação informada não foi encontrada.")
    harvest = planting.harvests.aggregate(
        production=Sum("yield_kg"), revenue=Sum("revenue_amount")
    )
    return _lines("Plantação", [
        ("Nome", planting.name),
        ("Cultura", planting.crop_name),
        ("Tipo", planting.get_crop_type_display()),
        ("Variedade", planting.variety),
        ("Híbrido", planting.hybrid),
        ("Fazenda", planting.farm.name if planting.farm else None),
        ("Talhão", planting.field.name if planting.field else None),
        ("Área plantada (ha)", planting.planted_area_ha),
        ("Data de plantio", planting.planting_date),
        ("Previsão de colheita", planting.expected_harvest_date),
        ("Data real da colheita", planting.actual_harvest_date),
        ("Status", planting.get_status_display()),
        ("Produção estimada (kg)", planting.estimated_production_kg),
        ("Produção colhida (kg)", harvest["production"] or 0),
        ("Receita estimada (R$)", planting.estimated_revenue),
        ("Receita de colheitas (R$)", harvest["revenue"] or 0),
        ("Custo acumulado (R$)", planting.investment_total),
        ("Dias de cultivo", planting.days_in_cultivation),
    ])


def _animal_context(*, organization_id, record_id):
    from apps.livestock.models import Animal

    animal = (
        Animal.objects.select_related("farm", "species", "breed", "batch")
        .filter(id=record_id, farm__organization_id=organization_id)
        .first()
    )
    if not animal:
        raise AgroContextNotFound("O animal informado não foi encontrado.")
    return _lines("Animal", [
        ("Identificação", animal.identifier),
        ("Espécie", animal.species.name),
        ("Raça", animal.breed.name if animal.breed else None),
        ("Fazenda", animal.farm.name),
        ("Lote", animal.batch.batch_code if animal.batch else None),
        ("Sexo", animal.get_gender_display()),
        ("Categoria", animal.category),
        ("Status", animal.get_status_display()),
        ("Status reprodutivo", animal.get_reproductive_status_display()),
        ("Nascimento", animal.birth_date),
        ("Peso atual (kg)", animal.current_weight_kg),
    ])


def _animal_batch_context(*, organization_id, record_id):
    from apps.livestock.models import AnimalBatch

    batch = (
        AnimalBatch.objects.select_related("farm", "species", "breed", "sector")
        .filter(id=record_id, farm__organization_id=organization_id)
        .first()
    )
    if not batch:
        raise AgroContextNotFound("O lote informado não foi encontrado.")
    return _lines("Lote de animais", [
        ("Código", batch.batch_code),
        ("Nome", batch.name),
        ("Espécie", batch.species.name),
        ("Raça", batch.breed.name if batch.breed else None),
        ("Fazenda", batch.farm.name),
        ("Setor", batch.sector.name if batch.sector else None),
        ("Quantidade", batch.quantity),
        ("Categoria", batch.category),
        ("Fase", batch.get_phase_display() if batch.phase else None),
        ("Peso médio (kg)", batch.avg_weight_kg),
        ("Entrada", batch.entry_date),
        ("Saída", batch.exit_date),
        ("Status", batch.get_status_display()),
    ])


def _farm_context(*, organization_id, record_id):
    from apps.farms.models import Farm

    farm = Farm.objects.filter(id=record_id, organization_id=organization_id).first()
    if not farm:
        raise AgroContextNotFound("A fazenda informada não foi encontrada.")
    return _lines("Fazenda", [
        ("Nome", farm.name),
        ("Cidade", farm.city),
        ("Estado", farm.state),
        ("Área total (ha)", farm.total_area_ha),
        ("Ativa", "Sim" if farm.is_active else "Não"),
        ("Plantações cadastradas", farm.plantations.count()),
        ("Lotes de animais", farm.animal_batches.count()),
        ("Animais individuais", farm.animals.count()),
    ])
