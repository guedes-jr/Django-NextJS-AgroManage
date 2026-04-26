"""
TextChoices for the inventory domain.
"""
from django.db import models


class CategoriaItem(models.TextChoices):
    RACAO = "racao", "Ração"
    NUCLEO = "nucleo", "Núcleo / Premix"
    SUPLEMENTO = "suplemento", "Suplemento"
    MEDICAMENTO = "medicamento", "Medicamento"
    VACINA = "vacina", "Vacina"
    MATERIAL = "material", "Material"
    OUTRO = "outro", "Outro"


class UnidadeMedida(models.TextChoices):
    KG = "kg", "kg — Quilograma"
    G = "g", "g — Grama"
    L = "l", "L — Litro"
    ML = "ml", "ml — Mililitro"
    UNIDADE = "unidade", "un — Unidade"
    DOSE = "dose", "dose — Dose"
    SACO = "saco", "sc — Saco"
    CAIXA = "caixa", "cx — Caixa"
    METRO = "m", "m — Metro"
    M2 = "m2", "m² — Metro quadrado"


class EspecieAnimal(models.TextChoices):
    BOVINO = "bovino", "Bovino"
    SUINO = "suino", "Suíno"
    AVE = "ave", "Ave"
    OVINO = "ovino", "Ovino"
    CAPRINO = "caprino", "Caprino"
    EQUINO = "equino", "Equino"
    MULTIPLO = "multiplo", "Múltiplas espécies"
    OUTRO = "outro", "Outro"


class ViaAplicacao(models.TextChoices):
    ORAL = "oral", "Oral"
    INJETAVEL = "injetavel", "Injetável"
    TOPICA = "topica", "Tópica"
    SUBCUTANEA = "subcutanea", "Subcutânea"
    INTRAMUSCULAR = "intramuscular", "Intramuscular"
    INTRAVENOSA = "intravenosa", "Intravenosa"
    OUTRA = "outra", "Outra"


class TipoMovimentacao(models.TextChoices):
    COMPRA = "compra", "Compra"
    VENDA = "venda", "Venda"
    CONSUMO = "consumo", "Consumo"
    PERDA = "perda", "Perda"


class LocalArmazenamento(models.TextChoices):
    DEPOSITO = "deposito", "Depósito Geral"
    CAMARA_FRIA = "camara_fria", "Câmara Fria"
    SILO = "silo", "Silo"
    ARMARIO = "armario", "Armário / Farmácia"
    TANQUE = "tanque", "Tanque"
    OUTRO = "outro", "Outro"


class TipoContratoFornecedor(models.TextChoices):
    SPOT = "spot", "Eventual / Spot"
    MENSAL = "mensal", "Contrato Mensal"
    ANUAL = "anual", "Contrato Anual"
