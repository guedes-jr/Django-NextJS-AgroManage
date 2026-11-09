"""Operational feed contracts: scoped reads, atomic formula writes and reviewed production."""
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP
import hashlib
import json
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import serializers, exceptions
from .models import FormulaRacao, FormulaIngrediente, ItemEstoque, LoteEstoque, MovimentacaoEstoque, ProducaoRacao
from .choices import EspecieAnimal
from .stock_launches import authorize

CENT = Decimal('.01')
MAX_QTY = Decimal('99999999.99')
SALT = 'inventory.mobile-feed.v1'

class Conflict(exceptions.APIException):
    status_code = 409
    default_detail = 'Os dados mudaram ou a revisão expirou. Revise novamente.'

class Strict(serializers.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, dict) or set(data) - set(self.fields):
            raise serializers.ValidationError({'non_field_errors': ['Campos não reconhecidos.']})
        return super().to_internal_value(data)

class IngredientInput(Strict):
    item = serializers.UUIDField()
    percentual = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=CENT, max_value=Decimal('100'))

class FormulaInput(Strict):
    id = serializers.UUIDField(required=False)
    expected_updated_at = serializers.DateTimeField(required=False)
    nome = serializers.CharField(max_length=150)
    descricao = serializers.CharField(max_length=5000, allow_blank=True, default='')
    especie_animal = serializers.ChoiceField(choices=EspecieAnimal.choices, allow_blank=True, default='')
    item_final = serializers.UUIDField()
    ingredientes = IngredientInput(many=True, min_length=1, max_length=50)

    def validate(self, data):
        ingredients = data['ingredientes']
        ids = [row['item'] for row in ingredients]
        if len(ids) != len(set(ids)) or data['item_final'] in ids:
            raise serializers.ValidationError({'ingredientes': ['Não repita ingredientes nem utilize o produto final como ingrediente.']})
        if sum(row['percentual'] for row in ingredients) != Decimal('100'):
            raise serializers.ValidationError({'ingredientes': ['Os percentuais devem somar 100%.']})
        if bool(data.get('id')) != bool(data.get('expected_updated_at')):
            raise serializers.ValidationError({'expected_updated_at': ['Informe a versão da fórmula ao editar.']})
        return data

class ProductionInput(Strict):
    formula = serializers.UUIDField()
    quantidade_teorica = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=CENT)
    quantidade_real = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=CENT)

class ConfirmInput(Strict):
    preview_token = serializers.CharField(max_length=60000)


def formulas(user):
    return FormulaRacao.objects.filter(organization_id=user.organization_id).select_related('item_final').prefetch_related(
        Prefetch('ingredientes', queryset=FormulaIngrediente.objects.select_related('item').order_by('item_id')))


def formula_data(obj):
    if obj.item_final_id and obj.item_final.organization_id != obj.organization_id or any(row.item.organization_id != obj.organization_id for row in obj.ingredientes.all()):
        raise serializers.ValidationError({'formula': ['Cadastro inconsistente. Revise as referências da fórmula.']})
    return {'id': str(obj.pk), 'nome': obj.nome, 'descricao': obj.descricao, 'especie_animal': obj.especie_animal,
            'item_final': str(obj.item_final_id) if obj.item_final_id else None,
            'item_final_nome': obj.item_final.nome if obj.item_final_id else '', 'ativa': obj.ativa,
            'updated_at': obj.updated_at.isoformat(),
            'ingredientes': [{'item': str(row.item_id), 'item_nome': row.item.nome, 'unidade': row.item.unidade_medida,
                              'ativo': row.item.ativo, 'percentual': str(row.percentual)} for row in obj.ingredientes.all()]}


def production_data(obj):
    return {'id': str(obj.pk), 'formula': str(obj.formula_id), 'formula_nome': obj.formula.nome,
            'data_producao': obj.data_producao.isoformat(), 'timezone': settings.TIME_ZONE, 'quantidade_teorica': str(obj.quantidade_teorica),
            'quantidade_real': str(obj.quantidade_real), 'status': obj.status,
            'responsavel_nome': obj.responsavel.full_name if obj.responsavel_id else ''}


def items_for(user, ids, lock=False):
    qs = ItemEstoque.objects.filter(organization_id=user.organization_id, id__in=ids).order_by('id')
    if lock:
        qs = qs.select_for_update()
    items = {str(item.pk): item for item in qs}
    if len(items) != len(ids) or any(not item.ativo or item.unidade_medida != 'kg' for item in items.values()):
        raise serializers.ValidationError({'item': ['Selecione produtos ativos da organização, em kg.']})
    return items


@transaction.atomic
def save_formula(user, data):
    authorize(user)
    obj = None
    if data.get('id'):
        obj = FormulaRacao.objects.select_for_update().filter(pk=data['id'], organization_id=user.organization_id).first()
        if not obj:
            raise exceptions.NotFound()
        if not obj.ativa or obj.updated_at != data['expected_updated_at']:
            raise Conflict()
    ids = {str(data['item_final']), *(str(row['item']) for row in data['ingredientes'])}
    items = items_for(user, ids, lock=True)
    final = items[str(data['item_final'])]
    if final.categoria != 'racao' and 'racao' not in (final.categorias or []):
        raise serializers.ValidationError({'item_final': ['O produto final precisa ser uma ração em kg.']})
    if obj is None:
        obj = FormulaRacao(organization_id=user.organization_id)
    for field in ('nome', 'descricao', 'especie_animal', 'item_final'):
        setattr(obj, field if field != 'item_final' else 'item_final_id', data[field])
    obj.save()
    obj.ingredientes.all().delete()
    FormulaIngrediente.objects.bulk_create([FormulaIngrediente(formula=obj, item_id=row['item'], percentual=row['percentual']) for row in data['ingredientes']])
    return {'id': str(obj.pk)}


def allocation(quantity, ingredients):
    """Distribute hundredths by largest remainder; exact sum, deterministic ties."""
    exact = [(row, quantity * row.percentual / Decimal('100')) for row in ingredients]
    values = {str(row.item_id): amount.quantize(CENT, rounding=ROUND_DOWN) for row, amount in exact}
    remaining = int((quantity - sum(values.values())) / CENT)
    for row, _ in sorted(exact, key=lambda pair: (-(pair[1] - values[str(pair[0].item_id)]), str(pair[0].item_id)))[:remaining]:
        values[str(row.item_id)] += CENT
    if any(value <= 0 for value in values.values()):
        raise serializers.ValidationError({'quantidade_teorica': ['Quantidade pequena demais para os percentuais da fórmula.']})
    return values


def evaluate(user, command, lock=False):
    qs = FormulaRacao.objects.filter(pk=command['formula'], organization_id=user.organization_id)
    if lock:
        qs = qs.select_for_update()
    formula = qs.first()
    if not formula:
        raise exceptions.NotFound()
    ingredients = list(formula.ingredientes.order_by('item_id'))
    if not formula.ativa or not formula.item_final_id or not ingredients or sum(row.percentual for row in ingredients) != Decimal('100') or any(row.percentual <= 0 for row in ingredients) or formula.item_final_id in [row.item_id for row in ingredients]:
        raise serializers.ValidationError({'formula': ['Fórmula inativa ou incompleta. Revise o cadastro.']})
    ids = {str(formula.item_final_id), *(str(row.item_id) for row in ingredients)}
    items = items_for(user, ids, lock)
    final = items[str(formula.item_final_id)]
    if final.categoria != 'racao' and 'racao' not in (final.categorias or []):
        raise serializers.ValidationError({'formula': ['Produto final deve ser ração em kg.']})
    today = timezone.localdate()
    lots = LoteEstoque.objects.filter(item_id__in=ids, ativo=True).order_by('data_entrada', 'id')
    if lock:
        lots = lots.select_for_update()
    lots = list(lots)
    quantities = allocation(command['quantidade_teorica'], ingredients)
    result, taken, total_cost = [], [], Decimal('0')
    for row in ingredients:
        item = items[str(row.item_id)]
        required = quantities[str(item.pk)]
        eligible = [lot for lot in lots if lot.item_id == item.pk and lot.quantidade_atual > 0 and lot.data_entrada <= today and (lot.data_validade is None or lot.data_validade >= today)]
        available = sum((lot.quantidade_atual for lot in eligible), Decimal('0'))
        if available < required:
            raise serializers.ValidationError({'estoque': [f'Estoque disponível insuficiente: {item.nome}. Necessário {required} kg; disponível {available} kg.']})
        cost_lots = [lot for lot in lots if lot.item_id == item.pk and lot.quantidade_atual > 0]
        total_balance = sum((lot.quantidade_atual for lot in cost_lots), Decimal('0'))
        average_cost = sum((lot.quantidade_atual * (lot.custo_unitario or Decimal('0')) for lot in cost_lots), Decimal('0')) / total_balance if total_balance else Decimal('0')
        remaining, portions = required, []
        for lot in eligible:
            if remaining <= 0:
                break
            amount = min(remaining, lot.quantidade_atual)
            remaining -= amount
            cost = lot.custo_unitario if lot.custo_unitario is not None else average_cost
            total_cost += amount * cost
            taken.append((lot, amount))
            portions.append({'id': str(lot.pk), 'numero': lot.numero_lote, 'quantidade': str(amount), 'saldo': str(lot.quantidade_atual), 'version': lot.updated_at.isoformat(), 'custo': str(cost)})
        result.append({'item': str(item.pk), 'nome': item.nome, 'percentual': str(row.percentual), 'quantidade': str(required), 'disponivel': str(available), 'lotes': portions, 'version': item.updated_at.isoformat()})
    final_balance = sum((lot.quantidade_atual for lot in lots if lot.item_id == final.pk), Decimal('0'))
    if final_balance + command['quantidade_real'] > MAX_QTY:
        raise serializers.ValidationError({'quantidade_real': ['O saldo final excede o limite do estoque.']})
    cost = total_cost.quantize(CENT, rounding=ROUND_HALF_UP)
    unit_cost = (total_cost / command['quantidade_real']).quantize(CENT, rounding=ROUND_HALF_UP)
    if cost > Decimal('9999999999.99') or unit_cost > MAX_QTY:
        raise serializers.ValidationError({'quantidade_real': ['O custo da produção excede o limite permitido.']})
    snapshot = {'formula': str(formula.pk), 'nome': formula.nome, 'version': formula.updated_at.isoformat(),
                'item_final': str(final.pk), 'item_final_nome': final.nome, 'final_version': final.updated_at.isoformat(),
                'quantidade_teorica': str(command['quantidade_teorica']), 'quantidade_real': str(command['quantidade_real']),
                'saldo_final_anterior': str(final_balance), 'saldo_final_posterior': str(final_balance + command['quantidade_real']),
                'ingredientes': result, 'custo_total': str(cost), 'custo_unitario': str(unit_cost), 'today': str(today)}
    return snapshot, formula, final, taken


def public_snapshot(snapshot):
    # Operational contract never includes prices, versions or internal cost snapshots.
    return {key: value for key, value in snapshot.items() if key in ('formula', 'nome', 'item_final', 'item_final_nome', 'quantidade_teorica', 'quantidade_real', 'saldo_final_anterior', 'saldo_final_posterior')} | {
        'ingredientes': [{key: value for key, value in row.items() if key in ('item', 'nome', 'percentual', 'quantidade', 'disponivel')} | {
            'lotes': [{key: value for key, value in lot.items() if key in ('id', 'numero', 'quantidade')} for lot in row['lotes']]
        } for row in snapshot['ingredientes']]}


def digest(snapshot):
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()


def preview(user, command):
    authorize(user)
    snapshot, *_ = evaluate(user, command)
    token = signing.dumps({'user': str(user.pk), 'org': str(user.organization_id),
                           'command': {key: str(value) for key, value in command.items()}, 'digest': digest(snapshot)}, salt=SALT, compress=True)
    return public_snapshot(snapshot) | {'preview_token': token}


@transaction.atomic
def confirm(user, token):
    authorize(user)
    try:
        signed = signing.loads(token, salt=SALT, max_age=900)
    except signing.BadSignature as error:
        raise Conflict() from error
    if signed['user'] != str(user.pk) or signed['org'] != str(user.organization_id):
        raise exceptions.PermissionDenied()
    serializer = ProductionInput(data=signed['command'])
    serializer.is_valid(raise_exception=True)
    try:
        snapshot, formula, final, taken = evaluate(user, serializer.validated_data, lock=True)
    except (serializers.ValidationError, exceptions.NotFound) as error:
        raise Conflict() from error
    if signed['digest'] != digest(snapshot):
        raise Conflict()
    production = ProducaoRacao.objects.create(organization_id=user.organization_id, formula=formula,
        quantidade_teorica=snapshot['quantidade_teorica'], quantidade_real=snapshot['quantidade_real'],
        custo_total=snapshot['custo_total'], responsavel=user, status='concluida')
    for lot, amount in taken:
        lot.quantidade_atual -= amount
        lot.save(update_fields=['quantidade_atual', 'updated_at'])
        MovimentacaoEstoque.objects.create(item_id=lot.item_id, lote=lot, tipo='consumo', quantidade=amount, responsavel=user,
            destino='Produção de ração', observacao=f'Produção {production.pk}: {formula.nome}')
    lot = LoteEstoque(item=final, numero_lote=f'PROD-{production.pk}', quantidade_inicial=snapshot['quantidade_real'],
        quantidade_atual=snapshot['quantidade_real'], custo_unitario=snapshot['custo_unitario'], data_entrada=timezone.localdate())
    lot._skip_finance_transaction = True
    lot.save()
    MovimentacaoEstoque.objects.create(item=final, lote=lot, tipo='entrada', quantidade=snapshot['quantidade_real'], responsavel=user, observacao=f'Produção {production.pk}: {formula.nome}')
    return {'id': str(production.pk), 'lote': str(lot.pk)}
