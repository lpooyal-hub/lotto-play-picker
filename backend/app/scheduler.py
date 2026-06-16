from __future__ import annotations

import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import settings
from .service import run_weekly_maintenance

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_weekly_job() -> None:
    try:
        result = run_weekly_maintenance()
        logger.info("Weekly lotto maintenance completed: %s", result)
    except Exception:
        logger.exception("Weekly lotto maintenance failed")


def get_scheduler() -> BackgroundScheduler:
    global _scheduler

    if _scheduler is None:
        timezone = ZoneInfo(settings.scheduler_timezone)
        scheduler = BackgroundScheduler(timezone=timezone)
        scheduler.add_job(
            _run_weekly_job,
            CronTrigger.from_crontab(settings.scheduler_cron, timezone=timezone),
            id="weekly-lotto-maintenance",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        _scheduler = scheduler

    return _scheduler


def start_scheduler() -> None:
    if not settings.scheduler_enabled:
        logger.info("Weekly scheduler disabled.")
        return

    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.start()
        logger.info(
            "Weekly scheduler started with cron '%s' (%s).",
            settings.scheduler_cron,
            settings.scheduler_timezone,
        )


def shutdown_scheduler() -> None:
    global _scheduler

    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Weekly scheduler stopped.")
