from django.db.models import DateField, OuterRef, Subquery
from django.db.models.functions import Coalesce

from .models import Animal, Birth


def with_batch_birth_date(queryset):
    """Resolve nursery birth dates in one query, including manually registered lots."""
    births = Birth.objects.filter(female__farm_id=OuterRef("farm_id"))
    direct = births.filter(batch_id=OuterRef("pk")).order_by("-birth_date")
    source = births.filter(batch__merged_into__id=OuterRef("pk")).order_by("-birth_date")
    maternal = births.filter(
        female_id=OuterRef("mother_id"), birth_date__lte=OuterRef("entry_date")
    ).order_by("-birth_date")
    animals = Animal.objects.filter(
        batch_id=OuterRef("pk"), farm_id=OuterRef("farm_id"), birth_date__isnull=False
    ).order_by("-birth_date")
    return queryset.annotate(resolved_birth_date=Coalesce(
        "birth_date",
        Subquery(direct.values("birth_date")[:1]),
        Subquery(source.values("birth_date")[:1]),
        Subquery(maternal.values("birth_date")[:1]),
        Subquery(animals.values("birth_date")[:1]),
        output_field=DateField(),
    ))
