"""Stable business-error responses shared by API routes."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse


class BusinessAPIError(Exception):
    """An expected API failure with a client-stable code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


def install_business_error_handler(app: FastAPI) -> None:
    @app.exception_handler(BusinessAPIError)
    async def _business_error_handler(_request, exc: BusinessAPIError):
        body: dict[str, Any] = {
            "code": exc.code,
            "message": exc.message,
        }
        if exc.details is not None:
            body["details"] = exc.details
        return JSONResponse(status_code=exc.status_code, content=body)
