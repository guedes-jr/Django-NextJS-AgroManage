from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter
from .views import (
    AnimalBatchViewSet, AnimalViewSet, MatingViewSet,
    PregnancyViewSet, BirthViewSet, LitterViewSet,
    ReproductionDashboardView, IncubationViewSet,
    MarrasView, MatrizesView, GestacoesView, MaternidadeView,
    CrecheView, CrescimentoView, EngordaView,
    VaccinationRecordViewSet, WeightRecordViewSet,
    ClinicalRecordViewSet, DiseaseViewSet,
    MedicationViewSet, AlertViewSet, SymptomViewSet, HealthRecordViewSet
)

router = DefaultRouter()
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

urlpatterns = [
    # Custom dashboard endpoint
    path('dashboard/reproduction/', ReproductionDashboardView.as_view(), name='reproduction_dashboard'),
    
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
