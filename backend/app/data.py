"""In-memory model of the wind snapshot and the forecast-selection rules.

Everything the API serves is derived from two series:

* actuals   - half-hourly outturn (MW), keyed by settlement-period start (UTC)
* runs      - forecast runs, each a publish time plus hourly points (MW)

The single most important rule lives in `WindData.forecast_for`: a forecast may
only be used if it was published before the moment the decision is taken.
"""

from __future__ import annotations

import json
from bisect import bisect_left, bisect_right
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache
from pathlib import Path

from .config import DATA_FILE, UK_TZ


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass(frozen=True)
class ForecastRun:
    publish_time: datetime
    points: dict[datetime, float]  # target start time (UTC) -> MW


@dataclass(frozen=True)
class SelectedForecast:
    target: datetime
    value: float
    publish_time: datetime

    @property
    def horizon_hours(self) -> float:
        return (self.target - self.publish_time).total_seconds() / 3600


class WindData:
    def __init__(self, actuals: dict[datetime, float], runs: list[ForecastRun], meta: dict | None = None):
        self.actuals = dict(sorted(actuals.items()))
        self.runs = sorted(runs, key=lambda run: run.publish_time)
        self.publish_times = [run.publish_time for run in self.runs]
        self.meta = meta or {}

    @classmethod
    def from_snapshot(cls, snapshot: dict) -> WindData:
        actuals = {parse_utc(start): float(gen) for start, gen in snapshot["actuals"]}
        runs = []
        for raw in snapshot["forecasts"]:
            published = parse_utc(raw["publishTime"])
            # Points targeting times before the publish time are back-casts, not forecasts.
            points = {parse_utc(start): float(gen) for start, gen in raw["points"]}
            runs.append(ForecastRun(published, {t: v for t, v in points.items() if t >= published}))
        return cls(actuals, runs, snapshot.get("meta"))

    @classmethod
    def from_file(cls, path: Path) -> WindData:
        with path.open(encoding="utf-8") as fh:
            return cls.from_snapshot(json.load(fh))

    # -- forecast selection -------------------------------------------------

    def forecast_for(
        self, target: datetime, available_by: datetime, *, inclusive: bool = True
    ) -> SelectedForecast | None:
        """Latest forecast for `target` among runs published by `available_by`.

        `inclusive=False` excludes a run published exactly at `available_by`
        (a forecast published at gate closure is too late to act on).
        """
        cut = bisect_right if inclusive else bisect_left
        for index in range(cut(self.publish_times, available_by) - 1, -1, -1):
            run = self.runs[index]
            if target in run.points:
                return SelectedForecast(target, run.points[target], run.publish_time)
        return None

    def runs_between(self, start: datetime, end: datetime) -> list[ForecastRun]:
        lo = bisect_left(self.publish_times, start)
        hi = bisect_right(self.publish_times, end)
        return self.runs[lo:hi]

    def actuals_between(self, start: datetime, end: datetime) -> list[tuple[datetime, float]]:
        """Half-hourly actuals with start <= t < end."""
        return [(t, v) for t, v in self.actuals.items() if start <= t < end]


# -- UK calendar helpers ----------------------------------------------------


def uk_day_bounds(day: date) -> tuple[datetime, datetime]:
    """UTC start/end of a UK local calendar day (23/25 h on clock-change days)."""
    start = datetime.combine(day, time(0), tzinfo=UK_TZ)
    end = datetime.combine(day + timedelta(days=1), time(0), tzinfo=UK_TZ)
    return start.astimezone(UTC), end.astimezone(UTC)


def gate_closure_utc(delivery_day: date, closes: time) -> datetime:
    """Gate closure for `delivery_day` happens on the previous UK day at `closes`."""
    local = datetime.combine(delivery_day - timedelta(days=1), closes, tzinfo=UK_TZ)
    return local.astimezone(UTC)


def hourly_targets(start: datetime, end: datetime) -> list[datetime]:
    """UTC hour starts in [start, end) - the forecast grid."""
    first = start.replace(minute=0, second=0, microsecond=0)
    if first < start:
        first += timedelta(hours=1)
    return [first + timedelta(hours=i) for i in range(int((end - first).total_seconds() // 3600))]


@lru_cache(maxsize=1)
def get_data() -> WindData:
    return WindData.from_file(DATA_FILE)
