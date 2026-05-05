from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Q
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from .models import FinancialCategory, BankAccount, Transaction
from .serializers import (
    FinancialCategorySerializer,
    BankAccountSerializer,
    TransactionSerializer
)

class FinancialCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = FinancialCategorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return FinancialCategory.objects.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)

class BankAccountViewSet(viewsets.ModelViewSet):
    serializer_class = BankAccountSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return BankAccount.objects.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)

class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Transaction.objects.filter(organization=self.request.user.organization).select_related('category', 'bank_account')
        
        # Filters
        category_type = self.request.query_params.get('type')
        if category_type:
            qs = qs.filter(category__category_type=category_type)
            
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
            
        return qs.order_by('-due_date')

    def perform_create(self, serializer):
        serializer.save(
            organization=self.request.user.organization,
            created_by=self.request.user
        )

    @action(detail=False, methods=['get'])
    def stats(self, request):
        organization = request.user.organization
        now = timezone.now()
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        transactions = Transaction.objects.filter(organization=organization)
        
        # Basic stats
        total_revenue = transactions.filter(
            category__category_type=FinancialCategory.CategoryType.REVENUE,
            status=Transaction.Status.PAID
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        
        total_expense = transactions.filter(
            category__category_type=FinancialCategory.CategoryType.EXPENSE,
            status=Transaction.Status.PAID
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        
        receivable = transactions.filter(
            category__category_type=FinancialCategory.CategoryType.REVENUE,
            status=Transaction.Status.PENDING
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        
        payable = transactions.filter(
            category__category_type=FinancialCategory.CategoryType.EXPENSE,
            status=Transaction.Status.PENDING
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        
        # Bank balance
        total_balance = BankAccount.objects.filter(organization=organization).aggregate(total=Sum('current_balance'))['total'] or Decimal('0')
        
        # Cash flow (last 30 days)
        last_30_days = []
        for i in range(30):
            date = (now - timedelta(days=i)).date()
            daily_rev = transactions.filter(
                category__category_type=FinancialCategory.CategoryType.REVENUE,
                payment_date=date,
                status=Transaction.Status.PAID
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
            
            daily_exp = transactions.filter(
                category__category_type=FinancialCategory.CategoryType.EXPENSE,
                payment_date=date,
                status=Transaction.Status.PAID
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
            
            last_30_days.append({
                "date": date.isoformat(),
                "revenue": float(daily_rev),
                "expense": float(daily_exp)
            })
            
        # Expenses by category
        by_category = transactions.filter(
            category__category_type=FinancialCategory.CategoryType.EXPENSE,
            status=Transaction.Status.PAID
        ).values('category__name').annotate(value=Sum('amount')).order_by('-value')
        
        return Response({
            "summary": {
                "balance": float(total_balance),
                "total_revenue": float(total_revenue),
                "total_expense": float(total_expense),
                "receivable": float(receivable),
                "payable": float(payable)
            },
            "cash_flow": last_30_days[::-1],
            "expenses_by_category": [
                {"name": item['category__name'], "value": float(item['value'])} 
                for item in by_category
            ]
        })
