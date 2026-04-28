"""
Serializers for the inventory app.
"""
import re
from django.utils import timezone
from rest_framework import serializers

from .models import ItemEstoque, LoteEstoque, MovimentacaoEstoque, Fornecedor
from .choices import TipoContratoFornecedor


# ---------------------------------------------------------------------------
# Fornecedor
# ---------------------------------------------------------------------------

class FornecedorSerializer(serializers.ModelSerializer):
    tipo_contrato_display = serializers.CharField(
        source="get_tipo_contrato_display", read_only=True
    )

    class Meta:
        model = Fornecedor
        fields = [
            "id", "organization", "nome",
            "telefone", "telefone_2", "telefone_3",
            "email", "cnpj", "cidade", "estado",
            "tipo_contrato", "tipo_contrato_display", "imagem",
            "ativo", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "organization", "created_at", "updated_at", "tipo_contrato_display"]
    
    def validate_nome(self, value):
        """Ensure nome is not empty."""
        if not value or not value.strip():
            raise serializers.ValidationError("Nome não pode estar vazio.")
        return value.strip()
    
    def validate_email(self, value):
        """Validate email format if provided."""
        if value and "@" not in value:
            raise serializers.ValidationError("E-mail inválido. Deve conter @.")
        return value.strip() if value else ""
    
    def validate_tipo_contrato(self, value):
        """Validate tipo_contrato choice."""
        valid_choices = [choice[0] for choice in TipoContratoFornecedor.choices]
        if value not in valid_choices:
            raise serializers.ValidationError(f"Tipo de contrato inválido. Escolha entre: {', '.join(valid_choices)}")
        return value
    
    def validate(self, data):
        """Check duplicate nome and CPF/CNPJ within the same organization."""
        nome = data.get("nome", "").strip()
        documento = data.get("cnpj", "").strip()
        
        # Get organization from context
        request = self.context.get("request")
        organization = None
        if request and hasattr(request, "user") and hasattr(request.user, "organization"):
            organization = request.user.organization
        
        if not organization:
            raise serializers.ValidationError({
                "organization": "Usuário não possui organização vinculada."
            })
        
        if nome or documento:
            queryset = Fornecedor.objects.filter(organization=organization)
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)

            if nome:
                duplicated_nome = queryset.filter(nome__iexact=nome).exists()
                if duplicated_nome:
                    raise serializers.ValidationError({
                        "nome": f"Já existe um fornecedor com o nome '{nome}' nesta organização."
                    })

            if documento:
                normalized_documento = re.sub(r"\D", "", str(documento))
                if normalized_documento:
                    for fornecedor in queryset.exclude(cnpj__isnull=True).exclude(cnpj=""):
                        fornecedor_documento = re.sub(r"\D", "", fornecedor.cnpj or "")
                        if fornecedor_documento and fornecedor_documento == normalized_documento:
                            raise serializers.ValidationError({
                                "cnpj": "Já existe um fornecedor com este CPF/CNPJ nesta organização."
                            })
        
        return data

    def create(self, validated_data):
        """
        Ensure organization is always injected from request context when available.
        """
        request = self.context.get("request")
        organization = getattr(getattr(request, "user", None), "organization", None)
        
        if organization and "organization" not in validated_data:
            validated_data["organization"] = organization
        elif not organization:
            raise serializers.ValidationError({
                "organization": "Não foi possível determinar a organização do usuário."
            })
        
        try:
            return super().create(validated_data)
        except Exception as e:
            raise serializers.ValidationError(f"Erro ao criar fornecedor: {str(e)}")

class ItemEstoqueSerializer(serializers.ModelSerializer):
    estoque_atual = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    estoque_baixo = serializers.BooleanField(read_only=True)
    categoria_display = serializers.CharField(
        source="get_categoria_display", read_only=True
    )
    unidade_display = serializers.CharField(
        source="get_unidade_medida_display", read_only=True
    )

    # Write-only: quantidade e dados do lote inicial (enviados juntos na criação)
    quantidade_inicial = serializers.DecimalField(
        max_digits=10, decimal_places=2, write_only=True, required=False
    )
    custo_unitario = serializers.DecimalField(
        max_digits=10, decimal_places=2, write_only=True, required=False, allow_null=True
    )
    numero_lote = serializers.CharField(write_only=True, required=False, allow_blank=True)
    data_validade = serializers.DateField(write_only=True, required=False, allow_null=True)
    data_fabricacao = serializers.DateField(write_only=True, required=False, allow_null=True)
    local_armazenamento = serializers.CharField(write_only=True, required=False, allow_blank=True)
    fornecedor = serializers.PrimaryKeyRelatedField(
        queryset=Fornecedor.objects.all(), required=False, allow_null=True, write_only=True
    )
    nota_fiscal = serializers.CharField(write_only=True, required=False, allow_blank=True)
    observacao_lote = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = ItemEstoque
        fields = [
            # Identification
            "id", "organization", "nome", "codigo", "categoria", "categoria_display",
            "unidade_medida", "unidade_display",
            # General
            "descricao", "marca", "fabricante", "especie_animal",
            "estoque_minimo", "ativo",
            # Technical — medicine/vaccine
            "principio_ativo", "concentracao", "via_aplicacao",
            "carencia_dias", "registro_mapa", "exige_receituario",
            "medicamento_controlado",
            # Technical — vaccine
            "temperatura_minima", "temperatura_maxima",
            "doses_por_embalagem", "volume_por_dose",
            # Technical — feed/supplement
            "composicao", "indicacao_uso", "modo_uso", "peso_embalagem",
            # Read-only computed
            "estoque_atual", "estoque_baixo",
            # Timestamps
            "created_at", "updated_at",
            # Write-only batch fields
            "quantidade_inicial", "custo_unitario", "numero_lote",
            "data_validade", "data_fabricacao", "local_armazenamento",
            "fornecedor", "nota_fiscal", "observacao_lote",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        # Extract batch fields before saving the item
        batch_fields = {
            "quantidade_inicial": validated_data.pop("quantidade_inicial", None),
            "custo_unitario": validated_data.pop("custo_unitario", None),
            "numero_lote": validated_data.pop("numero_lote", ""),
            "data_validade": validated_data.pop("data_validade", None),
            "data_fabricacao": validated_data.pop("data_fabricacao", None),
            "local_armazenamento": validated_data.pop("local_armazenamento", ""),
            "fornecedor": validated_data.pop("fornecedor", ""),
            "nota_fiscal": validated_data.pop("nota_fiscal", ""),
            "observacao_lote": validated_data.pop("observacao_lote", ""),
        }

        item = super().create(validated_data)

        # Create initial batch + movement if quantity was provided
        qty = batch_fields.get("quantidade_inicial")
        if qty and qty > 0:
            from .services import criar_lote_e_movimentacao
            criar_lote_e_movimentacao(item, batch_fields, self.context.get("request"))

        return item


# ---------------------------------------------------------------------------
# LoteEstoque
# ---------------------------------------------------------------------------

class LoteEstoqueSerializer(serializers.ModelSerializer):
    item_nome = serializers.CharField(source="item.nome", read_only=True)
    item_codigo = serializers.CharField(source="item.codigo", read_only=True)
    local_display = serializers.CharField(
        source="get_local_armazenamento_display", read_only=True
    )
    fornecedor_nome = serializers.CharField(source="fornecedor.nome", read_only=True)

    class Meta:
        model = LoteEstoque
        fields = [
            "id", "item", "item_nome", "item_codigo",
            "numero_lote", "data_fabricacao", "data_validade",
            "quantidade_inicial", "quantidade_atual", "custo_unitario",
            "local_armazenamento", "local_display",
            "fornecedor", "fornecedor_nome", "nota_fiscal", "data_entrada",
            "observacao", "ativo",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# MovimentacaoEstoque
# ---------------------------------------------------------------------------

class MovimentacaoEstoqueSerializer(serializers.ModelSerializer):
    item_nome = serializers.CharField(source="item.nome", read_only=True)
    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)
    responsavel_nome = serializers.CharField(
        source="responsavel.get_full_name", read_only=True
    )

    class Meta:
        model = MovimentacaoEstoque
        fields = [
            "id", "item", "item_nome", "lote",
            "tipo", "tipo_display", "quantidade",
            "data_movimentacao",
            "responsavel", "responsavel_nome",
            "observacao", "created_at",
        ]
        read_only_fields = ["id", "data_movimentacao", "created_at"]
