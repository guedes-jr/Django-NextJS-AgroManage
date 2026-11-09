"""
Serializers for the inventory app.
"""
from django.utils.translation import gettext as translate_message
import re
from decimal import Decimal
from apps.farms.models import Farm
from apps.finance.models import BankAccount, Transaction as FinancialTransaction
from django.db import transaction
from rest_framework import serializers

from .models import (
    ItemEstoque, LoteEstoque, MovimentacaoEstoque, Fornecedor, 
    FornecedorContato, FornecedorEndereco, AlertaEstoque,
    FormulaRacao, FormulaIngrediente, ProducaoRacao, ConsumoRacao
)

from .choices import CategoriaItem, TipoMovimentacao, LocalArmazenamento


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
        fields = ["id", "label", "cep", "logradouro", "numero", "bairro", "complemento", "cidade", "estado", "latitude", "longitude"]

class FornecedorSerializer(serializers.ModelSerializer):
    expected_updated_at = serializers.DateTimeField(write_only=True, required=False)
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
            "ativo", "created_at", "updated_at", "expected_updated_at",
        ]
        read_only_fields = ["id", "organization", "created_at", "updated_at", "tipo_contrato_display"]
    
    def validate_nome(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError(translate_message("Nome não pode estar vazio."))
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
                "organization": translate_message("Usuário não possui organização vinculada.")
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
                                "cnpj": translate_message("Já existe um fornecedor com este CPF/CNPJ nesta organização.")
                            })
        
        return data

    @transaction.atomic
    def create(self, validated_data):
        validated_data.pop('expected_updated_at', None)
        contatos_data = validated_data.pop('contatos', [])
        enderecos_data = validated_data.pop('enderecos', [])
        
        # Inject organization
        request = self.context.get("request")
        organization = getattr(getattr(request, "user", None), "organization", None)
        if organization:
            validated_data["organization"] = organization
        else:
            raise serializers.ValidationError({"organization": translate_message("Não foi possível determinar a organização.")})

        fornecedor = Fornecedor.objects.create(**validated_data)
        
        for contato_data in contatos_data:
            FornecedorContato.objects.create(fornecedor=fornecedor, **contato_data)
            
        for endereco_data in enderecos_data:
            FornecedorEndereco.objects.create(fornecedor=fornecedor, **endereco_data)
            
        return fornecedor

    @transaction.atomic
    def update(self, instance, validated_data):
        instance = Fornecedor.objects.select_for_update().get(pk=instance.pk, organization=instance.organization)
        expected = validated_data.pop('expected_updated_at', None)
        if expected is not None and instance.updated_at != expected:
            raise serializers.ValidationError({'expected_updated_at': translate_message('O cadastro foi alterado. Reabra a edição antes de salvar.')})
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
    expected_updated_at = serializers.DateTimeField(write_only=True, required=False)
    categorias = serializers.ListField(
        child=serializers.ChoiceField(choices=CategoriaItem.choices),
        required=False,
        allow_empty=False,
    )
    estoque_atual = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    custo_medio = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    estoque_baixo = serializers.BooleanField(read_only=True)
    categoria_display = serializers.CharField(
        source="get_categoria_display", read_only=True
    )
    categorias_display = serializers.SerializerMethodField()
    unidade_display = serializers.CharField(
        source="get_unidade_medida_display", read_only=True
    )
    tipo_semen_display = serializers.CharField(
        source="get_tipo_semen_display", read_only=True
    )

    custo_unitario = serializers.DecimalField(
        max_digits=10, decimal_places=2, write_only=True, required=False, allow_null=True
    )
    data_fabricacao = serializers.DateField(write_only=True, required=False, allow_null=True)
    local_armazenamento = serializers.CharField(write_only=True, required=False, allow_blank=True)
    nota_fiscal = serializers.CharField(write_only=True, required=False, allow_blank=True)
    observacao_lote = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = ItemEstoque
        fields = [
            # Identification
            "id", "organization", "nome", "categoria", "categoria_display",
            "categorias", "categorias_display",
            "unidade_medida", "unidade_display",
            # General
            "descricao", "fabricante", "especie_animal",
            "tipo_semen", "tipo_semen_display",
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
            "estoque_atual", "custo_medio", "estoque_baixo",
            # Timestamps
            "created_at", "updated_at", "expected_updated_at",
            # Write-only batch fields
            "custo_unitario", "data_fabricacao", "local_armazenamento",
            "nota_fiscal", "observacao_lote",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_categorias_display(self, obj):
        labels = dict(CategoriaItem.choices)
        categorias = obj.categorias or ([obj.categoria] if obj.categoria else [])
        return [labels.get(categoria, categoria) for categoria in categorias]

    def validate(self, attrs):
        categorias = attrs.get("categorias")
        categoria = attrs.get("categoria")
        if categorias:
            attrs["categoria"] = categorias[0]
        elif categoria:
            attrs["categorias"] = [categoria]
        organization = getattr(getattr(self.context.get("request"), "user", None), "organization", None)
        return attrs

    def create(self, validated_data):
        validated_data.pop("expected_updated_at", None)
        # Extract batch fields before saving the item
        batch_fields = {
            "custo_unitario": validated_data.pop("custo_unitario", None),
            "data_fabricacao": validated_data.pop("data_fabricacao", None),
            "local_armazenamento": validated_data.pop("local_armazenamento", ""),
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

    @transaction.atomic
    def update(self, instance, validated_data):
        instance = ItemEstoque.objects.select_for_update().get(pk=instance.pk, organization=instance.organization)
        expected = validated_data.pop("expected_updated_at", None)
        if expected is not None and instance.updated_at != expected:
            raise serializers.ValidationError({"expected_updated_at": translate_message("O cadastro foi alterado. Reabra a edição antes de salvar.")})
        return super().update(instance, validated_data)


class ItemEstoqueReceiptSerializer(ItemEstoqueSerializer):
    def to_representation(self, instance):
        return {"id": str(instance.pk)}


class FornecedorReceiptSerializer(FornecedorSerializer):
    def to_representation(self, instance):
        return {"id": str(instance.pk)}


# ---------------------------------------------------------------------------
# LoteEstoque
# ---------------------------------------------------------------------------

class LoteEstoqueSerializer(serializers.ModelSerializer):
    quantidade_inicial = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"))
    quantidade_atual = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
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
        read_only_fields = ["id", "quantidade_atual", "created_at", "updated_at"]

    def validate(self, attrs):
        if "quantidade_atual" in self.initial_data:
            raise serializers.ValidationError({"quantidade_atual": translate_message("O saldo só pode ser alterado por lançamentos. Use o ajuste de inventário.")})
        if self.instance:
            if "quantidade_inicial" in self.initial_data:
                raise serializers.ValidationError({"quantidade_inicial": translate_message("A quantidade inicial não pode ser editada. Registre um lançamento de ajuste.")})
            if attrs.get("item", self.instance.item) != self.instance.item:
                raise serializers.ValidationError({"item": translate_message("O item de um lote não pode ser alterado.")})
            if attrs.get("ativo", self.instance.ativo) != self.instance.ativo and self.instance.quantidade_atual != 0:
                raise serializers.ValidationError({"ativo": translate_message("Zere o saldo com um lançamento antes de alterar a situação do lote.")})
        organization = getattr(getattr(self.context.get("request"), "user", None), "organization", None)
        item = attrs.get("item", getattr(self.instance, "item", None))
        fornecedor = attrs.get("fornecedor", getattr(self.instance, "fornecedor", None))
        if not organization or not item or item.organization_id != organization.id:
            raise serializers.ValidationError({"item": translate_message("Item não pertence à sua organização.")})
        if fornecedor and fornecedor.organization_id != organization.id:
            raise serializers.ValidationError({"fornecedor": translate_message("Fornecedor não pertence à sua organização.")})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        quantity = validated_data["quantidade_inicial"]
        lot = LoteEstoque.objects.create(quantidade_atual=quantity, **validated_data)
        if quantity:
            MovimentacaoEstoque.objects.create(
                item=lot.item, lote=lot, tipo="entrada", quantidade=quantity,
                responsavel=self.context["request"].user,
                observacao="Saldo inicial informado no cadastro do lote.",
            )
        return lot

    @transaction.atomic
    def update(self, instance, validated_data):
        # Match the lock order used by stock consumption/counting.
        ItemEstoque.objects.select_for_update().get(pk=instance.item_id)
        self.instance = LoteEstoque.objects.select_for_update().get(pk=instance.pk)
        self.validate(validated_data)
        return super().update(self.instance, validated_data)


class StockCountSerializer(serializers.Serializer):
    unidade_esperada = serializers.CharField(max_length=20, required=False)
    quantidade_contada = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"))
    saldo_esperado = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"))
    motivo = serializers.CharField(max_length=1000, trim_whitespace=True)


# ---------------------------------------------------------------------------
# MovimentacaoEstoque
# ---------------------------------------------------------------------------

class MovimentacaoEstoqueSerializer(serializers.ModelSerializer):
    purchase_payment_method = serializers.ChoiceField(choices=FinancialTransaction.PaymentMethod.choices, write_only=True, required=False, default="transfer")
    purchase_due_date = serializers.DateField(write_only=True, required=False)
    purchase_payment_status = serializers.ChoiceField(choices=["pending", "paid"], write_only=True, required=False, default="pending")
    purchase_bank_account = serializers.PrimaryKeyRelatedField(queryset=BankAccount.objects.all(), write_only=True, required=False)
    purchase_payment_date = serializers.DateField(write_only=True, required=False)

    item_nome = serializers.CharField(source="item.nome", read_only=True)
    item_categoria = serializers.CharField(source="item.categoria", read_only=True)
    item_unidade = serializers.CharField(source="item.unidade_medida", read_only=True)
    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)
    responsavel_nome = serializers.SerializerMethodField()
    custo_unitario_movimento = serializers.SerializerMethodField()
    custo_total = serializers.SerializerMethodField()

    def get_responsavel_nome(self, obj):
        try:
            if not obj.responsavel:
                return None
            if obj.responsavel.full_name and obj.responsavel.full_name.strip():
                return obj.responsavel.full_name
            return obj.responsavel.email or "Usuário"
        except Exception:
            return "Usuário"

    def get_custo_unitario_movimento(self, obj):
        return str(self._movement_unit_cost(obj))

    def _movement_unit_cost(self, obj):
        if obj.lote and obj.lote.custo_unitario is not None:
            return obj.lote.custo_unitario
        average_cost = obj.item.custo_medio
        if average_cost:
            return average_cost
        last_lot = obj.item.lotes.filter(custo_unitario__gt=0).order_by("-created_at").first()
        return last_lot.custo_unitario if last_lot else average_cost

    def get_custo_total(self, obj):
        return str(obj.quantidade * self._movement_unit_cost(obj))

    # Write-only fields for creating a new batch during purchase
    custo_unitario = serializers.DecimalField(
        max_digits=10, decimal_places=2, write_only=True, required=False, allow_null=True
    )
    fornecedor = serializers.PrimaryKeyRelatedField(
        queryset=Fornecedor.objects.all(), write_only=True, required=False, allow_null=True
    )
    data_entrada = serializers.DateField(write_only=True, required=False)
    numero_lote = serializers.CharField(write_only=True, required=False, allow_blank=True)
    data_validade = serializers.DateField(write_only=True, required=False, allow_null=True)
    data_fabricacao = serializers.DateField(write_only=True, required=False, allow_null=True)
    local_armazenamento = serializers.CharField(write_only=True, required=False, allow_blank=True)
    nota_fiscal = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = MovimentacaoEstoque
        fields = [
            "id", "cattle_delivery", "farm", "item", "item_nome", "item_categoria", "item_unidade", "lote",
            "tipo", "tipo_display", "quantidade",
            "data_movimentacao",
            "responsavel", "responsavel_nome",
            "destino", "observacao",
            "custo_unitario_movimento", "custo_total",
            "created_at",
            "purchase_due_date", "purchase_payment_status", "purchase_bank_account", "purchase_payment_date", "purchase_payment_method",
            # Write-only batch fields
            "custo_unitario", "fornecedor", "numero_lote",
            "data_validade", "data_fabricacao", "data_entrada", "local_armazenamento", "nota_fiscal",
        ]
        read_only_fields = ["id", "cattle_delivery", "data_movimentacao", "created_at"]

    def validate_destino(self, value):
        return (value or "").strip()

    def validate(self, attrs):
        from django.utils import timezone
        if attrs.get("data_entrada") and (attrs["data_entrada"] > timezone.localdate() or attrs.get("tipo") not in {"compra", "entrada"}):
            raise serializers.ValidationError({"data_entrada": translate_message("Informe uma data de recebimento até hoje para uma entrada de estoque.")})
        if attrs.get("tipo") == "ajuste":
            raise serializers.ValidationError({"tipo": translate_message("Registre ajustes pelo inventário do lote, informando a contagem e o motivo.")})
        if attrs.get("quantidade") is not None and attrs["quantidade"] <= 0:
            raise serializers.ValidationError({"quantidade": translate_message("Informe uma quantidade maior que zero.")})
        organization = getattr(getattr(self.context.get("request"), "user", None), "organization", None)
        item = attrs.get("item", getattr(self.instance, "item", None))
        lote = attrs.get("lote", getattr(self.instance, "lote", None))
        fornecedor = attrs.get("fornecedor")
        if not organization or not item or item.organization_id != organization.id:
            raise serializers.ValidationError({"item": translate_message("Item não pertence à sua organização.")})
        account = attrs.get("purchase_bank_account")
        if account and account.organization_id != organization.id:
            raise serializers.ValidationError({"purchase_bank_account": translate_message("A conta não pertence à sua organização.")})
        if attrs.get("purchase_payment_status") == "paid" and (not account or not attrs.get("purchase_payment_date")):
            raise serializers.ValidationError({"purchase_payment_status": translate_message("Informe a conta e a data do pagamento.")})
        farm = attrs.get("farm", getattr(self.instance, "farm", None))
        if farm and farm.organization_id != organization.id:
            raise serializers.ValidationError({"farm": translate_message("A fazenda não pertence à sua organização.")})
        if lote and (lote.item_id != item.id or lote.item.organization_id != organization.id):
            raise serializers.ValidationError({"lote": translate_message("Lote não pertence ao item e à organização informados.")})
        if fornecedor and fornecedor.organization_id != organization.id:
            raise serializers.ValidationError({"fornecedor": translate_message("Fornecedor não pertence à sua organização.")})
        return attrs


class OperationalMovementSerializer(MovimentacaoEstoqueSerializer):
    lote_numero = serializers.CharField(source="lote.numero_lote", read_only=True, default=None)
    farm_nome = serializers.CharField(source="farm.name", read_only=True, default=None)
    timezone = serializers.SerializerMethodField()

    def get_timezone(self, obj):
        from django.conf import settings
        return settings.TIME_ZONE

    class Meta(MovimentacaoEstoqueSerializer.Meta):
        fields = ["id", "item", "item_nome", "item_unidade", "lote", "lote_numero", "tipo", "quantidade", "data_movimentacao", "responsavel_nome", "destino", "observacao", "cattle_delivery", "farm", "farm_nome", "timezone"]


class MovementReadQuery(serializers.Serializer):
    search = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    item = serializers.UUIDField(required=False)
    lote = serializers.UUIDField(required=False)
    tipo = serializers.ChoiceField(choices=["", *[value for value, _ in TipoMovimentacao.choices]], required=False, default="")
    start = serializers.DateField(required=False)
    end = serializers.DateField(required=False)

    def validate(self, attrs):
        start, end = attrs.get("start"), attrs.get("end")
        if bool(start) != bool(end) or (start and (end < start or (end - start).days > 365)):
            raise serializers.ValidationError({"start": translate_message("Informe um período de até 366 dias, com início e fim válidos.")})
        return attrs


class StrictStockInput:
    def to_internal_value(self, data):
        from collections.abc import Mapping
        if isinstance(data, Mapping) and set(data) - set(self.fields):
            raise serializers.ValidationError({"non_field_errors": [translate_message("O lançamento contém campos não permitidos.")]})
        return super().to_internal_value(data)


class StockLaunchInput(StrictStockInput, serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=ItemEstoque.objects.all())
    tipo = serializers.ChoiceField(choices=["entrada", "saida", "compra"])
    quantidade = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    unidade_esperada = serializers.CharField(max_length=20)
    lote = serializers.PrimaryKeyRelatedField(queryset=LoteEstoque.objects.all(), required=False, allow_null=True, default=None)
    farm = serializers.PrimaryKeyRelatedField(queryset=Farm.objects.all(), required=False, allow_null=True, default=None)
    fornecedor = serializers.PrimaryKeyRelatedField(queryset=Fornecedor.objects.all(), required=False, allow_null=True, default=None)
    numero_lote = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    data_entrada = serializers.DateField(required=False, allow_null=True, default=None)
    data_fabricacao = serializers.DateField(required=False, allow_null=True, default=None)
    data_validade = serializers.DateField(required=False, allow_null=True, default=None)
    local_armazenamento = serializers.ChoiceField(choices=["", *[value for value, _ in LocalArmazenamento.choices]], required=False, default="")
    nota_fiscal = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    custo_unitario = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"), required=False, allow_null=True, default=None)
    purchase_due_date = serializers.DateField(required=False, allow_null=True, default=None)
    motivo = serializers.CharField(max_length=1000)
    observacao = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")
    destino = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        org = self.context["request"].user.organization_id
        item, lot = attrs["item"], attrs["lote"]
        if item.organization_id != org or (lot and (lot.item_id != item.pk or lot.item.organization_id != org)):
            raise serializers.ValidationError({"item": translate_message("Produto/lote não pertencem ao contexto autorizado.")})
        if attrs["farm"] and attrs["farm"].organization_id != org or attrs["fornecedor"] and attrs["fornecedor"].organization_id != org:
            raise serializers.ValidationError(translate_message("Fazenda/fornecedor não pertencem à organização."))
        if attrs["tipo"] == "saida" and (not lot or not attrs["destino"]):
            raise serializers.ValidationError({"lote": translate_message("A saída exige lote e destino explícitos.")})
        if attrs["tipo"] == "compra":
            if lot or not attrs["farm"] or attrs["custo_unitario"] is None or attrs["purchase_due_date"] is None:
                raise serializers.ValidationError(translate_message("Compras exigem novo lote, fazenda, custo unitário e vencimento da conta a pagar."))
        elif attrs["custo_unitario"] is not None or attrs["purchase_due_date"] is not None:
            raise serializers.ValidationError(translate_message("Somente compras informam valores financeiros neste fluxo."))
        if not lot and (not attrs["numero_lote"] or attrs["data_entrada"] is None):
            raise serializers.ValidationError({"numero_lote": translate_message("Informe número e data de recebimento para um novo lote.")})
        if lot and any(attrs[k] for k in ("numero_lote", "data_entrada", "data_fabricacao", "data_validade", "local_armazenamento", "nota_fiscal", "fornecedor")):
            raise serializers.ValidationError(translate_message("O lançamento não altera os metadados do lote existente."))
        return attrs


class StockLaunchConfirmInput(StrictStockInput, serializers.Serializer):
    preview_token = serializers.CharField(max_length=20000)


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
    custo_medio = serializers.DecimalField(source="item.custo_medio", max_digits=12, decimal_places=2, read_only=True)
    
    class Meta:
        model = FormulaIngrediente
        fields = ["id", "item", "item_nome", "percentual", "estoque_atual", "custo_medio"]


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

    def validate(self, attrs):
        organization = getattr(getattr(self.context.get("request"), "user", None), "organization", None)
        item_final = attrs.get("item_final", getattr(self.instance, "item_final", None))
        ingredientes = attrs.get("ingredientes", [])
        if not organization:
            raise serializers.ValidationError({"organization": translate_message("Usuário não possui organização vinculada.")})
        if item_final and item_final.organization_id != organization.id:
            raise serializers.ValidationError({"item_final": translate_message("Item final não pertence à sua organização.")})
        foreign_items = [item["item"].id for item in ingredientes if item["item"].organization_id != organization.id]
        if foreign_items:
            raise serializers.ValidationError({"ingredientes": translate_message("Um ou mais ingredientes pertencem a outra organização.")})
        return attrs

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
    lote_codigo = serializers.CharField(source="lote_animal.batch_code", read_only=True, default=None)
    item_nome = serializers.CharField(source="item_estoque.nome", read_only=True)
    usuario_nome = serializers.SerializerMethodField()
    tipo_registro_display = serializers.CharField(source="get_tipo_registro_display", read_only=True)
    animais_identificadores = serializers.SerializerMethodField()

    class Meta:
        model = ConsumoRacao
        fields = [
            "id", "lote_animal", "lote_codigo", "animais", "animais_identificadores",
            "categoria_destino", "fase_destino", "item_estoque", "item_nome",
            "data_inicio", "data_fim", "quantidade", "custo_unitario", "custo_total",
            "tipo_registro", "tipo_registro_display", "usuario", "usuario_nome", "observacao",
            "created_at"
        ]
        read_only_fields = ["id", "custo_unitario", "custo_total", "usuario", "created_at"]

    def validate(self, attrs):
        organization = getattr(getattr(self.context.get("request"), "user", None), "organization", None)
        item = attrs.get("item_estoque", getattr(self.instance, "item_estoque", None))
        batch = attrs.get("lote_animal", getattr(self.instance, "lote_animal", None))
        if not organization or not item or item.organization_id != organization.id:
            raise serializers.ValidationError({"item_estoque": translate_message("Item não pertence à sua organização.")})
        animals = attrs.get("animais", [])
        if not batch and not animals:
            raise serializers.ValidationError({"destino": translate_message("Selecione um lote ou pelo menos um animal.")})
        if batch and animals:
            raise serializers.ValidationError({"destino": translate_message("Selecione lote ou animais, não ambos.")})
        if batch and batch.farm.organization_id != organization.id:
            raise serializers.ValidationError({"lote_animal": translate_message("Lote animal não pertence à sua organização.")})
        if animals and any(animal.farm.organization_id != organization.id for animal in animals):
            raise serializers.ValidationError({"animais": translate_message("Um ou mais animais não pertencem à sua organização.")})
        if attrs.get("data_inicio") and attrs.get("data_fim") and attrs["data_fim"] < attrs["data_inicio"]:
            raise serializers.ValidationError({"data_fim": translate_message("A data final não pode ser anterior à data inicial.")})

        destination = attrs.get("categoria_destino", getattr(self.instance, "categoria_destino", ""))
        destination_phase = attrs.get("fase_destino", getattr(self.instance, "fase_destino", ""))
        allowed_phases = {
            "lotes": {"maternidade", "creche", "crescimento", "engorda"},
            "matrizes": {"vazia", "gestante", "lactante"},
            "marras": {"marras"},
            "reprodutores": {"reprodutor"},
        }
        if destination not in allowed_phases:
            raise serializers.ValidationError({"categoria_destino": translate_message("Categoria de destino inválida.")})
        if destination_phase not in allowed_phases[destination]:
            raise serializers.ValidationError({"fase_destino": translate_message("Fase incompatível com a categoria selecionada.")})

        if batch:
            batch_phases = {
                "maternidade": {"gestacao_maternidade", "maternidade"},
                "creche": {"creche"},
                "crescimento": {"crescimento"},
                "engorda": {"engorda"},
            }
            if batch.species.code != "suinos":
                raise serializers.ValidationError({"lote_animal": translate_message("O lote selecionado não pertence à suinocultura.")})
            if destination != "lotes" or batch.phase not in batch_phases.get(destination_phase, set()):
                raise serializers.ValidationError({"lote_animal": translate_message("O lote não pertence à fase produtiva selecionada.")})

        if animals:
            for animal in animals:
                if animal.species.code != "suinos":
                    raise serializers.ValidationError({"animais": translate_message("Um ou mais animais não pertencem à suinocultura.")})
                category = (animal.category or "").casefold()
                reproductive_status = (animal.reproductive_status or "").casefold()
                compatible = (
                    (destination == "matrizes" and category == "matriz" and reproductive_status == destination_phase)
                    or (destination == "marras" and category in {"marrã", "marra"})
                    or (destination == "reprodutores" and category in {"reprodutor", "cachaço", "cachaco"})
                )
                if not compatible:
                    raise serializers.ValidationError({"animais": translate_message("Um ou mais animais não pertencem à categoria ou fase selecionada.")})

        if item.especie_animal not in {"", "suino", "multiplo"}:
            raise serializers.ValidationError({"item_estoque": translate_message("A ração selecionada não é indicada para suínos.")})
        return attrs

    def get_animais_identificadores(self, obj):
        return list(obj.animais.values_list("identifier", flat=True))

    def get_usuario_nome(self, obj):
        if not obj.usuario:
            return None
        return obj.usuario.full_name or obj.usuario.email
