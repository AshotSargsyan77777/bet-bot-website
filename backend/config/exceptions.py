"""Uniform API error shape: {"error": str, "code": str, "fields": {field: [messages]}?}."""

import logging

from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger("api")


def _first_message(data) -> str:
    if isinstance(data, list) and data:
        return _first_message(data[0])
    if isinstance(data, dict) and data:
        key, value = next(iter(data.items()))
        msg = _first_message(value)
        return msg if key in ("non_field_errors", "detail") else f"{key}: {msg}"
    return str(data)


def api_exception_handler(exc, context):
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied()

    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API error", exc_info=exc)
        return Response(
            {"error": "Սերվերի ներքին սխալ", "code": "server_error"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    payload: dict = {"code": getattr(exc, "default_code", "error")}
    if isinstance(exc, exceptions.ValidationError) and isinstance(response.data, dict):
        fields = {k: v if isinstance(v, list) else [v] for k, v in response.data.items() if k != "non_field_errors"}
        payload["error"] = _first_message(response.data)
        if fields:
            payload["fields"] = fields
    elif isinstance(exc, exceptions.APIException):
        detail = exc.detail
        payload["error"] = _first_message(detail) if not isinstance(detail, str) else str(detail)
        if hasattr(exc, "get_codes") and isinstance(exc.get_codes(), str):
            payload["code"] = exc.get_codes()
    else:
        payload["error"] = _first_message(response.data)
    response.data = payload
    return response
