"""
Serviços de geração de relatórios.
"""

from datetime import date, timedelta
from django.db.models import Sum, Count, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone
from typing import Dict, List, Any


class StockReportService:
    """Serviço para geração de relatórios de estoque."""

    @staticmethod
    def _get_lote_code(lote) -> str | None:
        if not lote:
            return None
        return lote.numero_lote or str(lote.id)

    @staticmethod
    def get_general_stock(organization, filters: Dict = None) -> Dict[str, Any]:
        """
        Relatório geral de estoque.
        Retorna todos os itens ativos com saldo calculado pelos lotes ativos.
        """
        from apps.inventory.models import ItemEstoque

        items = (
            ItemEstoque.objects.filter(organization=organization, ativo=True)
            .defer("prioridade")
            .prefetch_related("lotes")
        )

        if filters:
            if filters.get("category"):
                items = items.filter(categoria=filters["category"])
            if filters.get("search"):
                items = items.filter(
                    Q(nome__icontains=filters["search"])
                    | Q(codigo__icontains=filters["search"])
                )

        results = []
        total_value = 0
        total_items = 0

        for item in items:
            active_lotes = [lote for lote in item.lotes.all() if lote.ativo]
            total_qty = sum(lote.quantidade_atual or 0 for lote in active_lotes)
            total_cost = sum(
                (lote.quantidade_atual or 0) * (lote.custo_unitario or 0)
                for lote in active_lotes
            )
            min_stock = item.estoque_minimo or 0

            if total_qty > 0:
                results.append(
                    {
                        "id": str(item.id),
                        "code": item.codigo,
                        "name": item.nome,
                        "category": item.get_categoria_display(),
                        "unit": item.get_unidade_medida_display(),
                        "quantity": float(total_qty),
                        "avg_cost": round(float(total_cost / total_qty), 2)
                        if total_qty > 0
                        else 0,
                        "total_value": round(float(total_cost), 2),
                        "min_stock": float(min_stock),
                        "is_low_stock": total_qty <= min_stock if min_stock else False,
                    }
                )
                total_value += total_cost
                total_items += 1

        return {
            "items": results,
            "total_items": total_items,
            "total_value": round(float(total_value), 2),
            "low_stock_count": sum(1 for item in results if item["is_low_stock"]),
        }

    @staticmethod
    def get_stock_movement(organization, date_range: Dict = None) -> Dict[str, Any]:
        """
        Relatório de movimentações de estoque.
        """
        from apps.inventory.models import MovimentacaoEstoque

        queryset = MovimentacaoEstoque.objects.filter(
            item__organization=organization
        ).select_related("item", "lote", "responsavel")

        if date_range:
            start = date_range.get("start")
            end = date_range.get("end")
            if start:
                queryset = queryset.filter(data_movimentacao__date__gte=start)
            if end:
                queryset = queryset.filter(data_movimentacao__date__lte=end)

        movements = queryset.order_by("-data_movimentacao")[:500]

        by_type = (
            queryset.values("tipo")
            .annotate(
                count=Count("id"),
                total_quantity=Sum("quantidade"),
            )
            .order_by("tipo")
        )

        by_month = (
            queryset.annotate(month=TruncMonth("data_movimentacao"))
            .values("month", "tipo")
            .annotate(total=Sum("quantidade"))
            .order_by("month")
        )

        results = []
        for movement in movements:
            results.append(
                {
                    "id": str(movement.id),
                    "date": movement.data_movimentacao.isoformat()
                    if movement.data_movimentacao
                    else None,
                    "type": movement.get_tipo_display(),
                    "type_code": movement.tipo,
                    "item_code": movement.item.codigo if movement.item else None,
                    "item_name": movement.item.nome if movement.item else None,
                    "quantity": float(movement.quantidade or 0),
                    "lote_code": StockReportService._get_lote_code(movement.lote),
                    "created_by": movement.responsavel.full_name
                    if movement.responsavel
                    else None,
                    "notes": movement.observacao or "",
                }
            )

        return {
            "movements": results,
            "summary": {
                "total_movements": queryset.count(),
                "by_type": [
                    {
                        "type": item["tipo"],
                        "count": item["count"],
                        "quantity": float(item["total_quantity"] or 0),
                    }
                    for item in by_type
                ],
                "monthly": [
                    {
                        "month": item["month"].strftime("%Y-%m")
                        if item["month"]
                        else None,
                        "type": item["tipo"],
                        "quantity": float(item["total"] or 0),
                    }
                    for item in by_month
                ],
            },
        }

    @staticmethod
    def get_low_stock(organization) -> Dict[str, Any]:
        """
        Relatório de itens abaixo do estoque mínimo.
        """
        from apps.inventory.models import ItemEstoque

        items = (
            ItemEstoque.objects.filter(
                organization=organization, ativo=True, estoque_minimo__gt=0
            )
            .defer("prioridade")
            .prefetch_related("lotes")
        )

        results = []

        for item in items:
            active_lotes = [lote for lote in item.lotes.all() if lote.ativo]
            total_qty = sum(lote.quantidade_atual or 0 for lote in active_lotes)
            min_stock = item.estoque_minimo or 0

            if total_qty <= min_stock:
                needed = min_stock - total_qty
                results.append(
                    {
                        "id": str(item.id),
                        "code": item.codigo,
                        "name": item.nome,
                        "category": item.get_categoria_display(),
                        "unit": item.get_unidade_medida_display(),
                        "current_quantity": float(total_qty),
                        "min_stock": float(min_stock),
                        "needed": float(needed),
                        "urgency": "critical" if total_qty == 0 else "warning",
                    }
                )

        results.sort(key=lambda item: (item["urgency"] == "warning", -item["needed"]))

        return {
            "items": results,
            "total": len(results),
            "critical": sum(1 for item in results if item["urgency"] == "critical"),
            "warning": sum(1 for item in results if item["urgency"] == "warning"),
        }

    @staticmethod
    def get_expiry_report(organization, days_ahead: int = 30) -> Dict[str, Any]:
        """
        Relatório de validade de itens, principalmente medicamentos e vacinas.
        """
        from apps.inventory.models import LoteEstoque

        today = date.today()
        cutoff_date = today + timedelta(days=days_ahead)

        lotes = (
            LoteEstoque.objects.filter(
                item__organization=organization,
                item__categoria__in=["medicamento", "vacina"],
                data_validade__lte=cutoff_date,
                data_validade__gte=today,
                quantidade_atual__gt=0,
                ativo=True,
            )
            .select_related("item")
            .order_by("data_validade")
        )

        results = []
        total_value = 0

        for lote in lotes:
            quantity = lote.quantidade_atual or 0
            value = quantity * (lote.custo_unitario or 0)
            days_until = (lote.data_validade - today).days

            results.append(
                {
                    "id": str(lote.id),
                    "item_id": str(lote.item.id),
                    "item_code": lote.item.codigo,
                    "item_name": lote.item.nome,
                    "lote_code": StockReportService._get_lote_code(lote),
                    "quantity": float(quantity),
                    "expiry_date": lote.data_validade.isoformat(),
                    "days_until_expiry": days_until,
                    "cost": float(lote.custo_unitario or 0),
                    "total_value": round(float(value), 2),
                    "urgency": "critical"
                    if days_until <= 7
                    else "warning"
                    if days_until <= 15
                    else "normal",
                }
            )
            total_value += value

        expired = (
            LoteEstoque.objects.filter(
                item__organization=organization,
                item__categoria__in=["medicamento", "vacina"],
                data_validade__lt=today,
                quantidade_atual__gt=0,
                ativo=True,
            )
            .select_related("item")
            .order_by("data_validade")
        )

        expired_list = []
        expired_value = 0

        for lote in expired:
            quantity = lote.quantidade_atual or 0
            value = quantity * (lote.custo_unitario or 0)
            expired_list.append(
                {
                    "item_name": lote.item.nome,
                    "lote_code": StockReportService._get_lote_code(lote),
                    "quantity": float(quantity),
                    "expiry_date": lote.data_validade.isoformat(),
                    "total_value": round(float(value), 2),
                }
            )
            expired_value += value

        return {
            "expiring": results,
            "expired": expired_list,
            "total_expiring": len(results),
            "total_expired": len(expired_list),
            "total_expiring_value": round(float(total_value), 2),
            "total_expired_value": round(float(expired_value), 2),
        }


class FinancialReportService:
    """Serviço para geração de relatórios financeiros"""

    @staticmethod
    def get_cashflow(organization, date_range: Dict = None) -> Dict[str, Any]:
        """
        Relatório de fluxo de caixa.
        """
        from apps.finance.models import Transaction, FinancialCategory

        queryset = Transaction.objects.filter(organization=organization)

        if date_range:
            start = date_range.get("start")
            end = date_range.get("end")
            if start:
                queryset = queryset.filter(due_date__gte=start)
            if end:
                queryset = queryset.filter(due_date__lte=end)

        monthly = (
            queryset.annotate(month=TruncMonth("due_date"))
            .values("month", "category__category_type")
            .annotate(total=Sum("amount"))
            .order_by("month")
        )

        revenue = (
            queryset.filter(
                category__category_type=FinancialCategory.CategoryType.REVENUE
            ).aggregate(total=Sum("amount"))["total"]
            or 0
        )

        expense = (
            queryset.filter(
                category__category_type=FinancialCategory.CategoryType.EXPENSE
            ).aggregate(total=Sum("amount"))["total"]
            or 0
        )

        by_category = (
            queryset.values("category__name", "category__category_type")
            .annotate(total=Sum("amount"))
            .order_by("-total")
        )

        return {
            "summary": {
                "total_revenue": float(revenue),
                "total_expense": float(expense),
                "balance": float(revenue - expense),
            },
            "monthly": [
                {
                    "month": str(item["month"].strftime("%Y-%m"))
                    if item["month"]
                    else None,
                    "type": item["category__category_type"],
                    "amount": float(item["total"] or 0),
                }
                for item in monthly
            ],
            "by_category": [
                {
                    "category": item["category__name"],
                    "type": item["category__category_type"],
                    "amount": float(item["total"] or 0),
                }
                for item in by_category
            ],
        }

    @staticmethod
    def get_dre(organization, date_range: Dict = None) -> Dict[str, Any]:
        """
        Demonstração de Resultados do Exercício (DRE).
        """
        from apps.finance.models import Transaction, FinancialCategory
        from django.db.models.functions import TruncMonth

        queryset = Transaction.objects.filter(
            organization=organization, status__in=["paid", "pending"]
        )

        if date_range:
            if date_range.get("start"):
                queryset = queryset.filter(due_date__gte=date_range["start"])
            if date_range.get("end"):
                queryset = queryset.filter(due_date__lte=date_range["end"])

        # Revenue breakdown
        revenue_items = (
            queryset.filter(
                category__category_type=FinancialCategory.CategoryType.REVENUE
            )
            .values("category__name")
            .annotate(total=Sum("amount"))
            .order_by("-total")
        )

        # Expense breakdown
        expense_items = (
            queryset.filter(
                category__category_type=FinancialCategory.CategoryType.EXPENSE
            )
            .values("category__name")
            .annotate(total=Sum("amount"))
            .order_by("-total")
        )

        total_revenue = sum(item["total"] or 0 for item in revenue_items)
        total_expense = sum(item["total"] or 0 for item in expense_items)

        # By month for chart
        monthly_dre = (
            queryset.annotate(month=TruncMonth("due_date"))
            .values("month", "category__category_type")
            .annotate(total=Sum("amount"))
            .order_by("month")
        )

        return {
            "period": date_range or {},
            "revenue": {
                "total": float(total_revenue),
                "items": [
                    {"category": r["category__name"], "amount": float(r["total"] or 0)}
                    for r in revenue_items
                ],
            },
            "expense": {
                "total": float(total_expense),
                "items": [
                    {"category": r["category__name"], "amount": float(r["total"] or 0)}
                    for r in expense_items
                ],
            },
            "result": {
                "gross_profit": float(total_revenue - total_expense),
                "margin": round(
                    (total_revenue - total_expense) / total_revenue * 100, 2
                )
                if total_revenue > 0
                else 0,
            },
            "monthly": [
                {
                    "month": str(m["month"].strftime("%Y-%m")) if m["month"] else None,
                    "type": m["category__category_type"],
                    "amount": float(m["total"] or 0),
                }
                for m in monthly_dre
            ],
        }

    @staticmethod
    def get_by_category(organization, category_type: str = None) -> Dict[str, Any]:
        """
        Relatório detalhado por categoria.
        """
        from apps.finance.models import Transaction, FinancialCategory

        queryset = Transaction.objects.filter(organization=organization)

        if category_type:
            queryset = queryset.filter(category__category_type=category_type)

        categories = (
            queryset.values("category__id", "category__name", "category__category_type")
            .annotate(
                total=Sum("amount"), count=Count("id"), avg=Sum("amount") / Count("id")
            )
            .order_by("-total")
        )

        results = []
        for cat in categories:
            transactions = queryset.filter(category__id=cat["category__id"]).order_by(
                "-created_at"
            )[:20]
            results.append(
                {
                    "category_id": str(cat["category__id"]),
                    "category_name": cat["category__name"],
                    "type": cat["category__category_type"],
                    "total": float(cat["total"] or 0),
                    "count": cat["count"],
                    "average": float(cat["avg"] or 0),
                    "recent": [
                        {
                            "id": str(t.id),
                            "description": t.description,
                            "amount": float(t.amount),
                            "due_date": t.due_date.isoformat() if t.due_date else None,
                            "status": t.status,
                        }
                        for t in transactions
                    ],
                }
            )

        return {"categories": results}

    @staticmethod
    def get_comparative(organization, year: int = None) -> Dict[str, Any]:
        """
        Comparativo financeiro anual.
        """
        from apps.finance.models import Transaction, FinancialCategory
        from django.db.models.functions import TruncMonth

        if not year:
            year = date.today().year

        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"

        queryset = Transaction.objects.filter(
            organization=organization, due_date__gte=start_date, due_date__lte=end_date
        )

        monthly = (
            queryset.annotate(month=TruncMonth("due_date"))
            .values("month", "category__category_type")
            .annotate(total=Sum("amount"))
            .order_by("month")
        )

        # Build monthly comparison
        months = [
            "Jan",
            "Fev",
            "Mar",
            "Abr",
            "Mai",
            "Jun",
            "Jul",
            "Ago",
            "Set",
            "Out",
            "Nov",
            "Dez",
        ]
        monthly_data = {m: {"revenue": 0, "expense": 0} for m in months}

        for item in monthly:
            month_idx = item["month"].month - 1 if item["month"] else 0
            month_name = months[month_idx]
            if item["category__category_type"] == "revenue":
                monthly_data[month_name]["revenue"] = float(item["total"] or 0)
            else:
                monthly_data[month_name]["expense"] = float(item["total"] or 0)

        total_revenue = sum(m["revenue"] for m in monthly_data.values())
        total_expense = sum(m["expense"] for m in monthly_data.values())

        return {
            "year": year,
            "monthly": [
                {
                    "month": m,
                    "revenue": monthly_data[m]["revenue"],
                    "expense": monthly_data[m]["expense"],
                    "balance": monthly_data[m]["revenue"] - monthly_data[m]["expense"],
                }
                for m in months
            ],
            "totals": {
                "revenue": total_revenue,
                "expense": total_expense,
                "balance": total_revenue - total_expense,
            },
        }


class LivestockReportService:
    """Serviço para geração de relatórios de produção animal"""

    @staticmethod
    def get_inventory(organization) -> Dict[str, Any]:
        """
        Relatório de inventário de rebanho.
        """
        from apps.livestock.models import AnimalBatch, Species

        batches = AnimalBatch.objects.filter(
            farm__organization=organization, status=AnimalBatch.Status.ACTIVE
        ).select_related("farm", "species", "breed")

        by_species = (
            batches.values("species__name")
            .annotate(total_animals=Sum("quantity"), batches=Count("id"))
            .order_by("-total_animals")
        )

        by_farm = (
            batches.values("farm__name")
            .annotate(total_animals=Sum("quantity"), batches=Count("id"))
            .order_by("-total_animals")
        )

        by_status = batches.values("status").annotate(
            total_animals=Sum("quantity"), batches=Count("id")
        )

        results = []
        for batch in batches:
            results.append(
                {
                    "id": str(batch.id),
                    "farm": batch.farm.name,
                    "species": batch.species.name,
                    "breed": batch.breed.name if batch.breed else None,
                    "batch_code": batch.batch_code,
                    "quantity": batch.quantity,
                    "status": batch.get_status_display(),
                    "entry_date": batch.entry_date.isoformat()
                    if batch.entry_date
                    else None,
                    "avg_weight": float(batch.avg_weight_kg)
                    if batch.avg_weight_kg
                    else None,
                }
            )

        return {
            "items": results,
            "by_species": [
                {
                    "species": s["species__name"] or "Não definido",
                    "total": s["total_animals"],
                    "batches": s["batches"],
                }
                for s in by_species
            ],
            "by_farm": [
                {
                    "farm": f["farm__name"],
                    "total": f["total_animals"],
                    "batches": f["batches"],
                }
                for f in by_farm
            ],
            "by_status": [
                {
                    "status": s["status"],
                    "total": s["total_animals"],
                    "batches": s["batches"],
                }
                for s in by_status
            ],
            "total_animals": batches.aggregate(total=Sum("quantity"))["total"] or 0,
        }


class CropReportService:
    """Serviço para geração relatórios de culturas/lavouras"""

    @staticmethod
    def get_area_planted(organization) -> Dict[str, Any]:
        """
        Relatório de área plantada por cultura/fazenda.
        """
        from apps.crops.models import Field, PlantingCycle

        fields = Field.objects.filter(
            farm__organization=organization, is_active=True
        ).select_related("farm")

        by_farm = (
            fields.values("farm__name")
            .annotate(total_area=Sum("area_ha"), fields_count=Count("id"))
            .order_by("-total_area")
        )

        by_status = fields.values("is_active").annotate(
            total_area=Sum("area_ha"), fields_count=Count("id")
        )

        active_cycles = PlantingCycle.objects.filter(
            field__farm__organization=organization,
            status__in=["planting", "growing", "harvesting"],
        )

        cycles_by_crop = (
            active_cycles.values("crop_name")
            .annotate(cycles=Count("id"), total_area=Sum("field__area_ha"))
            .order_by("-cycles")
        )

        return {
            "summary": {
                "total_fields": fields.count(),
                "total_area": float(
                    fields.aggregate(total=Sum("area_ha"))["total"] or 0
                ),
                "active_cycles": active_cycles.count(),
            },
            "by_farm": [
                {
                    "farm": f["farm__name"],
                    "area": float(f["total_area"] or 0),
                    "fields": f["fields_count"],
                }
                for f in by_farm
            ],
            "by_status": [
                {
                    "status": "Ativo" if s["is_active"] else "Inativo",
                    "area": float(s["total_area"] or 0),
                    "fields": s["fields_count"],
                }
                for s in by_status
            ],
            "by_crop": [
                {
                    "crop": c["crop_name"] or "Não definida",
                    "cycles": c["cycles"],
                    "area": float(c["total_area"] or 0),
                }
                for c in cycles_by_crop
            ],
        }

    @staticmethod
    def get_harvest(organization, year: int = None) -> Dict[str, Any]:
        """
        Relatório de produção/safra.
        """
        from apps.crops.models import PlantingCycle, Field

        if not year:
            year = date.today().year

        cycles = PlantingCycle.objects.filter(
            field__farm__organization=organization, planting_date__year=year
        ).select_related("field", "field__farm")

        by_crop = (
            cycles.values("crop_name")
            .annotate(
                cycles=Count("id"),
                total_area=Sum("field__area_ha"),
                total_expected=Sum("expected_production"),
                total_harvested=Sum("actual_production"),
            )
            .order_by("-total_harvested")
        )

        by_farm = (
            cycles.values("field__farm__name")
            .annotate(cycles=Count("id"), total_production=Sum("actual_production"))
            .order_by("-total_production")
        )

        results = []
        for cycle in cycles:
            results.append(
                {
                    "id": str(cycle.id),
                    "field": cycle.field.name,
                    "farm": cycle.field.farm.name,
                    "crop": cycle.crop_name,
                    "planting_date": cycle.planting_date.isoformat()
                    if cycle.planting_date
                    else None,
                    "expected_harvest": cycle.expected_harvest_date.isoformat()
                    if cycle.expected_harvest_date
                    else None,
                    "expected_production": float(cycle.expected_production)
                    if cycle.expected_production
                    else 0,
                    "actual_production": float(cycle.actual_production)
                    if cycle.actual_production
                    else 0,
                    "status": cycle.get_status_display(),
                    "productivity": round(
                        float(cycle.actual_production or 0)
                        / float(cycle.field.area_ha),
                        2,
                    )
                    if cycle.actual_production and cycle.field.area_ha
                    else 0,
                }
            )

        return {
            "year": year,
            "total_cycles": cycles.count(),
            "by_crop": [
                {
                    "crop": c["crop_name"] or "Não definida",
                    "cycles": c["cycles"],
                    "area": float(c["total_area"] or 0),
                    "expected": float(c["total_expected"] or 0),
                    "harvested": float(c["total_harvested"] or 0),
                }
                for c in by_crop
            ],
            "by_farm": [
                {
                    "farm": f["field__farm__name"],
                    "cycles": f["cycles"],
                    "production": float(f["total_production"] or 0),
                }
                for f in by_farm
            ],
            "cycles": results,
        }
