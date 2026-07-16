import re
import time
from datetime import date, datetime
from decimal import Decimal

from django.db import connection, transaction


MAX_QUERY_LENGTH = 10_000
MAX_ROWS = 200
FORBIDDEN = re.compile(
    r"\b(insert|update|delete|merge|alter|drop|truncate|create|grant|revoke|copy|call|do|set|reset|vacuum|analyze|refresh|reindex|cluster|listen|notify|lock)\b",
    re.IGNORECASE,
)
SENSITIVE = re.compile(
    r"\b(pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|pg_sleep|dblink|lo_import|lo_export|current_setting)\s*\(",
    re.IGNORECASE,
)


class UnsafeQuery(ValueError):
    pass


def redact_query_for_history(query):
    return re.sub(r"'(?:''|[^'])*'", "'?'", (query or ""))[:MAX_QUERY_LENGTH]


def validate_readonly_query(query):
    query = (query or "").strip()
    if not query or len(query) > MAX_QUERY_LENGTH:
        raise UnsafeQuery("A consulta está vazia ou excede 10.000 caracteres.")
    query = query[:-1].strip() if query.endswith(";") else query
    if ";" in query:
        raise UnsafeQuery("Apenas uma instrução é permitida.")
    if not re.match(r"^(select|with)\b", query, re.IGNORECASE):
        raise UnsafeQuery("Somente consultas SELECT ou WITH são permitidas.")
    without_comments = re.sub(r"/\*.*?\*/|--[^\n]*", " ", query, flags=re.DOTALL)
    if FORBIDDEN.search(without_comments) or SENSITIVE.search(without_comments):
        raise UnsafeQuery("A consulta contém uma operação não permitida.")
    return query


def _json_value(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, bytes):
        return "<binary>"
    return value


def execute_readonly_query(query):
    query = validate_readonly_query(query)
    started = time.monotonic()
    with transaction.atomic():
        with connection.cursor() as cursor:
            if connection.vendor == "postgresql":
                cursor.execute("SET LOCAL statement_timeout = 3000")
                cursor.execute("SET TRANSACTION READ ONLY")
            cursor.execute(f"SELECT * FROM ({query}) AS platform_console_query LIMIT %s", [MAX_ROWS + 1])
            columns = [item[0] for item in cursor.description]
            raw_rows = cursor.fetchall()
    truncated = len(raw_rows) > MAX_ROWS
    rows = [[_json_value(value) for value in row] for row in raw_rows[:MAX_ROWS]]
    return {
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "was_truncated": truncated,
        "truncated": truncated,
        "duration_ms": int((time.monotonic() - started) * 1000),
    }


def explain_readonly_query(query):
    query = validate_readonly_query(query)
    started = time.monotonic()
    with transaction.atomic():
        with connection.cursor() as cursor:
            if connection.vendor == "postgresql":
                cursor.execute("SET LOCAL statement_timeout = 3000")
                cursor.execute("SET TRANSACTION READ ONLY")
                cursor.execute(f"EXPLAIN (FORMAT JSON, COSTS TRUE, VERBOSE FALSE) {query}")
                plan = cursor.fetchone()[0]
            else:
                cursor.execute(f"EXPLAIN QUERY PLAN {query}")
                plan = [list(row) for row in cursor.fetchall()]
    return {
        "database": connection.vendor,
        "plan": plan,
        "duration_ms": int((time.monotonic() - started) * 1000),
    }
