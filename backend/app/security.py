"""
Request authentication for write endpoints, and HTTP security headers.

The dashboard itself is a public, read-only demo, so read endpoints stay open.
Two kinds of writes are protected:

* Admin actions (wiping/regenerating demo data, bulk-saving recommendations)
  need the X-Admin-Token header to match ADMIN_TOKEN.
* Sensor ingestion needs the X-API-Key header to match TELEMETRY_API_KEY, so
  only the store's devices can post readings.

In development an unset secret leaves the endpoint open for convenience. In
production an unset secret disables the endpoint instead of exposing it.
"""
import hmac
from typing import Optional

from fastapi import Header, HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings


def _check(secret: str, provided: Optional[str], name: str, header: str) -> None:
    if not secret:
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action is disabled. Set {name} on the server to enable it.",
            )
        return  # development: open when no secret is configured
    if not provided or not hmac.compare_digest(provided.encode(), secret.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Missing or invalid {header} header.",
        )


def require_admin(x_admin_token: Optional[str] = Header(default=None)) -> None:
    _check(settings.ADMIN_TOKEN, x_admin_token, "ADMIN_TOKEN", "X-Admin-Token")


def require_telemetry_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    _check(settings.TELEMETRY_API_KEY, x_api_key, "TELEMETRY_API_KEY", "X-API-Key")


def admin_access_mode() -> str:
    """'open' | 'token' | 'disabled', so the UI can show the right controls."""
    if settings.ADMIN_TOKEN:
        return "token"
    return "disabled" if settings.is_production else "open"


# The Swagger/ReDoc pages load their JS and CSS from jsDelivr and use inline
# bootstrapping scripts, so they get a looser policy than the JSON API.
_DOCS_PATHS = ("/docs", "/redoc")
_DOCS_CSP = (
    "default-src 'none'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com; "
    "img-src 'self' data: https://fastapi.tiangolo.com https://cdn.redoc.ly; "
    "connect-src 'self'; "
    "worker-src blob:; "
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)
# JSON responses never need to load anything
_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        h = response.headers
        is_docs = request.url.path.startswith(_DOCS_PATHS)
        h.setdefault("Content-Security-Policy", _DOCS_CSP if is_docs else _API_CSP)
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "no-referrer")
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        h.setdefault("Cross-Origin-Resource-Policy", "same-site")
        h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
        # Browsers ignore HSTS on plain-HTTP responses, so this is safe in dev
        h.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
        if request.url.path.startswith("/api/"):
            # Inventory data changes constantly and may be sensitive; never cache it
            h.setdefault("Cache-Control", "no-store")
        return response
