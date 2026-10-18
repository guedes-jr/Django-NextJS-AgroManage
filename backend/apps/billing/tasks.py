import logging
from celery import shared_task
from .quotas import reconcile_storage

logger = logging.getLogger(__name__)


@shared_task
def reconcile_organization_storage():
    from apps.organizations.models import Organization
    completed = failed = 0
    for organization_id in Organization.objects.values_list("pk", flat=True).iterator(chunk_size=200):
        try:
            reconcile_storage(organization_id)
            completed += 1
        except Exception:
            failed += 1
            logger.warning("Storage reconciliation failed for organization %s", organization_id)
    return {"completed": completed, "failed": failed}
