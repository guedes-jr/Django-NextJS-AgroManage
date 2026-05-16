from apps.livestock.models import Birth
b = Birth.objects.get(female__identifier='MARRA_TEST_1')
print(f"Birth created at: {b.created_at}")
print(f"Batch associated: {b.batch.id if b.batch else None}")
