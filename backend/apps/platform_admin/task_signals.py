from celery.signals import before_task_publish, task_failure, task_postrun, task_prerun
from django.utils import timezone

from .models import BackgroundTaskRun


def _safe_text(value, limit=1000):
    return str(value or "")[:limit]


@before_task_publish.connect
def task_queued(sender=None, headers=None, **kwargs):
    task_id = (headers or {}).get("id")
    if task_id:
        BackgroundTaskRun.objects.get_or_create(task_id=task_id, defaults={"task_name": sender or "unknown"})


@task_prerun.connect
def task_started(task_id=None, task=None, **kwargs):
    BackgroundTaskRun.objects.update_or_create(
        task_id=task_id,
        defaults={"task_name": task.name, "status": BackgroundTaskRun.Status.RUNNING, "started_at": timezone.now()},
    )


@task_postrun.connect
def task_finished(task_id=None, task=None, retval=None, state=None, **kwargs):
    run, _ = BackgroundTaskRun.objects.get_or_create(task_id=task_id, defaults={"task_name": task.name})
    run.status = BackgroundTaskRun.Status.SUCCESS if state == "SUCCESS" else run.status
    run.finished_at = timezone.now()
    if run.started_at:
        run.duration_ms = int((run.finished_at - run.started_at).total_seconds() * 1000)
    run.result_summary = _safe_text(retval)
    run.save()


@task_failure.connect
def task_failed(task_id=None, exception=None, sender=None, **kwargs):
    run, _ = BackgroundTaskRun.objects.get_or_create(task_id=task_id, defaults={"task_name": getattr(sender, "name", "unknown")})
    run.status = BackgroundTaskRun.Status.FAILURE
    run.finished_at = timezone.now()
    run.error_class = exception.__class__.__name__ if exception else "Error"
    run.error_message = _safe_text(exception)
    run.save()
