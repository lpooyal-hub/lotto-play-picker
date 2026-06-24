from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .scheduler import shutdown_scheduler, start_scheduler
from .service import (
    check_prediction_results,
    generate_weekly_prediction,
    run_weekly_maintenance,
    sync_draws,
    sync_pension720_draws,
)
from .store import fetch_predictions, fetch_pension720_draws


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(title="Lotto Play Picker API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://lotto-play-picker.vercel.app", "https://lotto.42222.cloud"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def require_cron_secret(authorization: str | None) -> None:
    if not settings.cron_secret:
        return

    provided = (authorization or "").replace("Bearer ", "")
    if provided != settings.cron_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/predictions")
def predictions():
    try:
        return {"predictions": fetch_predictions()}
    except Exception as exc:
        return {"predictions": [], "error": str(exc)}


@app.get("/api/pension720/draws")
def pension720_draws():
    try:
        return {"draws": list(reversed(fetch_pension720_draws(limit=20)))}
    except Exception as exc:
        return {"draws": [], "error": str(exc)}


@app.post("/api/sync-draws")
def sync_draws_route(authorization: str | None = Header(default=None)):
    try:
        require_cron_secret(authorization)
        return {"ok": True, **sync_draws()}
    except HTTPException:
        raise
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.post("/api/sync-pension720-draws")
def sync_pension720_draws_route(authorization: str | None = Header(default=None)):
    try:
        require_cron_secret(authorization)
        return {"ok": True, **sync_pension720_draws()}
    except HTTPException:
        raise
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.post("/api/generate-weekly")
def generate_weekly_route(authorization: str | None = Header(default=None)):
    try:
        require_cron_secret(authorization)
        return {"ok": True, "prediction": generate_weekly_prediction()}
    except HTTPException:
        raise
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.post("/api/check-result")
def check_result_route(authorization: str | None = Header(default=None)):
    try:
        require_cron_secret(authorization)
        return {"ok": True, "checked": check_prediction_results()}
    except HTTPException:
        raise
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.post("/api/run-weekly-maintenance")
def run_weekly_maintenance_route(authorization: str | None = Header(default=None)):
    try:
        require_cron_secret(authorization)
        return {"ok": True, **run_weekly_maintenance()}
    except HTTPException:
        raise
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
