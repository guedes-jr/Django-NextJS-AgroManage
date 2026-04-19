#!/usr/bin/env bash
# =============================================================================
# AgroManage — seed.sh
# Loads initial/sample data into the database.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")/backend"

echo "[SEED] Activating venv..."
source "$BACKEND_DIR/.venv/bin/activate"
cd "$BACKEND_DIR"

echo "[SEED] Loading seed data..."
python manage.py shell << 'PYEOF'
from apps.organizations.models import Organization
from apps.farms.models import Farm, Sector
from apps.livestock.models import Species, Breed

org, _ = Organization.objects.get_or_create(
    slug="agro-demo",
    defaults={"name": "AgroManage Demo", "plan": "pro"},
)
print(f"  Organization: {org.name}")

farm, _ = Farm.objects.get_or_create(
    organization=org,
    name="Fazenda Modelo",
    defaults={"state": "MT", "city": "Sorriso", "total_area_ha": 500},
)
print(f"  Farm: {farm.name}")

sector, _ = Sector.objects.get_or_create(
    farm=farm,
    name="Pasto Norte",
    defaults={"sector_type": "pasture", "area_ha": 120},
)
print(f"  Sector: {sector.name}")

bovine, _ = Species.objects.get_or_create(name="Bovino", defaults={"code": "BOV"})
swine, _   = Species.objects.get_or_create(name="Suíno",  defaults={"code": "SUI"})
poultry, _ = Species.objects.get_or_create(name="Aves",   defaults={"code": "AVE"})
print(f"  Species: {bovine}, {swine}, {poultry}")

Breed.objects.get_or_create(species=bovine, name="Nelore")
Breed.objects.get_or_create(species=bovine, name="Angus")
Breed.objects.get_or_create(species=swine,  name="Landrace")
Breed.objects.get_or_create(species=poultry, name="Cobb 500")
print("  Breeds: seeded.")

print("[SEED] ✅ Done.")
PYEOF

deactivate
