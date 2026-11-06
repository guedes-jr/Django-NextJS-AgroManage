"""
Custom exception handler for standardized API error responses.
"""
import logging
from django.utils.translation import gettext as _
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Returns all API errors in a consistent envelope:
    {
        "error": {
            "code": "...",
            "message": "...",
            "detail": ...
        }
    }
    """
    response = exception_handler(exc, context)

    if response is not None:
        error_payload = {
            "error": {
                "code": _get_error_code(response.status_code),
                "message": _get_error_message(response.status_code),
                "detail": response.data,
            }
        }
        response.data = error_payload
        return response

    # Unexpected exceptions — log and return 500
    logger.exception("Unhandled exception in view: %s", exc)
    return Response(
        {
            "error": {
                "code": "internal_error",
                "message": _("An unexpected error occurred. Please try again later."),
                "detail": None,
            }
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def _get_error_code(status_code: int) -> str:
    codes = {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        422: "validation_error",
        429: "too_many_requests",
        500: "internal_error",
    }
    return codes.get(status_code, "error")


def _get_error_message(status_code: int) -> str:
    messages = {
        400: _("Bad request."),
        401: _("Authentication credentials were not provided or are invalid."),
        403: _("You do not have permission to perform this action."),
        404: _("The requested resource was not found."),
        405: _("Method not allowed."),
        409: _("Conflict with an existing resource."),
        422: _("Validation failed."),
        429: _("Too many requests."),
        500: _("Internal server error."),
    }
    return messages.get(status_code, _("An error occurred."))
