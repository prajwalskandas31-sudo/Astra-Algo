from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

ALLOWED_STATIC_IPS = os.getenv("ALLOWED_STATIC_IPS", "127.0.0.1,localhost").split(",")

class IPGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "127.0.0.1"
        # Normalize IPv6 localhost
        if client_ip in ["::1", "localhost", "127.0.0.1", "testclient"]:
            allowed = True
        else:
            allowed = client_ip in ALLOWED_STATIC_IPS or "0.0.0.0" in ALLOWED_STATIC_IPS

        if not allowed:
            return JSONResponse(status_code=403, content={"detail": f"Access forbidden: IP {client_ip} not allowed"})
        response = await call_next(request)
        return response
