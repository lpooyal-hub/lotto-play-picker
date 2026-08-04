from __future__ import annotations

import logging
import threading
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import settings
from .service import ensure_lotto_current

logger = logging.getLogger("uvicorn.error")

_scheduler: BackgroundScheduler | None = None


def _run_lotto_job() -> None:
    try:
        result = ensure_lotto_current()
        logger.info("Lotto daily ensure completed: %s", result)
    except Exception:
        logger.exception("Lotto daily ensure failed")


def _run_lotto_startup_catchup() -> None:
    try:
        result = ensure_lotto_current()
        logger.info("Lotto startup catch-up completed: %s", result)
    except Exception:
        logger.exception("Lotto startup catch-up failed")


def get_scheduler() -> BackgroundScheduler:
    global _scheduler

    if _scheduler is None:
        timezone = ZoneInfo(settings.scheduler_timezone)
        scheduler = BackgroundScheduler(timezone=timezone)

        if settings.lotto_scheduler_enabled:
            scheduler.add_job(
                _run_lotto_job,
                CronTrigger.from_crontab(settings.lotto_scheduler_cron, timezone=timezone),
                id="lotto-maintenance",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
            )

        _scheduler = scheduler

    return _scheduler


def start_scheduler() -> None:
    if not settings.lotto_scheduler_enabled:
        logger.info("Lotto scheduler disabled.")
        return

    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.start()
        logger.info("Schedulers started (%s).", settings.scheduler_timezone)
        logger.info("Lotto scheduler cron: %s", settings.lotto_scheduler_cron)
        logger.info("Startup catch-up workers scheduled.")
        threading.Timer(2.0, _run_lotto_startup_catchup).start()


def shutdown_scheduler() -> None:
    global _scheduler

    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Weekly scheduler stopped.")
