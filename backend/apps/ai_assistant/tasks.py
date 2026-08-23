from celery import shared_task

from .models import AIModelSyncRun
from .services.model_catalog import sync_opencode_zen_models
from .services.providers import AIProviderError


@shared_task(
    bind=True,
    name="apps.ai_assistant.tasks.sync_opencode_zen_models_task",
    autoretry_for=(AIProviderError,),
    retry_backoff=60,
    retry_backoff_max=900,
    retry_jitter=True,
    max_retries=3,
)
def sync_opencode_zen_models_task(self, trigger=AIModelSyncRun.Trigger.SCHEDULED):
    """Refresh the Zen catalog; Celery retries transient provider failures."""
    valid_triggers = {value for value, _ in AIModelSyncRun.Trigger.choices}
    if trigger not in valid_triggers:
        trigger = AIModelSyncRun.Trigger.SCHEDULED
    result = sync_opencode_zen_models(trigger=trigger)
    return {
        "run_id": result.run_id,
        "models_found": result.models_found,
        "free_models_found": result.free_models_found,
        "models_created": result.models_created,
        "models_updated": result.models_updated,
        "models_unavailable": result.models_unavailable,
    }
