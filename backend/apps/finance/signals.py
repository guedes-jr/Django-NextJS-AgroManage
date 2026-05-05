from django.db.models.signals import post_save
from django.dispatch import receiver
from apps.inventory.models import LoteEstoque
from apps.livestock.models import AnimalBatch
from .models import Transaction, FinancialCategory
from decimal import Decimal

@receiver(post_save, sender=LoteEstoque)
def create_inventory_transaction(sender, instance, created, **kwargs):
    """Cria uma despesa no financeiro quando um lote de estoque com custo é criado."""
    if created and instance.custo_unitario and instance.custo_unitario > 0:
        total_cost = instance.custo_unitario * instance.quantidade_inicial
        
        # Encontrar ou criar categoria de compra
        category, _ = FinancialCategory.objects.get_or_create(
            name="Compra de Insumos",
            category_type="expense",
            defaults={"description": "Transações automáticas de compra de estoque"}
        )
        
        # Tentar obter a organização do item de estoque
        organization = getattr(instance.item, 'organization', None)
        
        Transaction.objects.create(
            organization=organization,
            description=f"Compra de estoque: {instance.item.nome} (Lote: {instance.numero_lote})",
            amount=total_cost,
            category=category,
            due_date=instance.data_entrada,
            status="paid",  # Assumimos pago se entrou no estoque com custo
            reference=f"LOTE-{instance.id}"
        )

@receiver(post_save, sender=AnimalBatch)
def create_livestock_transaction(sender, instance, created, **kwargs):
    """Cria transações no financeiro para compra ou venda de lotes de animais."""
    
    # --- CASO 1: COMPRA DE ANIMAIS (Criação de lote com custo) ---
    if created and instance.origin == AnimalBatch.Origin.PURCHASED and instance.purchase_value and instance.purchase_value > 0:
        ref_pur = f"PURCHASE-BATCH-{instance.id}"
        
        category_pur, _ = FinancialCategory.objects.get_or_create(
            name="Compra de Animais",
            category_type="expense",
            defaults={"description": "Despesas automáticas de aquisição de novos animais"}
        )
        
        Transaction.objects.create(
            organization=instance.farm.organization,
            description=f"Compra de animais: {instance.batch_code} ({instance.species.name})",
            amount=instance.purchase_value,
            category=category_pur,
            due_date=instance.entry_date,
            status="paid",
            reference=ref_pur
        )

    # --- CASO 2: VENDA DE ANIMAIS (Status alterado para Vendido) ---
    if instance.status == AnimalBatch.Status.SOLD and instance.sale_value and instance.sale_value > 0:
        # Evitar duplicidade: verificar se já existe transação para esta referência
        ref_sale = f"SALE-BATCH-{instance.id}"
        if not Transaction.objects.filter(reference=ref_sale).exists():
            category_sale, _ = FinancialCategory.objects.get_or_create(
                name="Venda de Animais",
                category_type="revenue",
                defaults={"description": "Receitas automáticas de venda de lotes/animais"}
            )
            
            Transaction.objects.create(
                organization=instance.farm.organization,
                description=f"Venda de animais: {instance.batch_code} ({instance.species.name})",
                amount=instance.sale_value,
                category=category_sale,
                due_date=instance.exit_date or instance.updated_at.date(),
                status="paid",
                reference=ref_sale
            )
