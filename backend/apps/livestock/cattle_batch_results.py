"""Collective cattle launches and accrual results, independent of cash settlement."""
from datetime import date
from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers
from .models import AnimalBatch, HistoricoEvento, CattleGrazing
from .cattle_serializers import past_date

ZERO = Decimal(0)


def launch_input(batch, data):
    day = serializers.DateField(validators=[past_date]).run_validation(data.get("date"))
    key = str(serializers.UUIDField().run_validation(data.get("request_key")))
    if day < batch.entry_date:
        raise serializers.ValidationError({"date": "A data não pode anteceder a entrada do lote."})
    return day, key


def record_batch_death(batch, user, data):
    day, key = launch_input(batch, data)
    existing = batch.historicos.filter(tipo_evento="Mortalidade de Lote", metadata__request_key=key).first()
    if existing:
        return existing.metadata
    quantity = serializers.IntegerField(min_value=1).run_validation(data.get("quantity"))
    reason = serializers.CharField(max_length=500).run_validation(data.get("reason"))
    if batch.status != "active" or quantity > batch.quantity:
        raise serializers.ValidationError({"quantity": "Quantidade superior ao efetivo ativo disponível."})
    if batch.animal_set.filter(status="active").exists():
        raise serializers.ValidationError("Este lote possui animais identificados. Registre a morte pelo cadastro do animal.")
    batch.quantity -= quantity
    if batch.quantity == 0:
        sales = batch.historicos.filter(tipo_evento="Venda de Animais")
        last_sale = sales.order_by("-data_evento").first()
        batch.status = "finished" if last_sale else "dead"
        batch.exit_date = max(day, last_sale.data_evento) if last_sale else day
        from .services import finalize_batch_current_phase
        finalize_batch_current_phase(batch, batch.exit_date)
        CattleGrazing.objects.filter(batch=batch, exit_date__isnull=True).update(exit_date=batch.exit_date)
    batch.save(update_fields=["quantity", "status", "exit_date", "updated_at"])
    metadata = {"quantidade_mortes": quantity, "quantidade_atual": batch.quantity,
                "quantidade_anterior": batch.quantity + quantity, "causa": reason,
                "request_key": key, "author": str(user.pk)}
    HistoricoEvento.objects.create(farm=batch.farm, lote=batch, tipo_evento="Mortalidade de Lote", data_evento=day,
        descricao=f"{quantity} morte(s): {reason}", metadata=metadata)
    return metadata


def record_batch_cost(batch, user, data):
    """Append an explicitly appropriated external cost; never edit stock balances."""
    day, key = launch_input(batch, data)
    previous = batch.historicos.filter(tipo_evento="Custo de Lote Bovino", metadata__request_key=key).first()
    if previous:
        return previous.metadata
    description = serializers.CharField(max_length=500).run_validation(data.get("description"))
    category = serializers.ChoiceField(choices=["sanitary", "pasture", "labor", "freight", "other"]).run_validation(data.get("category"))
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal(".01")).run_validation(data.get("amount"))
    metadata = {"amount": str(amount), "category": category, "description": description,
                "request_key": key, "author": str(user.pk)}
    HistoricoEvento.objects.create(farm=batch.farm, lote=batch, tipo_evento="Custo de Lote Bovino", data_evento=day, descricao=description, metadata=metadata)
    return metadata


def batch_result(batch, *, yield_percent=None):
    from .cattle_analytics import cattle_cost_report
    costs = cattle_cost_report(batch.farm.organization, start=batch.entry_date, end=batch.exit_date or timezone.localdate(), batch=batch.pk)
    events = list(batch.historicos.order_by("data_evento", "created_at"))
    sales = [event for event in events if event.tipo_evento == "Venda de Animais"]
    deaths = sum(int(event.metadata.get("quantidade_mortes", 0)) for event in events if event.tipo_evento == "Mortalidade de Lote")
    sold = sum(int(event.metadata["quantity"]) for event in sales)
    remaining = batch.quantity if batch.status == "active" else 0
    entry = next((event.metadata for event in events if event.tipo_evento == "Entrada de Lote"), {})
    initial = int(entry.get("quantidade") or (remaining + sold + deaths))
    extra = [event for event in events if event.tipo_evento == "Custo de Lote Bovino"]
    acquisition = batch.purchase_value or ZERO
    extra_total = sum((Decimal(event.metadata["amount"]) for event in extra), ZERO)
    total = acquisition + Decimal(costs["operational_total"]) + extra_total
    gross = sum((Decimal(event.metadata.get("gross_amount", event.metadata["amount"])) for event in sales), ZERO)
    revenue = sum((Decimal(event.metadata["amount"]) for event in sales), ZERO)
    carcass = sum((Decimal(event.metadata.get("carcass_weight_kg", "0")) for event in sales), ZERO)
    complete_carcass = bool(sales) and all(event.metadata.get("carcass_weight_kg") for event in sales)
    estimated = any(event.metadata.get("carcass_estimated") for event in sales)
    if yield_percent and not complete_carcass and sales:
        carcass = sum((Decimal(event.metadata["carcass_weight_kg"]) if event.metadata.get("carcass_weight_kg") else Decimal(event.metadata["weight_kg"]) * yield_percent / 100 for event in sales), ZERO)
        complete_carcass, estimated = True, True
    weights = [{"date": str(row.weighing_date), "weight_kg": str(row.weight_kg)} for row in batch.weights.order_by("weighing_date", "created_at")]
    first_phase = batch.phase_histories.order_by("entry_date", "created_at").first()
    entry_weight = entry.get("peso_medio_entrada") or (first_phase.avg_weight_kg if first_phase else None)
    if entry_weight and not any(row["date"] == str(batch.entry_date) for row in weights):
        weights.insert(0, {"date": str(batch.entry_date), "weight_kg": str(entry_weight)})
    if sales:
        last_sale = max(sales, key=lambda event: (event.data_evento, event.created_at))
        sale_day = last_sale.data_evento
        if not weights or sale_day > date.fromisoformat(weights[-1]["date"]):
            weights.append({"date": str(sale_day), "weight_kg": str(Decimal(last_sale.metadata["weight_kg"])/int(last_sale.metadata["quantity"]))})
    intervals = []
    for first, last in zip(weights, weights[1:]):
        days = (date.fromisoformat(last["date"]) - date.fromisoformat(first["date"])).days
        if days > 0:
            intervals.append({"start": first["date"], "end": last["date"], "days": days,
                "gmd": str((Decimal(last["weight_kg"]) - Decimal(first["weight_kg"])) / days)})
    warnings = ["Resultado parcial dos custos lançados; não representa lucro líquido. Despesas financeiras não são somadas aos consumos."]
    if costs["missing_cost_count"]:
        warnings.append("Há consumos sem custo conhecido.")
    if remaining:
        warnings.append("Lote ainda possui animais ativos; custos incluem todo o lote e a receita somente as vendas realizadas.")
    if batch.source_batches.exists() or batch.outgoing_cattle_transfers.exists() or batch.incoming_cattle_transfers.exists():
        warnings.append("Lote com transferências: aquisição reflete o valor apropriado atual; revise custos compartilhados na origem e no destino.")
    if initial != remaining + sold + deaths:
        warnings.append("O efetivo não reconcilia com entrada, vendas e mortalidades. Revise o histórico; nenhum saldo foi corrigido automaticamente.")
    total_days = sum(row["days"] for row in intervals)
    daily_gain = sum((Decimal(row["gmd"]) * row["days"] for row in intervals), ZERO) / total_days if total_days else None
    return {"daily_weight_gain": str(daily_gain) if daily_gain is not None else None, "batch_code": batch.batch_code, "initial_head": initial, "sold_head": sold, "deaths": deaths, "remaining_head": remaining,
        "mortality_percent": str(Decimal(deaths) * 100 / initial) if initial else None,
        "acquisition": str(acquisition), "operational_cost": costs["operational_total"], "additional_cost": str(extra_total),
        "total_cost": str(total), "gross_revenue": str(gross), "deductions": str(gross-revenue), "net_revenue": str(revenue),
        "result": str(revenue-total), "margin_percent": str((revenue-total)/revenue*100) if revenue else None,
        "cost_per_sold_head": str(total/sold) if sold else None,
        "result_per_sold_head": str((revenue-total)/sold) if sold else None,
        "carcass_arrobas": str(carcass/15) if complete_carcass else None,
        "cost_per_arroba": str(total/(carcass/15)) if complete_carcass else None,
        "carcass_estimated": estimated,
        "entries": costs["entries"] + [{"id": str(event.pk), "date": str(event.data_evento), "description": event.descricao, "amount": event.metadata["amount"], "source": "additional"} for event in extra],
        "weight_intervals": intervals, "warnings": warnings}


def record_batch_treatment(batch, user, data):
    """Collective treatment without inventing individual animal registrations."""
    from datetime import timedelta
    from apps.inventory.models import LoteEstoque, MovimentacaoEstoque
    from apps.inventory.services import registrar_movimentacao
    day, key = launch_input(batch, data)
    previous = batch.historicos.filter(tipo_evento="Sanidade de Lote Bovino", metadata__request_key=key).first()
    if previous:
        return previous.metadata
    description = serializers.CharField(max_length=500).run_validation(data.get("description"))
    count = serializers.IntegerField(min_value=1, max_value=batch.quantity).run_validation(data.get("quantity"))
    if batch.status != "active" or batch.animal_set.filter(status="active").exists():
        raise serializers.ValidationError("Selecione um lote coletivo ativo sem animais identificados.")
    service = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0).run_validation(data.get("service_cost", "0"))
    metadata = {"request_key": key, "author": str(user.pk), "quantity": count, "description": description, "service_cost": str(service), "material_cost": "0"}
    lot_id = data.get("inventory_lot")
    if lot_id:
        lot_id = serializers.UUIDField().run_validation(lot_id)
        lot = LoteEstoque.objects.select_for_update().select_related("item").filter(pk=lot_id, item__organization=user.organization).first()
        if not lot or not lot.item.ativo or not lot.ativo or lot.item.categoria not in {"medicamento", "vacina", "medicamento_vacina"} or lot.item.especie_animal not in {"", "bovino", "multiplo"}:
            raise serializers.ValidationError({"inventory_lot": "Produto sanitário incompatível ou indisponível."})
        if lot.data_entrada > day or (lot.data_validade and lot.data_validade < day):
            raise serializers.ValidationError({"inventory_lot": "Produto vencido ou ainda não recebido na data da aplicação."})
        dose = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=Decimal(".0001")).run_validation(data.get("quantity_per_head"))
        total = dose * count
        if total > lot.quantidade_atual:
            raise serializers.ValidationError({"quantity_per_head": "Saldo insuficiente para a aplicação coletiva."})
        marker = f"Sanidade de lote bovino {batch.pk} {key}"
        registrar_movimentacao(lot.item, lote=lot, tipo="consumo", quantidade=total, responsavel=user, farm=batch.farm, destino=f"Lote {batch.batch_code}", observacao=marker)
        movement = MovimentacaoEstoque.objects.get(lote=lot, observacao=marker)
        metadata.update(inventory_movement=str(movement.pk), inventory_lot=str(lot.pk), inventory_quantity=str(total), inventory_unit=lot.item.unidade_medida,
            material_cost=str((total * lot.custo_unitario).quantize(Decimal(".01"))) if lot.custo_unitario is not None else None,
            meat_withdrawal_until=str(day+timedelta(days=lot.item.carencia_dias or 0)))
    elif data.get("quantity_per_head"):
        raise serializers.ValidationError({"inventory_lot": "Selecione o produto para registrar o consumo."})
    HistoricoEvento.objects.create(farm=batch.farm, lote=batch, tipo_evento="Sanidade de Lote Bovino", data_evento=day, descricao=description, metadata=metadata)
    return metadata
