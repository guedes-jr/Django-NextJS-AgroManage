"""Public national-calendar lookup and idempotent organization adoption."""
import json
import ssl
import certifi
from datetime import date
from urllib.request import urlopen, Request
from urllib.error import URLError
from django.core.cache import cache
from django.db import transaction
from rest_framework.exceptions import APIException, ValidationError
from .models import Holiday


class HolidayProviderUnavailable(APIException):
    status_code = 503
    default_detail = "Não foi possível consultar os feriados nacionais. Tente novamente ou cadastre manualmente."


def national_holidays(year):
    key = f"national-holidays-br-v1-{year}"
    cached = cache.get(key)
    if cached is not None:
        return cached
    try:
        with urlopen(Request(f"https://brasilapi.com.br/api/feriados/v1/{year}", headers={"User-Agent":"AgroManage/1.0", "Accept":"application/json"}), timeout=8, context=ssl.create_default_context(cafile=certifi.where())) as response:
            payload = json.loads(response.read(65537))
        if not isinstance(payload, list) or not 1 <= len(payload) <= 100:
            raise ValueError("Invalid provider payload")
        rows = []
        for row in payload:
            day = date.fromisoformat(row["date"])
            name = row["name"].strip()
            if day.year != year or not name or len(name) > 150:
                raise ValueError("Invalid provider holiday")
            rows.append({"date": day.isoformat(), "name": name})
        rows = sorted({(row["date"], row["name"]): row for row in rows}.values(), key=lambda row: (row["date"], row["name"]))
    except (URLError, OSError, ValueError, TypeError, KeyError, AttributeError) as exc:
        raise HolidayProviderUnavailable() from exc
    cache.set(key, rows, 86400)
    return rows


@transaction.atomic
def adopt_holidays(user, year, dates):
    selected = set(day.isoformat() for day in dates)
    rows = national_holidays(year)
    if selected - {row["date"] for row in rows}:
        raise ValidationError({"dates": "Selecione apenas datas da consulta nacional deste ano."})
    created = 0
    for row in rows:
        if row["date"] in selected:
            _, new = Holiday.objects.get_or_create(organization=user.organization, date=row["date"], name=row["name"], defaults={"source":"national", "created_by":user})
            created += int(new)
    return created
