from celery import shared_task
from apps.organizations.models import Organization
from .adoption import aggregate_organization


@shared_task
def refresh_organization_adoption():
    completed = 0
    for organization_id in Organization.objects.values_list("pk", flat=True).iterator(chunk_size=200):
        aggregate_organization(organization_id)
        completed += 1
    return {"completed": completed}


@shared_task
def process_organization_batch(batch_id):
    from .organization_batches import process_batch
    process_batch(batch_id)


@shared_task
def resume_organization_batches():
    from .models import OrganizationBatch
    for batch_id in OrganizationBatch.objects.filter(status__in=["queued", "running"]).values_list("pk", flat=True).iterator(chunk_size=100):
        process_organization_batch.delay(str(batch_id))


@shared_task
def refresh_organization_quota_snapshots():
    from django.utils import timezone
    from apps.billing.quotas import organization_usage
    from .models import OrganizationQuotaSnapshot
    completed = 0
    for organization_id in Organization.objects.values_list("pk", flat=True).iterator(chunk_size=200):
        usage = organization_usage(organization_id)
        near_limit = any(resource["status"] != "normal" for resource in usage["resources"].values())
        OrganizationQuotaSnapshot.objects.update_or_create(organization_id=organization_id, defaults={"near_limit": near_limit, "calculated_at": timezone.now()})
        completed += 1
    return {"completed": completed}


@shared_task
def generate_organization_export(job_id):
    from .exports.service import generate_export
    generate_export(job_id)


@shared_task
def maintain_organization_exports():
    from .exports.service import maintain_exports
    maintain_exports()


@shared_task
def process_organization_recovery(job_id):
    from .recovery.service import process_recovery
    process_recovery(job_id)


@shared_task
def maintain_organization_recoveries():
    from .recovery.service import maintain_recoveries
    maintain_recoveries()
