from .models import AuditLog


def record_client_action(*, request, action, model_name="", object_id="", description="", extra_data=None):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip_address = forwarded_for.split(",")[0].strip() if forwarded_for else request.META.get("REMOTE_ADDR")
    return AuditLog.objects.create(
        user=request.user,
        organization=getattr(request.user, "organization", None),
        action=action,
        model_name=model_name,
        object_id=str(object_id) if object_id else "",
        description=description,
        ip_address=ip_address or None,
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:512],
        extra_data=extra_data or {},
    )
