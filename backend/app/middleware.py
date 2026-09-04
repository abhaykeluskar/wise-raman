import time
import uuid
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, Response

logger = logging.getLogger(__name__)

class RequestTrackingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
        # Set correlation_id in request state for downstream handlers
        request.state.correlation_id = correlation_id

        start_time = time.time()
        try:
            response: Response = await call_next(request)
        except Exception as e:
            process_time = (time.time() - start_time) * 1000
            logger.error(
                f"[{correlation_id}] {request.method} {request.url.path} failed in {process_time:.2f}ms: {e}"
            )
            raise e

        process_time = (time.time() - start_time) * 1000
        response.headers["X-Correlation-ID"] = correlation_id
        response.headers["X-Process-Time"] = f"{process_time:.2f}ms"

        # Log request summary
        if not request.url.path.startswith("/api/backend/logs") and not request.url.path.startswith("/api/ai/logs"):
            logger.info(
                f"[{correlation_id}] {request.method} {request.url.path} {response.status_code} in {process_time:.2f}ms"
            )

        return response
