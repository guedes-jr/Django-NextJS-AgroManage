"""
Livestock domain models — species, breeds, animals, batches.
Generic model supports cattle, swine, poultry, sheep and more.
"""
from common.models import BaseModel
from django.db import models


class Species(BaseModel):
    """Animal species (e.g. Bovino, Suíno, Aves, Ovino)."""

    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Species"
        verbose_name_plural = "Species"

    def __str__(self) -> str:
        return self.name


class Breed(BaseModel):
    """Breed within a species (e.g. Nelore, Landrace, Cobb)."""

    species = models.ForeignKey(Species, on_delete=models.CASCADE, related_name="breeds")
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Breed"
        verbose_name_plural = "Breeds"
        unique_together = [["species", "name"]]

    def __str__(self) -> str:
        return f"{self.species.name} — {self.name}"


class AnimalBatch(BaseModel):
    """
    A batch / lot of animals of the same species managed collectively.
    Used for poultry, swine lots, and cattle groups.
    """

    class Origin(models.TextChoices):
        PURCHASED = "purchased", "Comprado"
        BORN = "born", "Nascido"
        DONATED = "donated", "Doado"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SOLD = "sold", "Sold"
        FINISHED = "finished", "Finished"
        DEAD = "dead", "Dead"

    class Category(models.TextChoices):
        BEZERRO = "Bezerro", "Bezerro"
        GARROTE = "Garrote", "Garrote"
        NOVILHA = "Novilha", "Novilha"
        TOURO = "Touro", "Touro"
        MATRIZ = "Matriz", "Matriz"
        LEITAO = "Leitão", "Leitão"
        TERMINACAO = "Terminação", "Terminação"
        CACHACO = "Cachaço", "Cachaço"
        PINTO = "Pinto", "Pinto"
        FRANGO_CORTE = "Frango de Corte", "Frango de Corte"
        POEDEIRA = "Poedeira", "Poedeira"

    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE, related_name="animal_batches")
    sector = models.ForeignKey(
        "farms.Sector", on_delete=models.SET_NULL, null=True, blank=True, related_name="animal_batches"
    )
    species = models.ForeignKey(Species, on_delete=models.PROTECT, related_name="batches")
    breed = models.ForeignKey(Breed, on_delete=models.SET_NULL, null=True, blank=True)
    batch_code = models.CharField(max_length=50)
    quantity = models.PositiveIntegerField(default=0)
    entry_date = models.DateField()
    exit_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    origin = models.CharField(max_length=20, choices=Origin.choices, default=Origin.PURCHASED)
    purchase_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    sale_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    gender = models.CharField(max_length=20, null=True, blank=True)
    category = models.CharField(max_length=50, choices=Category.choices, null=True, blank=True)
    name = models.CharField(max_length=100, null=True, blank=True)
    avg_weight_kg = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Animal Batch"
        verbose_name_plural = "Animal Batches"
        unique_together = [["farm", "batch_code"]]

    def __str__(self) -> str:
        return f"{self.batch_code} ({self.species}) @ {self.farm}"


class Animal(BaseModel):
    """
    Individual animal tracking (mainly for Swine and Cattle reproductive phases).
    """

    class Gender(models.TextChoices):
        MALE = "M", "Macho"
        FEMALE = "F", "Fêmea"

    class ReproductiveStatus(models.TextChoices):
        VAZIA = "vazia", "Vazia"
        EM_PREPARO = "em_preparo", "Em Preparo"
        PRONTA = "pronta", "Pronta para Serviço"
        COBERTA = "coberta", "Coberta (Aguardando DG)"
        GESTANTE = "gestante", "Gestante"
        LACTANTE = "lactante", "Lactante"
        DESCANSO = "descanso", "Em Descanso"
        ATIVA = "ativa", "Ativa (Macho)"

    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE, related_name="animals")
    species = models.ForeignKey(Species, on_delete=models.PROTECT, related_name="animals")
    breed = models.ForeignKey(Breed, on_delete=models.SET_NULL, null=True, blank=True)
    batch = models.ForeignKey(AnimalBatch, on_delete=models.SET_NULL, null=True, blank=True, help_text="Lote de origem, se houver")
    
    identifier = models.CharField(max_length=50, help_text="Brinco, tatuagem ou nome")
    birth_date = models.DateField(null=True, blank=True)
    entry_date = models.DateField(null=True, blank=True)
    
    gender = models.CharField(max_length=1, choices=Gender.choices, default=Gender.FEMALE)
    category = models.CharField(max_length=50, choices=AnimalBatch.Category.choices, null=True, blank=True)
    status = models.CharField(max_length=20, choices=AnimalBatch.Status.choices, default=AnimalBatch.Status.ACTIVE)
    reproductive_status = models.CharField(max_length=20, choices=ReproductiveStatus.choices, default=ReproductiveStatus.EM_PREPARO)
    
    initial_weight_kg = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    current_weight_kg = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Animal"
        verbose_name_plural = "Animals"
        unique_together = [["farm", "identifier"]]

    def __str__(self) -> str:
        return f"{self.identifier} ({self.species})"


class Mating(BaseModel):
    """
    Cobertura ou Inseminação Artificial.
    """
    
    class MatingType(models.TextChoices):
        NATURAL = "natural", "Monta Natural"
        AI = "ai", "Inseminação Artificial"
        IATF = "iatf", "IATF"

    class Status(models.TextChoices):
        PENDING_DG = "pending_dg", "Aguardando Diagnóstico"
        CONFIRMED = "confirmed", "Prenhez Confirmada"
        FAILED = "failed", "Falha/Vazia"

    female = models.ForeignKey(Animal, on_delete=models.CASCADE, related_name="matings_as_female")
    sire = models.ForeignKey(Animal, on_delete=models.SET_NULL, null=True, blank=True, related_name="matings_as_sire", help_text="Touro ou cachaço")
    sire_info = models.CharField(max_length=100, blank=True, help_text="Informação do sêmen se não for animal cadastrado")
    
    mating_date = models.DateField()
    mating_type = models.CharField(max_length=20, choices=MatingType.choices, default=MatingType.AI)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING_DG)
    
    expected_birth_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Mating"
        verbose_name_plural = "Matings"

    def __str__(self) -> str:
        return f"Mating {self.female.identifier} on {self.mating_date}"


class Pregnancy(BaseModel):
    """
    Gestação confirmada.
    """
    
    class Status(models.TextChoices):
        ONGOING = "ongoing", "Em andamento"
        COMPLETED = "completed", "Concluída (Parto)"
        LOST = "lost", "Perda/Aborto"

    mating = models.OneToOneField(Mating, on_delete=models.CASCADE, related_name="pregnancy")
    female = models.ForeignKey(Animal, on_delete=models.CASCADE, related_name="pregnancies")
    
    start_date = models.DateField()
    expected_birth_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ONGOING)
    
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Pregnancy"
        verbose_name_plural = "Pregnancies"

    def __str__(self) -> str:
        return f"Pregnancy of {self.female.identifier}"


class Birth(BaseModel):
    """
    Registro de Parto.
    """
    
    pregnancy = models.OneToOneField(Pregnancy, on_delete=models.CASCADE, related_name="birth")
    female = models.ForeignKey(Animal, on_delete=models.CASCADE, related_name="births")
    
    birth_date = models.DateField()
    live_born = models.PositiveIntegerField(default=0)
    stillborn = models.PositiveIntegerField(default=0)
    mummified = models.PositiveIntegerField(default=0)
    
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Birth"
        verbose_name_plural = "Births"

    @property
    def total_born(self) -> int:
        return self.live_born + self.stillborn + self.mummified

    def __str__(self) -> str:
        return f"Birth by {self.female.identifier} on {self.birth_date}"


class Litter(BaseModel):
    """
    Leitegada vinculada a um parto, antes de virar lote na creche.
    """
    
    birth = models.OneToOneField(Birth, on_delete=models.CASCADE, related_name="litter")
    weaning_date = models.DateField(null=True, blank=True)
    weaned_quantity = models.PositiveIntegerField(default=0, help_text="Quantidade desmamada viva")
    avg_weaning_weight_kg = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Litter"
        verbose_name_plural = "Litters"

    def __str__(self) -> str:
        return f"Litter from birth {self.birth.id}"


class Incubation(BaseModel):
    """
    Registro de incubação de ovos (Aves).
    """
    
    class Status(models.TextChoices):
        INCUBATING = "incubating", "Incubando"
        HATCHED = "hatched", "Eclodido"
        FAILED = "failed", "Falha"

    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE, related_name="incubations")
    batch = models.ForeignKey(AnimalBatch, on_delete=models.CASCADE, related_name="incubations", help_text="Lote de matrizes de origem")
    
    start_date = models.DateField()
    expected_hatch_date = models.DateField()
    eggs_incubated = models.PositiveIntegerField(default=0)
    eggs_hatched = models.PositiveIntegerField(default=0)
    
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INCUBATING)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Incubation"
        verbose_name_plural = "Incubations"

    def __str__(self) -> str:
        return f"Incubation from batch {self.batch.batch_code} on {self.start_date}"
