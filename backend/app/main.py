"""FastAPI app. All routes live under /api so the same app works behind Vercel's
rewrite, in Docker (where it also serves the built React app) and in local dev."""

from __future__ import annotations

import os
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from . import analysis
from .config import (
    CONFIDENCE_LEVELS,
    DECISION_FIRST,
    DECISION_LAST,
    DEFAULT_CONFIDENCE,
    DEFAULT_GATE,
    DELIVERY_FIRST,
    DELIVERY_LAST,
    GATE_CLOSURES,
    MAX_HORIZON_HOURS,
)
from .data import get_data

GateId = Literal["epex-60", "n2ex", "epex-30"]
EXPLORER_FIRST = DELIVERY_FIRST - timedelta(days=1)

app = FastAPI(
    title="Wind Forecast Desk API",
    version="1.0.0",
    description="Day-ahead wind forecasts vs outturn for GB, decisions made in January 2026.",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def cache_headers(request: Request, call_next):
    response = await call_next(request)
    # The data is a fixed historical snapshot, so API responses can be cached hard at the edge.
    if request.url.path.startswith("/api/") and response.status_code == 200 and request.method == "GET":
        response.headers.setdefault("Cache-Control", "public, max-age=600, s-maxage=86400")
    return response


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta", summary="Analysis window, auctions and snapshot details")
def meta() -> dict:
    data = get_data()
    schedule = Counter(run.publish_time.strftime("%H:%M") for run in data.runs)
    return {
        "decisionDays": {"first": DECISION_FIRST.isoformat(), "last": DECISION_LAST.isoformat()},
        "deliveryDays": [d.isoformat() for d in analysis.delivery_days()],
        "explorerDays": {"first": EXPLORER_FIRST.isoformat(), "last": DELIVERY_LAST.isoformat()},
        "gates": [analysis.gate_json(g) for g in GATE_CLOSURES],
        "defaultGate": DEFAULT_GATE.id,
        "confidenceLevels": list(CONFIDENCE_LEVELS),
        "defaultConfidence": DEFAULT_CONFIDENCE,
        "maxHorizonHours": MAX_HORIZON_HOURS,
        # Regular WINDFOR runs (UTC); one-off re-runs appear once and are dropped here.
        "publishScheduleUtc": sorted(t for t, n in schedule.items() if n > 1),
        "snapshot": data.meta,
    }


@app.get("/api/day/{day}", summary="Decision-time forecast vs actual for one delivery day")
def day_view(
    day: date,
    gate: GateId = DEFAULT_GATE.id,
    confidence: Annotated[float, Query(description="One of the configured confidence levels")] = DEFAULT_CONFIDENCE,
) -> dict:
    if not DELIVERY_FIRST <= day <= DELIVERY_LAST:
        raise HTTPException(404, f"Delivery days run {DELIVERY_FIRST} to {DELIVERY_LAST}")
    if confidence not in CONFIDENCE_LEVELS:
        raise HTTPException(422, f"confidence must be one of {list(CONFIDENCE_LEVELS)}")
    return analysis.day_view(day, gate, confidence)


@app.get("/api/accuracy", summary="Accuracy of the forecasts available at gate closure, all January decisions")
def accuracy(gate: GateId = DEFAULT_GATE.id) -> dict:
    return analysis.accuracy_report(gate)


@app.get("/api/horizons", summary="Error vs forecast horizon (0-48 h)")
def horizons() -> dict:
    return analysis.horizon_report()


@app.get("/api/explorer", summary="Actual vs the forecast available N hours ahead, for a date range")
def explorer(
    start: date,
    end: date,
    horizon: Annotated[float, Query(ge=0, le=MAX_HORIZON_HOURS)] = 4,
) -> dict:
    if not EXPLORER_FIRST <= start <= end <= DELIVERY_LAST:
        raise HTTPException(422, f"Choose dates between {EXPLORER_FIRST} and {DELIVERY_LAST}, start <= end")
    return analysis.explorer(start, end, horizon)


# In Docker the API also serves the compiled frontend; on Vercel the CDN does.
_dist = Path(os.getenv("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
