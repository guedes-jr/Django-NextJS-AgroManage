"""Read-only diagnosis before repairing historical pedigree data."""
import json
from collections import defaultdict
from django.core.management.base import BaseCommand
from apps.livestock.models import Animal


class Command(BaseCommand):
    help = "Diagnostica filiações bovinas históricas sem alterar registros."

    def add_arguments(self, parser):
        parser.add_argument("--organization")
        parser.add_argument("--summary", action="store_true")

    def handle(self, *args, **options):
        query = Animal.objects.filter(species__code="bovinos").select_related("sire_ref__species", "dam_ref__species")
        if options["organization"]:
            query = query.filter(farm__organization_id=options["organization"])
        rows = {row.pk: row for row in query}
        findings = defaultdict(set)
        for row in rows.values():
            for field, sex in [("sire_ref", "M"), ("dam_ref", "F")]:
                parent = getattr(row, field)
                if not parent: continue
                if parent.pk == row.pk: findings[row.pk].add("autorrelacionamento")
                if parent.gender != sex: findings[row.pk].add("sexo_do_ascendente")
                if parent.farm_id != row.farm_id or parent.species.code != "bovinos": findings[row.pk].add("origem_do_ascendente")
                if parent.birth_date and row.birth_date and parent.birth_date >= row.birth_date: findings[row.pk].add("cronologia")
            frontier, seen = {pk for pk in [row.sire_ref_id, row.dam_ref_id] if pk}, set()
            while frontier:
                if row.pk in frontier:
                    findings[row.pk].add("ciclo"); break
                seen.update(frontier)
                frontier = {pk for node in frontier if node in rows for pk in [rows[node].sire_ref_id, rows[node].dam_ref_id] if pk and pk not in seen}
        result = {"animals_reviewed": len(rows), "animals_with_findings": len(findings), "changed": False}
        if not options["summary"]:
            result["findings"] = [{"animal_id": str(pk), "issues": sorted(issues)} for pk, issues in sorted(findings.items(), key=lambda row: str(row[0]))]
        self.stdout.write(json.dumps(result, ensure_ascii=False))
