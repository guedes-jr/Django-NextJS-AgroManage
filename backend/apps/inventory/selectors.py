# Read-side query functions for the 'inventory' app.
# Return QuerySets or values, no side effects.

from django.db.models import Q


VACCINE_CATEGORIES = ("vacina", "medicamento_vacina")


def vaccine_category_q(prefix=""):
    """Match dedicated vaccines and combined medicine/vaccine inventory items."""
    return Q(**{f"{prefix}categoria__in": VACCINE_CATEGORIES})
