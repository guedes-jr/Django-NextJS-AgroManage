import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.base')
django.setup()

from apps.livestock.models import VaccinationRecord
from apps.livestock.serializers import VaccinationRecordSerializer

records = VaccinationRecord.objects.all().order_by('-id')[:5]
for r in records:
    print(f"ID: {r.id}, Vaccine: {r.vaccine_name}, Dosage: {r.dosage_ml}")
    ser = VaccinationRecordSerializer(r)
    print(f"Cost: {ser.data.get('inventory_cost')}")
    if r.vaccine_item:
        print(f"Item custo_medio: {r.vaccine_item.custo_medio}")
