from rest_framework import viewsets, status, serializers, filters
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from django.db import IntegrityError
from django.utils import timezone
import datetime
from .models import AnimalBatch, Animal, Mating, Pregnancy, Birth, Litter, WeightRecord, VaccinationRecord, HealthRecord, FeedingRecord, Symptom, Disease, ClinicalRecord, MedicationInventory, SanitaryAlert, HistoricoEvento
from .serializers import (
    AnimalBatchSerializer, AnimalSerializer, MatingSerializer,
    PregnancySerializer, BirthSerializer, LitterSerializer,
    IncubationSerializer, SymptomSerializer, DiseaseSerializer,
    ClinicalRecordSerializer, MedicationSerializer, AlertSerializer,
    HealthRecordSerializer
)
from rest_framework.views import APIView

# ─── Phase Dashboard Views ────────────────────────────────────────────────────

class BasePhaseView(APIView):
    """Shared helper for phase endpoints — provides org filter + pagination."""

    def get_org_filter(self, request):
        user = request.user
        if not (user.is_authenticated and hasattr(user, 'organization') and user.organization):
            return None
        return {'farm__organization': user.organization}

    def get_species_filter(self, request):
        species = request.query_params.get('species', 'suinos')
        org_f = self.get_org_filter(request)
        if org_f is None:
            return None, None
        return {**org_f, 'species__code': species}, species

    def paginate_queryset(self, request, qs):
        page = request.query_params.get('page', 1)
        page_size = request.query_params.get('page_size', 50)
        try:
            page = int(page)
            page_size = int(page_size)
        except (ValueError, TypeError):
            page = 1
            page_size = 50
        page_size = min(max(page_size, 1), 100)
        start = (page - 1) * page_size
        end = start + page_size
        return qs[start:end], qs.count()


class MarrasView(BasePhaseView):
    def get(self, request):
        filters, species = self.get_species_filter(request)
        if filters is None:
            return Response({"error": "Unauthorized"}, status=401)

        category = 'Marrã' if species == 'suinos' else 'Novilha'
        qs = Animal.objects.filter(**filters, gender='F', category=category).filter(
            reproductive_status__in=['vazia', 'em_preparo', 'pronta', 'aguardando_cobertura']
        )
        total = qs.count()
        prontas = qs.filter(reproductive_status__in=['pronta', 'aguardando_cobertura']).count()
        em_preparo = qs.filter(reproductive_status='em_preparo').count()
        disponiveis = qs.filter(reproductive_status='vazia').count()

        alerts = []
        if prontas > 0:
            alerts.append({"type": "info", "icon": "🎯", "text": f"{prontas} marrã{'s' if prontas > 1 else ''} pronta{'s' if prontas > 1 else ''} para cobertura.", "time": "Hoje"})

        ai_suggestions = []
        if prontas > 0:
            ai_suggestions.append({"text": f"{prontas} marrã{'s' if prontas > 1 else ''} em condições ideais para primeira cobertura."})

        animals, _ = self.paginate_queryset(request, qs)
        rows = []
        for a in animals:
            idade = (timezone.now().date() - a.birth_date).days if a.birth_date else None
            rows.append({
                "id": a.id,
                "identifier": a.identifier,
                "idade": idade,
                "peso": float(a.current_weight_kg) if a.current_weight_kg else None,
                "entrada": a.entry_date.isoformat() if a.entry_date else None,
                "status": a.reproductive_status,
            })

        return Response({
            "kpis": {
                "total": total,
                "disponiveis": disponiveis,
                "em_preparo": em_preparo,
                "prontas": prontas,
            },
            "rows": rows,
            "alerts": alerts,
            "aiSuggestions": ai_suggestions,
        })


class MatrizesView(BasePhaseView):
    def get(self, request):
        filters, species = self.get_species_filter(request)
        if filters is None:
            return Response({"error": "Unauthorized"}, status=401)

        category = 'Matriz' if species == 'suinos' else 'Vaca'
        qs = Animal.objects.filter(**filters, gender='F', category=category).filter(
            reproductive_status__in=['vazia', 'em_preparo', 'pronta', 'coberta', 'gestante', 'lactante', 'descanso', 'aguardando_cobertura']
        )
        total = qs.count()
        vazias = qs.filter(reproductive_status__in=['vazia', 'aguardando_cobertura']).count()
        cobertas = qs.filter(reproductive_status='coberta').count()
        lactantes = qs.filter(reproductive_status='lactante').count()
        gestantes = qs.filter(reproductive_status='gestante').count()

        alerts = []
        if vazias > 5:
            alerts.append({"type": "danger", "icon": "⚠️", "text": f"{vazias} matrizes vazias — acima do ideal.", "time": "Hoje"})
        if cobertas > 0:
            alerts.append({"type": "info", "icon": "ℹ️", "text": f"{cobertas} matrizes cobertas aguardando diagnóstico.", "time": "Hoje"})

        ai_suggestions = []
        if vazias > 5:
            ai_suggestions.append({"text": f"Há {vazias} matrizes vazias. Revise o manejo reprodutivo."})

        qs_paged, _ = self.paginate_queryset(request, qs)
        rows = []
        for a in qs_paged:
            ultima_cob = a.matings_as_female.order_by('-mating_date').first()
            dias_abertos = (timezone.now().date() - ultima_cob.mating_date).days if ultima_cob and ultima_cob.mating_date else None
            rows.append({
                "id": a.id,
                "identifier": a.identifier,
                "op": (a.births.count() if hasattr(a, 'births') else 0) + 1,
                "dias_abertos": dias_abertos,
                "ultima_cobertura": ultima_cob.mating_date.isoformat() if ultima_cob and ultima_cob.mating_date else "—",
                "status": a.reproductive_status,
            })

        return Response({
            "kpis": {"total": total, "vazias": vazias, "cobertas": cobertas, "lactantes": lactantes, "gestantes": gestantes},
            "rows": rows,
            "alerts": alerts,
            "aiSuggestions": ai_suggestions,
        })


class GestacoesView(BasePhaseView):
    def get(self, request):
        filters, species = self.get_species_filter(request)
        if filters is None:
            return Response({"error": "Unauthorized"}, status=401)

        # 1. Gestantes confirmadas (Pregnancy ongoing)
        pregnancies = Pregnancy.objects.filter(
            female__farm__organization=request.user.organization,
            female__species__code=species,
            status='ongoing'
        ).select_related('female', 'mating')

        # 2. Cobertas aguardando diagnóstico (Animal status 'coberta')
        cobertas = Animal.objects.filter(
            **filters,
            reproductive_status='coberta'
        ).prefetch_related('matings_as_female')

        now = timezone.now().date()
        rows = []

        # Process Cobertas
        for a in cobertas:
            ultima_cob = a.matings_as_female.order_by('-mating_date').first()
            if ultima_cob:
                dias_desde_cob = (now - ultima_cob.mating_date).days
                dias_faltantes = max(0, 21 - dias_desde_cob)
                rows.append({
                    "id": f"cob_{a.id}",
                    "animal_id": a.id,
                    "identifier": a.identifier,
                    "cobertura": ultima_cob.mating_date.isoformat(),
                    "dias": dias_desde_cob,
                    "previsao": (ultima_cob.mating_date + datetime.timedelta(days=21)).isoformat(),
                    "dias_faltantes": f"{dias_faltantes} dias" if dias_faltantes > 0 else "Pronto!",
                    "status": "Confirmar Prenhez",
                })

        # Process Gestantes
        for p in pregnancies:
            dias_gestacao = (now - p.start_date).days if p.start_date else 0
            dias_para_parto = (p.expected_birth_date - now).days if p.expected_birth_date else None
            
            rows.append({
                "id": p.id,
                "animal_id": p.female.id,
                "identifier": p.female.identifier,
                "cobertura": p.mating.mating_date.isoformat() if p.mating and p.mating.mating_date else None,
                "dias": dias_gestacao,
                "previsao": p.expected_birth_date.isoformat() if p.expected_birth_date else None,
                "dias_faltantes": f"{dias_para_parto}d p/ Parto" if dias_para_parto is not None and dias_para_parto >= 0 else "Parto Hoje!",
                "status": "Parto próximo" if (p.expected_birth_date and (p.expected_birth_date - now).days <= 7) else "Gestante",
            })

        # Totals
        total = len(rows)
        aguardando_dg = len([r for r in rows if r['status'] == "Confirmar Prenhez"])
        confirmar_hoje = len([r for r in rows if r['status'] == "Confirmar Prenhez" and r['dias_faltantes'] == "Pronto!"])
        parto_proximo = len([r for r in rows if r['status'] == "Parto próximo"])

        alerts = []
        if confirmar_hoje > 0:
            alerts.append({"type": "info", "icon": "🔬", "text": f"{confirmar_hoje} diagnóstico{'s' if confirmar_hoje > 1 else ''} de prenhez pronto{'s' if confirmar_hoje > 1 else ''} para realização.", "time": "Hoje"})
        if parto_proximo > 0:
            alerts.append({"type": "warning", "icon": "⏰", "text": f"{parto_proximo} parto{'s' if parto_proximo > 1 else ''} previsto{'s' if parto_proximo > 1 else ''} para os próximos 7 dias.", "time": "Hoje"})

        return Response({
            "kpis": {
                "total": total,
                "aguardando_dg": aguardando_dg,
                "confirmadas": total - aguardando_dg,
                "parto_proximo": parto_proximo
            },
            "rows": rows,
            "alerts": alerts,
            "aiSuggestions": [{"text": f"Há {confirmar_hoje} animais prontos para diagnóstico de prenhez."}] if confirmar_hoje > 0 else [],
        })


class MaternidadeView(BasePhaseView):
    def get(self, request):
        filters, species = self.get_species_filter(request)
        if filters is None:
            return Response({"error": "Unauthorized"}, status=401)

        base_qs = Birth.objects.filter(
            female__farm__organization=request.user.organization,
            female__species__code=species
        ).select_related('female', 'litter').order_by('-birth_date')

        # Considerar em lactação: todos os partos que não possuem desmame concluído
        lactating_qs = base_qs.exclude(litter__weaning_date__isnull=False)

        now = timezone.now().date()
        start_of_month = now.replace(day=1)

        em_lactacao = lactating_qs.count()

        nascidos_mes_qs = base_qs.filter(birth_date__gte=start_of_month)
        total_nascidos_mes = sum(b.total_born for b in nascidos_mes_qs)

        desmamados_mes_qs = base_qs.filter(
            litter__weaning_date__gte=start_of_month,
            litter__weaning_date__isnull=False
        )
        total_desmamados = sum(b.litter.weaned_quantity or 0 for b in desmamados_mes_qs)

        total_born_lactating = sum(b.total_born for b in lactating_qs)
        total_dead_birth = sum(b.stillborn + b.mummified for b in lactating_qs)
        mortalidade_pct = round((total_dead_birth / total_born_lactating * 100), 1) if total_born_lactating else 0

        alerts = []
        pendentes_desmame = lactating_qs.filter(birth_date__lte=now - datetime.timedelta(days=21)).count()
        if pendentes_desmame > 0:
            alerts.append({"type": "warning", "icon": "🔄", "text": f"{pendentes_desmame} leitegada{'s' if pendentes_desmame > 1 else ''} pronta{'s' if pendentes_desmame > 1 else ''} para desmame.", "time": "Hoje"})

        alta_mortalidade = [b for b in lactating_qs if b.total_born > 0 and (b.stillborn + b.mummified) / b.total_born > 0.15]
        if alta_mortalidade:
            alerts.append({"type": "error", "icon": "⚠️", "text": f"{len(alta_mortalidade)} leitegada{'s' if len(alta_mortalidade) > 1 else ''} com mortalidade ao nascer > 15%.", "time": "Hoje"})

        ai_suggestions = []
        if pendentes_desmame > 0:
            ai_suggestions.append({"text": f"{pendentes_desmame} leitegada{'s' if pendentes_desmame > 1 else ''} com 21+ dias — considerar desmame para liberar matriz."})
        if mortalidade_pct > 10:
            ai_suggestions.append({"text": f"Mortalidade ao nascer de {mortalidade_pct}% — revisar manejo de matrizes no parto."})

        paged, _ = self.paginate_queryset(request, lactating_qs)
        rows = []
        for b in paged:
            idade = (now - b.birth_date).days if b.birth_date else None
            previsao_desmame = (b.birth_date + datetime.timedelta(days=21)).isoformat() if b.birth_date else None
            
            if hasattr(b, 'litter') and b.litter.weaning_date:
                status = "Desmamado"
                vivos_atual = b.litter.weaned_quantity or 0
            elif idade is not None and idade >= 21:
                status = "Pronto p/ Desmame"
                vivos_atual = b.live_born
            else:
                status = "Lactação"
                vivos_atual = b.live_born

            rows.append({
                "id": b.id,
                "animal_id": b.female.id,
                "identifier": b.female.identifier,
                "data_parto": b.birth_date.isoformat() if b.birth_date else None,
                "vivos": b.live_born,
                "obitos": b.stillborn,
                "mumificados": b.mummified,
                "idade": idade,
                "status": status,
                "previsao_desmame": previsao_desmame,
                "vivos_atual": vivos_atual,
            })

        return Response({
            "kpis": {
                "em_lactacao": em_lactacao,
                "nascidos_mes": total_nascidos_mes,
                "desmamados_mes": total_desmamados,
                "mortalidade": f"{mortalidade_pct}%",
                "media_nascidos": round(sum(b.live_born for b in nascidos_mes_qs) / nascidos_mes_qs.count(), 1) if nascidos_mes_qs.count() else 0,
            },
            "rows": rows,
            "alerts": alerts,
            "aiSuggestions": ai_suggestions,
        })


class CrecheView(BasePhaseView):
    def get(self, request):
        filters, species = self.get_species_filter(request)
        if filters is None:
            return Response({"error": "Unauthorized"}, status=401)

        qs = AnimalBatch.objects.filter(**filters, status='active').filter(
            phase__in=['creche', 'gestacao_maternidade']
        )
        total = qs.count()
        prontos = qs.filter(quantity__gte=40)
        total_animais = sum(b.quantity for b in qs)
        pesos = [float(b.avg_weight_kg) for b in qs if b.avg_weight_kg]
        peso_medio = round(sum(pesos) / len(pesos), 1) if pesos else None

        alerts = []
        if prontos.exists():
            alerts.append({"type": "info", "icon": "ℹ️", "text": f"{prontos.count()} lote{'s' if prontos.count() > 1 else ''} pronto{'s' if prontos.count() > 1 else ''} para transferência ao crescimento.", "time": "Hoje"})

        ai_suggestions = []
        if peso_medio and peso_medio >= 15:
            ai_suggestions.append({"text": "Lotes com peso médio acima de 15kg — aptos para crescimento."})

        paged, _ = self.paginate_queryset(request, qs)
        rows = []
        for b in paged:
            rows.append({
                "id": b.id,
                "lote": b.batch_code,
                "entrada": b.entry_date.isoformat() if b.entry_date else None,
                "qtd": b.quantity,
                "peso": f"{float(b.avg_weight_kg):.0f} kg" if b.avg_weight_kg else "—",
                "status": b.status,
            })

        return Response({
            "kpis": {"total": total, "animais_alojados": total_animais, "peso_medio": f"{peso_medio} kg" if peso_medio else "—"},
            "rows": rows,
            "alerts": alerts,
            "aiSuggestions": ai_suggestions,
        })


class CrescimentoView(BasePhaseView):
    def get(self, request):
        filters, species = self.get_species_filter(request)
        if filters is None:
            return Response({"error": "Unauthorized"}, status=401)

        qs = AnimalBatch.objects.filter(**filters, phase='crescimento', status='active')
        total = qs.count()
        total_animais = sum(b.quantity for b in qs)
        now = timezone.now().date()

        pesos = []
        ganhos = []
        proximos_engorda = 0
        for b in qs:
            if b.avg_weight_kg:
                w = float(b.avg_weight_kg)
                pesos.append(w)
                if b.entry_date:
                    dias = (now - b.entry_date).days
                    if dias > 0:
                        ganhos.append(w / dias)
                if w >= 60:
                    proximos_engorda += 1

        peso_medio = round(sum(pesos) / len(pesos), 1) if pesos else None
        gpd_medio = round(sum(ganhos) / len(ganhos), 2) if ganhos else None

        alerts = []
        if proximos_engorda > 0:
            alerts.append({"type": "info", "icon": "📈", "text": f"{proximos_engorda} lote{'s' if proximos_engorda > 1 else ''} com peso ≥60kg — apto{'s' if proximos_engorda > 1 else ''} para transferência à engorda.", "time": "Hoje"})

        ai_suggestions = []
        if gpd_medio and gpd_medio < 0.7:
            ai_suggestions.append({"text": f"GPD médio de {gpd_medio}kg/dia abaixo do ideal (0.7-0.9kg). Revira a dieta ou qualidade da ração."})
        if peso_medio and peso_medio < 30:
            ai_suggestions.append({"text": "Peso médio baixo no crescimento — verifique manejo e sanidade dos lotes."})

        paged, _ = self.paginate_queryset(request, qs)
        rows = []
        for b in paged:
            dias = (now - b.entry_date).days if b.entry_date else None
            peso = float(b.avg_weight_kg) if b.avg_weight_kg else None
            gpd = round(peso / dias, 2) if peso and dias and dias > 0 else None
            dias_restantes = round((60 - peso) / (gpd or 0.7)) if peso and peso < 60 else 0

            rows.append({
                "id": b.id,
                "lote": b.batch_code,
                "entrada": b.entry_date.isoformat() if b.entry_date else None,
                "dias": dias,
                "qtd": b.quantity,
                "peso": peso,
                "gpd": gpd,
                "previsao": f"{dias_restantes}d" if dias_restantes and dias_restantes > 0 else "Pronto",
                "status": "Pronto p/ engorda" if peso and peso >= 60 else "Em crescimento",
            })

        return Response({
            "kpis": {
                "total": total,
                "animais_alojados": total_animais,
                "peso_medio": peso_medio,
                "gpd_medio": gpd_medio,
                "proximos_engorda": proximos_engorda,
            },
            "rows": rows,
            "alerts": alerts,
            "aiSuggestions": ai_suggestions,
        })


class EngordaView(BasePhaseView):
    def get(self, request):
        filters, species = self.get_species_filter(request)
        if filters is None:
            return Response({"error": "Unauthorized"}, status=401)

        TARGET_WEIGHT = 110
        qs = AnimalBatch.objects.filter(**filters, phase='engorda', status='active')
        total = qs.count()
        total_animais = sum(b.quantity for b in qs)
        now = timezone.now().date()

        pesos = []
        ganhos = []
        prontos = 0
        valor_estimado = 0
        for b in qs:
            if b.avg_weight_kg:
                w = float(b.avg_weight_kg)
                pesos.append(w)
                if b.entry_date:
                    dias = (now - b.entry_date).days
                    if dias > 0:
                        ganhos.append(w / dias)
                if w >= TARGET_WEIGHT:
                    prontos += 1
                    if b.quantity and b.sale_value:
                        valor_estimado += float(b.sale_value) * b.quantity
                    elif b.quantity:
                        valor_estimado += w * b.quantity * 8

        peso_medio = round(sum(pesos) / len(pesos), 1) if pesos else None
        gpd_medio = round(sum(ganhos) / len(ganhos), 2) if ganhos else None

        alerts = []
        if prontos > 0:
            alerts.append({"type": "success", "icon": "💰", "text": f"{prontos} lote{'s' if prontos > 1 else ''} pronto{'s' if prontos > 1 else ''} para venda (≥{TARGET_WEIGHT}kg).", "time": "Hoje"})
        dias_sem_peso = [b for b in qs if not b.avg_weight_kg]
        if dias_sem_peso:
            alerts.append({"type": "warning", "icon": "⚠️", "text": f"{len(dias_sem_peso)} lote{'s' if len(dias_sem_peso) > 1 else ''} sem peso registrado.", "time": "Hoje"})

        ai_suggestions = []
        if peso_medio and peso_medio < 70:
            ai_suggestions.append({"text": f"Peso médio de {peso_medio}kg — lotes ainda em fase inicial de engorda."})
        if prontos > 0:
            ai_suggestions.append({"text": f"{prontos} lote{'s' if prontos > 1 else ''} no peso de abate. Programar venda."})
        if valor_estimado > 0:
            ai_suggestions.append({"text": f"Valor estimado de lotes prontos: R$ {valor_estimado:,.2f}."})

        paged, _ = self.paginate_queryset(request, qs)
        rows = []
        for b in paged:
            peso = float(b.avg_weight_kg) if b.avg_weight_kg else None
            dias = (now - b.entry_date).days if b.entry_date else None
            gpd = round(peso / dias, 2) if peso and dias and dias > 0 else None
            dias_restantes = round((TARGET_WEIGHT - peso) / (gpd or 0.85)) if peso and peso < TARGET_WEIGHT else 0
            pronto = peso and peso >= TARGET_WEIGHT

            rows.append({
                "id": b.id,
                "lote": b.batch_code,
                "qtd": b.quantity,
                "dias": dias,
                "peso": peso,
                "gpd": gpd,
                "previsao": b.exit_date.isoformat() if b.exit_date else (f"{dias_restantes}d" if dias_restantes > 0 else "—"),
                "status": "Pronto para venda" if pronto else "Em engorda",
            })

        return Response({
            "kpis": {
                "total": total,
                "animais_alojados": total_animais,
                "peso_medio": peso_medio,
                "gpd_medio": gpd_medio,
                "prontos": prontos,
                "valor_estimado": valor_estimado,
            },
            "rows": rows,
            "alerts": alerts,
            "aiSuggestions": ai_suggestions,
        })


def build_animal_history(animal):
    """Retorna lista de eventos ordenados para um Animal individual."""
    events = []

    # 1. Matings
    for m in animal.matings_as_female.all():
        events.append({
            "type": "mating",
            "date": m.mating_date,
            "title": f"Cobertura / Inseminação ({m.get_mating_type_display()})",
            "subtitle": f"Reprodutor: {m.sire_info or (m.sire.identifier if m.sire else 'N/A')}",
            "status": m.get_status_display()
        })

    # 2. Pregnancies
    for p in animal.pregnancies.all():
        events.append({
            "type": "pregnancy",
            "date": p.start_date,
            "title": "Gestação Confirmada",
            "subtitle": f"Previsão de parto: {p.expected_birth_date}",
            "status": p.get_status_display()
        })

    # 3. Births
    for b in animal.births.all():
        events.append({
            "type": "birth",
            "date": b.birth_date,
            "title": "Parto Realizado",
            "subtitle": f"Nascidos: {b.total_born} (Vivos: {b.live_born})",
            "status": "Concluído"
        })

    # 4. Weights
    for w in animal.weights.all():
        events.append({
            "type": "weight",
            "date": w.weighing_date,
            "title": "Registro de Peso",
            "subtitle": f"Peso: {w.weight_kg} kg",
            "status": "Medição"
        })

    # 5. Vaccinations
    for v in animal.vaccinations.all():
        events.append({
            "type": "vaccination",
            "date": v.application_date,
            "title": f"Vacinação: {v.vaccine_name}",
            "subtitle": f"Dose: {v.get_dose_type_display()}",
            "status": "Aplicada"
        })

    # 6. Health
    for h in animal.health_records.all():
        events.append({
            "type": "health",
            "date": h.application_date,
            "title": f"Clínico: {h.get_treatment_type_display()}",
            "subtitle": h.description,
            "status": "Registro"
        })

    # 7. Feeding
    for f in animal.feeding_records.all():
        events.append({
            "type": "feeding",
            "date": f.date,
            "title": f"Alimentação: {f.feed_type}",
            "subtitle": f"Quantidade: {f.quantity_kg} kg",
            "status": "Registro"
        })

    # 8. Histórico Genérico (Descartes, Perdas, etc)
    for he in animal.historicos.all():
        events.append({
            "type": "historico_evento",
            "date": he.data_evento,
            "title": he.tipo_evento,
            "subtitle": he.descricao,
            "status": "Evento"
        })

    # Sort events by date descending
    events.sort(key=lambda x: x['date'], reverse=True)

    return events


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

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Retorna o histórico completo do lote, incluindo suas fases anteriores e lotes de origem."""
        batch = self.get_object()
        
        def get_batch_history(b):
            history_list = []
            
            # 1. Obter histórico recursivamente dos lotes que deram origem a este (merge)
            for source in b.source_batches.all():
                history_list.extend(get_batch_history(source))
                
            # 2. Obter as fases antigas deste lote
            for ph in b.phase_histories.all().order_by('entry_date'):
                history_list.append({
                    'batch_id': b.id,
                    'batch_code': b.batch_code,
                    'phase': ph.phase,
                    'quantity': ph.quantity,
                    'avg_weight_kg': float(ph.avg_weight_kg) if ph.avg_weight_kg else None,
                    'entry_date': ph.entry_date.isoformat() if ph.entry_date else None,
                    'exit_date': ph.exit_date.isoformat() if ph.exit_date else None,
                    'is_current': False
                })
                
            # 3. Adicionar a fase atual ativa deste lote
            if b.phase:
                history_list.append({
                    'batch_id': b.id,
                    'batch_code': b.batch_code,
                    'phase': b.phase,
                    'quantity': b.quantity,
                    'avg_weight_kg': float(b.avg_weight_kg) if b.avg_weight_kg else None,
                    'entry_date': b.entry_date.isoformat() if b.entry_date else None,
                    'exit_date': b.exit_date.isoformat() if b.exit_date else None,
                    'is_current': b.status == 'active'
                })
            
            return history_list
            
        full_history = get_batch_history(batch)
        
        # Ordenar cronologicamente por entry_date
        full_history.sort(key=lambda x: x['entry_date'] if x['entry_date'] else '0000-00-00')
        
        return Response(full_history)

    @action(detail=True, methods=['get'], url_path='animal-detail')
    def animal_detail(self, request, pk=None):
        """Retorna o Animal individual associado a este lote, se houver."""
        batch = self.get_object()
        animal = Animal.objects.filter(batch=batch).first()
        if animal:
            serializer = AnimalSerializer(animal, context={'request': request})
            return Response(serializer.data)
        return Response({"detail": "Nenhum animal individual encontrado para este lote."}, status=404)

    @action(detail=True, methods=['get'], url_path='animal-history')
    def animal_history(self, request, pk=None):
        """Retorna o full-history do Animal individual associado a este lote."""
        batch = self.get_object()
        animal = Animal.objects.filter(batch=batch).first()
        if animal:
            events = build_animal_history(animal)
            return Response(events)
        return Response({"detail": "Nenhum animal individual encontrado para este lote."}, status=404)


class AnimalViewSet(viewsets.ModelViewSet):
    serializer_class = AnimalSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return Animal.objects.filter(farm__organization=user.organization)
        return Animal.objects.none()

    @action(detail=False, methods=['get'], url_path='reproducers')
    def reproducers(self, request):
        """Lista reprodutores (machos ativos) da espécie para seleção em coberturas."""
        user = request.user
        if not (user.is_authenticated and hasattr(user, 'organization') and user.organization):
            return Response({"error": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        species = request.query_params.get('species', 'suinos')
        qs = Animal.objects.filter(
            farm__organization=user.organization,
            species__code=species,
            gender='M',
            status='active'
        ).order_by('identifier')
        data = [
            {'id': a.id, 'identifier': a.identifier, 'category': a.category or ''}
            for a in qs
        ]
        return Response(data)

    @action(detail=True, methods=['post'], url_path='register-mating')
    def register_mating(self, request, pk=None):
        animal = self.get_object()
        serializer = MatingSerializer(data=request.data)
        if serializer.is_valid():
            mating = serializer.save(female=animal)

            # Vincular reprodutor por FK se fornecido
            sire_id = request.data.get('sire_id')
            if sire_id:
                try:
                    sire_animal = Animal.objects.get(pk=sire_id)
                    mating.sire = sire_animal
                    mating.save(update_fields=['sire'])
                except Animal.DoesNotExist:
                    pass

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

            # Salvar fase anterior para retorno inteligente no DG negativo
            animal.previous_phase = animal.reproductive_status
            animal.reproductive_status = Animal.ReproductiveStatus.COBERTA
            animal.save(update_fields=['previous_phase', 'reproductive_status'])
            return Response(MatingSerializer(mating).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='register-weight')
    def register_weight(self, request, pk=None):
        animal = self.get_object()
        weight = request.data.get('weight_kg')
        date = request.data.get('weighing_date', timezone.now().date())
        
        if not weight:
            return Response({"error": "Peso é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)
            
        record = WeightRecord.objects.create(
            farm=animal.farm,
            species=animal.species,
            animal=animal,
            weight_kg=weight,
            weighing_date=date,
            notes=request.data.get('notes', '')
        )
        return Response({"message": "Peso registrado com sucesso", "weight": weight}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='register-vaccination')
    def register_vaccination(self, request, pk=None):
        animal = self.get_object()
        vaccine_name = request.data.get('vaccine_name')
        date = request.data.get('application_date', timezone.now().date())
        
        if not vaccine_name:
            return Response({"error": "Nome da vacina é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)
            
        record = VaccinationRecord.objects.create(
            farm=animal.farm,
            species=animal.species,
            animal=animal,
            vaccine_name=vaccine_name,
            application_date=date,
            dose_type=request.data.get('dose_type', VaccinationRecord.DoseType.UNICA),
            dosage_ml=request.data.get('dosage_ml'),
            notes=request.data.get('notes', '')
        )
        return Response({"message": "Vacina registrada com sucesso"}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='diagnose-pregnancy')
    def diagnose_pregnancy(self, request, pk=None):
        animal = self.get_object()
        result = request.data.get('result')  # 'positive' or 'negative'
        date = request.data.get('diagnosis_date', timezone.now().date())

        if result == 'positive':
            animal.reproductive_status = Animal.ReproductiveStatus.GESTANTE
            animal.save(update_fields=['reproductive_status'])

            # Criar Pregnancy se ainda não existe para o último Mating
            latest_mating = animal.matings_as_female.order_by('-mating_date').first()
            if latest_mating:
                Pregnancy.objects.get_or_create(
                    female=animal,
                    mating=latest_mating,
                    defaults={
                        'start_date': latest_mating.mating_date,
                        'expected_birth_date': latest_mating.expected_birth_date,
                        'status': 'ongoing'
                    }
                )
        elif result == 'negative':
            # Retornar para a fase anterior salva (Marrã ou Aguardando Cobertura)
            prev = animal.previous_phase or Animal.ReproductiveStatus.VAZIA
            animal.reproductive_status = prev
            animal.previous_phase = ''
            animal.save(update_fields=['reproductive_status', 'previous_phase'])

            # Marcar o Mating como falho
            latest_mating = animal.matings_as_female.order_by('-mating_date').first()
            if latest_mating and latest_mating.status == Mating.Status.PENDING_DG:
                latest_mating.status = Mating.Status.FAILED
                latest_mating.save(update_fields=['status'])

        return Response({"message": f"Diagnóstico {result} registrado.", "status": animal.reproductive_status})

    @action(detail=True, methods=['post'], url_path='descartar-matriz')
    def descartar_matriz(self, request, pk=None):
        animal = self.get_object()
        data_descarte = request.data.get('data_descarte', timezone.now().date())
        motivo = request.data.get('motivo', '')
        peso = request.data.get('peso')
        valor_venda = request.data.get('valor_venda')
        tipo_descarte = request.data.get('tipo_descarte', 'OUTRO')
        observacao = request.data.get('observacao', '')

        status_map = {
            'VENDA': Animal.Status.SOLD,
            'MORTE': Animal.Status.DEAD,
            'DESCARTE_SANITARIO': Animal.Status.DEAD,
            'BAIXA_PRODUTIVA': Animal.Status.FINISHED,
        }
        animal.status = status_map.get(tipo_descarte, Animal.Status.FINISHED)
        animal.reproductive_status = ''
        animal.save(update_fields=['status', 'reproductive_status'])

        HistoricoEvento.objects.create(
            farm=animal.farm,
            tipo_evento='Descarte',
            descricao=f"Motivo: {motivo} | Tipo: {tipo_descarte} | Obs: {observacao}",
            data_evento=data_descarte,
            matriz=animal,
            metadata={
                'peso': peso,
                'valor_venda': valor_venda,
                'tipo_descarte': tipo_descarte,
                'motivo': motivo
            }
        )
        return Response({"message": "Matriz descartada com sucesso", "status": animal.status})

    @action(detail=True, methods=['get'], url_path='full-history')
    def full_history(self, request, pk=None):
        animal = self.get_object()
        events = build_animal_history(animal)
        return Response(events)


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

    @action(detail=True, methods=['post'], url_path='registrar-perda')
    def registrar_perda(self, request, pk=None):
        pregnancy = self.get_object()
        data = request.data.get('data', timezone.now().date())
        tipo_perda = request.data.get('tipo_perda', 'ABORTO')
        observacao = request.data.get('observacao', '')
        
        pregnancy.status = 'failed'
        pregnancy.save(update_fields=['status'])
        
        female = pregnancy.female
        female.reproductive_status = Animal.ReproductiveStatus.VAZIA
        female.save(update_fields=['reproductive_status'])
        
        HistoricoEvento.objects.create(
            farm=female.farm,
            tipo_evento='Perda Gestacional',
            descricao=f"Tipo: {tipo_perda} | Obs: {observacao}",
            data_evento=data,
            matriz=female,
            metadata={'tipo_perda': tipo_perda}
        )
        return Response({"message": "Perda gestacional registrada."})


class BirthViewSet(viewsets.ModelViewSet):
    serializer_class = BirthSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return Birth.objects.filter(female__farm__organization=user.organization)
        return Birth.objects.none()

    @action(detail=True, methods=['post'], url_path='registrar-mortalidade')
    def registrar_mortalidade(self, request, pk=None):
        birth = self.get_object()
        data = request.data.get('data', timezone.now().date())
        quantidade = int(request.data.get('quantidade', 1))
        causa = request.data.get('causa', 'DESCONHECIDA')
        observacao = request.data.get('observacao', '')
        
        birth.stillborn += quantidade
        if birth.live_born >= quantidade:
            birth.live_born -= quantidade
        else:
            birth.live_born = 0
        birth.save(update_fields=['stillborn', 'live_born'])
        
        HistoricoEvento.objects.create(
            farm=birth.female.farm,
            tipo_evento='Mortalidade Maternidade',
            descricao=f"Qtd: {quantidade} | Causa: {causa} | Obs: {observacao}",
            data_evento=data,
            matriz=birth.female,
            metadata={'quantidade': quantidade, 'causa': causa}
        )
        return Response({"message": "Mortalidade registrada."})

    @action(detail=True, methods=['post'], url_path='registrar-procedimento')
    def registrar_procedimento(self, request, pk=None):
        birth = self.get_object()
        data = request.data.get('data', timezone.now().date())
        tipo = request.data.get('tipo', 'OBSERVACAO_GERAL')
        quantidade = request.data.get('quantidade')
        destino_matriz_id = request.data.get('destino_matriz_id')
        observacao = request.data.get('observacao', '')
        
        HistoricoEvento.objects.create(
            farm=birth.female.farm,
            tipo_evento='Procedimento Maternidade',
            descricao=f"Tipo: {tipo} | Obs: {observacao}",
            data_evento=data,
            matriz=birth.female,
            metadata={'tipo': tipo, 'quantidade': quantidade, 'destino_matriz_id': destino_matriz_id}
        )
        return Response({"message": "Procedimento registrado."})

    @action(detail=False, methods=['post'])
    def batch_wean(self, request):
        birth_ids = request.data.get('birth_ids', [])
        weaned_quantity = request.data.get('weaned_quantity')
        if not birth_ids:
            return Response({"error": "Nenhum parto selecionado."}, status=status.HTTP_400_BAD_REQUEST)

        births = self.get_queryset().filter(id__in=birth_ids)
        now = timezone.now().date()
        weaned = 0
        for b in births:
            litter, created = Litter.objects.get_or_create(
                birth=b,
                defaults={'weaned_quantity': weaned_quantity or b.live_born, 'weaning_date': now}
            )
            if not created:
                litter.weaning_date = now
                if weaned_quantity is not None:
                    litter.weaned_quantity = weaned_quantity
                litter.save()

            # Mover a mãe para Aguardando Cobertura após desmame
            female = b.female
            female.reproductive_status = Animal.ReproductiveStatus.AGUARDANDO_COBERTURA
            female.previous_phase = ''  # limpar fase anterior
            female.save(update_fields=['reproductive_status', 'previous_phase'])

            # Mover o lote (AnimalBatch) para a fase de Creche
            if b.batch:
                b.batch.phase = 'creche'
                b.batch.save(update_fields=['phase'])

            weaned += 1
        return Response({"message": f"{weaned} leitegada(s) desmamada(s) com sucesso."})


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
        reprodutores_count = animals.filter(category='Cachaço' if species_code == 'suinos' else 'Touro', status='active').count()
        gestantes = animals.filter(reproductive_status=Animal.ReproductiveStatus.GESTANTE).count()
        aguardando_cobertura = animals.filter(reproductive_status=Animal.ReproductiveStatus.AGUARDANDO_COBERTURA).count()
        
        # Leitoes / Bezerros (Partos do mes)
        now = timezone.now()
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0)
        
        births = Birth.objects.filter(female__farm__organization=user.organization, female__species__code=species_code, birth_date__gte=start_of_month)
        nascidos_mes = sum([b.total_born for b in births])
        
        # Tx Prenhez simplificada: Gestantes / (Matrizes Ativas) * 100
        tx_prenhez = 0
        total_produtivas = matrizes_ativas + marras_count
        if total_produtivas > 0:
            tx_prenhez = int((gestantes / total_produtivas) * 100)
            
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

        if aguardando_cobertura > 0:
            alerts.append({
                "type": "info",
                "icon": "🔄",
                "text": f"{aguardando_cobertura} matriz{'es' if aguardando_cobertura > 1 else ''} aguardando cobertura.",
                "time": "Hoje"
            })

        return Response({
            "species": species_code,
            "status": "connected",
            "kpis": {
                "marras": marras_count,
                "matrizes_ativas": matrizes_ativas,
                "reprodutores": reprodutores_count,
                "gestantes": gestantes,
                "aguardando_cobertura": aguardando_cobertura,
                "nascidos_mes": nascidos_mes,
                "tx_prenhez": f"{tx_prenhez}%"
            },
            "alerts": alerts,
            "aiSuggestions": ai_suggestions,
            "message": "Dashboard API is connected."
        }, status=status.HTTP_200_OK)


class VaccinationRecordViewSet(viewsets.ModelViewSet):
    def get_serializer_class(self):
        from .serializers import VaccinationRecordSerializer
        return VaccinationRecordSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return VaccinationRecord.objects.filter(farm__organization=user.organization)
        return VaccinationRecord.objects.none()

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        
        # Resolve animal from animal_identifier (if passed)
        animal_identifier = data.get('animal_identifier')
        if animal_identifier:
            try:
                from .models import Animal
                animal = Animal.objects.filter(
                    identifier=animal_identifier,
                    farm__organization=request.user.organization
                ).first()
                if animal:
                    data['animal'] = animal.id
                    data['farm'] = animal.farm.id
                    data['species'] = animal.species.id
                else:
                    return Response(
                        {"detail": f"Animal com brinco '{animal_identifier}' não foi encontrado."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except Exception as e:
                return Response(
                    {"detail": f"Erro ao buscar animal: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Resolve batch from batch_code (if passed)
        batch_code = data.get('batch_code')
        if batch_code and not data.get('animal'):
            try:
                from .models import AnimalBatch
                batch = AnimalBatch.objects.filter(
                    batch_code=batch_code,
                    farm__organization=request.user.organization
                ).first()
                if batch:
                    data['batch'] = batch.id
                    data['farm'] = batch.farm.id
                    data['species'] = batch.species.id
                else:
                    return Response(
                        {"detail": f"Lote com código '{batch_code}' não foi encontrado."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except Exception as e:
                return Response(
                    {"detail": f"Erro ao buscar lote: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        # Set default farm if neither animal nor batch is specified
        if not data.get('farm'):
            from farms.models import Farm
            first_farm = Farm.objects.filter(organization=request.user.organization).first()
            if first_farm:
                data['farm'] = first_farm.id
                from .models import Species
                suinos_sp = Species.objects.filter(code='suinos').first()
                if suinos_sp:
                    data['species'] = suinos_sp.id
        
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class WeightRecordViewSet(viewsets.ModelViewSet):
    def get_serializer_class(self):
        from .serializers import WeightRecordSerializer
        return WeightRecordSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return WeightRecord.objects.filter(farm__organization=user.organization)
        return WeightRecord.objects.none()


class ClinicalRecordViewSet(viewsets.ModelViewSet):
    serializer_class = ClinicalRecordSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['farm', 'animal', 'disease', 'severity', 'record_type']
    search_fields = ['animal__identifier', 'clinical_notes']
    ordering_fields = ['record_date']
    ordering = ['-record_date']
    
    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return ClinicalRecord.objects.filter(farm__organization=user.organization)
        return ClinicalRecord.objects.none()

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        
        # Resolve animal from animal_identifier
        animal_identifier = data.get('animal_identifier')
        if animal_identifier:
            try:
                from .models import Animal
                animal = Animal.objects.filter(
                    identifier=animal_identifier,
                    farm__organization=request.user.organization
                ).first()
                if animal:
                    data['animal'] = animal.id
                    data['farm'] = animal.farm.id
                else:
                    return Response(
                        {"detail": f"Animal com brinco '{animal_identifier}' não foi encontrado."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except Exception as e:
                return Response(
                    {"detail": f"Erro ao buscar animal: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
    
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Histórico clínico do animal"""
        record = self.get_object()
        animal_records = ClinicalRecord.objects.filter(
            animal=record.animal
        ).order_by('-record_date')
        serializer = self.get_serializer(animal_records, many=True)
        return Response(serializer.data)

class DiseaseViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Disease.objects.all()
    serializer_class = DiseaseSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['species']
    search_fields = ['name', 'code']

class MedicationViewSet(viewsets.ModelViewSet):
    serializer_class = MedicationSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['farm', 'is_available']
    
    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return MedicationInventory.objects.filter(farm__organization=user.organization)
        return MedicationInventory.objects.none()
    
    @action(detail=False, methods=['get'])
    def expiring_soon(self, request):
        """Medicamentos vencendo em 30 dias"""
        from datetime import timedelta
        from django.utils import timezone
        today = timezone.now().date()
        expiring = self.get_queryset().filter(
            expiry_date__lte=today + timedelta(days=30),
            expiry_date__gte=today
        )
        serializer = self.get_serializer(expiring, many=True)
        return Response(serializer.data)

class AlertViewSet(viewsets.ModelViewSet):
    serializer_class = AlertSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['farm', 'status', 'severity']
    ordering = ['-created_date']

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return SanitaryAlert.objects.filter(farm__organization=user.organization)
        return SanitaryAlert.objects.none()


class HealthRecordViewSet(viewsets.ModelViewSet):
    serializer_class = HealthRecordSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['farm', 'treatment_type', 'animal']
    
    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return HealthRecord.objects.filter(farm__organization=user.organization)
        return HealthRecord.objects.none()

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        
        # Resolve animal from animal_identifier
        animal_identifier = data.get('animal_identifier')
        if animal_identifier:
            try:
                from .models import Animal
                animal = Animal.objects.filter(
                    identifier=animal_identifier,
                    farm__organization=request.user.organization
                ).first()
                if animal:
                    data['animal'] = animal.id
                    data['farm'] = animal.farm.id
                else:
                    return Response(
                        {"detail": f"Animal com brinco '{animal_identifier}' não foi encontrado."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except Exception as e:
                return Response(
                    {"detail": f"Erro ao buscar animal: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

class SymptomViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Symptom.objects.all()
    serializer_class = SymptomSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code']
