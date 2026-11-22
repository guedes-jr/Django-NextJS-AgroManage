"""
TextChoices for the inventory domain.
"""
from django.db import models


class CategoriaItem(models.TextChoices):
    RACAO = "racao", "Ração"
    NUCLEO = "nucleo", "Suplementos"
    SUPLEMENTO = "suplemento", "Suplemento Animal"
    SEMENTE = "semente", "Sementes/mudas"
    FERTILIZANTE = "fertilizante", "Adubos"
    FERTIRRIGACAO = "fertirrigacao", "Fertirrigação"
    DEFENSIVO = "defensivo", "Foliares / Defensivos"
    CORRETIVO = "corretivo", "Corretivo de Solo"
    MEDICAMENTO = "medicamento", "Medicamento"
    VACINA = "vacina", "Vacina"
    MEDICAMENTO_VACINA = "medicamento_vacina", "Medicamentos e Vacinas"
    MATERIAL = "material", "Material"
    SEMEN = "semen", "Sêmen"
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


class Segmento(models.TextChoices):
    """Segmento dono do item/fórmula. Vazio = geral, compartilhado por todos."""

    GERAL = "", "Geral"
    SUINOS = "suinos", "Suinocultura"
    GADO_DE_CORTE = "gado-de-corte", "Gado de corte"
    PECUARIA_LEITEIRA = "pecuaria-leiteira", "Pecuária leiteira"


# Espécie implícita em cada segmento (mantém especie_animal coerente para clientes antigos).
SEGMENTO_ESPECIE = {"suinos": "suino", "gado-de-corte": "bovino", "pecuaria-leiteira": "bovino"}
CATTLE_SEGMENTS = ("gado-de-corte", "pecuaria-leiteira")
# Finalidade do lote/animal bovino -> segmento.
CATTLE_PURPOSE_SEGMENT = {"beef": "gado-de-corte", "dairy": "pecuaria-leiteira"}


def sync_segmento(instance):
    """Alinha segmento e especie_animal: o segmento manda; suíno sem segmento vira Suinocultura."""
    if instance.segmento:
        instance.especie_animal = SEGMENTO_ESPECIE[instance.segmento]
    elif instance.especie_animal in {"suino", "suinos"}:
        instance.segmento = Segmento.SUINOS


def segment_items_q(segments, prefix=""):
    """Itens/fórmulas utilizáveis pelos segmentos informados: os deles e os gerais compatíveis.

    Itens gerais (sem segmento) só entram se a espécie for compatível, para que um
    item legado de suínos nunca apareça para bovinos e vice-versa.
    """
    from django.db.models import Q

    segments = [segments] if isinstance(segments, str) else list(segments)
    species = {SEGMENTO_ESPECIE[segment] for segment in segments}
    return Q(**{f"{prefix}segmento__in": segments}) | Q(
        **{f"{prefix}segmento": "", f"{prefix}especie_animal__in": ["", "multiplo", *species]}
    )


def cattle_segments(purpose=None):
    """Segments a cattle lot/animal with this purpose may use; unknown/dual -> both cattle segments."""
    segment = CATTLE_PURPOSE_SEGMENT.get(purpose)
    return [segment] if segment else list(CATTLE_SEGMENTS)


def item_in_segments(item, segments):
    segments = [segments] if isinstance(segments, str) else list(segments)
    if item.segmento:
        return item.segmento in segments
    return item.especie_animal in {"", "multiplo", *(SEGMENTO_ESPECIE[segment] for segment in segments)}


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
    ENTRADA = "entrada", "Entrada"
    SAIDA = "saida", "Saída"
    VENCIMENTO = "vencimento", "Vencimento"
    AJUSTE = "ajuste", "Ajuste"


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


class TipoRegistroConsumo(models.TextChoices):
    TOTAL_PERIODO = "total_periodo", "Total no Período"
    DIARIO = "diario", "Consumo Diário"
    POR_CABECA = "por_cabeca", "Por Cabeça"


class TipoSemen(models.TextChoices):
    CONVENCIONAL = "convencional", "Convencional"
    SEXADO_MACHO = "sexado_macho", "Sexado Macho"
    SEXADO_FEMEA = "sexado_femea", "Sexado Fêmea"
