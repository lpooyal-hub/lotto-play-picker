import os


class Settings:
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    supabase_key = os.getenv("SUPABASE_SECRET_KEY", "")
    cron_secret = os.getenv("CRON_SECRET", "")
    scheduler_timezone = os.getenv("WEEKLY_SCHEDULER_TIMEZONE", "Asia/Seoul")

    scheduler_enabled = os.getenv("ENABLE_WEEKLY_SCHEDULER", "false").lower() in {"1", "true", "yes", "on"}
    scheduler_cron = os.getenv("WEEKLY_SCHEDULER_CRON", "0 0 * * *")

    lotto_scheduler_enabled = os.getenv("ENABLE_LOTTO_SCHEDULER", str(scheduler_enabled)).lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    lotto_scheduler_cron = os.getenv("LOTTO_SCHEDULER_CRON", scheduler_cron)

    pension720_scheduler_enabled = os.getenv("ENABLE_PENSION720_SCHEDULER", str(scheduler_enabled)).lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    pension720_scheduler_cron = os.getenv("PENSION720_SCHEDULER_CRON", "10 0 * * *")


settings = Settings()
