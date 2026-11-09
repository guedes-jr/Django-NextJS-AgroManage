from .cattle_improvement_api import CattleOperationsView, CattleOperationMobileDetailView, CattleOccurrenceMobileResolutionView
from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter
from .views import (
    AnimalBatchViewSet, AnimalViewSet, MatingViewSet,
    PregnancyViewSet, BirthViewSet, LitterViewSet,
    ReproductionDashboardView, SpeciesSummaryView, IncubationViewSet,
    MarrasView, MatrizesView, GestacoesView, MaternidadeView,
    CrecheView, CrescimentoView, EngordaView,
    VaccinationRecordViewSet, WeightRecordViewSet,
    ClinicalRecordViewSet, DiseaseViewSet, AcknowledgeOperationalAlertView,
    MedicationViewSet, AlertViewSet, SymptomViewSet, HealthRecordViewSet
)

from .cattle_views import (
    CattleOverviewView, CattleDairyOverviewView, CattleAnimalViewSet, CattleBatchViewSet,
    CattlePastureViewSet, CattleGrazingViewSet, CattleMilkViewSet, CattleMilkDailyTotalViewSet, CattleFeedViewSet,
    CattleManagementViewSet, CattleAgendaView, CattleFeedPlanViewSet, CattleDailyFeedingView, CattleTroughReadingViewSet,
)

from .milk_tank_api import MilkTankViewSet, MilkTankMovementViewSet, MilkTankQualityViewSet

router = DefaultRouter()
router.register(r"cattle/milk-tanks", MilkTankViewSet, basename="milk-tank")
router.register(r"cattle/milk-tank-movements", MilkTankMovementViewSet, basename="milk-tank-movement")
router.register(r"cattle/milk-tank-quality", MilkTankQualityViewSet, basename="milk-tank-quality")
router.register(r'batches', AnimalBatchViewSet, basename='animalbatch')
router.register(r'animals', AnimalViewSet, basename='animal')
router.register(r'matings', MatingViewSet, basename='mating')
router.register(r'pregnancies', PregnancyViewSet, basename='pregnancy')
router.register(r'births', BirthViewSet, basename='birth')
router.register(r'litters', LitterViewSet, basename='litter')
router.register(r'incubations', IncubationViewSet, basename='incubation')
router.register(r'vaccinations', VaccinationRecordViewSet, basename='vaccination')
router.register(r'weights', WeightRecordViewSet, basename='weight')
router.register(r'clinical/records', ClinicalRecordViewSet, basename='clinicalrecord')
router.register(r'diseases', DiseaseViewSet, basename='disease')
router.register(r'medications', MedicationViewSet, basename='medication')
router.register(r'alerts', AlertViewSet, basename='alert')
router.register(r'symptoms', SymptomViewSet, basename='symptom')
router.register(r'health/records', HealthRecordViewSet, basename='healthrecord')


router.register(r'cattle/animals', CattleAnimalViewSet, basename='cattle-animal')
router.register(r'cattle/batches', CattleBatchViewSet, basename='cattle-batch')
router.register(r'cattle/pastures', CattlePastureViewSet, basename='cattle-pasture')
router.register(r'cattle/grazings', CattleGrazingViewSet, basename='cattle-grazing')
router.register(r'cattle/feed', CattleFeedViewSet, basename='cattle-feed')
router.register(r'cattle/milk-totals', CattleMilkDailyTotalViewSet, basename='cattle-milk-total')
router.register(r'cattle/milk', CattleMilkViewSet, basename='cattle-milk')
router.register(r'cattle/trough-readings', CattleTroughReadingViewSet, basename='cattle-trough-reading')
router.register(r'cattle/feed-plans', CattleFeedPlanViewSet, basename='cattle-feed-plan')
router.register(r'cattle/managements', CattleManagementViewSet, basename='cattle-management')

urlpatterns = [
    path("cattle/operations/occurrences/<uuid:pk>/mobile-resolve/", CattleOccurrenceMobileResolutionView.as_view(), name="cattle-occurrence-mobile-resolution"),
    path("cattle/operations/<str:kind>/<uuid:pk>/mobile/", CattleOperationMobileDetailView.as_view(), name="cattle-operation-mobile-detail"),
    path("cattle/operations/<str:kind>/", CattleOperationsView.as_view(), name="cattle-operations"),
    path('cattle/dairy-overview/', CattleDairyOverviewView.as_view(), name='cattle-dairy-overview'),
    path('cattle/daily-feeding/', CattleDailyFeedingView.as_view(), name='cattle-daily-feeding'),
    path('cattle/agenda/', CattleAgendaView.as_view(), name='cattle-agenda'),
    path('cattle/overview/', CattleOverviewView.as_view(), name='cattle-overview'),
    # Custom dashboard endpoint
    path('dashboard/reproduction/', ReproductionDashboardView.as_view(), name='reproduction_dashboard'),
    path('dashboard/reproduction/acknowledge-alert/', AcknowledgeOperationalAlertView.as_view(), name='acknowledge_operational_alert'),
    path('dashboard/species-summary/', SpeciesSummaryView.as_view(), name='species_summary'),
    
    # Phase-specific endpoints
    path('marras/', MarrasView.as_view(), name='marras'),
    path('matrizes/', MatrizesView.as_view(), name='matrizes'),
    path('gestacoes/', GestacoesView.as_view(), name='gestacoes'),
    path('maternidades/', MaternidadeView.as_view(), name='maternidades'),
    path('creches/', CrecheView.as_view(), name='creches'),
    path('crescimentos/', CrescimentoView.as_view(), name='crescimentos'),
    path('engordas/', EngordaView.as_view(), name='engordas'),
    
    # Manual re_path to allow optional trailing slashes for the main actions
    re_path(r'^batches/?$', AnimalBatchViewSet.as_view({'get': 'list', 'post': 'create'})),
    re_path(r'^batches/bulk_create_batches/?$', AnimalBatchViewSet.as_view({'post': 'bulk_create_batches'})),
    
    # Fallback to standard router URLs
    path('', include(router.urls)),
]
