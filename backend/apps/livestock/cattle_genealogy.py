"""Cattle ancestry validation shared by the generic and cattle APIs."""
from django.db.models import Q
from rest_framework.exceptions import ValidationError
from .models import Animal


def validate_cattle_parentage(instance, attrs, farm_id):
    relevant = {"sire_ref", "dam_ref", "gender", "birth_date", "farm_id"}
    if instance and not relevant.intersection(attrs):
        return
    if instance and farm_id != instance.farm_id:
        from apps.farms.models import Farm
        if not Farm.objects.filter(pk=farm_id, organization_id=instance.farm.organization_id).exists():
            raise ValidationError({"farm_id": "Selecione uma fazenda da sua organização."})
        if instance.offspring_as_sire.exclude(farm_id=farm_id).exists() or instance.offspring_as_dam.exclude(farm_id=farm_id).exists():
            raise ValidationError({"farm_id": "A transferência deixaria descendentes vinculados em outra fazenda."})
    child_id = instance.pk if instance else None
    birth = attrs.get("birth_date", getattr(instance, "birth_date", None))
    for field, sex in [("sire_ref", "M"), ("dam_ref", "F")]:
        parent = attrs.get(field, getattr(instance, field, None))
        if not parent:
            continue
        if parent.pk == child_id:
            raise ValidationError({field: "O animal não pode ser seu próprio pai ou mãe."})
        if parent.farm_id != farm_id or parent.species.code != "bovinos" or parent.gender != sex:
            raise ValidationError({field: "Selecione um ascendente bovino da mesma fazenda e do sexo correspondente."})
        if birth and parent.birth_date and parent.birth_date >= birth:
            raise ValidationError({field: "O nascimento do ascendente deve anteceder o do descendente."})
        # Batch traversal avoids one query for every animal in an ancestry graph.
        frontier, visited, graph = {parent.pk}, set(), {}
        for _ in range(100):
            if not frontier:
                break
            if child_id in frontier:
                raise ValidationError({field: "Esta filiação criaria um ciclo na genealogia."})
            nodes = list(Animal.objects.filter(pk__in=frontier, farm_id=farm_id, species__code="bovinos").values_list("id", "sire_ref_id", "dam_ref_id"))
            graph.update({pk: [node for node in (sire, dam) if node] for pk, sire, dam in nodes})
            visited.update(frontier)
            if len(visited) > 10000:
                raise ValidationError({field: "A ascendência excede o limite de validação."})
            frontier = {pk for _, sire, dam in nodes for pk in (sire, dam) if pk and pk not in visited}
        else:
            raise ValidationError({field: "A ascendência excede o limite de validação. Revise o cadastro."})
        colors = {}
        def visit(pk):
            if colors.get(pk) == 1:
                raise ValidationError({field: "O ascendente possui uma genealogia cíclica. Corrija sua origem antes de vinculá-lo."})
            if colors.get(pk) == 2: return
            colors[pk] = 1
            for previous in graph.get(pk, []): visit(previous)
            colors[pk] = 2
        visit(parent.pk)
    if instance:
        sex = attrs.get("gender", instance.gender)
        if (sex != "M" and instance.offspring_as_sire.exists()) or (sex != "F" and instance.offspring_as_dam.exists()):
            raise ValidationError({"gender": "O sexo é incompatível com a filiação dos descendentes cadastrados."})
        if birth and Animal.objects.filter(farm_id=farm_id, birth_date__lte=birth).filter(Q(sire_ref=instance) | Q(dam_ref=instance)).exists():
            raise ValidationError({"birth_date": "O nascimento deve anteceder o dos descendentes cadastrados."})


def genealogy(animal, depth=3):
    nodes, frontier, seen = [], [(animal, "Animal", 0)], set()
    while frontier:
        parent_ids = {pk for current, _, level in frontier if level < depth for pk in [current.sire_ref_id, current.dam_ref_id] if pk}
        parents = {row.pk: row for row in Animal.objects.filter(pk__in=parent_ids, farm_id=animal.farm_id, species=animal.species)}
        next_frontier = []
        for current, relation, level in frontier:
            repeated = current.pk in seen
            nodes.append({"id": str(current.pk), "identifier": current.identifier, "relation": relation, "level": level, "repeated": repeated})
            if repeated: continue
            seen.add(current.pk)
            if level < depth:
                for field, label in [("sire_ref_id", "Pai"), ("dam_ref_id", "Mãe")]:
                    if getattr(current, field) in parents:
                        next_frontier.append((parents[getattr(current, field)], f"{relation} › {label}", level + 1))
        frontier = next_frontier
    children = Animal.objects.filter(farm_id=animal.farm_id, species=animal.species).filter(Q(sire_ref=animal) | Q(dam_ref=animal)).order_by("birth_date", "identifier")
    return {"ancestors": nodes, "children": list(children.values("id", "identifier", "birth_date", "status", "current_weight_kg")[:50]), "children_count": children.count(), "depth": depth, "notice": "Ascendência limitada aos vínculos identificados. Nomes livres e dados ausentes não comprovam ausência de parentesco."}
