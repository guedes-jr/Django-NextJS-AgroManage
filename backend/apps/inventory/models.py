"""
Inventory domain models — simplified 3-model structure.

  ItemEstoque      — master item card (all categories in one table via choices)
  LoteEstoque      — traceability lot per item (expiry, cost, qty)
  MovimentacaoEstoque — every in/out/adjustment movement
"""
from django.conf import settings
from django.db import models

from common.models import BaseModel

from .choices import (
    CategoriaItem,
    UnidadeMedida,
    EspecieAnimal,
    ViaAplicacao,
    TipoMovimentacao,
    LocalArmazenamento,
    TipoContratoFornecedor,
)


class ItemEstoque(BaseModel):
    """
    Cadastro central de qualquer item de estoque.
    Campos técnicos (princípio_ativo, temperatura, etc.) são opcionais
    e visíveis conforme a categoria selecionada no front-end.
    """

    # -- Identificação ---------------------------------------------------------
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inventory_items",
    )
    nome = models.CharField(max_length=150)
    codigo = models.CharField(
        max_length=50, unique=True, blank=True, help_text="SKU / código interno"
    )
    categoria = models.CharField(max_length=30, choices=CategoriaItem.choices)
    unidade_medida = models.CharField(max_length=20, choices=UnidadeMedida.choices)

    # -- Informações gerais ---------------------------------------------------
    descricao = models.TextField(blank=True)
    marca = models.CharField(max_length=100, blank=True)
    fabricante = models.CharField(max_length=100, blank=True)
    especie_animal = models.CharField(
        max_length=30, choices=EspecieAnimal.choices, blank=True
    )

    # -- Estoque mínimo -------------------------------------------------------
    estoque_minimo = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # -- Campos técnicos (Medicamentos / Vacinas) ----------------------------
    principio_ativo = models.CharField(max_length=150, blank=True)
    concentracao = models.CharField(max_length=100, blank=True)
    via_aplicacao = models.CharField(
        max_length=30, choices=ViaAplicacao.choices, blank=True
    )
    carencia_dias = models.PositiveIntegerField(
        null=True, blank=True, help_text="Carência abate/leite (dias)"
    )
    registro_mapa = models.CharField(max_length=50, blank=True)
    exige_receituario = models.BooleanField(default=False)
    medicamento_controlado = models.BooleanField(default=False)

    # -- Campos técnicos (Vacinas) -------------------------------------------
    temperatura_minima = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    temperatura_maxima = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    doses_por_embalagem = models.PositiveIntegerField(null=True, blank=True)
    volume_por_dose = models.CharField(max_length=30, blank=True)

    # -- Campos técnicos (Ração / Núcleo / Suplemento) ----------------------
    composicao = models.TextField(blank=True, help_text="Composição / garantias")
    indicacao_uso = models.TextField(blank=True)
    modo_uso = models.TextField(blank=True, help_text="Dosagem / modo de preparo")
    peso_embalagem = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )

    # -- Status ---------------------------------------------------------------
    ativo = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Item de Estoque"
        verbose_name_plural = "Itens de Estoque"

    def __str__(self) -> str:
        return f"{self.nome} ({self.get_unidade_medida_display()})"

    @property
    def estoque_atual(self) -> "Decimal":
        """Soma dos saldos de todos os lotes ativos."""
        from decimal import Decimal

        result = self.lotes.filter(ativo=True).aggregate(
            total=models.Sum("quantidade_atual")
        )["total"]
        return result or Decimal("0")

    @property
    def estoque_baixo(self) -> bool:
        return self.estoque_atual < self.estoque_minimo


class Fornecedor(BaseModel):
    """
    Cadastro de fornecedores de insumos e materiais.
    """
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="fornecedores",
    )
    nome = models.CharField(max_length=150)
    telefone = models.CharField(max_length=30, blank=True)
    telefone_2 = models.CharField(max_length=30, blank=True)
    telefone_3 = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    cnpj = models.CharField(max_length=20, blank=True)
    cidade = models.CharField(max_length=100, blank=True)
    estado = models.CharField(max_length=2, blank=True)
    
    tipo_contrato = models.CharField(
        max_length=30, 
        choices=TipoContratoFornecedor.choices, 
        default=TipoContratoFornecedor.SPOT
    )
    imagem = models.ImageField(upload_to="fornecedor_logos/", null=True, blank=True)
    ativo = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Fornecedor"
        verbose_name_plural = "Fornecedores"
        unique_together = [["organization", "nome"]]

    def __str__(self) -> str:
        return self.nome


class LoteEstoque(BaseModel):
    """
    Lote de rastreabilidade vinculado a um ItemEstoque.
    Controla validade, saldo e custo por lote.
    """

    item = models.ForeignKey(
        ItemEstoque, on_delete=models.PROTECT, related_name="lotes"
    )

    numero_lote = models.CharField(max_length=100, blank=True)
    data_fabricacao = models.DateField(null=True, blank=True)
    data_validade = models.DateField(null=True, blank=True)

    quantidade_inicial = models.DecimalField(max_digits=10, decimal_places=2)
    quantidade_atual = models.DecimalField(max_digits=10, decimal_places=2)
    custo_unitario = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )

    local_armazenamento = models.CharField(
        max_length=30, choices=LocalArmazenamento.choices, blank=True
    )
    fornecedor = models.ForeignKey(
        Fornecedor, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name="lotes"
    )
    nota_fiscal = models.CharField(max_length=50, blank=True)
    data_entrada = models.DateField()

    observacao = models.TextField(blank=True)
    ativo = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Lote de Estoque"
        verbose_name_plural = "Lotes de Estoque"
        unique_together = [["item", "numero_lote"]]

    def __str__(self) -> str:
        lote = self.numero_lote or str(self.id)[:8]
        return f"{self.item.nome} — Lote {lote}"


class MovimentacaoEstoque(BaseModel):
    """Registro de toda entrada, saída ou ajuste de estoque."""

    farm = models.ForeignKey(
        "farms.Farm",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inventory_movements",
    )
    item = models.ForeignKey(
        ItemEstoque, on_delete=models.PROTECT, related_name="movimentacoes"
    )
    lote = models.ForeignKey(
        LoteEstoque,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="movimentacoes",
    )
    tipo = models.CharField(max_length=30, choices=TipoMovimentacao.choices)
    quantidade = models.DecimalField(max_digits=10, decimal_places=2)
    data_movimentacao = models.DateTimeField(auto_now_add=True)
    responsavel = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movimentacoes_estoque",
    )
    observacao = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Movimentação de Estoque"
        verbose_name_plural = "Movimentações de Estoque"

    def __str__(self) -> str:
        return f"{self.item.nome} | {self.tipo} | {self.quantidade}"
