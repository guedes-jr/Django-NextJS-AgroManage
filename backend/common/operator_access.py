"""Organization operator scope, independent of UI visibility."""

from functools import wraps

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Model, Q
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS

SPECIES_PATHS = {
    "Animal": ["species"],
    "AnimalBatch": ["species"],
    "Species": [""],
    "Breed": ["species"],
    "Mating": ["female__species"],
    "Pregnancy": ["female__species"],
    "Birth": ["female__species"],
    "Litter": ["birth__female__species"],
    "Incubation": ["batch__species"],
    "VaccinationRecord": ["species"],
    "WeightRecord": ["species"],
    "HealthRecord": ["animal__species"],
    "FeedingRecord": ["animal__species", "batch__species"],
    "Symptom": ["species"],
    "Disease": ["species"],
    "ClinicalRecord": ["animal__species", "batch__species"],
    "HeatRecord": ["animal__species"],
    "LitterMedication": ["batch__species"],
    "HistoricoEvento": ["matriz__species", "lote__species"],
    "SanitaryAlert": ["affected_animals__species", "affected_batches__species"],
    "MedicationInventory": ["species_indicated"],
    "ConsumoRacao": ["lote_animal__species", "animais__species"],
}
OPERATIONAL_MODELS = {
    "Animal",
    "AnimalBatch",
    "Mating",
    "Pregnancy",
    "Birth",
    "Litter",
    "Incubation",
    "VaccinationRecord",
    "WeightRecord",
    "HealthRecord",
    "ClinicalRecord",
    "Planting",
    "Fertilization",
    "Fertigation",
    "PesticideApplication",
    "Irrigation",
    "SoilAnalysis",
    "LandPreparation",
    "ConsumoRacao",
}
OPERATIONAL_ACTIONS = {
    "register_weight",
    "registrar_vacinacao",
    "registrar_mortalidade",
    "register_mating",
    "register_vaccination",
    "diagnose_pregnancy",
    "register_heat",
    "registrar_perda",
    "desmamar",
    "registrar_procedimento",
}
FINANCIAL_ACTIONS = {
    "financial_details",
    "sales",
    "register_sale",
    "dashboard",
    "indicators",
    "export",
    "download",
}


def is_operator(user):
    return getattr(user, "role", None) == "operator"


def effective_access(user):
    operator = is_operator(user)
    return {
        "role": user.role,
        "can_manage_users": user.role == "admin",
        "can_view_financial": not operator,
        "can_operate_crops": not operator or user.can_operate_crops,
        "livestock_species": [species.code for species in user.allowed_livestock.all()]
        if operator
        else None,
        "read_only": operator and user.operator_read_only,
    }


def request_allowed(user, request):
    if not is_operator(user):
        return getattr(user, "role", None) in ("admin", "manager")
    path = request.path.removeprefix("/api/v1/").strip("/")
    personal_paths = (
        "auth/me",
        "auth/preferences",
        "auth/change-password",
        "auth/force-change-password",
        "auth/token",
        "auth/logout",
        "notifications",
        "support",
        "affiliates",
    )
    if any(
        path == prefix or path.startswith(prefix + "/") for prefix in personal_paths
    ):
        return True
    if user.operator_read_only and request.method not in SAFE_METHODS:
        return False
    if path == "auth/operator-options":
        return True
    if path == "reports/dashboard":
        return True
    if path == "inventory/consumos" and request.method == "POST":
        return user.allowed_livestock.exists()
    if path.startswith("inventory/"):
        resource = path.split("/")[1]
        return (
            request.method in SAFE_METHODS
            and resource in ("items", "lotes", "formulas", "consumos")
            and (user.can_operate_crops or user.allowed_livestock.exists())
        )
    if path.startswith("tasks"):
        return True
    if path.startswith("crops/"):
        return user.can_operate_crops
    if path.startswith("livestock/"):
        return user.allowed_livestock.exists()
    if path.startswith("farms/") or path in ("farms", "organizations/me"):
        restricted = (
            "farms/assets",
            "farms/asset-implements",
            "farms/structures",
            "farms/structure-items",
        )
        return request.method in SAFE_METHODS and not any(
            path == prefix or path.startswith(prefix + "/") for prefix in restricted
        )
    return False


def enforce_request(user, request):
    if not request_allowed(user, request):
        raise PermissionDenied(
            "Seu perfil não permite acessar esta área. Solicite autorização ao administrador."
        )


def species_codes(user):
    return {species.code for species in user.allowed_livestock.all()}


def scoped_queryset(queryset, user):
    if not is_operator(user):
        return queryset
    paths = SPECIES_PATHS.get(queryset.model.__name__)
    if paths:
        query = Q()
        for path in paths:
            query |= Q(
                **{f"{path}__code__in" if path else "code__in": species_codes(user)}
            )
        if queryset.model.__name__ == "Disease":
            query |= Q(species__isnull=True)
        result = queryset.filter(query).distinct()
        if queryset.model.__name__ in ("ConsumoRacao", "SanitaryAlert"):
            from apps.livestock.models import Species

            forbidden = Species.objects.exclude(code__in=species_codes(user)).values(
                "pk"
            )
            for path in paths:
                result = result.exclude(**{f"{path}__in": forbidden})
        return result
    # Non-species clinical catalogs are shared; farm scoping stays in the view.
    if (
        queryset.model._meta.app_label == "livestock"
        and queryset.model.__name__ not in ("MedicationInventory",)
    ):
        return queryset.none()
    return queryset


def sensitive_key(key):
    key = str(key).lower()
    return key in {
        "amount",
        "price",
        "cost",
        "revenue",
        "expense",
        "profit",
        "margin",
        "salary",
        "balance",
        "financial",
        "financial_details",
        "financial_summary",
        "expenses",
        "revenues",
        "costs",
        "prices",
        "roi",
        "unit_value",
        "kwh_value",
        "total_amount",
        "total_expenses",
        "total_revenues",
    } or any(
        word in key
        for word in (
            "purchase_value",
            "acquisition_value",
            "current_value",
            "depreciation",
            "estimated_value",
            "sale_value",
            "unit_cost",
            "total_cost",
            "total_value",
            "cost",
            "expense",
            "revenue",
            "profit",
            "margin",
            "price",
            "cost_",
            "_cost",
            "_price",
            "price_",
            "valor",
            "preco",
            "custo",
            "lucro",
            "receita",
            "despesa",
            "saldo",
            "financial",
            "payment",
            "transaction",
            "supplier_price",
            "hourly_rate",
            "daily_rate",
            "salary",
            "investment",
            "_revenue",
            "revenue_",
            "_expense",
            "expense_",
            "_profit",
            "profit_",
            "_margin",
            "margin_",
        )
    )


def contains_sensitive_data(data):
    if isinstance(data, dict):
        return any(
            sensitive_key(key) or contains_sensitive_data(value)
            for key, value in data.items()
        )
    if isinstance(data, (list, tuple)):
        return any(contains_sensitive_data(value) for value in data)
    return False


def record_closed(instance):
    if getattr(instance, "status", "") in (
        "paid",
        "approved",
        "sold",
        "finished",
        "closed",
        "completed",
        "lost",
        "failed",
        "dead",
        "hatched",
        "cancelled",
    ):
        return True
    if instance._meta.model_name == "birth":
        return bool(getattr(getattr(instance, "litter", None), "weaning_date", None))
    if instance._meta.model_name == "litter":
        return bool(instance.weaning_date)
    if hasattr(instance, "plantation_id"):
        return instance.plantation.status in ("finished", "cancelled")
    return False


def operational_data(data):
    if isinstance(data, dict):
        return {
            key: operational_data(value)
            for key, value in data.items()
            if not sensitive_key(key)
        }
    if isinstance(data, (list, tuple)):
        return [operational_data(value) for value in data]
    if isinstance(data, str) and "R$" in data:
        return "Informação financeira restrita."
    return data


def validate_related(value, user):
    if isinstance(value, Model):
        if (
            hasattr(value, "organization_id")
            and value.organization_id != user.organization_id
        ):
            raise PermissionDenied("Registro fora da sua organização.")
        if (
            hasattr(value, "organization")
            and value.organization
            and value.organization.pk != user.organization_id
        ):
            raise PermissionDenied("Registro fora da sua organização.")
        if (
            hasattr(value, "farm_id")
            and value.farm.organization_id != user.organization_id
        ):
            raise PermissionDenied("Registro fora da sua organização.")
        parent_paths = {
            "Birth": "female__farm__organization_id",
            "Mating": "female__farm__organization_id",
            "Pregnancy": "female__farm__organization_id",
            "Litter": "birth__female__farm__organization_id",
            "HeatRecord": "animal__farm__organization_id",
        }
        parent_path = parent_paths.get(value.__class__.__name__)
        if (
            parent_path
            and not value.__class__.objects.filter(
                pk=value.pk, **{parent_path: user.organization_id}
            ).exists()
        ):
            raise PermissionDenied("Registro fora da sua organização.")
        if (
            value._meta.app_label == "livestock"
            and value.__class__.__name__ in SPECIES_PATHS
            and not scoped_queryset(
                value.__class__.objects.filter(pk=value.pk), user
            ).exists()
        ):
            raise PermissionDenied("Rebanho não autorizado.")
    elif isinstance(value, dict):
        for item in value.values():
            validate_related(item, user)
    elif isinstance(value, (list, tuple)):
        for item in value:
            validate_related(item, user)


def validate_raw_references(data, user):
    from apps.livestock import models

    references = {
        "animal": models.Animal,
        "female": models.Animal,
        "male": models.Animal,
        "mother": models.Animal,
        "father": models.Animal,
        "batch": models.AnimalBatch,
        "lote_animal": models.AnimalBatch,
        "birth": models.Birth,
        "litter": models.Litter,
        "mating": models.Mating,
        "pregnancy": models.Pregnancy,
        "sire": models.Animal,
        "destino_birth": models.Birth,
    }
    if isinstance(data, dict):
        for key, value in data.items():
            name = key.removesuffix("_id")
            if name in references and value and not isinstance(value, (dict, list)):
                try:
                    obj = references[name].objects.get(pk=value)
                except (
                    references[name].DoesNotExist,
                    ValueError,
                    DjangoValidationError,
                ):
                    raise PermissionDenied(
                        "Referência inválida ou não autorizada."
                    ) from None
                validate_related(obj, user)
            elif isinstance(value, (dict, list)):
                validate_raw_references(value, user)
    elif isinstance(data, list):
        for item in data:
            validate_raw_references(item, user)


def remember_operator_record(user, instance):
    from apps.accounts.models import OperatorRecordOwnership

    if is_operator(user):
        OperatorRecordOwnership.objects.get_or_create(
            user=user,
            organization_id=user.organization_id,
            model_label=instance._meta.label_lower,
            object_id=instance.pk,
        )


def operator_scoped(cls):
    """Wrap domain views once so custom get_queryset/actions retain operator scope."""
    initial = cls.initial

    @wraps(initial)
    def guarded_initial(self, request, *args, **kwargs):
        initial(self, request, *args, **kwargs)
        enforce_request(request.user, request)
        if not is_operator(request.user):
            return
        if (
            request.query_params.get("species")
            and self.__module__.endswith("livestock.views")
            and request.query_params["species"] not in species_codes(request.user)
        ):
            raise PermissionDenied("Rebanho não autorizado.")
        if request.method not in SAFE_METHODS:
            if isinstance(request.data, dict) and request.data.get("status") in (
                "sold",
                "paid",
                "approved",
                "cancelled",
                "closed",
                "finished",
                "completed",
                "lost",
                "failed",
                "dead",
                "hatched",
            ):
                raise PermissionDenied(
                    "Esta mudança de situação exige um gerente ou administrador."
                )
            if contains_sensitive_data(request.data):
                raise PermissionDenied("Campos financeiros são restritos.")
            validate_raw_references(request.data, request.user)
        action = getattr(self, "action", None)
        if action in FINANCIAL_ACTIONS and not (
            self.__module__.endswith("crops.views")
            and action in ("dashboard", "indicators")
        ):
            raise PermissionDenied(
                "Indicadores gerenciais e operações financeiras são restritos."
            )
        if (
            request.method not in SAFE_METHODS
            and cls.__name__ != "AcknowledgeOperationalAlertView"
        ):
            model = (
                self.get_serializer_class().Meta.model
                if hasattr(self, "get_serializer_class")
                else None
            )
            if request.user.operator_read_only or request.method == "DELETE":
                raise PermissionDenied("Seu acesso não permite alterar este registro.")
            crop_bulk = (
                self.__module__.endswith("crops.views")
                and action == "bulk_create"
                and model
                and model.__name__ in ("Fertigation", "PesticideApplication")
            )
            if (
                not crop_bulk
                and action not in ("create", "update", "partial_update")
                and action not in OPERATIONAL_ACTIONS
            ):
                raise PermissionDenied(
                    "Esta operação exige um gerente ou administrador."
                )
            if action in ("create", "update", "partial_update") and (
                not model or model.__name__ not in OPERATIONAL_MODELS
            ):
                raise PermissionDenied(
                    "Este cadastro exige um gerente ou administrador."
                )
        if not hasattr(self, "get_queryset") and self.__module__.endswith(
            "livestock.views"
        ):
            code = request.query_params.get("species", "suinos")
            if code not in species_codes(request.user):
                raise PermissionDenied("Rebanho não autorizado.")

    cls.initial = guarded_initial
    if hasattr(cls, "get_queryset"):
        original_queryset = cls.get_queryset

        @wraps(original_queryset)
        def get_queryset(self):
            return scoped_queryset(original_queryset(self), self.request.user)

        cls.get_queryset = get_queryset
    if hasattr(cls, "get_serializer"):
        original_serializer = cls.get_serializer

        @wraps(original_serializer)
        def get_serializer(self, *args, **kwargs):
            serializer = original_serializer(self, *args, **kwargs)
            if is_operator(self.request.user):
                target = (
                    serializer.child if hasattr(serializer, "child") else serializer
                )
                for field in list(target.fields):
                    if sensitive_key(field):
                        target.fields.pop(field)
                if "data" in kwargs and contains_sensitive_data(kwargs["data"]):
                    raise PermissionDenied("Campos financeiros são restritos.")
            return serializer

        cls.get_serializer = get_serializer
        for method in ("perform_create", "perform_update"):
            original = getattr(cls, method, None)
            if original is None:
                continue

            def wrap_save(original, creating):
                @wraps(original)
                def save(self, serializer):
                    from apps.accounts.models import OperatorRecordOwnership

                    if is_operator(self.request.user):
                        validate_related(serializer.validated_data, self.request.user)
                        if (
                            not creating
                            and serializer.instance._meta.model_name
                            in (
                                "planting",
                                "fertilization",
                                "fertigation",
                                "pesticideapplication",
                                "irrigation",
                                "landpreparation",
                                "laborrecord",
                                "birth",
                                "vaccinationrecord",
                            )
                            and set(serializer.validated_data) - {"notes", "operator"}
                        ):
                            raise PermissionDenied(
                                "Correções de quantidades, datas ou estoque exigem um gerente ou administrador."
                            )
                        if not creating:
                            instance = serializer.instance
                            own = OperatorRecordOwnership.objects.filter(
                                user=self.request.user,
                                organization_id=self.request.user.organization_id,
                                model_label=instance._meta.label_lower,
                                object_id=instance.pk,
                            ).exists()
                            if (
                                instance._meta.model_name == "consumoracao"
                                or not own
                                or record_closed(instance)
                            ):
                                raise PermissionDenied(
                                    "Somente registros próprios ainda abertos podem ser corrigidos."
                                )
                    with transaction.atomic():
                        original(self, serializer)
                        if (
                            creating
                            and is_operator(self.request.user)
                            and serializer.instance
                        ):
                            instance = serializer.instance
                            OperatorRecordOwnership.objects.get_or_create(
                                user=self.request.user,
                                organization_id=self.request.user.organization_id,
                                model_label=instance._meta.label_lower,
                                object_id=instance.pk,
                            )

                return save

            setattr(cls, method, wrap_save(original, method == "perform_create"))
    finalize = cls.finalize_response

    @wraps(finalize)
    def finalize_response(self, request, response, *args, **kwargs):
        if (
            is_operator(getattr(request, "user", None))
            and response.status_code < 400
            and hasattr(response, "data")
        ):
            response.data = operational_data(response.data)
        return finalize(self, request, response, *args, **kwargs)

    cls.finalize_response = finalize_response
    return cls
