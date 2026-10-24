"""Thin client for the two Elexon Insights (BMRS) datasets the app uses.

No API key is required. Both endpoints are the `/stream` variants, which return
a plain JSON array without paging.
"""

from __future__ import annotations

import time as _time
from datetime import date, datetime, timedelta

import httpx

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"


def _get(client: httpx.Client, path: str, params: dict[str, str], retries: int = 4) -> list[dict]:
    for attempt in range(retries):
        try:
            response = client.get(f"{BASE_URL}/{path}", params=params)
            response.raise_for_status()
            return response.json()
        except (httpx.TransportError, httpx.HTTPStatusError):
            if attempt == retries - 1:
                raise
            _time.sleep(2**attempt)
    return []


def fetch_wind_actuals(client: httpx.Client, first: date, last: date) -> list[dict]:
    """FUELHH half-hourly outturn for fuelType WIND, settlement dates first..last."""
    rows: list[dict] = []
    day = first
    while day <= last:
        chunk_end = min(day + timedelta(days=6), last)
        rows += _get(
            client,
            "FUELHH/stream",
            {
                "settlementDateFrom": day.isoformat(),
                "settlementDateTo": chunk_end.isoformat(),
                "fuelType": "WIND",
            },
        )
        day = chunk_end + timedelta(days=1)
    return [r for r in rows if r.get("fuelType") == "WIND"]


def fetch_wind_forecasts(client: httpx.Client, published_from: datetime, published_to: datetime) -> list[dict]:
    """WINDFOR hourly forecasts for every run published in [published_from, published_to]."""
    rows: list[dict] = []
    start = published_from
    while start < published_to:
        end = min(start + timedelta(days=3), published_to)
        rows += _get(
            client,
            "WINDFOR/stream",
            {
                "publishDateTimeFrom": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "publishDateTimeTo": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        )
        start = end
    return rows
