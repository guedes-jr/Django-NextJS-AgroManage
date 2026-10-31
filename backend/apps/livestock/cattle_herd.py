"""Keep cattle headcount changes in the existing operational commands."""
from rest_framework.exceptions import ValidationError


def validate_headcount_edit(instance, values):
    if instance and instance.species.code == "bovinos" and "quantity" in values:
        raise ValidationError({"quantity": "O efetivo é atualizado pelas operações de entrada, nascimento, mortalidade, transferência e venda."})
