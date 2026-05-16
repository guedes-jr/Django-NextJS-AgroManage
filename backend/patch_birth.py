from apps.livestock.serializers import BirthSerializer
from apps.livestock.models import Animal, Pregnancy, AnimalBatch
import traceback

try:
    pregnancy = Pregnancy.objects.exclude(birth__isnull=False).first()
    if not pregnancy:
        print("No pregnancy without birth available")
    else:
        batch = AnimalBatch.objects.first()
        data = {
            "birth_date": "2026-05-15",
            "live_born": "12",
            "stillborn": "0",
            "mummified": "0",
            "female": str(pregnancy.female.id),
            "pregnancy": str(pregnancy.id),
            "batch": str(batch.id) if batch else None
        }

        serializer = BirthSerializer(data=data)
        if not serializer.is_valid():
            print("VALIDATION ERROR:", serializer.errors)
        else:
            print("VALID!")
except Exception as e:
    traceback.print_exc()
