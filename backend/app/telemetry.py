import asyncio
import json
import logging
from typing import AsyncGenerator
from datetime import datetime

logger = logging.getLogger(__name__)

class TelemetryLogger:
    def __init__(self, name: str = "telemetry"):
        self.name = name
        self.subscribers = set()
        self.history = []  # Ring buffer of recent telemetry logs

    def log(self, message: str, level: str = "INFO", meta: dict = None):
        timestamp = datetime.now().strftime("%H:%M:%S")
        event = {
            "timestamp": timestamp,
            "message": message,
            "level": level,
            "meta": meta or {}
        }
        self.history.append(event)
        if len(self.history) > 100:
            self.history.pop(0)
            
        logger.info(f"[{self.name.upper()}] {timestamp} - {message}")

        # Broadcast to all live SSE subscribers
        for queue in list(self.subscribers):
            try:
                queue.put_nowait(event)
            except Exception:
                pass

    async def subscribe(self) -> AsyncGenerator[dict, None]:
        queue = asyncio.Queue()
        # Seed new subscribers with recent history
        for item in self.history[-25:]:
            await queue.put(item)
        self.subscribers.add(queue)
        try:
            while True:
                item = await queue.get()
                yield item
        except asyncio.CancelledError:
            pass
        finally:
            if queue in self.subscribers:
                self.subscribers.remove(queue)

backend_telemetry = TelemetryLogger("backend")
ai_telemetry = TelemetryLogger("ai")

# Default alias for backward compatibility
telemetry = backend_telemetry
