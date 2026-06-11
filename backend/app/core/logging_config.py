"""
backend/app/core/logging_config.py
Configures structured JSON logging for production and pretty console
logging for development. Called once from main.py at startup.
"""
import logging
import sys
from app.core.config import settings


class DevFormatter(logging.Formatter):
    """Coloured, human-readable formatter for local development."""
    COLOURS = {
        logging.DEBUG:    "\033[36m",   # cyan
        logging.INFO:     "\033[32m",   # green
        logging.WARNING:  "\033[33m",   # yellow
        logging.ERROR:    "\033[31m",   # red
        logging.CRITICAL: "\033[35m",   # magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        colour = self.COLOURS.get(record.levelno, "")
        level = f"{colour}{record.levelname:<8}{self.RESET}"
        return f"{level} {record.name:<30} {record.getMessage()}"


class JsonFormatter(logging.Formatter):
    """
    Structured JSON log lines for production log aggregators
    (CloudWatch, Datadog, Loki, etc.).
    Each line is valid JSON: {"level":"INFO","logger":"...","message":"...","time":"..."}
    """
    import json as _json
    from datetime import datetime, timezone

    def format(self, record: logging.LogRecord) -> str:
        import json
        from datetime import datetime, timezone
        payload = {
            "time": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    """
    Sets up root logger and silences noisy third-party libraries.
    Call this once at application startup (main.py lifespan).
    """
    root = logging.getLogger()
    root.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

    # Remove any existing handlers (avoid duplicate logs in tests)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    if settings.ENVIRONMENT == "development":
        handler.setFormatter(DevFormatter())
    else:
        handler.setFormatter(JsonFormatter())

    root.addHandler(handler)

    # Silence noisy libraries in production
    for noisy in ("uvicorn.access", "sqlalchemy.engine", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(
            logging.DEBUG if settings.DEBUG else logging.WARNING
        )
