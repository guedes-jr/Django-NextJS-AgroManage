from apps.livestock.models import Pregnancy, Birth
print("Pregnancies without birth:", Pregnancy.objects.filter(birth__isnull=True).count())
print("Total Pregnancies:", Pregnancy.objects.count())
print("Total Births:", Birth.objects.count())
for p in Pregnancy.objects.filter(birth__isnull=True):
    print(f"Pregnancy ID: {p.id}")
