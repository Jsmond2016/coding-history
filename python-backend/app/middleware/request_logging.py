"""FastAPI middleware for logging API requests to the RequestLog table."""

import asyncio
import json
import time
from typing import Optional

from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# Sensitive field names to redact from logged request bodies
SENSITIVE_FIELDS = frozenset({
    "password", "secret", "token", "authorization",
    "apiKey", "api_key", "access_token", "refresh_token",
})


def _sanitize_body(body: Optional[str], max_length: int = 2000) -> Optional[str]:
    """Sanitize a request/response body by redacting sensitive fields."""
    if not body:
        return None

    try:
        data = json.loads(body)
        if isinstance(data, dict):
            for key in list(data.keys()):
                if key.lower() in SENSITIVE_FIELDS:
                    data[key] = "***REDACTED***"
            return json.dumps(data, ensure_ascii=False)[:max_length]
    except (json.JSONDecodeError, TypeError):
        pass

    return body[:max_length]


def _extract_route_name(path: str, max_segments: int = 4) -> str:
    """Extract a short route name from the URL path (first N segments)."""
    parts = [p for p in path.split("/") if p]
    return "/".join(parts[:max_segments])


def _extract_module(path: str) -> Optional[str]:
    """Extract the module name (3rd path segment after /api/v1/)."""
    parts = [p for p in path.split("/") if p]
    # Expected: api, v1, <module>, ...
    if len(parts) >= 3:
        return parts[2]
    return None


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that logs API requests to the request_logs table.

    Only logs requests matching /api/v1/*.
    """

    async def dispatch(self, request: Request, call_next):
        # Only log API requests
        if not request.url.path.startswith("/api/v1/"):
            return await call_next(request)

        start_time = time.time()
        request_body = None

        # Capture request body for write methods
        if request.method in ("POST", "PUT", "PATCH"):
            try:
                raw_body = await request.body()
                if raw_body:
                    request_body = _sanitize_body(raw_body.decode("utf-8", errors="replace"))
            except Exception:
                request_body = None

        # Execute the request
        response = await call_next(request)

        duration_ms = int((time.time() - start_time) * 1000)

        # Capture response body for errors
        response_body = None
        if hasattr(response, "status_code") and response.status_code and response.status_code >= 400:
            try:
                # Read the response body
                body_chunks = []
                async for chunk in response.body_iterator:
                    body_chunks.append(chunk)
                full_body = b"".join(body_chunks)

                if full_body:
                    response_body = _sanitize_body(
                        full_body.decode("utf-8", errors="replace"),
                        max_length=4000,
                    )

                # Reconstruct the response so the client still receives it
                from starlette.responses import Response as StarletteResponse

                new_response = StarletteResponse(
                    content=full_body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                )
                response = new_response
            except Exception as exc:
                logger.debug(f"[RequestLogging] failed to capture error body: {exc}")

        # Fire-and-forget log write
        route_name = _extract_route_name(request.url.path)
        module = _extract_module(request.url.path)

        async def _write_log():
            try:
                from app.core.database import async_session_factory
                from app.services.log_service import LogService

                async with async_session_factory() as session:
                    svc = LogService()
                    await svc.create_request_log(
                        session,
                        method=request.method,
                        url=str(request.url.path),
                        route_name=route_name,
                        module=module,
                        status_code=response.status_code or 0,
                        request_body=request_body,
                        response_body=response_body,
                        duration=duration_ms,
                    )
                    await session.commit()
            except Exception as exc:
                logger.debug(f"[RequestLogging] failed to write log: {exc}")

        asyncio.create_task(_write_log())

        return response
