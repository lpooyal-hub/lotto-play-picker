import os


class Settings:
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    supabase_key = os.getenv("SUPABASE_SECRET_KEY", "")
    cron_secret = os.getenv("CRON_SECRET", "")
    scheduler_enabled = os.getenv("ENABLE_WEEKLY_SCHEDULER", "false").lower() in {"1", "true", "yes", "on"}
    scheduler_cron = os.getenv("WEEKLY_SCHEDULER_CRON", "35 21 * * 6")
    scheduler_timezone = os.getenv("WEEKLY_SCHEDULER_TIMEZONE", "Asia/Seoul")


settings = Settings()
