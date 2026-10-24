"""Download the January 2026 wind data from Elexon and write the app's snapshot file.

    python -m backend.app.ingest            # writes backend/data/wind_jan2026.json

The deployed app reads this snapshot instead of calling Elexon on every request:
the analysis window is fixed (decisions made in January 2026), so a snapshot
keeps responses fast, the numbers reproducible, and Elexon un-hammered.
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, date, datetime
from pathlib import Path

import httpx

from .config import DATA_FILE
from .elexon import fetch_wind_actuals, fetch_wind_forecasts

# Margins around the analysis window: 48 h horizons need runs from 30 Dec, and
# delivery day 1 Feb needs actuals up to the end of 1 Feb.
ACTUALS_FROM = date(2025, 12, 31)
ACTUALS_TO = date(2026, 2, 2)
FORECASTS_FROM = datetime(2025, 12, 29, tzinfo=UTC)
FORECASTS_TO = datetime(2026, 2, 2, tzinfo=UTC)


def build_snapshot(actual_rows: list[dict], forecast_rows: list[dict]) -> dict:
    # FUELHH can re-publish a settlement period; keep the latest publication.
    latest: dict[str, tuple[str, int]] = {}
    for row in actual_rows:
        key = row["startTime"]
        if key not in latest or row["publishTime"] > latest[key][0]:
            latest[key] = (row["publishTime"], row["generation"])
    actuals = sorted([start, gen] for start, (_, gen) in latest.items())

    runs: dict[str, dict[str, int]] = {}
    for row in forecast_rows:
        runs.setdefault(row["publishTime"], {})[row["startTime"]] = row["generation"]
    forecasts = [
        {"publishTime": publish, "points": sorted([start, gen] for start, gen in points.items())}
        for publish, points in sorted(runs.items())
    ]

    return {
        "meta": {
            "source": "Elexon Insights Solution (BMRS) API: FUELHH (fuelType WIND) and WINDFOR",
            "generatedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "actualsSettlementDates": [ACTUALS_FROM.isoformat(), ACTUALS_TO.isoformat()],
            "forecastPublishWindow": [
                FORECASTS_FROM.strftime("%Y-%m-%dT%H:%M:%SZ"),
                FORECASTS_TO.strftime("%Y-%m-%dT%H:%M:%SZ"),
            ],
            "actualRows": len(actuals),
            "forecastRuns": len(forecasts),
            "forecastRows": sum(len(run["points"]) for run in forecasts),
        },
        "actuals": actuals,
        "forecasts": forecasts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DATA_FILE)
    args = parser.parse_args()

    with httpx.Client(timeout=60) as client:
        actual_rows = fetch_wind_actuals(client, ACTUALS_FROM, ACTUALS_TO)
        forecast_rows = fetch_wind_forecasts(client, FORECASTS_FROM, FORECASTS_TO)

    snapshot = build_snapshot(actual_rows, forecast_rows)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    # One series per line keeps the file small but still diff-able.
    with args.out.open("w", encoding="utf-8") as fh:
        fh.write("{\n")
        fh.write(f'"meta": {json.dumps(snapshot["meta"], indent=1)},\n')
        fh.write(f'"actuals": {json.dumps(snapshot["actuals"], separators=(",", ":"))},\n')
        fh.write('"forecasts": [\n')
        fh.write(",\n".join(json.dumps(run, separators=(",", ":")) for run in snapshot["forecasts"]))
        fh.write("\n]\n}\n")
    print(json.dumps(snapshot["meta"], indent=2))


if __name__ == "__main__":
    main()
