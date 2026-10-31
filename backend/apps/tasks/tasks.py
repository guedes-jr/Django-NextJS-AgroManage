from celery import shared_task


@shared_task
def collect_agenda_reminders():
    from .reminders import collect_reminders
    return collect_reminders()
