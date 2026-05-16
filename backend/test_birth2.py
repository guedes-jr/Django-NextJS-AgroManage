from apps.livestock.serializers import BirthSerializer
from apps.livestock.models import Animal, Pregnancy, AnimalBatch, Mating

# Create a dummy pregnancy to test
female = Animal.objects.filter(gender='F').first()
mating = Mating.objects.create(female=female, mating_date='2026-01-01', status='confirmed')
pregnancy = Pregnancy.objects.create(female=female, mating=mating, start_date='2026-01-01', expected_birth_date='2026-05-15')
batch = AnimalBatch.objects.first()

data = {
    "female_identifier": "MARRA_TEST_1",
    "birth_date": "2026-05-15",
    "live_born": "12",
    "stillborn": "0",
    "mummified": "0",
    "female": str(female.id),
    "pregnancy": str(pregnancy.id),
    "batch": str(batch.id) if batch else None
}

serializer = BirthSerializer(data=data)
if not serializer.is_valid():
    print("VALIDATION ERROR:", serializer.errors)
else:
    print("VALID!")
    
# Cleanup
pregnancy.delete()
mating.delete()
