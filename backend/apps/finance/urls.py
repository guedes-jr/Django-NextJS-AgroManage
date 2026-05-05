from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r"categories", views.FinancialCategoryViewSet, basename="financial-category")
router.register(r"accounts", views.BankAccountViewSet, basename="bank-account")
router.register(r"transactions", views.TransactionViewSet, basename="transaction")

urlpatterns = [
    path("", include(router.urls)),
]
