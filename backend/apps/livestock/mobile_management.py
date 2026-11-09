"""Manager-only operational management reads, without cost/stock valuation fields."""
from django.conf import settings
from django.db.models import Count, Exists, OuterRef, Q
from rest_framework import serializers
from .models import CattleManagement, CattleManagementEntry
from .mobile_grazing_entry import writable


class Query(serializers.Serializer):
    production = serializers.ChoiceField(choices=['beef','dairy'])
    farm = serializers.UUIDField(required=False)
    kind = serializers.ChoiceField(choices=['all',*CattleManagement.Kind.values], default='all')
    status = serializers.ChoiceField(choices=['all',*CattleManagement.Status.values], default='all')
    search = serializers.CharField(max_length=100, allow_blank=True, default='')


def rows(user, params):
    writable(user)
    values=Query(data=params); values.is_valid(raise_exception=True)
    query=values.validated_data
    entries=CattleManagementEntry.objects.filter(management_id=OuterRef('pk'))
    valid=Q(animal__farm_id=OuterRef('farm_id'),animal__farm__organization_id=user.organization_id,animal__species__code='bovinos')
    purposes=[query['production'],'dual']
    qs=CattleManagement.objects.filter(farm__organization_id=user.organization_id).annotate(
        has_segment=Exists(entries.filter(valid,animal__cattle_purpose__in=purposes)),
        has_invalid=Exists(entries.exclude(valid)),
        participant_count=Count('entries'),
        segment_count=Count('entries',filter=Q(entries__animal__cattle_purpose__in=purposes)),
    ).filter(has_segment=True,has_invalid=False)
    if query.get('farm'): qs=qs.filter(farm_id=query['farm'])
    if query['kind']!='all': qs=qs.filter(kind=query['kind'])
    if query['status']!='all': qs=qs.filter(status=query['status'])
    if query['search']: qs=qs.filter(Q(description__icontains=query['search'])|Q(responsible__icontains=query['search']))
    return qs.select_related('farm').only('id','farm__id','farm__name','kind','date','description','responsible',
        'updated_at','status','treatment_type','next_procedure_date','milk_withdrawal_until','meat_withdrawal_until','notes',
        'confirmed_at','cancellation_reason','follow_up_status','follow_up_note','follow_up_resolved_at').order_by('-date','-created_at','-id')


def data(row, detail=False):
    result={'id':str(row.pk),'farm':str(row.farm_id),'farm_name':row.farm.name,'kind':row.kind,
        'date':str(row.date),'description':row.description,'responsible':row.responsible,'status':row.status,
        'participant_count':row.participant_count,'segment_count':row.segment_count}
    if detail:
        result.update(timezone=settings.TIME_ZONE,treatment_type=row.treatment_type,notes=row.notes,
            next_procedure_date=str(row.next_procedure_date) if row.next_procedure_date else None,
            milk_withdrawal_until=str(row.milk_withdrawal_until) if row.milk_withdrawal_until else None,
            meat_withdrawal_until=str(row.meat_withdrawal_until) if row.meat_withdrawal_until else None,
            confirmed_at=row.confirmed_at.isoformat() if row.confirmed_at else None,
            cancellation_reason=row.cancellation_reason,follow_up_status=row.follow_up_status,
            follow_up_note=row.follow_up_note,follow_up_resolved_at=row.follow_up_resolved_at.isoformat() if row.follow_up_resolved_at else None)
    return result


def participants(management, search=''):
    return management.entries.select_related('animal').filter(animal__farm_id=management.farm_id, animal__species__code='bovinos').filter(
        Q(animal__identifier__icontains=search)|Q(animal__cattle_profile__name__icontains=search)
    ).only('id','management_id','weight_kg','animal__id','animal__identifier','animal__farm_id','animal__cattle_purpose','animal__status').order_by('animal__identifier','id')


def participant_data(row):
    return {'id':str(row.pk),'animal':str(row.animal_id),'identifier':row.animal.identifier,
        'farm':str(row.animal.farm_id),'cattle_purpose':row.animal.cattle_purpose,'status':row.animal.status,
        'weight_kg':str(row.weight_kg) if row.weight_kg is not None else None}
