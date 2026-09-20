from decimal import Decimal

from django.db import migrations


def materialize_unlinked_feed_productions(apps, schema_editor):
    FormulaRacao = apps.get_model("inventory", "FormulaRacao")
    ItemEstoque = apps.get_model("inventory", "ItemEstoque")
    LoteEstoque = apps.get_model("inventory", "LoteEstoque")
    MovimentacaoEstoque = apps.get_model("inventory", "MovimentacaoEstoque")

    formulas = FormulaRacao.objects.filter(
        item_final__isnull=True,
        producoes__status="concluida",
        producoes__quantidade_real__gt=0,
    ).distinct()

    for formula in formulas.iterator():
        item, _ = ItemEstoque.objects.get_or_create(
            organization_id=formula.organization_id,
            nome=formula.nome,
            categoria="racao",
            defaults={
                "categorias": ["racao"],
                "unidade_medida": "kg",
                "especie_animal": formula.especie_animal,
                "descricao": f"Ração produzida pela fórmula {formula.nome}",
                "ativo": True,
            },
        )
        if not item.ativo:
            item.ativo = True
            item.save(update_fields=["ativo", "updated_at"])

        formula.item_final_id = item.id
        formula.save(update_fields=["item_final", "updated_at"])

        for production in formula.producoes.filter(
            status="concluida", quantidade_real__gt=0
        ).iterator():
            lot_number = f"PROD-{production.id}"
            unit_cost = (
                production.custo_total / production.quantidade_real
                if production.quantidade_real
                else Decimal("0")
            )
            lot, created = LoteEstoque.objects.get_or_create(
                item_id=item.id,
                numero_lote=lot_number,
                defaults={
                    "quantidade_inicial": production.quantidade_real,
                    "quantidade_atual": production.quantidade_real,
                    "custo_unitario": unit_cost,
                    "data_entrada": production.data_producao.date(),
                    "ativo": True,
                },
            )
            if created:
                movement = MovimentacaoEstoque.objects.create(
                    item_id=item.id,
                    lote_id=lot.id,
                    tipo="entrada",
                    quantidade=production.quantidade_real,
                    responsavel_id=production.responsavel_id,
                    observacao=f"Entrada recuperada da produção (Lote {lot_number})",
                )
                MovimentacaoEstoque.objects.filter(pk=movement.pk).update(
                    data_movimentacao=production.data_producao
                )


class Migration(migrations.Migration):
    dependencies = [("inventory", "0026_consumoracao_individual_animals")]

    operations = [migrations.RunPython(
        materialize_unlinked_feed_productions,
        migrations.RunPython.noop,
    )]
