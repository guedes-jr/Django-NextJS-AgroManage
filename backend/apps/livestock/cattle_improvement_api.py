"""HTTP boundary for the cattle operations center; domain writes live in services."""
from datetime import timedelta
from decimal import Decimal
from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.farms.models import Farm
from apps.accounts.models import User
from .cattle_views import CattlePermission
from .cattle_serializers import past_date
from .models import (Animal, AnimalBatch, CattleTransfer, CattleOccurrence, CattleProtocol, CattleProtocolRun, CattleProtocolStep, CattlePurposeChange)
from . import cattle_improvements as commands


class Period(serializers.Serializer):
    start = serializers.DateField(required=False)
    end = serializers.DateField(required=False)
    farm = serializers.UUIDField(required=False)
    batch = serializers.UUIDField(required=False)
    animal = serializers.UUIDField(required=False)
    production = serializers.ChoiceField(choices=["all", *commands.PURPOSES], default="all")
    drop_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=1, max_value=100, default=20)

    def validate(self, data):
        data.setdefault("end", timezone.localdate())
        data.setdefault("start", data["end"]-timedelta(days=29))
        if data["start"] > data["end"] or (data["end"]-data["start"]).days > 366 or data["end"] > timezone.localdate():
            raise serializers.ValidationError("Use um período válido de até 366 dias, sem datas futuras.")
        return data


class TransferInput(serializers.Serializer):
    source = serializers.UUIDField()
    destination = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    animals = serializers.ListField(child=serializers.UUIDField(), max_length=1000, default=list)
    date = serializers.DateField(validators=[past_date])
    reason = serializers.CharField(max_length=300)
    request_key = serializers.UUIDField()
    preview = serializers.BooleanField(default=True)
    expected_source = serializers.IntegerField(min_value=0,required=False)
    expected_destination = serializers.IntegerField(min_value=0,required=False)


class CattleOperationsView(APIView):
    permission_classes = [CattlePermission]
    create_roles = {"admin", "manager", "operator"}

    def page(self, request, queryset, project):
        paginator = PageNumberPagination()
        paginator.page_size = 10
        paginator.page_size_query_param = "page_size"
        paginator.max_page_size = 100
        rows = paginator.paginate_queryset(queryset, request)
        return paginator.get_paginated_response([project(row) for row in rows])

    def farm(self, request, value):
        pk = serializers.UUIDField().run_validation(value)
        result = Farm.objects.filter(pk=pk, organization=request.user.organization).first()
        if not result:
            raise serializers.ValidationError({"farm": "Fazenda não autorizada."})
        return result

    def member(self, request, value):
        if request.user.role == "operator" and str(value) != str(request.user.pk):
            raise PermissionDenied("Você só pode atribuir tarefas a si mesmo.")
        member = User.objects.filter(pk=serializers.UUIDField().run_validation(value), organization=request.user.organization, is_active=True).first()
        if not member:
            raise serializers.ValidationError({"assigned_to": "Membro não autorizado."})
        return member

    def get(self, request, kind):
        if request.query_params.get('view') == 'mobile':
            from . import mobile_protocol_execution as protocol_execution
            if kind == 'protocol-execution-options':return Response(protocol_execution.options(request.user,request.query_params))
            from . import mobile_protocol_start as protocol_start
            if kind == 'protocol-start-options':return Response(protocol_start.options(request.user,request.query_params))
            if kind == 'protocol-start-animals':return self.page(request,protocol_start.animals(request.user,request.query_params),protocol_start.animal_data)
            from . import mobile_protocols as protocols
            if kind in protocols.KINDS:
                return self.page(request, protocols.rows(request.user, kind, request.query_params), lambda row: protocols.data(row, kind))
            from . import mobile_classification as classification
            if kind == 'classification-options':
                return Response(classification.options(request.user, request.query_params))
            if kind == 'classification-targets':
                rows, target_kind = classification.targets(request.user, request.query_params)
                return self.page(request, rows, lambda row: classification.target_data(row, target_kind))
            from . import mobile_cattle_occurrence as occurrence
            if kind == 'occurrence-options':
                return Response(occurrence.options(request.user, request.query_params))
            if kind == 'occurrence-members':
                return self.page(request, occurrence.members(request.user, request.query_params), lambda row: {'id': str(row.pk), 'full_name': row.full_name})
            if kind == 'occurrence-targets':
                rows, target_kind = occurrence.targets(request.user, request.query_params)
                return self.page(request, rows, lambda row: occurrence.target_data(row, target_kind))
            from . import mobile_cattle_operations as mobile
            return self.page(request, mobile.rows(request.user, kind, request.query_params), lambda row: mobile.data(row, kind, request.user))
        org = request.user.organization
        farm = request.query_params.get("farm")
        if farm:
            farm = self.farm(request, farm).pk
        if kind == "members":
            return Response(list(User.objects.filter(organization=org, is_active=True).filter(Q(pk=request.user.pk) if request.user.role == "operator" else Q()).values("id", "full_name")))
        if kind == "purpose-history":
            rows = CattlePurposeChange.objects.filter(Q(animal__farm__organization=org) | Q(batch__farm__organization=org)).select_related("animal", "batch", "created_by").order_by("-created_at")
            if farm:
                rows = rows.filter(Q(animal__farm_id=farm) | Q(batch__farm_id=farm))
            return self.page(request, rows, lambda row: {"id": row.pk, "target": row.animal.identifier if row.animal_id else row.batch.batch_code, "date": row.date, "previous": row.previous, "purpose": row.purpose, "author": row.created_by.full_name})
        if kind == "transfers":
            if request.user.role not in {"admin", "manager"}:
                raise PermissionDenied("Transferências e seus valores de origem são gerenciais.")
            rows = CattleTransfer.objects.filter(farm__organization=org).select_related("source", "destination", "created_by").order_by("-created_at")
            if farm:
                rows = rows.filter(farm_id=farm)
            return self.page(request, rows, lambda row: {"id": row.pk, "date": row.date, "source": row.source.batch_code, "destination": row.destination.batch_code, "quantity": row.quantity, "reason": row.reason, "author": row.created_by.full_name, "snapshot": row.snapshot})
        if kind == "occurrences":
            rows = CattleOccurrence.objects.filter(farm__organization=org).select_related("task__assigned_to", "animal", "batch").order_by("-created_at")
            if farm:
                rows = rows.filter(farm_id=farm)
            if request.query_params.get("status") == "open":
                rows = rows.filter(resolved_at__isnull=True)
            elif request.query_params.get("status") == "done":
                rows = rows.filter(resolved_at__isnull=False)
            return self.page(request, rows, lambda row: {"id": row.pk, "date": row.date, "kind": row.kind, "description": row.description, "target": row.animal.identifier if row.animal_id else row.batch.batch_code if row.batch_id else "Área da fazenda", "due_date": row.task.due_date, "assigned_to": row.task.assigned_to.full_name if row.task.assigned_to_id else "—", "status": row.task.status, "resolution": row.resolution, "resolved_at": row.resolved_at})
        if kind == "protocols":
            rows = CattleProtocol.objects.filter(organization=org).order_by("name", "-version")
            return self.page(request, rows, lambda row: {"id": row.pk, "name": row.name, "version": row.version, "steps": row.steps})
        if kind == "protocol-runs":
            rows = CattleProtocolRun.objects.filter(animal__farm__organization=org).select_related("animal", "protocol").prefetch_related("executions__task").order_by("-created_at")
            if farm:
                rows = rows.filter(animal__farm_id=farm)
            return self.page(request, rows, lambda row: {"id": row.pk, "animal": row.animal.identifier, "protocol": f"{row.protocol.name} v{row.protocol.version}", "start_date": row.start_date, "steps": [{"id": step.pk, "name": row.steps_snapshot[step.number]["name"], "due_date": step.task.due_date, "executed_date": step.executed_date, "status": "done" if step.executed_at else "overdue" if step.task.due_date < timezone.localdate() else "pending"} for step in sorted(row.executions.all(), key=lambda step: step.number)]})
        if kind == "matings":
            from .models import Mating
            rows = Mating.objects.filter(female__farm__organization=org, female__species__code="bovinos").select_related("female").order_by("-mating_date")
            if request.query_params.get("animal"):
                rows = rows.filter(female_id=serializers.UUIDField().run_validation(request.query_params["animal"]))
            return self.page(request, rows, lambda row: {"id": row.pk, "label": f"{row.female.identifier} · {row.mating_date}", "animal": row.female_id})
        if kind == "stock-lots":
            from apps.inventory.models import LoteEstoque
            rows = LoteEstoque.objects.filter(item__organization=org, item__ativo=True, ativo=True, quantidade_atual__gt=0, item__categoria__in=["semen"] if request.query_params.get("category") == "semen" else ["medicamento", "vacina", "medicamento_vacina"], item__especie_animal__in=["", "bovino", "multiplo"]).select_related("item").order_by("data_validade", "created_at")
            return self.page(request, rows, lambda row: {"id": row.pk, "label": f"{row.item.nome} · {row.numero_lote or 'Sem número'} · {row.quantidade_atual} {row.item.unidade_medida}", "unit": row.item.unidade_medida, "expiry": row.data_validade, "balance": row.quantidade_atual})
        if kind in {"milk-trends", "costs"}:
            query = Period(data=request.query_params)
            query.is_valid(raise_exception=True)
            data = query.validated_data
            if kind == "milk-trends":
                from .cattle_analytics import milk_trends
                return Response(milk_trends(org, **{key: value for key, value in data.items() if key in {"start", "end", "farm", "animal", "drop_percent"}}))
            if request.user.role not in {"admin", "manager"}:
                raise PermissionDenied("Apuração de custos disponível ao gerente ou administrador.")
            from .cattle_analytics import cattle_cost_report
            return Response(cattle_cost_report(org, **{key: value for key, value in data.items() if key in {"start", "end", "farm", "batch"}}, purpose=data["production"]))
        raise serializers.ValidationError("Consulta desconhecida.")

    def post(self, request, kind):
        if request.query_params.get('view') == 'mobile' and kind in ['protocol-execution-preview','protocol-execution-confirm']:
            from . import mobile_protocol_execution as execution
            from .mobile_vaccination import ConfirmInput
            if kind == 'protocol-execution-preview':
                values=execution.Input(data=request.data);values.is_valid(raise_exception=True)
                return Response(execution.preview(request.user,values.validated_data))
            values=ConfirmInput(data=request.data);values.is_valid(raise_exception=True)
            return Response(execution.confirm(request.user,values.validated_data['preview_token']))
        if request.query_params.get('view') == 'mobile' and kind in ['protocol-start-preview','protocol-start-confirm']:
            from . import mobile_protocol_start as protocol_start
            from .mobile_vaccination import ConfirmInput
            if kind == 'protocol-start-preview':
                values=protocol_start.Input(data=request.data);values.is_valid(raise_exception=True)
                return Response(protocol_start.preview(request.user,values.validated_data))
            values=ConfirmInput(data=request.data);values.is_valid(raise_exception=True)
            return Response(protocol_start.confirm(request.user,values.validated_data['preview_token']),status=201)
        if request.query_params.get('view') == 'mobile' and kind in ['classification-preview', 'classification-confirm']:
            from . import mobile_classification as classification
            from .mobile_vaccination import ConfirmInput
            classification.writable(request.user)
            if kind == 'classification-preview':
                values = classification.Input(data=request.data); values.is_valid(raise_exception=True)
                return Response(classification.preview(request.user, values.validated_data))
            values = ConfirmInput(data=request.data); values.is_valid(raise_exception=True)
            return Response(classification.confirm(request.user, values.validated_data['preview_token']))
        if request.query_params.get('view') == 'mobile' and kind == 'occurrences':
            from . import mobile_cattle_occurrence as occurrence
            occurrence.writable(request.user)
            values = occurrence.Input(data=request.data); values.is_valid(raise_exception=True)
            return Response(occurrence.create(request.user, values.validated_data), status=201)
        user, org = request.user, request.user.organization
        if user.role not in {"admin", "manager"}:
            if user.role != "operator" or user.operator_read_only or kind not in {"occurrences", "resolve-occurrence", "start-protocol", "execute-step"}:
                raise PermissionDenied("Esta operação exige gerente ou administrador ou acesso operacional autorizado.")
        data = request.data
        if kind == "classify":
            class Input(serializers.Serializer):
                animals = serializers.ListField(child=serializers.UUIDField(), max_length=1000, default=list)
                batches = serializers.ListField(child=serializers.UUIDField(), max_length=1000, default=list)
                purpose = serializers.ChoiceField(choices=commands.PURPOSES)
            query = Input(data=data); query.is_valid(raise_exception=True)
            return Response(commands.classify(user, **query.validated_data))
        if kind == "transfers":
            query = TransferInput(data=data); query.is_valid(raise_exception=True)
            values = query.validated_data
            preview = values.pop("preview")
            if preview:
                return Response(commands.transfer_preview(user, **values))
            record = commands.transfer(user, values)
            return Response({"id": record.pk, "snapshot": record.snapshot}, status=201)
        if kind == "move-pasture":
            from .models import CattlePasture
            batch=AnimalBatch.objects.filter(pk=serializers.UUIDField().run_validation(data.get("batch")),farm__organization=org,species__code="bovinos").first()
            pasture=CattlePasture.objects.filter(pk=serializers.UUIDField().run_validation(data.get("pasture")),farm__organization=org).first()
            if not batch or not pasture: raise serializers.ValidationError("Lote ou pasto não autorizado.")
            result=commands.move_pasture(user,batch=batch,pasture=pasture,reason=serializers.CharField(max_length=300).run_validation(data.get("reason")),request_key=serializers.UUIDField().run_validation(data.get("request_key")),preview=serializers.BooleanField().run_validation(data.get("preview",True)),expected_source=data.get("expected_source"))
            return Response(result)
        if kind in {"import-preview", "import-confirm"}:
            farm = self.farm(request, data.get("farm"))
            rows = data.get("rows")
            if not isinstance(rows, list) or not 1 <= len(rows) <= 500 or any(not isinstance(row, dict) for row in rows):
                raise serializers.ValidationError("Envie entre 1 e 500 linhas válidas.")
            # Explicit whitelist excludes initial purchase/financial side effects.
            allowed = {"identifier", "name", "gender", "category", "birth_date", "entry_date", "breed_name_input", "initial_weight_kg", "notes", "cattle_purpose"}
            if any(set(row)-allowed for row in rows):
                raise serializers.ValidationError("A planilha contém colunas não permitidas.")
            if kind == "import-preview":
                return Response({"rows": commands.import_preview(user, farm, rows)})
            try:
                created = commands.import_animals(user, farm, rows)
            except IntegrityError:
                raise serializers.ValidationError("Os dados mudaram durante a importação. Confira novamente a prévia; nenhum animal deste arquivo foi gravado.") from None
            return Response({"created": created}, status=201)
        if kind == "occurrences":
            farm = self.farm(request, data.get("farm"))
            assigned_to = self.member(request, data.get("assigned_to"))
            day = serializers.DateField(validators=[past_date]).run_validation(data.get("date"))
            due = serializers.DateField().run_validation(data.get("due_date"))
            if due < day:
                raise serializers.ValidationError("O prazo não pode anteceder a ocorrência.")
            values = {"farm": farm, "assigned_to": assigned_to, "date": day, "due_date": due, "kind": serializers.ChoiceField(choices=["animal", "water", "fence", "pasture", "other"]).run_validation(data.get("kind")), "description": serializers.CharField(max_length=1000).run_validation(data.get("description"))}
            for key, model in [("animal", Animal), ("batch", AnimalBatch)]:
                if data.get(key):
                    target = model.objects.filter(pk=serializers.UUIDField().run_validation(data[key]), farm=farm, species__code="bovinos").first()
                    if not target:
                        raise serializers.ValidationError({key: "Participante não autorizado nesta fazenda."})
                    values[key] = target
            record = commands.create_occurrence(user, values)
            return Response({"id": record.pk, "task": record.task_id}, status=201)
        if kind == "resolve-occurrence":
            row = CattleOccurrence.objects.filter(pk=serializers.UUIDField().run_validation(data.get("id")), farm__organization=org).select_related("task").first()
            if not row or (user.role == "operator" and row.task.assigned_to_id != user.pk and row.created_by_id != user.pk):
                raise PermissionDenied("Ocorrência não autorizada.")
            row = commands.resolve_occurrence(user, row, serializers.CharField(max_length=1000).run_validation(data.get("resolution")))
            return Response({"id": row.pk, "resolved_at": row.resolved_at})
        if kind == "protocols":
            name = serializers.CharField(max_length=100).run_validation(data.get("name"))
            steps = data.get("steps")
            if not isinstance(steps,list) or not 1 <= len(steps) <= 30:
                raise serializers.ValidationError("Informe entre 1 e 30 etapas.")
            clean = []
            for step in steps:
                if not isinstance(step,dict): raise serializers.ValidationError("Etapa inválida.")
                clean.append({"name": serializers.CharField(max_length=150).run_validation(step.get("name")), "day": serializers.IntegerField(min_value=0,max_value=365).run_validation(step.get("day"))})
            if [step["day"] for step in clean] != sorted(step["day"] for step in clean):
                raise serializers.ValidationError("Ordene as etapas pelo dia relativo de execução.")
            row = commands.create_protocol(user, name, clean)
            return Response({"id": row.pk, "version": row.version},status=201)
        if kind == "start-protocol":
            animal = Animal.objects.filter(pk=serializers.UUIDField().run_validation(data.get("animal")), farm__organization=org, species__code="bovinos").first()
            protocol = CattleProtocol.objects.filter(pk=serializers.UUIDField().run_validation(data.get("protocol")), organization=org).first()
            if not animal or not protocol: raise serializers.ValidationError("Animal ou protocolo não autorizado.")
            start = serializers.DateField().run_validation(data.get("start_date"))
            if animal.entry_date and start < animal.entry_date: raise serializers.ValidationError("O protocolo não pode anteceder a entrada do animal.")
            assigned = self.member(request, data.get("assigned_to"))
            row = commands.start_protocol(user,animal=animal,protocol=protocol,start_date=start,request_key=serializers.UUIDField().run_validation(data.get("request_key")),assigned_to=assigned)
            return Response({"id": row.pk},status=201)
        if kind == "execute-step":
            step = CattleProtocolStep.objects.filter(pk=serializers.UUIDField().run_validation(data.get("id")), run__animal__farm__organization=org).select_related("task", "run").first()
            if not step or (user.role=="operator" and step.task.assigned_to_id != user.pk and step.run.created_by_id != user.pk): raise PermissionDenied("Etapa não autorizada.")
            from apps.inventory.models import LoteEstoque
            from .models import Mating
            lot = None
            mating = None
            if data.get("inventory_lot"):
                lot = LoteEstoque.objects.filter(pk=serializers.UUIDField().run_validation(data["inventory_lot"]), item__organization=org).first()
                if not lot: raise serializers.ValidationError("Lote não autorizado.")
            if data.get("mating"):
                mating = Mating.objects.filter(pk=serializers.UUIDField().run_validation(data["mating"]), female__farm__organization=org).first()
                if not mating: raise serializers.ValidationError("Cobertura não autorizada.")
            quantity = serializers.DecimalField(max_digits=10, decimal_places=2,min_value=Decimal("0.01")).run_validation(data["inventory_quantity"]) if data.get("inventory_quantity") else None
            row = commands.execute_protocol_step(user,step,serializers.DateField(validators=[past_date]).run_validation(data.get("date")),serializers.CharField(max_length=1000,allow_blank=True,default="").run_validation(data.get("notes","")),lot,quantity,mating)
            return Response({"id":row.pk,"executed_date":row.executed_date})
        raise serializers.ValidationError("Operação desconhecida.")


class CattleOperationMobileDetailView(APIView):
    permission_classes = [CattlePermission]

    def get(self, request, kind, pk):
        from django.shortcuts import get_object_or_404
        from . import mobile_protocols as protocols
        if kind in protocols.KINDS:
            row = get_object_or_404(protocols.rows(request.user, kind, request.query_params), pk=pk)
            return Response(protocols.detail(row, kind, request.user))
        from . import mobile_cattle_operations as mobile
        row = get_object_or_404(mobile.rows(request.user, kind, request.query_params), pk=pk)
        return Response(mobile.data(row, kind, request.user))


class CattleOccurrenceMobileResolutionView(APIView):
    permission_classes = [CattlePermission]
    create_roles = {'admin', 'manager', 'operator'}

    def get(self, request, pk):
        from . import mobile_cattle_occurrence as occurrence
        return Response(occurrence.resolve_options(request.user, pk, request.query_params))

    def post(self, request, pk):
        from . import mobile_cattle_occurrence as occurrence
        occurrence.writable(request.user)
        values = occurrence.ResolveInput(data=request.data); values.is_valid(raise_exception=True)
        return Response(occurrence.resolve(request.user, pk, values.validated_data))
