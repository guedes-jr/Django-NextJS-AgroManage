"""Scoped operational read projections; never load financial/transfer snapshots."""
from django.conf import settings
from django.db.models import Q, F
from rest_framework import serializers, exceptions
from .models import CattleOccurrence, CattlePurposeChange, CattleTransfer
from .mobile_clinic import authorize

KINDS=['occurrences','purpose-history','transfers']


class Query(serializers.Serializer):
    production=serializers.ChoiceField(choices=['beef','dairy'])
    farm=serializers.UUIDField(required=False)
    search=serializers.CharField(max_length=100,allow_blank=True,default='')
    status=serializers.ChoiceField(choices=['all','open','done'],default='all')


def rows(user,kind,params):
    authorize(user)
    if user.role=='operator' and not user.allowed_livestock.filter(code='bovinos').exists(): raise exceptions.PermissionDenied()
    kind=serializers.ChoiceField(choices=KINDS).run_validation(kind)
    if kind=='transfers' and user.role not in ['admin','manager']: raise exceptions.PermissionDenied()
    values=Query(data=params);values.is_valid(raise_exception=True);query=values.validated_data
    purposes=[query['production'],'dual']
    if kind=='transfers':
        qs=CattleTransfer.objects.filter(farm__organization=user.organization,source__farm_id=F('farm_id'),destination__farm_id=F('farm_id'),
            source__species__code='bovinos',destination__species__code='bovinos').filter(Q(source__cattle_purpose__in=purposes)|Q(destination__cattle_purpose__in=purposes))
        qs=qs.select_related('farm','source','destination','created_by').only('id','date','quantity','reason','farm__id','farm__name','created_by__id','created_by__full_name',
            'source__id','source__batch_code','source__cattle_purpose','destination__id','destination__batch_code','destination__cattle_purpose')
        if query['search']:qs=qs.filter(Q(reason__icontains=query['search'])|Q(source__batch_code__icontains=query['search'])|Q(destination__batch_code__icontains=query['search']))
    else:
        animal=Q(animal__isnull=False,batch__isnull=True,animal__farm_id=F('farm_id'),animal__species__code='bovinos')
        batch=Q(batch__isnull=False,animal__isnull=True,batch__farm_id=F('farm_id'),batch__species__code='bovinos')
        common=['id','date','farm__id','farm__name','created_by__id','created_by__full_name','animal__id','animal__identifier','animal__cattle_purpose','batch__id','batch__batch_code','batch__cattle_purpose']
        if kind=='purpose-history':
            qs=CattlePurposeChange.objects.filter(farm__organization=user.organization).filter(animal|batch).filter(Q(previous__in=purposes)|Q(purpose__in=purposes))
            fields=[*common,'previous','purpose']
            if query['search']:qs=qs.filter(Q(animal__identifier__icontains=query['search'])|Q(batch__batch_code__icontains=query['search']))
        else:
            qs=CattleOccurrence.objects.filter(farm__organization=user.organization,task__organization=user.organization).filter(
                (animal&Q(animal__cattle_purpose__in=purposes))|(batch&Q(batch__cattle_purpose__in=purposes))|Q(animal__isnull=True,batch__isnull=True))
            qs=qs.filter(Q(task__farm_id=F('farm_id'))|Q(task__farm__isnull=True)).filter(Q(task__assigned_to__isnull=True)|Q(task__assigned_to__organization=user.organization))
            if query['status']!='all':qs=qs.filter(resolved_at__isnull=query['status']=='open')
            if query['search']:qs=qs.filter(Q(description__icontains=query['search'])|Q(animal__identifier__icontains=query['search'])|Q(batch__batch_code__icontains=query['search']))
            fields=[*common,'kind','description','resolution','resolved_at','task__id','task__due_date','task__status','task__assigned_to__id','task__assigned_to__full_name']
            qs=qs.select_related('task__assigned_to')
        qs=qs.select_related('farm','animal','batch','created_by').only(*fields)
    if query.get('farm'):qs=qs.filter(farm_id=query['farm'])
    return qs.order_by('-date','-created_at','-id')


def target(row,kind):
    return {'id':str(row.pk),'kind':kind,'identifier':row.identifier if kind=='animals' else row.batch_code,'purpose':row.cattle_purpose}


def data(row,kind,user=None):
    result={'id':str(row.pk),'tab':kind,'farm':str(row.farm_id),'farm_name':row.farm.name,'date':str(row.date),'author':row.created_by.full_name,'timezone':settings.TIME_ZONE}
    if kind=='transfers':
        return {**result,'source':target(row.source,'batches'),'destination':target(row.destination,'batches'),'quantity':row.quantity,'reason':row.reason}
    result['target']=target(row.animal,'animals') if row.animal_id else target(row.batch,'batches') if row.batch_id else None
    if kind=='purpose-history':return {**result,'previous':row.previous,'purpose':row.purpose}
    can_resolve=bool(user and not row.resolved_at and (user.role in ['admin','manager'] or user.role=='operator' and not user.operator_read_only and (row.created_by_id==user.pk or row.task.assigned_to_id==user.pk)))
    return {**result,'can_resolve':can_resolve,'kind':row.kind,'description':row.description,'due_date':str(row.task.due_date) if row.task.due_date else None,
        'assigned_to':row.task.assigned_to.full_name if row.task.assigned_to_id else '', 'status':row.task.status,
        'resolution':row.resolution,'resolved_at':row.resolved_at.isoformat() if row.resolved_at else None}
