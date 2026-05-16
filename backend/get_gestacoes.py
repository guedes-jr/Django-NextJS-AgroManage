from apps.livestock.models import Pregnancy
for p in Pregnancy.objects.all():
    print(f"Pregnancy ID: {p.id}, status: {p.status}")
    print(f"Animal: {p.female.identifier}, reproductive_status: {p.female.reproductive_status}")
    if hasattr(p, 'birth'):
        print(f"Birth ID: {p.birth.id}")
    else:
        print("No birth")
    print("---")
