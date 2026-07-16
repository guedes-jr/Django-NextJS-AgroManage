from .models import PlatformAuditLog


def record_platform_action(
    *, request, action, organization=None, object_type="", object_id="", description="", extra_data=None
):
    """Record a backoffice action with request metadata."""

    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip_address = forwarded_for.split(",")[0].strip() if forwarded_for else request.META.get("REMOTE_ADDR")

    return PlatformAuditLog.objects.create(
        actor=request.user,
        organization=organization,
        action=action,
        object_type=object_type,
        object_id=str(object_id) if object_id else "",
        description=description,
        ip_address=ip_address or None,
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:512],
        request_id=request.META.get("HTTP_X_REQUEST_ID", "")[:100],
        extra_data=extra_data or {},
    )
