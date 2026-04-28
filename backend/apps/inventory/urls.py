from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"items", views.ItemEstoqueViewSet, basename="inventory-items")
router.register(r"lotes", views.LoteEstoqueViewSet, basename="inventory-lotes")
router.register(r"movimentacoes", views.MovimentacaoEstoqueViewSet, basename="inventory-movimentacoes")
router.register(r"fornecedores", views.FornecedorViewSet, basename="inventory-fornecedores")
router.register(r"alertas", views.AlertaEstoqueViewSet, basename="inventory-alertas")
router.register(r"formulas", views.FormulaRacaoViewSet, basename="inventory-formulas")
router.register(r"producoes", views.ProducaoRacaoViewSet, basename="inventory-producoes")

urlpatterns = [
    path("", include(router.urls)),
]
