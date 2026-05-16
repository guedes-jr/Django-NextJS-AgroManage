from apps.livestock.models import AnimalBatch, Birth, Pregnancy
import datetime

batches = AnimalBatch.objects.filter(batch_code__startswith="L-MARRA_TEST_1")
for b in batches:
    print(f"Deleting batch: {b.batch_code} created at {b.created_at}")
    b.delete()

births = Birth.objects.filter(female__identifier='MARRA_TEST_1')
for b in births:
    print(f"Deleting birth: {b.id} created at {b.created_at}")
    b.delete()

