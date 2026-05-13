from rest_framework import viewsets, status, serializers
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db import IntegrityError
from .models import AnimalBatch, Animal, Mating, Pregnancy, Birth, Litter
from .serializers import (
    AnimalBatchSerializer, AnimalSerializer, MatingSerializer,
    PregnancySerializer, BirthSerializer, LitterSerializer,
    IncubationSerializer
)
from rest_framework.views import APIView

class AnimalBatchViewSet(viewsets.ModelViewSet):
    serializer_class = AnimalBatchSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return AnimalBatch.objects.filter(farm__organization=user.organization)
        return AnimalBatch.objects.none()

    @action(detail=False, methods=['post'])
    def bulk_create_batches(self, request):
        # Pass request context to serializer
        serializer = self.get_serializer(data=request.data, many=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        self.perform_bulk_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def perform_bulk_create(self, serializer):
        try:
            # Farm/Org injection happens in the serializer's create method
            serializer.save()
        except IntegrityError as e:
            # Handle any integrity errors that slip through validation
            error_msg = str(e)
            if "UNIQUE constraint failed" in error_msg:
                raise serializers.ValidationError(
                    "One or more batch codes already exist for the specified farm(s). "
                    "Please check your data and try again."
                )
            raise


class AnimalViewSet(viewsets.ModelViewSet):
    serializer_class = AnimalSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return Animal.objects.filter(farm__organization=user.organization)
        return Animal.objects.none()

    @action(detail=True, methods=['post'], url_path='register-mating')
    def register_mating(self, request, pk=None):
        animal = self.get_object()
        serializer = MatingSerializer(data=request.data)
        if serializer.is_valid():
            mating = serializer.save(female=animal)
            
            # Cálculo de previsão de parto
            if mating.mating_date:
                import datetime
                days_to_add = 0
                if animal.species.code == 'suinos':
                    days_to_add = 114
                elif animal.species.code == 'bovinos':
                    days_to_add = 283
                
                if days_to_add > 0:
                    mating.expected_birth_date = mating.mating_date + datetime.timedelta(days=days_to_add)
                    mating.save(update_fields=['expected_birth_date'])
            
            animal.reproductive_status = Animal.ReproductiveStatus.COBERTA
            animal.save()
            return Response(MatingSerializer(mating).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MatingViewSet(viewsets.ModelViewSet):
    serializer_class = MatingSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return Mating.objects.filter(female__farm__organization=user.organization)
        return Mating.objects.none()


class PregnancyViewSet(viewsets.ModelViewSet):
    serializer_class = PregnancySerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return Pregnancy.objects.filter(female__farm__organization=user.organization)
        return Pregnancy.objects.none()


class BirthViewSet(viewsets.ModelViewSet):
    serializer_class = BirthSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return Birth.objects.filter(female__farm__organization=user.organization)
        return Birth.objects.none()


class LitterViewSet(viewsets.ModelViewSet):
    serializer_class = LitterSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return Litter.objects.filter(birth__female__farm__organization=user.organization)
        return Litter.objects.none()


class IncubationViewSet(viewsets.ModelViewSet):
    serializer_class = IncubationSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            from .models import Incubation
            return Incubation.objects.filter(farm__organization=user.organization)
        from .models import Incubation
        return Incubation.objects.none()


class ReproductionDashboardView(APIView):
    """
    Endpoint for reproduction dashboard data.
    """
    def get(self, request, *args, **kwargs):
        species_code = request.query_params.get('species', 'suinos')
        user = request.user
        
        if not (user.is_authenticated and hasattr(user, 'organization')):
            return Response({"error": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
            
        farm_filter = {'farm__organization': user.organization}
        
        if species_code == 'aves':
            from .models import AnimalBatch, Incubation
            batches = AnimalBatch.objects.filter(**farm_filter, species__code='aves')
            incubations = Incubation.objects.filter(batch__farm__organization=user.organization)
            
            return Response({
                "species": species_code,
                "status": "connected",
                "kpis": {
                    "lotes": batches.count(),
                    "incubacoes_ativas": incubations.filter(status='incubating').count(),
                    "ovos_incubados": sum([i.eggs_incubated for i in incubations.filter(status='incubating')])
                },
                "message": "Dados de aves carregados com sucesso."
            }, status=status.HTTP_200_OK)

        # For Suínos and Bovinos
        animals = Animal.objects.filter(**farm_filter, species__code=species_code)
        
        marras_count = animals.filter(category='Marrã' if species_code == 'suinos' else 'Novilha').count()
        matrizes_ativas = animals.filter(category='Matriz' if species_code == 'suinos' else 'Vaca', status='active').count()
        gestantes = animals.filter(reproductive_status=Animal.ReproductiveStatus.GESTANTE).count()
        
        # Leitoes / Bezerros (Partos do mes)
        import datetime
        from django.utils import timezone
        now = timezone.now()
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0)
        
        births = Birth.objects.filter(female__farm__organization=user.organization, female__species__code=species_code, birth_date__gte=start_of_month)
        nascidos_mes = sum([b.total_born for b in births])
        
        # Tx Prenhez simplificada: Gestantes / (Matrizes Ativas) * 100
        tx_prenhez = 0
        if matrizes_ativas > 0:
            tx_prenhez = int((gestantes / matrizes_ativas) * 100)
            
        # IA Alerts (Simple rules)
        alerts = []
        ai_suggestions = []
        
        # Check close births
        close_pregnancies = Pregnancy.objects.filter(
            female__farm__organization=user.organization, 
            female__species__code=species_code,
            status='ongoing',
            expected_birth_date__lte=now.date() + datetime.timedelta(days=7)
        )
        if close_pregnancies.exists():
            alerts.append({
                "type": "warning", 
                "icon": "⏰", 
                "text": f"Previsão de {close_pregnancies.count()} partos para os próximos 7 dias.", 
                "time": "Hoje"
            })
            ai_suggestions.append({"text": "Prepare o setor de maternidade para os partos iminentes."})
        
        # Check delayed matings
        empty_matrizes = animals.filter(reproductive_status=Animal.ReproductiveStatus.VAZIA)
        if empty_matrizes.count() > 5:
             ai_suggestions.append({"text": f"Há {empty_matrizes.count()} matrizes vazias. Revise o manejo reprodutivo."})

        return Response({
            "species": species_code,
            "status": "connected",
            "kpis": {
                "marras": marras_count,
                "matrizes_ativas": matrizes_ativas,
                "gestantes": gestantes,
                "nascidos_mes": nascidos_mes,
                "tx_prenhez": f"{tx_prenhez}%"
            },
            "alerts": alerts,
            "aiSuggestions": ai_suggestions,
            "message": "Dashboard API is connected."
        }, status=status.HTTP_200_OK)
