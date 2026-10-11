"""Only operational aggregates; never query financial tables for operators."""

from django.db.models import Count, Sum

from apps.crops.models import PlantingCycle
from apps.livestock.models import Animal, AnimalBatch
from apps.tasks.models import Task
from common.operator_access import effective_access


def operator_dashboard(user):
    access = effective_access(user)
    codes = access["livestock_species"] or []
    batches = AnimalBatch.objects.filter(
        farm__organization_id=user.organization_id,
        species__code__in=codes,
        status="active",
    )
    animals = Animal.objects.filter(
        farm__organization_id=user.organization_id,
        species__code__in=codes,
        status="active",
    )
    herd = {
        row["species__code"]: {
            "code": row["species__code"],
            "name": row["species__name"],
            "batches": row["batches"],
            "quantity": row["quantity"] or 0,
            "individuals": 0,
        }
        for row in batches.values("species__code", "species__name").annotate(
            batches=Count("pk"), quantity=Sum("quantity")
        )
    }
    for row in animals.values("species__code", "species__name").annotate(
        individuals=Count("pk")
    ):
        entry = herd.setdefault(
            row["species__code"],
            {
                "code": row["species__code"],
                "name": row["species__name"],
                "batches": 0,
                "quantity": 0,
                "individuals": 0,
            },
        )
        entry["individuals"] = row["individuals"]
    crops = (
        PlantingCycle.objects.filter(organization_id=user.organization_id).count()
        if access["can_operate_crops"]
        else None
    )
    tasks = Task.objects.filter(
        organization_id=user.organization_id,
        assigned_to=user,
        status__in=["open", "in_progress"],
    ).order_by("due_date", "-created_at")
    return {
        "mode": "operational",
        "organization": user.organization.name if user.organization else None,
        "access": access,
        "operational": {"plantations": crops, "herds": list(herd.values())},
        "tasks": list(
            tasks.values("id", "title", "due_date", "priority", "status")[:20]
        ),
    }
