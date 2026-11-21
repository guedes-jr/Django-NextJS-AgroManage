"""
Área do veterinário: the vet's own clients, the animals attended and every procedure.

Clients and animals are isolated from the organization's herd: a vet attends external farms.
A client may be linked to a farm of the organization; with Recursos dos segmentos › Integração
com o rebanho on, procedures are also written to that farm's herd (see ``herd_sync``).
Business rules (status, next procedure, alerts) live in services/selectors.
"""
from decimal import Decimal

from django.db import models

from common.models import BaseModel


class Category(models.TextChoices):
    OPEN_COW = "vaca_solteira", "Vaca solteira"
    LACTATING_COW = "vaca_parida", "Vaca parida"
    HEIFER = "novilha", "Novilha"


class VeterinaryClient(BaseModel):
    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="veterinary_clients")
    name = models.CharField(max_length=150)
    farm_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    # Farm of this organization the client corresponds to (herd integration).
    farm = models.ForeignKey("farms.Farm", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    data = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("created_at",)

    def __str__(self):
        return f"{self.name} · {self.farm_name}" if self.farm_name else self.name


class VeterinaryAnimal(BaseModel):
    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="veterinary_animals")
    client = models.ForeignKey(VeterinaryClient, on_delete=models.CASCADE, related_name="animals")
    identifier = models.CharField(max_length=60)
    name = models.CharField(max_length=120, blank=True)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OPEN_COW)
    # Metadata and integrations; {"herd_animal_id": "<uuid>"} links the herd animal.
    data = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(fields=("client", "identifier"), name="unique_veterinary_animal_identifier"),
        ]

    def __str__(self):
        return self.identifier


class VeterinaryProcedure(BaseModel):
    """One procedure on one animal (a prototype "atendimento")."""

    class Kind(models.TextChoices):
        INSEMINATION = "insemination", "Inseminação"
        PROTOCOL = "protocol", "Protocolo IATF"
        IATF_INSEMINATION = "iatf_insemination", "IATF (inseminar)"
        ULTRASOUND = "ultrasound", "Ultrassom"
        PALPATION = "palpation", "Palpação"
        OTHER = "other", "Outro"

    class Result(models.TextChoices):
        NONE = "", "—"
        PREGNANT = "pregnant", "Prenha"
        OPEN = "open", "Vazia"

    class Conduct(models.TextChoices):
        NONE = "", "—"
        IATF_PROTOCOL = "iatf_protocol", "Protocolo IATF"
        OBSERVE_HEAT = "observe_heat", "Observar cio"
        INDUCTION = "induction", "Indução"
        DISCARD = "discard", "Descarte"

    class Cycling(models.TextChoices):
        NONE = "", "—"
        CYCLING = "cycling", "Ciclando"
        NOT_CYCLING = "not_cycling", "Não ciclando"

    class CoverageMethod(models.TextChoices):
        NONE = "", "—"
        ARTIFICIAL = "artificial", "Inseminação artificial"
        NATURAL = "natural", "Monta natural"

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="veterinary_procedures")
    client = models.ForeignKey(VeterinaryClient, on_delete=models.PROTECT, related_name="procedures")
    animal = models.ForeignKey(VeterinaryAnimal, on_delete=models.CASCADE, related_name="procedures")
    date = models.DateField(db_index=True)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    result = models.CharField(max_length=10, choices=Result.choices, blank=True, default="")
    semen = models.CharField(max_length=120, blank=True)
    value = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    paid = models.BooleanField(default=False)
    notes = models.CharField(max_length=500, blank=True)
    responsible = models.CharField(max_length=120, blank=True)
    category = models.CharField(max_length=20, choices=Category.choices, blank=True)
    conduct = models.CharField(max_length=20, choices=Conduct.choices, blank=True, default="")
    cycling = models.CharField(max_length=15, choices=Cycling.choices, blank=True, default="")
    management_days = models.PositiveSmallIntegerField(null=True, blank=True)
    protocol_start = models.DateField(null=True, blank=True)
    return_days = models.PositiveSmallIntegerField(default=0)
    discard_reason = models.CharField(max_length=60, blank=True)
    coverage_date = models.DateField(null=True, blank=True)
    gestation_days = models.PositiveSmallIntegerField(default=0)
    bull = models.CharField(max_length=120, blank=True)
    calving_date = models.DateField(null=True, blank=True)
    coverage_method = models.CharField(max_length=12, choices=CoverageMethod.choices, blank=True, default="")
    # Protocol stage recorded by this procedure (removal D8/D9 or IATF insemination), with the D number.
    step = models.CharField(max_length=20, choices=(("", "—"), ("removal", "Retirada do dispositivo"), ("insemination", "Inseminação do IATF")), blank=True, default="")
    step_day = models.PositiveSmallIntegerField(null=True, blank=True)
    rescheduled_to = models.DateField(null=True, blank=True)
    # Where the pregnancy came from when it was confirmed (IATF protocol or insemination).
    origin_kind = models.CharField(max_length=20, blank=True, default="")
    not_done = models.BooleanField(default=False)
    # Team member with a login who performed it (``responsible`` keeps the typed name).
    responsible_user = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    # Metadata: herd records written by the integration, pricing applied, API data.
    data = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta(BaseModel.Meta):
        ordering = ("-date", "-created_at")
        indexes = [models.Index(fields=("organization", "date"))]


class VeterinaryAlert(BaseModel):
    """Scheduled step created by a procedure (protocol D8/D10, heat, induction, calving, ultrasound)."""

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="veterinary_alerts")
    client = models.ForeignKey(VeterinaryClient, on_delete=models.CASCADE, related_name="alerts")
    animal = models.ForeignKey(VeterinaryAnimal, on_delete=models.CASCADE, related_name="alerts")
    procedure = models.ForeignKey(VeterinaryProcedure, on_delete=models.SET_NULL, null=True, blank=True, related_name="alerts")
    class Kind(models.TextChoices):
        CALVING = "calving", "Parto previsto"
        REMOVAL = "removal", "Retirar dispositivo + prostaglandina + indutor de ovulação + eCG"
        INSEMINATE = "inseminate", "Inseminar"
        OBSERVE_HEAT = "observe_heat", "Observar cio"
        INDUCTION_REVIEW = "induction_review", "Reavaliar após a indução"
        ULTRASOUND = "ultrasound", "Fazer ultrassom (diagnóstico)"

    date = models.DateField(db_index=True)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    # D number for protocol steps; calving alerts keep the expected calving date here.
    day = models.PositiveSmallIntegerField(null=True, blank=True)
    reference_date = models.DateField(null=True, blank=True)
    done = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        ordering = ("date", "created_at")


class VeterinarySettings(BaseModel):
    """Per-organization price table (per animal) and the last responsible typed."""

    organization = models.OneToOneField("organizations.Organization", on_delete=models.CASCADE, related_name="veterinary_settings")
    price_insemination = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("35"))
    price_protocol = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("25"))
    price_iatf_insemination = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("45"))
    price_ultrasound = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("15"))
    price_palpation = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("10"))
    price_other = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("30"))
    last_responsible = models.CharField(max_length=120, blank=True)
    # Finance integration: days until an unpaid procedure is due in Contas a receber.
    payment_days = models.PositiveSmallIntegerField(default=30)
    # Client pricing: discount when a visit attends at least ``discount_min_animals`` animals,
    # and a closed price for the IATF package (protocol + insemination), charged at insemination.
    discount_min_animals = models.PositiveSmallIntegerField(null=True, blank=True)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    price_iatf_package = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Prescription header.
    vet_name = models.CharField(max_length=120, blank=True)
    vet_registry = models.CharField(max_length=60, blank=True)
    vet_phone = models.CharField(max_length=40, blank=True)

    PRICE_FIELDS = {
        VeterinaryProcedure.Kind.INSEMINATION: "price_insemination",
        VeterinaryProcedure.Kind.PROTOCOL: "price_protocol",
        VeterinaryProcedure.Kind.IATF_INSEMINATION: "price_iatf_insemination",
        VeterinaryProcedure.Kind.ULTRASOUND: "price_ultrasound",
        VeterinaryProcedure.Kind.PALPATION: "price_palpation",
        VeterinaryProcedure.Kind.OTHER: "price_other",
    }

    def price(self, kind):
        return getattr(self, self.PRICE_FIELDS[kind])


class VeterinaryClientPrice(BaseModel):
    """Price of one procedure kind for one client (Recursos › Preço por cliente)."""

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="veterinary_client_prices")
    client = models.ForeignKey(VeterinaryClient, on_delete=models.CASCADE, related_name="prices")
    kind = models.CharField(max_length=20, choices=VeterinaryProcedure.Kind.choices)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta(BaseModel.Meta):
        constraints = [models.UniqueConstraint(fields=("client", "kind"), name="unique_veterinary_client_price")]


class VeterinaryTeamMember(BaseModel):
    """A user with a login who attends for the area, and the commission paid per procedure."""

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="veterinary_team")
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="veterinary_memberships")
    commission_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        ordering = ("created_at",)
        constraints = [models.UniqueConstraint(fields=("organization", "user"), name="unique_veterinary_team_member")]


class VeterinaryProcedureInput(BaseModel):
    """Stock used in a procedure (semen, hormones, devices); the movement is the stock exit."""

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="veterinary_inputs")
    procedure = models.ForeignKey(VeterinaryProcedure, on_delete=models.CASCADE, related_name="inputs")
    lot = models.ForeignKey("inventory.LoteEstoque", on_delete=models.PROTECT, related_name="+")
    item = models.ForeignKey("inventory.ItemEstoque", on_delete=models.PROTECT, related_name="+")
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    total_cost = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    movement = models.ForeignKey("inventory.MovimentacaoEstoque", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta(BaseModel.Meta):
        ordering = ("created_at",)


def attachment_path(instance, filename):
    """veterinary/<organization>/<animal>/<random>.<ext>: the original name stays in ``name``."""
    import uuid
    from pathlib import Path

    suffix = Path(filename).suffix.lower()[:10]
    return f"veterinary/{instance.organization_id}/{instance.animal_id}/{uuid.uuid4().hex}{suffix}"


class VeterinaryAttachment(BaseModel):
    """Photo (ultrasound) or document attached to an animal, optionally to one procedure."""

    class Kind(models.TextChoices):
        PHOTO = "photo", "Foto"
        DOCUMENT = "document", "Documento"

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="veterinary_attachments")
    animal = models.ForeignKey(VeterinaryAnimal, on_delete=models.CASCADE, related_name="attachments")
    procedure = models.ForeignKey(VeterinaryProcedure, on_delete=models.SET_NULL, null=True, blank=True, related_name="attachments")
    file = models.FileField(upload_to=attachment_path)
    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.PHOTO)
    size = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta(BaseModel.Meta):
        ordering = ("-created_at",)


class VeterinaryPrescription(BaseModel):
    """Receituário: products, doses and instructions for one animal (or the whole visit)."""

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="veterinary_prescriptions")
    client = models.ForeignKey(VeterinaryClient, on_delete=models.CASCADE, related_name="prescriptions")
    animal = models.ForeignKey(VeterinaryAnimal, on_delete=models.CASCADE, null=True, blank=True, related_name="prescriptions")
    procedure = models.ForeignKey(VeterinaryProcedure, on_delete=models.SET_NULL, null=True, blank=True, related_name="prescriptions")
    date = models.DateField()
    # [{"product": str, "dose": str, "route": str, "frequency": str, "duration": str}]
    items = models.JSONField(default=list)
    notes = models.TextField(blank=True)
    withdrawal = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta(BaseModel.Meta):
        ordering = ("-date", "-created_at")
