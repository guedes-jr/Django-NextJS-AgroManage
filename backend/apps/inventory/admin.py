from django.contrib import admin
from .models import ItemEstoque, LoteEstoque, MovimentacaoEstoque


class LoteInline(admin.TabularInline):
    model = LoteEstoque
    extra = 0
    readonly_fields = ("created_at",)
    fields = (
        "numero_lote", "data_validade", "quantidade_inicial",
        "quantidade_atual", "custo_unitario", "fornecedor", "ativo",
    )


@admin.register(ItemEstoque)
class ItemEstoqueAdmin(admin.ModelAdmin):
    list_display = ("nome", "codigo", "categoria", "unidade_medida", "estoque_minimo", "ativo")
    list_filter = ("categoria", "ativo", "especie_animal")
    search_fields = ("nome", "codigo", "marca")
    readonly_fields = ("created_at", "updated_at")
    inlines = [LoteInline]
    fieldsets = (
        ("Identificação", {
            "fields": ("nome", "codigo", "categoria", "unidade_medida", "ativo"),
        }),
        ("Informações Gerais", {
            "fields": ("descricao", "marca", "fabricante", "especie_animal", "estoque_minimo"),
        }),
        ("Campos Técnicos — Medicamentos / Vacinas", {
            "classes": ("collapse",),
            "fields": (
                "principio_ativo", "concentracao", "via_aplicacao", "carencia_dias",
                "registro_mapa", "exige_receituario", "medicamento_controlado",
                "temperatura_minima", "temperatura_maxima",
                "doses_por_embalagem", "volume_por_dose",
            ),
        }),
        ("Campos Técnicos — Ração / Núcleo", {
            "classes": ("collapse",),
            "fields": ("composicao", "indicacao_uso", "modo_uso", "peso_embalagem"),
        }),
        ("Timestamps", {
            "classes": ("collapse",),
            "fields": ("created_at", "updated_at"),
        }),
    )


@admin.register(LoteEstoque)
class LoteEstoqueAdmin(admin.ModelAdmin):
    list_display = ("item", "numero_lote", "data_validade", "quantidade_atual", "fornecedor", "ativo")
    list_filter = ("ativo", "local_armazenamento")
    search_fields = ("item__nome", "numero_lote", "fornecedor")
    readonly_fields = ("created_at", "updated_at")


@admin.register(MovimentacaoEstoque)
class MovimentacaoEstoqueAdmin(admin.ModelAdmin):
    list_display = ("item", "tipo", "quantidade", "data_movimentacao", "responsavel")
    list_filter = ("tipo",)
    search_fields = ("item__nome", "observacao")
    readonly_fields = ("data_movimentacao", "created_at")
