from .adoption import queue_activity


class CustomerActivityMiddleware:
    """Successful customer domain mutations only; GET/polling never counts."""
    domains = {"farms", "livestock", "crops", "inventory", "finance", "tasks"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        parts = request.path.strip("/").split("/")
        if (request.method in {"POST", "PUT", "PATCH", "DELETE"}
                and 200 <= response.status_code < 300
                and len(parts) >= 3 and parts[:2] == ["api", "v1"]
                and parts[2] in self.domains
                and parts[2:] != ["inventory", "alertas", "gerar_alertas"]):
            queue_activity(getattr(request, "user", None), "operation")
        return response
