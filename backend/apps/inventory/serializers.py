"""
Serializers for the inventory app.
"""
import re
import uuid
from django.utils import timezone
from rest_framework import serializers

from .models import (
    ItemEstoque, LoteEstoque, MovimentacaoEstoque, Fornecedor, 
    FornecedorContato, FornecedorEndereco, AlertaEstoque,
    FormulaRacao, FormulaIngrediente, ProducaoRacao, ConsumoRacao
)

from .choices import TipoContratoFornecedor


# ---------------------------------------------------------------------------
# Fornecedor
# ---------------------------------------------------------------------------

class FornecedorContatoSerializer(serializers.ModelSerializer):
    class Meta:
        model = FornecedorContato
        fields = ["id", "tipo", "label", "valor"]

class FornecedorEnderecoSerializer(serializers.ModelSerializer):
    class Meta:
        model = FornecedorEndereco
        fields = ["id", "cep", "logradouro", "numero", "bairro", "complemento", "cidade", "estado", "latitude", "longitude"]

class FornecedorSerializer(serializers.ModelSerializer):
    tipo_contrato_display = serializers.CharField(
        source="get_tipo_contrato_display", read_only=True
    )
    contatos = FornecedorContatoSerializer(many=True, required=False)
    enderecos = FornecedorEnderecoSerializer(many=True, required=False)

    class Meta:
        model = Fornecedor
        fields = [
            "id", "organization", "nome",
            "cnpj", "contatos", "enderecos",
            "tipo_contrato", "tipo_contrato_display", "imagem", "logo_url",
            "ativo", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "organization", "created_at", "updated_at", "tipo_contrato_display"]
    
    def validate_nome(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Nome não pode estar vazio.")
        return value.strip()
    
    def validate(self, data):
        nome = data.get("nome", "").strip()
        documento = data.get("cnpj", "").strip()
        
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
        contatos_data = validated_data.pop('contatos', [])
        enderecos_data = validated_data.pop('enderecos', [])
        
        # Inject organization
        request = self.context.get("request")
        organization = getattr(getattr(request, "user", None), "organization", None)
        if organization:
            validated_data["organization"] = organization
        else:
            raise serializers.ValidationError({"organization": "Não foi possível determinar a organização."})

        fornecedor = Fornecedor.objects.create(**validated_data)
        
        for contato_data in contatos_data:
            FornecedorContato.objects.create(fornecedor=fornecedor, **contato_data)
            
        for endereco_data in enderecos_data:
            FornecedorEndereco.objects.create(fornecedor=fornecedor, **endereco_data)
            
        return fornecedor

    def update(self, instance, validated_data):
        contatos_data = validated_data.pop('contatos', None)
        enderecos_data = validated_data.pop('enderecos', None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if contatos_data is not None:
            instance.contatos.all().delete()
            for contato_data in contatos_data:
                FornecedorContato.objects.create(fornecedor=instance, **contato_data)
        
        if enderecos_data is not None:
            instance.enderecos.all().delete()
            for endereco_data in enderecos_data:
                FornecedorEndereco.objects.create(fornecedor=instance, **endereco_data)
        
        return instance


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

    custo_unitario = serializers.DecimalField(
        max_digits=10, decimal_places=2, write_only=True, required=False, allow_null=True
    )
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
            "id", "organization", "nome", "categoria", "categoria_display",
            "unidade_medida", "unidade_display",
            # General
            "descricao", "fabricante", "especie_animal",
            "estoque_minimo", "prioridade", "ativo",
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
            "custo_unitario", "data_fabricacao", "local_armazenamento",
            "fornecedor", "nota_fiscal", "observacao_lote",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        # Extract batch fields before saving the item
        batch_fields = {
            "custo_unitario": validated_data.pop("custo_unitario", None),
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
    local_display = serializers.CharField(
        source="get_local_armazenamento_display", read_only=True
    )
    fornecedor_nome = serializers.CharField(source="fornecedor.nome", read_only=True)

    class Meta:
        model = LoteEstoque
        fields = [
            "id", "item", "item_nome",
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
    responsavel_nome = serializers.SerializerMethodField()

    def get_responsavel_nome(self, obj):
        try:
            if not obj.responsavel:
                return None
            if obj.responsavel.full_name and obj.responsavel.full_name.strip():
                return obj.responsavel.full_name
            return obj.responsavel.email or "Usuário"
        except Exception:
            return "Usuário"

    # Write-only fields for creating a new batch during purchase
    custo_unitario = serializers.DecimalField(
        max_digits=10, decimal_places=2, write_only=True, required=False, allow_null=True
    )
    fornecedor = serializers.PrimaryKeyRelatedField(
        queryset=Fornecedor.objects.all(), write_only=True, required=False, allow_null=True
    )
    numero_lote = serializers.CharField(write_only=True, required=False, allow_blank=True)
    data_validade = serializers.DateField(write_only=True, required=False, allow_null=True)
    data_fabricacao = serializers.DateField(write_only=True, required=False, allow_null=True)
    local_armazenamento = serializers.CharField(write_only=True, required=False, allow_blank=True)
    nota_fiscal = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = MovimentacaoEstoque
        fields = [
            "id", "item", "item_nome", "lote",
            "tipo", "tipo_display", "quantidade",
            "data_movimentacao",
            "responsavel", "responsavel_nome",
            "observacao", "created_at",
            # Write-only batch fields
            "custo_unitario", "fornecedor", "numero_lote",
            "data_validade", "data_fabricacao", "local_armazenamento", "nota_fiscal",
        ]
        read_only_fields = ["id", "data_movimentacao", "created_at"]


class AlertaEstoqueSerializer(serializers.ModelSerializer):
    item_nome = serializers.ReadOnlyField(source="item.nome")
    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)
    prioridade_display = serializers.CharField(source="get_prioridade_display", read_only=True)

    class Meta:
        model = AlertaEstoque
        fields = [
            "id", "item", "item_nome", "tipo", "tipo_display", 
            "prioridade", "prioridade_display", "titulo", 
            "descricao", "lido", "resolvido", "created_at"
        ]
        read_only_fields = ["id", "created_at"]


# ---------------------------------------------------------------------------
# Fórmula e Produção
# ---------------------------------------------------------------------------

class FormulaIngredienteSerializer(serializers.ModelSerializer):
    item_nome = serializers.CharField(source="item.nome", read_only=True)
    estoque_atual = serializers.DecimalField(source="item.estoque_atual", max_digits=10, decimal_places=2, read_only=True)
    
    class Meta:
        model = FormulaIngrediente
        fields = ["id", "item", "item_nome", "percentual", "estoque_atual"]


class FormulaRacaoSerializer(serializers.ModelSerializer):
    ingredientes = FormulaIngredienteSerializer(many=True, required=False)
    item_final_nome = serializers.CharField(source="item_final.nome", read_only=True)
    especie_animal_display = serializers.CharField(
        source="get_especie_animal_display", read_only=True
    )

    class Meta:
        model = FormulaRacao
        fields = [
            "id", "nome", "descricao", "especie_animal", "especie_animal_display",
            "item_final", "item_final_nome", "ativa", "ingredientes",
        ]

    def create(self, validated_data):
        ingredientes_data = validated_data.pop('ingredientes', [])
        formula = FormulaRacao.objects.create(**validated_data)
        
        for ing_data in ingredientes_data:
            FormulaIngrediente.objects.create(formula=formula, **ing_data)
            
        return formula

    def update(self, instance, validated_data):
        ingredientes_data = validated_data.pop('ingredientes', None)
        
        # Update formula fields
        instance.nome = validated_data.get('nome', instance.nome)
        instance.descricao = validated_data.get('descricao', instance.descricao)
        instance.especie_animal = validated_data.get('especie_animal', instance.especie_animal)
        instance.item_final = validated_data.get('item_final', instance.item_final)
        instance.ativa = validated_data.get('ativa', instance.ativa)
        instance.save()
        
        # Update ingredients
        if ingredientes_data is not None:
            # Delete existing
            instance.ingredientes.all().delete()
            # Create new ones
            for ing_data in ingredientes_data:
                FormulaIngrediente.objects.create(formula=instance, **ing_data)
                
        return instance



class ProducaoRacaoSerializer(serializers.ModelSerializer):
    formula_nome = serializers.CharField(source="formula.nome", read_only=True)
    responsavel_nome = serializers.SerializerMethodField()

    class Meta:
        model = ProducaoRacao
        fields = [
            "id", "formula", "formula_nome", "data_producao",
            "quantidade_teorica", "quantidade_real", "custo_total",
            "responsavel", "responsavel_nome", "status"
        ]
        read_only_fields = ["id", "data_producao", "custo_total", "responsavel"]

    def get_responsavel_nome(self, obj):
        try:
            if not obj.responsavel:
                return None
            if obj.responsavel.full_name and obj.responsavel.full_name.strip():
                return obj.responsavel.full_name
            return obj.responsavel.email or "Usuário"
        except Exception:
            return "Usuário"


class ConsumoRacaoSerializer(serializers.ModelSerializer):
    lote_codigo = serializers.CharField(source="lote_animal.batch_code", read_only=True)
    item_nome = serializers.CharField(source="item_estoque.nome", read_only=True)
    usuario_nome = serializers.SerializerMethodField()
    tipo_registro_display = serializers.CharField(source="get_tipo_registro_display", read_only=True)

    class Meta:
        model = ConsumoRacao
        fields = [
            "id", "lote_animal", "lote_codigo", "item_estoque", "item_nome",
            "data_inicio", "data_fim", "quantidade", "custo_unitario", "custo_total",
            "tipo_registro", "tipo_registro_display", "usuario", "usuario_nome", "observacao",
            "created_at"
        ]
        read_only_fields = ["id", "custo_unitario", "custo_total", "usuario", "created_at"]

    def get_usuario_nome(self, obj):
        if not obj.usuario: return None
        return obj.usuario.full_name or obj.usuario.email

