from django.core.management.base import BaseCommand
from django.db import transaction
from apps.livestock.models import Species, Symptom, Disease

class Command(BaseCommand):
    help = 'Seed clinical data for the AgroManage platform (Symptoms & Diseases)'

    def handle(self, *args, **kwargs):
        self.stdout.write("Starting to seed clinical data...")

        with transaction.atomic():
            # 1. Create Species if they don't exist
            suino, _ = Species.objects.get_or_create(code='suino', defaults={'name': 'Suíno'})
            bovino, _ = Species.objects.get_or_create(code='bovino', defaults={'name': 'Bovino'})

            # 2. Create Symptoms
            symptoms_data = [
                # GERAL
                ('febre', 'Febre (Hipertermia)', 'high'),
                ('apatia', 'Apatia/Letargia', 'medium'),
                ('perda_apetite', 'Perda de Apetite (Anorexia)', 'medium'),
                ('emagrecimento', 'Emagrecimento Progressivo', 'high'),
                ('morte_subita', 'Morte Súbita', 'critical'),
                # DIGESTIVO
                ('diarreia', 'Diarreia', 'high'),
                ('vomito', 'Vômito', 'medium'),
                # RESPIRATORIO
                ('tosse', 'Tosse', 'medium'),
                ('espirro', 'Espirro', 'low'),
                ('dispneia', 'Dificuldade Respiratória (Dispneia)', 'high'),
                ('descarga_nasal', 'Descarga Nasal (Coriza)', 'medium'),
                # REPRODUTIVO
                ('aborto', 'Aborto', 'critical'),
                ('retencao_placenta', 'Retenção de Placenta', 'high'),
                # OUTROS
                ('edema', 'Edema (Inchaço)', 'high'),
                ('lesao_pele', 'Lesões na Pele', 'medium'),
                ('claudicacao', 'Claudicação (Mancar)', 'high'),
            ]

            symptom_objs = {}
            for code, name, urgency in symptoms_data:
                symp, _ = Symptom.objects.get_or_create(
                    code=code,
                    defaults={'name': name, 'urgency_level': urgency}
                )
                symptom_objs[code] = symp

            # Assign species to symptoms (all symptoms for both)
            for symp in symptom_objs.values():
                symp.species.add(suino, bovino)

            self.stdout.write(f"Successfully loaded {len(symptoms_data)} symptoms.")

            # 3. Create Diseases (Suínos)
            suino_diseases = [
                {
                    'code': 'PCV2',
                    'name': 'Circovirose Suína',
                    'description': 'Infecção causada pelo Circovírus Suíno tipo 2 (PCV2), que afeta principalmente leitões desmamados e de recria.',
                    'recommended_treatment': 'Tratamento de suporte com anti-inflamatórios e antibióticos para prevenir infecções secundárias. Foco na vacinação preventiva.',
                    'transmission_route': 'direct',
                    'is_infectious': True,
                    'is_reportable': False,
                    'mortality_rate': 15.0,
                    'symptoms': ['emagrecimento', 'diarreia', 'dispneia', 'lesao_pele'],
                },
                {
                    'code': 'PRRS',
                    'name': 'Síndrome Reprodutiva e Respiratória dos Suínos',
                    'description': 'Doença viral que causa falhas reprodutivas severas em matrizes e doenças respiratórias em suínos jovens.',
                    'recommended_treatment': 'Não há tratamento específico. Uso de antibióticos para controle bacteriano secundário.',
                    'transmission_route': 'respiratory',
                    'is_infectious': True,
                    'is_reportable': True,
                    'mortality_rate': 20.0,
                    'symptoms': ['aborto', 'dispneia', 'febre', 'morte_subita'],
                },
                {
                    'code': 'PSA',
                    'name': 'Peste Suína Africana',
                    'description': 'Doença viral altamente contagiosa e devastadora. Não há cura nem vacina.',
                    'recommended_treatment': 'Nenhum. Erradicação do rebanho infectado.',
                    'transmission_route': 'direct',
                    'is_infectious': True,
                    'is_reportable': True,
                    'mortality_rate': 95.0,
                    'symptoms': ['febre', 'apatia', 'morte_subita', 'lesao_pele'],
                },
                {
                    'code': 'ERISIPELA',
                    'name': 'Erisipela Suína (Doença do Diamante)',
                    'description': 'Infecção bacteriana caracterizada por lesões de pele em formato de diamante e artrite.',
                    'recommended_treatment': 'Antibioticoterapia (Penicilina) altamente eficaz se administrada cedo.',
                    'transmission_route': 'alimentar',
                    'is_infectious': True,
                    'is_reportable': False,
                    'mortality_rate': 5.0,
                    'symptoms': ['febre', 'lesao_pele', 'claudicacao', 'apatia'],
                }
            ]

            # 4. Create Diseases (Bovinos)
            bovino_diseases = [
                {
                    'code': 'AFTOSA',
                    'name': 'Febre Aftosa',
                    'description': 'Doença viral altamente contagiosa que afeta animais de casco fendido, causando vesículas na boca e cascos.',
                    'recommended_treatment': 'Tratamento de suporte. Controle rigoroso focado em vacinação e erradicação.',
                    'transmission_route': 'direct',
                    'is_infectious': True,
                    'is_reportable': True,
                    'mortality_rate': 2.0,
                    'symptoms': ['febre', 'claudicacao', 'perda_apetite'],
                },
                {
                    'code': 'MASTITE',
                    'name': 'Mastite Bovina',
                    'description': 'Inflamação da glândula mamária, geralmente infecciosa, que reduz a produção e a qualidade do leite.',
                    'recommended_treatment': 'Antibioticoterapia intramamária e sistêmica. Ordenha frequente.',
                    'transmission_route': 'indirect',
                    'is_infectious': True,
                    'is_reportable': False,
                    'mortality_rate': 1.0,
                    'symptoms': ['edema', 'febre', 'apatia'],
                },
                {
                    'code': 'BRUCELOSE',
                    'name': 'Brucelose Bovina',
                    'description': 'Zoonose bacteriana que afeta a reprodução, causando abortos no terço final da gestação.',
                    'recommended_treatment': 'Doença incurável em animais. Abate sanitário e vacinação das fêmeas bezerras.',
                    'transmission_route': 'direct',
                    'is_infectious': True,
                    'is_reportable': True,
                    'mortality_rate': 0.0, # Causa aborto, não mata a mãe
                    'symptoms': ['aborto', 'retencao_placenta'],
                }
            ]

            all_diseases = [(suino, suino_diseases), (bovino, bovino_diseases)]
            disease_count = 0

            for species, diseases in all_diseases:
                for data in diseases:
                    disease_symptoms = data.pop('symptoms')
                    disease, created = Disease.objects.update_or_create(
                        code=data['code'],
                        species=species,
                        defaults=data
                    )
                    
                    # Set symptoms
                    disease.symptoms.set([symptom_objs[sym] for sym in disease_symptoms])
                    disease_count += 1

            self.stdout.write(self.style.SUCCESS(f"Successfully loaded {disease_count} diseases!"))
