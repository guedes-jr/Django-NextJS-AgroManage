"""Preenche o segmento de itens, fórmulas e lançamentos existentes.

Itens/fórmulas: suíno -> Suinocultura; bovino -> Gado de corte ou Pecuária leiteira
quando a organização só tem uma dessas finalidades nos lotes/animais bovinos
(senão continua geral). A ração produzida herda o segmento da fórmula.
Lançamentos: o segmento sai do vínculo (plantação, lote, venda de leite, mão de
obra suína, compra de estoque do item).
"""
from django.db import migrations

PURPOSE_SEGMENT = {"beef": "gado-de-corte", "dairy": "pecuaria-leiteira"}


def cattle_segment_by_org(apps):
    AnimalBatch = apps.get_model("livestock", "AnimalBatch")
    Animal = apps.get_model("livestock", "Animal")
    purposes = {}
    for model in (AnimalBatch, Animal):
        rows = model.objects.filter(species__code="bovinos", cattle_purpose__in=PURPOSE_SEGMENT)
        for org_id, purpose in rows.values_list("farm__organization_id", "cattle_purpose").distinct():
            purposes.setdefault(org_id, set()).add(purpose)
    return {org: PURPOSE_SEGMENT[next(iter(found))] for org, found in purposes.items() if len(found) == 1}


def forwards(apps, schema_editor):
    ItemEstoque = apps.get_model("inventory", "ItemEstoque")
    FormulaRacao = apps.get_model("inventory", "FormulaRacao")
    LoteEstoque = apps.get_model("inventory", "LoteEstoque")
    Transaction = apps.get_model("finance", "Transaction")
    cattle = cattle_segment_by_org(apps)
    for model in (ItemEstoque, FormulaRacao):
        model.objects.filter(segmento="", especie_animal__in=["suino", "suinos"]).update(segmento="suinos")
        for org_id, segment in cattle.items():
            model.objects.filter(segmento="", especie_animal="bovino", organization_id=org_id).update(segmento=segment)
    for formula in FormulaRacao.objects.exclude(segmento="").exclude(item_final__isnull=True):
        ItemEstoque.objects.filter(pk=formula.item_final_id, segmento="").update(segmento=formula.segmento)

    Transaction.objects.filter(planting_cycle__isnull=False).update(segmento="plantacoes")
    Transaction.objects.filter(animal_batch__species__code__in=["suino", "suinos"]).update(segmento="suinos")
    for purpose, segment in PURPOSE_SEGMENT.items():
        Transaction.objects.filter(animal_batch__species__code="bovinos", animal_batch__cattle_purpose=purpose).update(segmento=segment)
    Transaction.objects.filter(reference__startswith="SALE-MILK-TANK-").update(segmento="pecuaria-leiteira")
    Transaction.objects.filter(reference__startswith="LABOR-SWINE-").update(segmento="suinos")
    lot_segments = dict(
        LoteEstoque.objects.exclude(item__segmento="").values_list("id", "item__segmento")
    )
    for transaction in Transaction.objects.filter(segmento="", reference__startswith="LOTE-").only("id", "reference"):
        segment = lot_segments.get(_uuid(transaction.reference[len("LOTE-"):]))
        if segment:
            Transaction.objects.filter(pk=transaction.pk).update(segmento=segment)


def _uuid(value):
    import uuid

    try:
        return uuid.UUID(value)
    except ValueError:
        return None


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0008_segmento"),
        ("inventory", "0029_segmento"),
        ("livestock", "0047_animal_data"),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
