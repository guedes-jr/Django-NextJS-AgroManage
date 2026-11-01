"""Cattle commands and read models. No balance changes without domain records."""
from datetime import timedelta
from decimal import Decimal
from django.db import transaction
from django.db.models import Q, Sum, Count
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .models import (Animal, AnimalBatch, CattlePurposeChange, CattleTransfer, CattleOccurrence,
                     CattleProtocol, CattleProtocolRun, CattleProtocolStep, CattleGrazing, HistoricoEvento)

PURPOSES = {"unknown", "beef", "dairy", "dual"}


def filter_purpose(queryset, purpose):
    if not purpose or purpose == "all":
        return queryset
    if purpose not in PURPOSES:
        raise ValidationError({"production": "Finalidade inválida."})
    return queryset.filter(cattle_purpose__in=[purpose, "dual"] if purpose in {"beef", "dairy"} else [purpose])


def remember_purpose(target, previous, user):
    if isinstance(target, AnimalBatch):
        participants = list(Animal.objects.select_for_update().filter(batch=target, farm=target.farm, status="active").exclude(cattle_purpose=target.cattle_purpose).order_by("pk"))
        Animal.objects.filter(pk__in=[animal.pk for animal in participants]).update(cattle_purpose=target.cattle_purpose, updated_at=timezone.now())
        CattlePurposeChange.objects.bulk_create([CattlePurposeChange(animal=animal, farm=target.farm, previous=animal.cattle_purpose, purpose=target.cattle_purpose, date=timezone.localdate(), created_by=user) for animal in participants])
    if previous == target.cattle_purpose:
        return
    CattlePurposeChange.objects.create(**{"animal" if isinstance(target, Animal) else "batch": target},
        farm=target.farm, previous=previous, purpose=target.cattle_purpose, date=timezone.localdate(), created_by=user)


@transaction.atomic
def classify(user, *, animals, batches, purpose):
    if purpose not in PURPOSES or not (animals or batches):
        raise ValidationError("Selecione os participantes e uma finalidade válida.")
    from apps.farms.models import Farm
    farm_ids = set(Animal.objects.filter(pk__in=animals, farm__organization=user.organization, species__code="bovinos").values_list("farm_id", flat=True))
    farm_ids.update(AnimalBatch.objects.filter(pk__in=batches, farm__organization=user.organization, species__code="bovinos").values_list("farm_id", flat=True))
    list(Farm.objects.select_for_update().filter(pk__in=farm_ids).order_by("pk"))
    selected_animals = list(Animal.objects.select_for_update().filter(pk__in=animals, farm__organization=user.organization, species__code="bovinos").order_by("pk"))
    selected_batches = list(AnimalBatch.objects.select_for_update().filter(pk__in=batches, farm__organization=user.organization, species__code="bovinos").order_by("pk"))
    if len(selected_animals) != len(set(animals)) or len(selected_batches) != len(set(batches)):
        raise ValidationError("Um participante não pertence ao rebanho autorizado.")
    # Batch classification is explicitly presented as including active linked animals.
    selected_batch_ids = {batch.pk for batch in selected_batches}
    linked_purposes = dict(AnimalBatch.objects.filter(pk__in=[animal.batch_id for animal in selected_animals if animal.batch_id], farm__organization=user.organization).values_list("pk", "cattle_purpose"))
    for animal in selected_animals:
        if animal.batch_id and animal.batch_id not in selected_batch_ids and linked_purposes.get(animal.batch_id) != purpose:
            raise ValidationError("Classifique o lote do animal ou transfira-o para um lote compatível antes de mudar sua finalidade individual.")
    for target in [*selected_animals, *selected_batches]:
        previous = target.cattle_purpose
        target.cattle_purpose = purpose
        target.save(update_fields=["cattle_purpose", "updated_at"])
        remember_purpose(target, previous, user)
    return {"animals": len(selected_animals), "batches": len(selected_batches)}


def transfer_preview(user, *, source, destination, quantity, animals, date, reason, **kwargs):
    batches = list(AnimalBatch.objects.filter(pk__in=[source, destination], farm__organization=user.organization, species__code="bovinos", status="active").select_related("farm"))
    by_id = {str(batch.pk): batch for batch in batches}
    if len(by_id) != 2 or str(source) not in by_id or str(destination) not in by_id:
        raise ValidationError("Selecione dois lotes bovinos ativos e autorizados.")
    origin, target = by_id[str(source)], by_id[str(destination)]
    if origin.farm_id != target.farm_id or origin.category != target.category or origin.gender != target.gender:
        raise ValidationError("Origem e destino devem ser da mesma fazenda, categoria e sexo.")
    if origin.cattle_purpose != target.cattle_purpose:
        raise ValidationError("Classifique os dois lotes com a mesma finalidade antes de transferir.")
    if date != timezone.localdate():
        raise ValidationError({"date": "Transferências usam a data atual para preservar o histórico de ocupação e efetivo."})
    if quantity <= 0 or quantity > origin.quantity:
        raise ValidationError({"quantity": "Quantidade inválida para o saldo da origem."})
    active = Animal.objects.filter(batch=origin, status="active")
    ids = list(active.filter(pk__in=animals, farm=origin.farm, species__code="bovinos").values_list("pk", flat=True))
    if len(animals) != len(set(animals)):
        raise ValidationError({"animals": "Não repita participantes."})
    if origin.quantity < active.count() or target.quantity < Animal.objects.filter(batch=target, status="active").count():
        raise ValidationError("O efetivo do lote está incompatível com os animais identificados. Confira os lançamentos de entrada e saída antes de transferir.")
    if animals:
        if len(ids) != len(set(animals)) or quantity != len(ids):
            raise ValidationError({"animals": "Informe exatamente os animais ativos da origem correspondentes à quantidade."})
    elif active.exists():
        raise ValidationError({"animals": "O lote tem animais identificados: selecione os participantes da transferência."})
    if not reason.strip():
        raise ValidationError({"reason": "Informe o motivo."})
    return {"source": str(origin.pk), "destination": str(target.pk), "source_code": origin.batch_code,
            "destination_code": target.batch_code, "farm": str(origin.farm_id), "quantity": quantity,
            "source_before": origin.quantity, "source_after": origin.quantity - quantity,
            "destination_before": target.quantity, "destination_after": target.quantity + quantity,
            "animals": sorted(str(pk) for pk in ids), "date": date.isoformat(), "reason": reason}


@transaction.atomic
def transfer(user, data):
    from apps.farms.models import Farm
    origin = AnimalBatch.objects.filter(pk=data["source"], farm__organization=user.organization, species__code="bovinos").first()
    if not origin:
        raise ValidationError("Origem inválida.")
    Farm.objects.select_for_update().get(pk=origin.farm_id)
    existing = CattleTransfer.objects.filter(farm_id=origin.farm_id, request_key=data["request_key"]).first()
    if existing:
        signature = existing.snapshot
        if any(str(signature[key]) != str(data[key]) for key in ["source", "destination", "quantity", "reason", "date"]) or signature["animals"] != sorted(str(pk) for pk in data["animals"]):
            raise ValidationError("A chave já foi usada com outros participantes ou dados.")
        return existing
    locked = list(AnimalBatch.objects.select_for_update().filter(pk__in=[data["source"], data["destination"]]).order_by("pk"))
    snapshot = transfer_preview(user, **data)
    if data.get("expected_source") != snapshot["source_before"] or data.get("expected_destination") != snapshot["destination_before"]:
        raise ValidationError("O efetivo mudou desde a prévia. Confira novamente antes de confirmar.")
    by_id = {str(batch.pk): batch for batch in locked}
    source, destination = by_id[str(data["source"])], by_id[str(data["destination"])]
    moved_weight = source.avg_weight_kg
    if snapshot["animals"]:
        participants = list(Animal.objects.select_for_update().filter(pk__in=snapshot["animals"]).order_by("pk"))
        if any(animal.batch_id != source.pk or animal.status != "active" for animal in participants):
            raise ValidationError("Os participantes mudaram. Confira a prévia novamente.")
        Animal.objects.filter(pk__in=snapshot["animals"]).update(batch=destination)
    original = source.quantity
    old_destination = destination.quantity
    source.quantity -= data["quantity"]
    destination.quantity += data["quantity"]
    if moved_weight is not None and (not old_destination or destination.avg_weight_kg is not None):
        destination.avg_weight_kg = ((destination.avg_weight_kg or 0) * old_destination + moved_weight * data["quantity"]) / destination.quantity
    else:
        destination.avg_weight_kg = None
    if source.purchase_value is not None:
        share = (source.purchase_value * Decimal(data["quantity"]) / Decimal(original)).quantize(Decimal(".01"))
        source.purchase_value -= share
        destination.purchase_value = (destination.purchase_value or 0) + share if destination.purchase_value is not None or not old_destination else None
        snapshot["purchase_value_transferred"] = str(share)
    source.save(update_fields=["quantity", "purchase_value", "updated_at"])
    destination.save(update_fields=["quantity", "purchase_value", "avg_weight_kg", "updated_at"])
    record = CattleTransfer.objects.create(farm=source.farm, source=source, destination=destination, date=data["date"], quantity=data["quantity"], animal_ids=snapshot["animals"], reason=data["reason"], request_key=data["request_key"], snapshot=snapshot, created_by=user)
    for batch, direction in [(source, "Saída"), (destination, "Entrada")]:
        HistoricoEvento.objects.create(farm=source.farm, lote=batch, tipo_evento=f"Transferência · {direction}", data_evento=data["date"], descricao=f"{data['quantity']} animais: {source.batch_code} → {destination.batch_code}. {data['reason']}", metadata={**snapshot, "transfer_id": str(record.pk), "responsible_id": str(user.pk)})
    return record


@transaction.atomic
def create_occurrence(user, data):
    from apps.tasks.models import Task
    task = Task.objects.create(organization=user.organization, farm=data["farm"], title=f"Ocorrência bovina · {data['kind']}", description=data["description"], due_date=data["due_date"], assigned_to=data["assigned_to"], created_by=user, priority=data.get("priority", "medium"))
    return CattleOccurrence.objects.create(farm=data["farm"], animal=data.get("animal"), batch=data.get("batch"), kind=data["kind"], date=data["date"], description=data["description"], task=task, created_by=user)


@transaction.atomic
def resolve_occurrence(user, occurrence, note):
    from apps.tasks.models import Task
    occurrence = CattleOccurrence.objects.select_for_update().get(pk=occurrence.pk)
    if occurrence.resolved_at:
        return occurrence
    if not note.strip():
        raise ValidationError({"resolution": "Informe como a ocorrência foi resolvida."})
    occurrence.resolved_at, occurrence.resolved_by, occurrence.resolution = timezone.now(), user, note
    occurrence.save(update_fields=["resolved_at", "resolved_by", "resolution", "updated_at"])
    Task.objects.filter(pk=occurrence.task_id).update(status="done")
    return occurrence


@transaction.atomic
def start_protocol(user, *, animal, protocol, start_date, request_key, assigned_to):
    from apps.tasks.models import Task
    animal = Animal.objects.select_for_update().get(pk=animal.pk)
    if animal.status != "active" or animal.gender != "F" or animal.species.code != "bovinos":
        raise ValidationError("Selecione uma fêmea bovina ativa.")
    existing = CattleProtocolRun.objects.filter(animal=animal, request_key=request_key).first()
    if existing:
        if existing.protocol_id != protocol.pk or existing.start_date != start_date:
            raise ValidationError("Chave reutilizada com outro protocolo ou data.")
        return existing
    run = CattleProtocolRun.objects.create(animal=animal, protocol=protocol, start_date=start_date, request_key=request_key, steps_snapshot=protocol.steps, created_by=user)
    for index, step in enumerate(protocol.steps):
        task = Task.objects.create(organization=user.organization, farm=animal.farm, title=f"{animal.identifier} · {step['name']}", description=f"Protocolo {protocol.name} v{protocol.version}", due_date=start_date + timedelta(days=step["day"]), assigned_to=assigned_to, created_by=user)
        CattleProtocolStep.objects.create(run=run, number=index, task=task)
    return run


@transaction.atomic
def execute_protocol_step(user, step, date, notes, inventory_lot=None, inventory_quantity=None, mating=None):
    step = CattleProtocolStep.objects.select_for_update().select_related("task", "run").get(pk=step.pk)
    if step.executed_at:
        return step
    if date > timezone.localdate() or date < step.run.start_date:
        raise ValidationError({"date": "Informe uma data válida de execução."})
    if step.run.executions.filter(number__lt=step.number, executed_at__isnull=True).exists():
        raise ValidationError("Conclua as etapas anteriores antes desta execução.")
    if mating and (mating.female_id != step.run.animal_id or mating.mating_date != date):
        raise ValidationError("A cobertura deve pertencer à mesma matriz e data da execução.")
    if inventory_lot:
        from apps.inventory.models import LoteEstoque, MovimentacaoEstoque
        from apps.inventory.services import registrar_movimentacao
        lot = LoteEstoque.objects.select_for_update().select_related("item").get(pk=inventory_lot.pk)
        if lot.item.organization_id != user.organization_id or lot.item.categoria != "semen" or lot.item.especie_animal not in {"bovino", "multiplo", ""} or not lot.ativo or not lot.item.ativo or lot.data_entrada > date or (lot.data_validade and lot.data_validade < date):
            raise ValidationError("Selecione um lote de sêmen bovino elegível na data de execução.")
        if not mating or not inventory_quantity or inventory_quantity <= 0 or inventory_quantity > lot.quantidade_atual:
            raise ValidationError("Vincule a cobertura e uma quantidade positiva de sêmen disponível na unidade do estoque.")
        marker = f"Protocolo bovino {step.pk}"
        registrar_movimentacao(lot.item, lote=lot, tipo="consumo", quantidade=inventory_quantity, responsavel=user, farm=step.run.animal.farm, destino="Reprodução bovina", observacao=marker)
        step.inventory_cost_snapshot = (inventory_quantity * lot.custo_unitario).quantize(Decimal(".01")) if lot.custo_unitario is not None else None
        step.inventory_lot, step.inventory_quantity = lot, inventory_quantity
        step.inventory_movement = MovimentacaoEstoque.objects.get(lote=lot, observacao=marker)
    elif inventory_quantity:
        raise ValidationError("Selecione o lote de sêmen para a quantidade informada.")
    step.mating = mating
    step.executed_at, step.executed_date, step.executed_by, step.notes = timezone.now(), date, user, notes
    step.save(update_fields=["executed_at", "executed_date", "executed_by", "notes", "inventory_lot", "inventory_quantity", "inventory_cost_snapshot", "inventory_movement", "mating", "updated_at"])
    step.task.status = "done"
    step.task.save(update_fields=["status", "updated_at"])
    return step


def import_preview(user, farm, rows):
    from .cattle_serializers import CattleAnimalSerializer
    from types import SimpleNamespace
    seen, result = set(), []
    existing = set(Animal.objects.filter(farm=farm).values_list("identifier", flat=True))
    for index, row in enumerate(rows):
        data = {**row, "farm_id": str(farm.pk)}
        identifier = str(data.get("identifier", "")).strip()
        errors = {}
        if identifier in seen:
            errors["identifier"] = ["Brinco repetido nesta planilha."]
        seen.add(identifier)
        if identifier in existing:
            errors["identifier"] = ["Brinco já cadastrado nesta fazenda."]
        serializer = CattleAnimalSerializer(data=data, context={"request": SimpleNamespace(user=user)})
        if not serializer.is_valid():
            errors.update(serializer.errors)
        result.append({"line": index + 2, "data": data, "errors": errors, "valid": not errors})
    return result


@transaction.atomic
def import_animals(user, farm, rows):
    from apps.farms.models import Farm
    from .cattle_serializers import CattleAnimalSerializer
    from types import SimpleNamespace
    Farm.objects.select_for_update().get(pk=farm.pk)
    preview = import_preview(user, farm, rows)
    if any(not row["valid"] for row in preview):
        raise ValidationError({"rows": preview})
    created = []
    for row in preview:
        serializer = CattleAnimalSerializer(data=row["data"], context={"request": SimpleNamespace(user=user)})
        serializer.is_valid(raise_exception=True)
        animal = serializer.save()
        from common.operator_access import remember_operator_record
        remember_operator_record(user, animal)
        created.append(str(animal.pk))
    return created


@transaction.atomic
def move_pasture(user, *, batch, pasture, reason, request_key, preview=True, expected_source=None):
    from apps.farms.models import Farm
    from .models import CattlePasture
    from .cattle_services import enter_cattle_pasture
    Farm.objects.select_for_update().get(pk=batch.farm_id)
    batch = AnimalBatch.objects.select_for_update().get(pk=batch.pk)
    pasture = CattlePasture.objects.select_for_update().get(pk=pasture.pk)
    marker = str(request_key)
    existing = HistoricoEvento.objects.filter(farm=batch.farm, lote=batch, tipo_evento="Mudança de pasto", metadata__request_key=marker).first()
    if existing:
        if existing.metadata.get("destination") != str(pasture.pk) or existing.metadata.get("reason") != reason:
            raise ValidationError("Chave já utilizada com outro destino ou motivo.")
        return existing.metadata
    if batch.status != "active" or batch.farm_id != pasture.farm_id or pasture.availability in {"resting", "blocked"}:
        raise ValidationError("Selecione um lote ativo e um pasto liberado da mesma fazenda.")
    current = CattleGrazing.objects.select_for_update().filter(batch=batch, exit_date__isnull=True).select_related("pasture").first()
    today = timezone.localdate()
    if not current or current.pasture_id == pasture.pk or current.entry_date > today:
        raise ValidationError("Informe outro pasto para um lote com ocupação atual válida.")
    snapshot={"source":str(current.pasture_id),"source_code":current.pasture.name,"destination":str(pasture.pk),"destination_code":pasture.name,"quantity":batch.quantity,"date":today.isoformat(),"reason":reason,"request_key":marker,"batch":str(batch.pk)}
    if preview:
        return snapshot
    if str(expected_source) != str(current.pasture_id):
        raise ValidationError("A ocupação mudou desde a prévia. Confira novamente.")
    current.exit_date=today;current.save(update_fields=["exit_date","updated_at"])
    grazing=enter_cattle_pasture({"batch":batch,"pasture":pasture,"entry_date":today,"notes":reason})
    snapshot["grazing_id"]=str(grazing.pk)
    HistoricoEvento.objects.create(farm=batch.farm,lote=batch,tipo_evento="Mudança de pasto",data_evento=today,descricao=f"{current.pasture.name} → {pasture.name}. {reason}",metadata={**snapshot,"responsible_id":str(user.pk)})
    return snapshot


@transaction.atomic
def create_protocol(user, name, steps):
    from django.db.models import Max
    organization = user.organization
    organization.__class__.objects.select_for_update().get(pk=organization.pk)
    version = (CattleProtocol.objects.filter(organization=organization, name=name).aggregate(last=Max("version"))["last"] or 0) + 1
    return CattleProtocol.objects.create(organization=organization, name=name, version=version, steps=steps, created_by=user)
