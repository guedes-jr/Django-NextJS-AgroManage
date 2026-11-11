"""Read-only CSV import preview; no creation endpoint or side effects."""
import csv
import io
from types import SimpleNamespace
from rest_framework import serializers, exceptions
from .models import Animal
from .cattle_serializers import CattleAnimalSerializer
from .mobile_cattle_occurrence import scope
from .mobile_vaccination import Strict
COLUMNS=['identifier','name','gender','category','birth_date','entry_date','breed_name_input','initial_weight_kg','notes','cattle_purpose']

class Input(Strict):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])
    csv=serializers.CharField(max_length=200000,trim_whitespace=False)

def parse(content):
    text=content.removeprefix('\ufeff')
    first=next((line for line in text.splitlines() if line.strip()),'')
    reader=csv.reader(io.StringIO(text,newline=''),delimiter=';' if ';' in first else ',',strict=True)
    headers=None;rows=[]
    try:
        while True:
            line=reader.line_num+1
            try:values=next(reader)
            except StopIteration:break
            values=[value.strip() for value in values]
            if not any(values):continue
            if headers is None:
                headers=values
                if len(set(headers))!=len(headers) or any(key not in COLUMNS for key in headers) or 'identifier' not in headers:
                    raise serializers.ValidationError({'csv':'Confira as colunas do modelo; identificador obrigatório e sem campos financeiros.'})
                continue
            if len(values)!=len(headers):raise serializers.ValidationError({'csv':f'Linha {line}: quantidade de colunas diferente do cabeçalho.'})
            rows.append((line,{key:value for key,value in zip(headers,values) if value}))
            if len(rows)>500:raise serializers.ValidationError({'csv':'Limite de 500 animais por prévia.'})
    except csv.Error as error:raise serializers.ValidationError({'csv':f'CSV inválido próximo da linha {reader.line_num}: {error}'}) from None
    if not rows:raise serializers.ValidationError({'csv':'Informe cabeçalho e de 1 a 500 animais.'})
    return headers,rows

def preview(user,v):
    farm,_=scope(user,v)
    if user.role not in ['admin','manager']:raise exceptions.PermissionDenied()
    farm.organization_id=user.organization_id
    headers,rows=parse(v['csv'])
    identifiers={data.get('identifier','') for _,data in rows}
    existing=set(Animal.objects.filter(farm=farm,identifier__in=identifiers).values_list('identifier',flat=True))
    context={'request':SimpleNamespace(user=user),'validated_import_farm':farm,'import_existing_identifiers':existing}
    seen=set();result=[];counts={key:0 for key in ['unknown','beef','dairy','dual']}
    for line,data in rows:
        identifier=data.get('identifier','');purpose=data.get('cattle_purpose','unknown');errors={}
        if identifier in seen:errors['identifier']=['Brinco repetido neste CSV.']
        seen.add(identifier)
        serializer=CattleAnimalSerializer(data={**data,'farm_id':str(farm.pk)},context=context)
        if not serializer.is_valid():errors.update(serializer.errors)
        if purpose in counts:counts[purpose]+=1
        result.append({'line':line,'data':{**data,'cattle_purpose':purpose},'errors':errors,'valid':not errors})
    valid=sum(row['valid'] for row in result)
    return {'farm':{'id':str(farm.pk),'name':farm.name},'production':v['production'],'headers':headers,'total':len(result),'valid':valid,'invalid':len(result)-valid,'purposes':counts,'rows':result,'preview_only':True}
