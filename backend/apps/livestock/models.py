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
        MARRA = "Marrã", "Marrã"
        VACA = "Vaca", "Vaca"
        LEITAO = "Leitão", "Leitão"
        TERMINACAO = "Terminação", "Terminação"
        CACHACO = "Cachaço", "Cachaço"
        REPRODUTOR = "Reprodutor", "Reprodutor"
        AGUARDANDO_COBERTURA = "Aguardando Cobertura", "Aguardando Cobertura"
        PINTO = "Pinto", "Pinto"
        FRANGO_CORTE = "Frango de Corte", "Frango de Corte"
        POEDEIRA = "Poedeira", "Poedeira"

    class Phase(models.TextChoices):
        CRECHE = "creche", "Creche"
        CRESCIMENTO = "crescimento", "Crescimento"
        ENGORDA = "engorda", "Engorda"
        GESTACAO_MATERNIDADE = "gestacao_maternidade", "Gestação/Maternidade"
        REPRODUCAO = "reproducao", "Reprodução"
        AGUARDANDO_COBERTURA = "aguardando_cobertura", "Aguardando Cobertura"
        OUTRO = "outro", "Outro"

    phase = models.CharField(max_length=30, choices=Phase.choices, null=True, blank=True, help_text="Fase produtiva do lote (creche, crescimento, engorda, etc.)")

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
    mother = models.ForeignKey('Animal', on_delete=models.SET_NULL, null=True, blank=True, related_name="offspring_batches")
    avg_weight_kg = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)
    source_batches = models.ManyToManyField('self', blank=True, symmetrical=False, related_name='merged_into')

    class Meta(BaseModel.Meta):
        verbose_name = "Animal Batch"
        verbose_name_plural = "Animal Batches"
        unique_together = [["farm", "batch_code"]]

    def __str__(self) -> str:
        return f"{self.batch_code} ({self.species}) @ {self.farm}"


class BatchPhaseHistory(BaseModel):
    batch = models.ForeignKey(AnimalBatch, on_delete=models.CASCADE, related_name='phase_histories')
    phase = models.CharField(max_length=50)
    quantity = models.PositiveIntegerField()
    avg_weight_kg = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    entry_date = models.DateField()
    exit_date = models.DateField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Batch Phase History"
        verbose_name_plural = "Batch Phase Histories"
        ordering = ['entry_date']

    def __str__(self):
        return f"{self.batch.batch_code} - {self.phase}"


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
        AGUARDANDO_COBERTURA = "aguardando_cobertura", "Aguardando Cobertura"

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

    # Controle reprodutivo
    birth_count = models.PositiveIntegerField(default=0, help_text="Nº total de partos da fêmea")
    previous_phase = models.CharField(
        max_length=30, blank=True,
        help_text="Status reprodutivo anterior (para retorno após DG negativo)"
    )

    # Filiação (opcional)
    sire_ref = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='offspring_as_sire', verbose_name='Pai (Reprodutor)',
        help_text='Reprodutor pai, se cadastrado no sistema'
    )
    dam_ref = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='offspring_as_dam', verbose_name='Mãe',
        help_text='Mãe, se cadastrada no sistema'
    )
    sire_name = models.CharField(
        max_length=100, blank=True,
        help_text='Nome/registro do pai se não cadastrado no sistema'
    )
    dam_name = models.CharField(
        max_length=100, blank=True,
        help_text='Nome/registro da mãe se não cadastrada no sistema'
    )

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
    birth_time_start = models.TimeField(null=True, blank=True, help_text="Horário de início do parto")
    birth_time_end = models.TimeField(null=True, blank=True, help_text="Horário de término do parto")
    birth_order = models.PositiveIntegerField(default=1, help_text="Número/ordem do parto (1ª cria, 2ª cria...)")
    live_born = models.PositiveIntegerField(default=0)
    stillborn = models.PositiveIntegerField(default=0)
    mummified = models.PositiveIntegerField(default=0)
    mortality = models.PositiveIntegerField(default=0, help_text="Mortalidade pós-parto (registrada durante maternidade)")
    avg_weight_kg = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text="Peso médio dos leitões ao nascimento")
    
    notes = models.TextField(blank=True)
    batch = models.ForeignKey("AnimalBatch", on_delete=models.SET_NULL, null=True, blank=True, related_name="birth_records")

    class Meta(BaseModel.Meta):
        verbose_name = "Birth"
        verbose_name_plural = "Births"

    @property
    def total_born(self) -> int:
        return self.live_born + self.stillborn + self.mummified

    def __str__(self) -> str:
        return f"Birth by {self.female.identifier} on {self.birth_date}"

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        
        # Calcular ordem do parto antes de salvar
        if is_new:
            self.birth_order = self.female.birth_count + 1
        
        super().save(*args, **kwargs)
        
        if is_new:
            female = self.female
            update_fields = []

            # Promover categoria na primeira cria
            if female.category == "Marrã":
                female.category = "Matriz"
                update_fields.append('category')
            elif female.category == "Novilha":
                female.category = "Vaca"
                update_fields.append('category')

            # Incrementar contador de partos
            female.birth_count = female.birth_count + 1
            update_fields.append('birth_count')

            # Mover status reprodutivo para Lactante
            female.reproductive_status = Animal.ReproductiveStatus.LACTANTE
            update_fields.append('reproductive_status')

            if update_fields:
                female.save(update_fields=update_fields)


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


class VaccinationRecord(BaseModel):
    """
    Registro de aplicação de vacina em animal ou lote.
    """

    class DoseType(models.TextChoices):
        UNICA = "unica", "Dose Única"
        PRIMEIRA = "primeira", "1ª Dose"
        SEGUNDA = "segunda", "2ª Dose"
        TERCEIRA = "terceira", "3ª Dose"
        REFORCO = "reforco", "Reforço"

    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE, related_name="vaccinations")
    species = models.ForeignKey(Species, on_delete=models.PROTECT, related_name="vaccinations")
    animal = models.ForeignKey("Animal", on_delete=models.SET_NULL, null=True, blank=True, related_name="vaccinations")
    batch = models.ForeignKey("AnimalBatch", on_delete=models.SET_NULL, null=True, blank=True, related_name="vaccinations")

    vaccine_name = models.CharField(max_length=100)
    vaccine_item = models.ForeignKey(
        "inventory.ItemEstoque",
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name="vacinacoes",
        help_text="Item do estoque (vacina) vinculado"
    )
    application_date = models.DateField()
    next_dose_date = models.DateField(null=True, blank=True)
    dose_type = models.CharField(max_length=20, choices=DoseType.choices, default=DoseType.UNICA)
    dosage_ml = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    batch_number = models.CharField(max_length=50, blank=True, help_text="Número do lote da vacina")
    applicator = models.CharField(max_length=100, blank=True, help_text="Responsável pela aplicação")
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Vaccination Record"
        verbose_name_plural = "Vaccination Records"
        ordering = ["-application_date"]

    def __str__(self) -> str:
        target = self.animal.identifier if self.animal else self.batch.batch_code if self.batch else "—"
        return f"{self.vaccine_name} → {target} em {self.application_date}"


class WeightRecord(BaseModel):
    """
    Registro de pesagem de animal ou lote.
    """
    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE, related_name="weights")
    species = models.ForeignKey(Species, on_delete=models.PROTECT, related_name="weights")
    animal = models.ForeignKey("Animal", on_delete=models.SET_NULL, null=True, blank=True, related_name="weights")
    batch = models.ForeignKey("AnimalBatch", on_delete=models.SET_NULL, null=True, blank=True, related_name="weights")

    weight_kg = models.DecimalField(max_digits=10, decimal_places=3)
    weighing_date = models.DateField()
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Weight Record"
        verbose_name_plural = "Weight Records"
        ordering = ["-weighing_date"]

    def __str__(self) -> str:
        target = self.animal.identifier if self.animal else self.batch.batch_code if self.batch else "—"
        return f"{self.weight_kg}kg ← {target} em {self.weighing_date}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Update current weight on animal or batch
        if self.animal:
            self.animal.current_weight_kg = self.weight_kg
            self.animal.save(update_fields=['current_weight_kg'])
        if self.batch:
            self.batch.avg_weight_kg = self.weight_kg
            self.batch.save(update_fields=['avg_weight_kg'])


class HealthRecord(BaseModel):
    """
    Registro clínico do animal (além de vacinas).
    """
    class TreatmentType(models.TextChoices):
        MEDICACAO = "medication", "Medicação"
        EXAME = "exam", "Exame"
        CIRURGIA = "surgery", "Cirurgia"
        OUTRO = "other", "Outro"

    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE, related_name="health_records")
    animal = models.ForeignKey(Animal, on_delete=models.CASCADE, related_name="health_records")
    
    treatment_type = models.CharField(max_length=20, choices=TreatmentType.choices, default=TreatmentType.MEDICACAO)
    description = models.TextField()
    application_date = models.DateField()
    veterinary = models.CharField(max_length=100, blank=True)
    cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Health Record"
        verbose_name_plural = "Health Records"
        ordering = ["-application_date"]

    def __str__(self) -> str:
        return f"{self.treatment_type} - {self.animal.identifier} em {self.application_date}"


class FeedingRecord(BaseModel):
    """
    Registro de consumo ou troca de dieta.
    """
    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE, related_name="feeding_records")
    animal = models.ForeignKey(Animal, on_delete=models.SET_NULL, null=True, blank=True, related_name="feeding_records")
    batch = models.ForeignKey(AnimalBatch, on_delete=models.SET_NULL, null=True, blank=True, related_name="feeding_records")
    
    feed_type = models.CharField(max_length=100)
    quantity_kg = models.DecimalField(max_digits=10, decimal_places=3)
    date = models.DateField()
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Feeding Record"
        verbose_name_plural = "Feeding Records"
        ordering = ["-date"]

    def __str__(self) -> str:
        target = self.animal.identifier if self.animal else self.batch.batch_code if self.batch else "—"
        return f"{self.feed_type} ({self.quantity_kg}kg) para {target} em {self.date}"


class Symptom(BaseModel):
    """Sintoma padrão"""
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    species = models.ManyToManyField(Species)
    urgency_level = models.CharField(
        max_length=20,
        choices=[
            ('low', 'Baixa'),
            ('medium', 'Média'),
            ('high', 'Alta'),
            ('critical', 'Crítica'),
        ],
        default='medium'
    )
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return self.name


class Disease(BaseModel):
    """Doença/Patologia"""
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    species = models.ForeignKey(
        Species,
        on_delete=models.CASCADE,
        related_name='diseases'
    )
    description = models.TextField()
    
    # Sintomas e manifestação
    symptoms = models.ManyToManyField(Symptom)
    typical_symptoms = models.JSONField(
        default=list,
        help_text='Sintomas típicos dessa doença'
    )
    
    # Tratamento
    recommended_treatment = models.TextField()
    typical_duration_days = models.IntegerField(null=True, blank=True)
    
    # Epidemiologia
    incubation_period_days = models.IntegerField(null=True, blank=True)
    transmission_route = models.CharField(
        max_length=50,
        choices=[
            ('direct', 'Contato direto'),
            ('indirect', 'Contato indireto'),
            ('respiratory', 'Via respiratória'),
            ('alimentar', 'Via alimentar'),
            ('unknown', 'Desconhecida'),
        ]
    )
    is_infectious = models.BooleanField(default=False)
    is_reportable = models.BooleanField(default=False)
    
    # Estatísticas
    mortality_rate = models.FloatField(null=True, blank=True)
    recovery_rate = models.FloatField(null=True, blank=True)
    
    # Metadata
    prevention_measures = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['species', 'name']
        verbose_name_plural = "Diseases"
    
    def __str__(self):
        return f"{self.name} ({self.species.code})"


class ClinicalRecord(BaseModel):
    """Registro Clínico do Animal"""
    
    RECORD_TYPES = [
        ('consultation', 'Consulta'),
        ('diagnosis', 'Diagnóstico'),
        ('treatment', 'Tratamento'),
        ('follow_up', 'Acompanhamento'),
        ('recovery', 'Recuperação'),
    ]
    
    SEVERITY_CHOICES = [
        ('mild', 'Leve'),
        ('moderate', 'Moderado'),
        ('severe', 'Grave'),
        ('critical', 'Crítico'),
    ]
    
    IMPROVEMENT_STATUS = [
        ('no_improvement', 'Sem melhora'),
        ('stable', 'Estável'),
        ('improving', 'Melhorando'),
        ('recovered', 'Curado'),
    ]
    
    OUTCOME_CHOICES = [
        ('cured', 'Curado'),
        ('death', 'Morte'),
        ('chronic', 'Crônico'),
        ('unknown', 'Desconhecido'),
        ('pending', 'Pendente'),
    ]
    
    # Identificação
    farm = models.ForeignKey(
        'farms.Farm',
        on_delete=models.CASCADE,
        related_name='clinical_records'
    )
    animal = models.ForeignKey(
        Animal,
        on_delete=models.CASCADE,
        related_name='clinical_records'
    )
    batch = models.ForeignKey(
        AnimalBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    
    # Tipo e Data
    record_type = models.CharField(
        max_length=20,
        choices=RECORD_TYPES,
        default='consultation'
    )
    record_date = models.DateField()
    record_time = models.TimeField(null=True, blank=True)
    
    # Sintomas Observados
    symptoms_observed = models.JSONField(default=list)
    clinical_notes = models.TextField()
    body_temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True
    )
    
    # Diagnóstico
    disease = models.ForeignKey(
        Disease,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='clinical_records'
    )
    severity = models.CharField(
        max_length=20,
        choices=SEVERITY_CHOICES,
        default='moderate'
    )
    
    # Prescrição
    prescribed_medications = models.JSONField(
        default=list,
        help_text='Lista de medicamentos prescritos'
    )
    
    # Evolução
    followup_date = models.DateField(null=True, blank=True)
    improvement_status = models.CharField(
        max_length=20,
        choices=IMPROVEMENT_STATUS,
        null=True,
        blank=True
    )
    
    # Resultado
    outcome = models.CharField(
        max_length=20,
        choices=OUTCOME_CHOICES,
        default='pending'
    )
    outcome_date = models.DateField(null=True, blank=True)
    
    # Custo
    treatment_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Veterinário
    veterinarian = models.CharField(max_length=100, blank=True)
    
    # Notas
    notes = models.TextField(blank=True)
    is_critical = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-record_date', '-record_time']
        indexes = [
            models.Index(fields=['farm', '-record_date']),
            models.Index(fields=['animal', '-record_date']),
            models.Index(fields=['disease', '-record_date']),
        ]
        verbose_name = "Clinical Record"
        verbose_name_plural = "Clinical Records"
    
    def __str__(self):
        return f"{self.animal.identifier} - {self.record_date} ({self.disease})"


class MedicationInventory(BaseModel):
    """Inventário de Medicamentos"""
    
    farm = models.ForeignKey('farms.Farm', on_delete=models.CASCADE)
    
    # Informações
    medication_name = models.CharField(max_length=150)
    active_ingredient = models.CharField(max_length=150, blank=True)
    dosage = models.CharField(max_length=50)
    concentration = models.CharField(max_length=50, blank=True)
    unit = models.CharField(
        max_length=20,
        choices=[
            ('mg', 'Miligrama'),
            ('ml', 'Mililitro'),
            ('g', 'Grama'),
            ('unit', 'Unidade'),
        ]
    )
    
    # Lote
    batch_number = models.CharField(max_length=50)
    manufacturing_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField()
    
    # Quantidade
    quantity_available = models.DecimalField(max_digits=10, decimal_places=3)
    reorder_level = models.DecimalField(max_digits=10, decimal_places=3)
    
    # Financeiro
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)
    supplier = models.CharField(max_length=100)
    
    # Uso
    species_indicated = models.ManyToManyField(Species)
    therapeutic_class = models.CharField(max_length=100, blank=True)
    
    # Metadata
    storage_conditions = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    is_available = models.BooleanField(default=True)
    
    class Meta:
        unique_together = [['farm', 'medication_name', 'batch_number']]
        ordering = ['-expiry_date']
        verbose_name_plural = "Medication Inventories"
    
    def __str__(self):
        return f"{self.medication_name} ({self.batch_number})"
    
    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now().date() > self.expiry_date
    
    @property
    def days_to_expiry(self):
        from django.utils import timezone
        return (self.expiry_date - timezone.now().date()).days


class SanitaryAlert(BaseModel):
    """Alerta Sanitário"""
    
    ALERT_TYPES = [
        ('disease_outbreak', 'Surto de Doença'),
        ('medication_expired', 'Medicamento Vencido'),
        ('vaccine_expired', 'Vacina Vencida'),
        ('high_mortality', 'Mortalidade Elevada'),
        ('other', 'Outro'),
    ]
    
    SEVERITY_LEVELS = [
        ('low', 'Baixa'),
        ('medium', 'Média'),
        ('high', 'Alta'),
        ('critical', 'Crítica'),
    ]
    
    STATUS_CHOICES = [
        ('active', 'Ativo'),
        ('acknowledged', 'Reconhecido'),
        ('resolved', 'Resolvido'),
    ]
    
    farm = models.ForeignKey('farms.Farm', on_delete=models.CASCADE)
    
    alert_type = models.CharField(max_length=30, choices=ALERT_TYPES)
    severity = models.CharField(max_length=20, choices=SEVERITY_LEVELS)
    
    title = models.CharField(max_length=200)
    description = models.TextField()
    recommended_actions = models.TextField()
    
    # Escopo
    affected_animals = models.ManyToManyField(Animal, blank=True)
    affected_batches = models.ManyToManyField(AnimalBatch, blank=True)
    disease = models.ForeignKey(
        Disease,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active'
    )
    
    # Timeline
    created_date = models.DateField(auto_now_add=True)
    acknowledged_date = models.DateField(null=True, blank=True)
    resolved_date = models.DateField(null=True, blank=True)
    
    # Metadata
    generated_by = models.CharField(max_length=50, default='system')
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-created_date']
        verbose_name_plural = "Sanitary Alerts"
    
    def __str__(self):
        return f"{self.title} ({self.severity})"


class HistoricoEvento(BaseModel):
    """
    Registro de histórico operacional genérico (Descartes, Mortalidade, Perdas, Transferências).
    """
    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE, related_name="historicos_operacionais")
    tipo_evento = models.CharField(max_length=50)
    descricao = models.TextField()
    data_evento = models.DateField()
    matriz = models.ForeignKey(Animal, null=True, blank=True, on_delete=models.CASCADE, related_name="historicos")
    lote = models.ForeignKey(AnimalBatch, null=True, blank=True, on_delete=models.CASCADE, related_name="historicos")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Histórico de Evento"
        verbose_name_plural = "Históricos de Eventos"
        ordering = ["-data_evento"]

    def __str__(self):
        target = self.matriz.identifier if self.matriz else self.lote.batch_code if self.lote else "Geral"
        return f"{self.tipo_evento} - {target} em {self.data_evento}"


class HeatRecord(BaseModel):
    """
    Registro de cio de uma Marrã ou Matriz.
    Ao registrar o 1º cio, o sistema gera automaticamente previsão
    do 2º (21 dias) e 3º cio (42 dias). Cobertura ocorre no 3º cio.
    """
    animal = models.ForeignKey(
        Animal, on_delete=models.CASCADE, related_name="heat_records"
    )
    heat_number = models.PositiveSmallIntegerField(
        default=1, help_text="Número do cio (1º, 2º, 3º...)"
    )
    heat_date = models.DateField(help_text="Data do cio (real ou prevista)")
    is_predicted = models.BooleanField(
        default=False, help_text="True se a data for uma previsão automática"
    )
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Registro de Cio"
        verbose_name_plural = "Registros de Cio"
        ordering = ["animal", "heat_number"]

    def __str__(self) -> str:
        tipo = "Previsto" if self.is_predicted else "Real"
        return f"{self.animal.identifier} — {self.heat_number}º Cio ({tipo}) em {self.heat_date}"

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)

        # Ao registrar o 1º cio real, gerar previsões para o 2º e 3º cios automaticamente
        if is_new and not self.is_predicted and self.heat_number == 1:
            import datetime
            # 2º cio: +21 dias
            HeatRecord.objects.get_or_create(
                animal=self.animal,
                heat_number=2,
                defaults={
                    "heat_date": self.heat_date + datetime.timedelta(days=21),
                    "is_predicted": True,
                }
            )
            # 3º cio: +42 dias (cobertura)
            HeatRecord.objects.get_or_create(
                animal=self.animal,
                heat_number=3,
                defaults={
                    "heat_date": self.heat_date + datetime.timedelta(days=42),
                    "is_predicted": True,
                }
            )


class LitterMedication(BaseModel):
    """
    Medicamento/procedimento aplicado em uma leitegada na Maternidade.
    Essa informação acompanha o lote ao ser transferido para Creche/Crescimento/Engorda.
    """
    birth = models.ForeignKey(
        Birth, on_delete=models.CASCADE, related_name="medications"
    )
    batch = models.ForeignKey(
        AnimalBatch, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="litter_medications",
        help_text="Lote da Creche/Crescimento/Engorda herdeiro do histórico"
    )
    medicamento = models.CharField(max_length=150)
    dosagem = models.CharField(max_length=100, blank=True)
    data_aplicacao = models.DateField()
    motivo = models.CharField(max_length=200, blank=True)
    responsavel = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Medicamento da Leitegada"
        verbose_name_plural = "Medicamentos da Leitegada"
        ordering = ["-data_aplicacao"]

    def __str__(self) -> str:
        return f"{self.medicamento} — Leitegada {self.birth_id} em {self.data_aplicacao}"

