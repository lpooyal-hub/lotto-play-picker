from __future__ import annotations

import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from .config import settings
from .service import ensure_lotto_current, ensure_pension720_current, run_lotto_maintenance, run_pension720_maintenance

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_lotto_job() -> None:
    try:
        result = run_lotto_maintenance()
        logger.info("Lotto maintenance completed: %s", result)
    except Exception:
        logger.exception("Lotto maintenance failed")


def _run_pension720_job() -> None:
    try:
        result = run_pension720_maintenance()
        logger.info("Pension720 maintenance completed: %s", result)
    except Exception:
        logger.exception("Pension720 maintenance failed")


def _run_lotto_startup_catchup() -> None:
    try:
        result = ensure_lotto_current()
        logger.info("Lotto startup catch-up completed: %s", result)
    except Exception:
        logger.exception("Lotto startup catch-up failed")


def _run_pension720_startup_catchup() -> None:
    try:
        result = ensure_pension720_current()
        logger.info("Pension720 startup catch-up completed: %s", result)
    except Exception:
        logger.exception("Pension720 startup catch-up failed")


def _run_lotto_ensure_job() -> None:
    try:
        result = ensure_lotto_current()
        logger.info("Lotto ensure check completed: %s", result)
    except Exception:
        logger.exception("Lotto ensure check failed")


def _run_pension720_ensure_job() -> None:
    try:
        result = ensure_pension720_current()
        logger.info("Pension720 ensure check completed: %s", result)
    except Exception:
        logger.exception("Pension720 ensure check failed")


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
            scheduler.add_job(
                _run_lotto_ensure_job,
                IntervalTrigger(minutes=settings.lotto_scheduler_ensure_interval_minutes, timezone=timezone),
                id="lotto-ensure",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
            )

        if settings.pension720_scheduler_enabled:
            scheduler.add_job(
                _run_pension720_job,
                CronTrigger.from_crontab(settings.pension720_scheduler_cron, timezone=timezone),
                id="pension720-maintenance",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
            )
            scheduler.add_job(
                _run_pension720_ensure_job,
                IntervalTrigger(minutes=settings.pension720_scheduler_ensure_interval_minutes, timezone=timezone),
                id="pension720-ensure",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
            )

        _scheduler = scheduler

    return _scheduler


def start_scheduler() -> None:
    if not settings.lotto_scheduler_enabled and not settings.pension720_scheduler_enabled:
        logger.info("All schedulers disabled.")
        return

    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.start()
        logger.info("Schedulers started (%s).", settings.scheduler_timezone)
        if settings.lotto_scheduler_enabled:
            logger.info("Lotto scheduler cron: %s", settings.lotto_scheduler_cron)
            logger.info(
                "Lotto ensure interval: every %s minutes",
                settings.lotto_scheduler_ensure_interval_minutes,
            )
        if settings.pension720_scheduler_enabled:
            logger.info("Pension720 scheduler cron: %s", settings.pension720_scheduler_cron)
            logger.info(
                "Pension720 ensure interval: every %s minutes",
                settings.pension720_scheduler_ensure_interval_minutes,
            )

        # If the container was down during the scheduled time, recover the missed work once on startup.
        if settings.lotto_scheduler_enabled:
            _run_lotto_startup_catchup()
        if settings.pension720_scheduler_enabled:
            _run_pension720_startup_catchup()


def shutdown_scheduler() -> None:
    global _scheduler

    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Weekly scheduler stopped.")
