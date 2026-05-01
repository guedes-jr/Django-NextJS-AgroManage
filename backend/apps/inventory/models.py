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
        max_length=50, unique=True, blank=True, null=True, help_text="SKU / código interno"
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

    # -- Prioridade -----------------------------------------------------------
    PRIORITY_CHOICES = (
        ('baixa', 'Baixa'),
        ('media', 'Média'),
        ('alta', 'Alta'),
        ('critica', 'Crítica'),
    )
    prioridade = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='media')

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
    cnpj = models.CharField(max_length=20, blank=True)
    
    tipo_contrato = models.CharField(
        max_length=30, 
        choices=TipoContratoFornecedor.choices, 
        default=TipoContratoFornecedor.SPOT
    )
    imagem = models.ImageField(upload_to="fornecedores/", blank=True, null=True)
    logo_url = models.URLField(max_length=500, blank=True, null=True, help_text="URL da logo externa (Clearbit, etc)")
    ativo = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Fornecedor"
        verbose_name_plural = "Fornecedores"

    def __str__(self) -> str:
        return self.nome


class FornecedorContato(BaseModel):
    """
    Lista de contatos (telefone, e-mail) vinculados a um fornecedor.
    """
    TIPO_CHOICES = (
        ('telefone', 'Telefone'),
        ('email', 'E-mail'),
    )
    
    fornecedor = models.ForeignKey(
        Fornecedor, 
        on_delete=models.CASCADE, 
        related_name="contatos"
    )
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    label = models.CharField(max_length=50, blank=True, help_text="Ex: Vendas, Financeiro, WhatsApp")
    valor = models.CharField(max_length=150)
    
    class Meta(BaseModel.Meta):
        verbose_name = "Contato do Fornecedor"
        verbose_name_plural = "Contatos do Fornecedor"

    def __str__(self) -> str:
        return f"{self.label}: {self.valor}"


class FornecedorEndereco(BaseModel):
    """
    Lista de endereços (Matriz, Filial, Depósito) vinculados a um fornecedor.
    """
    fornecedor = models.ForeignKey(
        Fornecedor,
        on_delete=models.CASCADE,
        related_name="enderecos"
    )
    label = models.CharField(max_length=50, blank=True, help_text="Ex: Matriz, Entrega")
    cep = models.CharField(max_length=10, blank=True)
    logradouro = models.CharField(max_length=255, blank=True)
    numero = models.CharField(max_length=20, blank=True)
    bairro = models.CharField(max_length=100, blank=True)
    complemento = models.CharField(max_length=255, blank=True)
    cidade = models.CharField(max_length=100, blank=True)
    estado = models.CharField(max_length=2, blank=True)
    latitude = models.DecimalField(max_digits=15, decimal_places=10, null=True, blank=True)
    longitude = models.DecimalField(max_digits=15, decimal_places=10, null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Endereço de Fornecedor"
        verbose_name_plural = "Endereços de Fornecedores"

    def __str__(self) -> str:
        return f"{self.logradouro}, {self.bairro} - {self.cidade}/{self.estado}"


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


class AlertaEstoque(BaseModel):
    """
    Registra eventos de alerta (estoque baixo, vencimento, etc).
    Permite que o usuário visualize e resolva/arquive os alertas.
    """
    class TipoAlerta(models.TextChoices):
        ESTOQUE_BAIXO = "estoque_baixo", "Estoque Baixo"
        VENCIMENTO_PROXIMO = "vencimento_proximo", "Vencimento Próximo"
        VENCIDO = "vencido", "Vencido"
        OUTRO = "outro", "Outro"

    class PrioridadeAlerta(models.TextChoices):
        BAIXA = "baixa", "Baixa"
        MEDIA = "media", "Média"
        ALTA = "alta", "Alta"
        CRITICA = "critica", "Crítica"

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="inventory_alerts",
    )
    item = models.ForeignKey(
        ItemEstoque, 
        on_delete=models.CASCADE, 
        related_name="alertas",
        null=True,
        blank=True
    )
    tipo = models.CharField(
        max_length=30, 
        choices=TipoAlerta.choices, 
        default=TipoAlerta.ESTOQUE_BAIXO
    )
    prioridade = models.CharField(
        max_length=10, 
        choices=PrioridadeAlerta.choices, 
        default=PrioridadeAlerta.MEDIA
    )
    titulo = models.CharField(max_length=150)
    descricao = models.TextField(blank=True)
    lido = models.BooleanField(default=False)
    resolvido = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        verbose_name = "Alerta de Estoque"
        verbose_name_plural = "Alertas de Estoque"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"[{self.get_prioridade_display()}] {self.titulo}"


class FormulaRacao(BaseModel):
    """
    Receita/fórmula para a produção de ração.
    """
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="formulas_racao",
    )
    nome = models.CharField(max_length=150)
    descricao = models.TextField(blank=True)
    item_final = models.ForeignKey(
        ItemEstoque, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name="formulas_como_resultado",
        help_text="O item de estoque (Ração) que será gerado por esta fórmula"
    )
    ativa = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Fórmula de Ração"
        verbose_name_plural = "Fórmulas de Ração"

    def __str__(self) -> str:
        return self.nome


class FormulaIngrediente(BaseModel):
    """
    Ingrediente específico de uma fórmula, vinculado a um item do estoque.
    """
    formula = models.ForeignKey(FormulaRacao, on_delete=models.CASCADE, related_name="ingredientes")
    item = models.ForeignKey(ItemEstoque, on_delete=models.PROTECT, related_name="usado_em_formulas")
    percentual = models.DecimalField(max_digits=5, decimal_places=2, help_text="Percentual (0 a 100) na fórmula")

    class Meta(BaseModel.Meta):
        verbose_name = "Ingrediente da Fórmula"
        verbose_name_plural = "Ingredientes das Fórmulas"
        unique_together = [["formula", "item"]]

    def __str__(self) -> str:
        return f"{self.item.nome} ({self.percentual}%) em {self.formula.nome}"


class ProducaoRacao(BaseModel):
    """
    Registro histórico de uma batida/produção de ração.
    """
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="producoes_racao",
    )
    formula = models.ForeignKey(FormulaRacao, on_delete=models.PROTECT, related_name="producoes")
    data_producao = models.DateTimeField(auto_now_add=True)
    
    quantidade_teorica = models.DecimalField(max_digits=10, decimal_places=2, help_text="Quantidade planejada (kg)")
    quantidade_real = models.DecimalField(max_digits=10, decimal_places=2, help_text="Quantidade que efetivamente rendeu (kg)")
    
    custo_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    responsavel = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="producoes_registradas"
    )
    status = models.CharField(max_length=20, default="concluida")

    class Meta(BaseModel.Meta):
        verbose_name = "Produção de Ração"
        verbose_name_plural = "Produções de Ração"

    def __str__(self) -> str:
        return f"Produção {self.formula.nome} em {self.data_producao.strftime('%d/%m/%Y')}"
