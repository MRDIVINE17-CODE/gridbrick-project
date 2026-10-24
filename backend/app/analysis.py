"""Builds the views the API serves: day-ahead desk, accuracy report, horizon study."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from functools import lru_cache

from .config import (
    CONFIDENCE_LEVELS,
    DELIVERY_FIRST,
    DELIVERY_LAST,
    GATE_CLOSURES,
    MAX_HORIZON_HOURS,
    UK_TZ,
    GateClosure,
)
from .data import SelectedForecast, WindData, gate_closure_utc, get_data, hourly_targets, uk_day_bounds
from .metrics import histogram, mean, quantile, summarize

BAND = (0.1, 0.9)  # P10-P90 uncertainty band drawn around the decision forecast
LEVEL_BINS = ((0, 4000), (4000, 8000), (8000, 12000), (12000, 16000), (16000, None))


@dataclass(frozen=True)
class Matched:
    """A forecast that was available at decision time, paired with what happened."""

    target: datetime
    forecast: float
    actual: float
    publish_time: datetime

    @property
    def error(self) -> float:
        return self.forecast - self.actual

    @property
    def horizon_hours(self) -> float:
        return (self.target - self.publish_time).total_seconds() / 3600


def iso(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


def delivery_days() -> list[date]:
    return [DELIVERY_FIRST + timedelta(days=i) for i in range((DELIVERY_LAST - DELIVERY_FIRST).days + 1)]


def gate_by_id(gate_id: str) -> GateClosure:
    for gate in GATE_CLOSURES:
        if gate.id == gate_id:
            return gate
    raise KeyError(gate_id)


def gate_json(gate: GateClosure, day: date | None = None) -> dict:
    out = {"id": gate.id, "venue": gate.venue, "product": gate.product, "closes": gate.closes.strftime("%H:%M")}
    if day is not None:
        out["closesAt"] = iso(gate_closure_utc(day, gate.closes))
    return out


# -- decision-time forecasts --------------------------------------------------


def decision_forecasts(data: WindData, day: date, gate: GateClosure) -> list[SelectedForecast]:
    """For each hour of delivery day `day`, the latest forecast published before gate closure."""
    start, end = uk_day_bounds(day)
    closure = gate_closure_utc(day, gate.closes)
    selected = (data.forecast_for(t, closure, inclusive=False) for t in hourly_targets(start, end))
    return [s for s in selected if s is not None]


def _match(data: WindData, selected: list[SelectedForecast]) -> list[Matched]:
    return [
        Matched(s.target, s.value, data.actuals[s.target], s.publish_time) for s in selected if s.target in data.actuals
    ]


@lru_cache(maxsize=8)
def decision_matches(gate_id: str) -> dict[date, tuple[Matched, ...]]:
    data, gate = get_data(), gate_by_id(gate_id)
    return {day: tuple(_match(data, decision_forecasts(data, day, gate))) for day in delivery_days()}


def errors_excluding(gate_id: str, day: date | None) -> list[float]:
    """Decision-time errors from every delivery day except `day` (leave-one-day-out)."""
    return [m.error for d, matches in decision_matches(gate_id).items() if d != day for m in matches]


def margin_table(errors: list[float]) -> dict[float, float]:
    """Over-forecast (MW) not exceeded with the given confidence."""
    return {level: quantile(errors, level) for level in sorted({*CONFIDENCE_LEVELS, *BAND})}


# -- day-ahead desk ------------------------------------------------------------


def day_view(day: date, gate_id: str, confidence: float) -> dict:
    data, gate = get_data(), gate_by_id(gate_id)
    start, end = uk_day_bounds(day)
    closure = gate_closure_utc(day, gate.closes)
    selected = {s.target: s for s in decision_forecasts(data, day, gate)}
    # Calibrate on the other days only, so a day's band never "knows" its own outcome.
    margins = margin_table(errors_excluding(gate_id, day))
    margin = margins[confidence]

    points = []
    t = start
    while t < end:
        row: dict = {"time": iso(t), "actual": data.actuals.get(t)}
        if t in selected:
            f = selected[t].value
            row |= {
                "forecast": f,
                "low": max(0.0, f - margins[BAND[1]]),
                "high": max(0.0, f - margins[BAND[0]]),
                "firm": max(0.0, f - margin),
            }
        points.append(row)
        t += timedelta(minutes=30)

    matched = _match(data, list(selected.values()))
    summary = summarize([m.forecast for m in matched], [m.actual for m in matched])
    if matched:
        firm = [max(0.0, m.forecast - margin) for m in matched]
        summary |= {
            "firmEnergyGWh": sum(firm) / 1000,
            "hoursBelowFirm": sum(m.actual < f for m, f in zip(matched, firm, strict=True)),
            "hoursInBand": sum(
                m.forecast - margins[BAND[1]] <= m.actual <= m.forecast - margins[BAND[0]] for m in matched
            ),
            "shortfallEnergyGWh": sum(max(0.0, m.error) for m in matched) / 1000,
        }

    used_runs = sorted({s.publish_time for s in selected.values()})
    horizons = [s.horizon_hours for s in selected.values()]
    return {
        "date": day.isoformat(),
        "gate": gate_json(gate, day),
        "confidence": confidence,
        "decisionRun": {
            "publishTimes": [iso(p) for p in used_runs],
            "ageAtGateMinutes": (closure - used_runs[-1]).total_seconds() / 60 if used_runs else None,
            "horizonHours": [min(horizons), max(horizons)] if horizons else None,
        },
        "margins": {f"{level:g}": value for level, value in margins.items()},
        "band": {"low": BAND[0], "high": BAND[1]},
        "points": points,
        "revisions": _revisions(data, day, closure, set(used_runs)),
        "summary": summary,
    }


def _revisions(data: WindData, day: date, closure: datetime, used: set[datetime]) -> list[dict]:
    """Every run from 24 h before gate closure up to delivery that covers the day."""
    start, end = uk_day_bounds(day)
    out = []
    for run in data.runs_between(closure - timedelta(hours=24), end):
        values = [{"time": iso(t), "value": v} for t, v in sorted(run.points.items()) if start <= t < end]
        if values:
            out.append(
                {
                    "publishTime": iso(run.publish_time),
                    "availableAtGate": run.publish_time < closure,
                    "isDecision": run.publish_time in used,
                    "points": values,
                }
            )
    return out


# -- accuracy report -------------------------------------------------------------


@lru_cache(maxsize=8)
def accuracy_report(gate_id: str) -> dict:
    gate = gate_by_id(gate_id)
    by_day = decision_matches(gate_id)
    matches = [m for day_matches in by_day.values() for m in day_matches]
    errors = [m.error for m in matches]
    horizons = [m.horizon_hours for m in matches]

    return {
        "gate": gate_json(gate),
        "deliveryDays": [d.isoformat() for d in by_day],
        "horizonHours": {"min": min(horizons), "max": max(horizons), "mean": mean(horizons)},
        "summary": summarize([m.forecast for m in matches], [m.actual for m in matches]),
        "margins": _margin_backtest(gate_id, by_day),
        "histogram": histogram(errors, 500),
        "byHour": _by_hour(matches),
        "byLevel": _by_level(matches),
        "daily": [
            {
                "date": d.isoformat(),
                "mae": mean([abs(m.error) for m in ms]),
                "bias": mean([m.error for m in ms]),
                "forecastGWh": sum(m.forecast for m in ms) / 1000,
                "actualGWh": sum(m.actual for m in ms) / 1000,
            }
            for d, ms in by_day.items()
            if ms
        ],
        "worst": [
            {
                "time": iso(m.target),
                "forecast": m.forecast,
                "actual": m.actual,
                "error": m.error,
                "publishTime": iso(m.publish_time),
                "horizonHours": m.horizon_hours,
            }
            for m in _worst_per_day(by_day, 8)
        ],
        "scatter": [[m.forecast, m.actual] for m in matches],
        "gateComparison": [
            {**gate_json(g), **_brief([m for ms in decision_matches(g.id).values() for m in ms])} for g in GATE_CLOSURES
        ],
    }


def _worst_per_day(by_day: dict[date, tuple[Matched, ...]], limit: int) -> list[Matched]:
    """The single worst hour of each delivery day, largest first (one bad night is one event)."""
    worst = [max(ms, key=lambda m: abs(m.error)) for ms in by_day.values() if ms]
    return sorted(worst, key=lambda m: abs(m.error), reverse=True)[:limit]


def _brief(matches: list[Matched]) -> dict:
    s = summarize([m.forecast for m in matches], [m.actual for m in matches])
    return {"mae": s["mae"], "rmse": s["rmse"], "bias": s["bias"], "p90Error": s["errorQuantiles"]["p90"]}


def _margin_backtest(gate_id: str, by_day: dict[date, tuple[Matched, ...]]) -> list[dict]:
    """Margin per confidence level, plus how often it actually held out-of-sample.

    For each day the margin is re-estimated from the other days only; we then
    count the hours where actual wind came in at or above forecast - margin.
    """
    all_margins = margin_table(errors_excluding(gate_id, None))
    held = {level: 0 for level in CONFIDENCE_LEVELS}
    total = 0
    for day, matches in by_day.items():
        if not matches:
            continue
        loo = margin_table(errors_excluding(gate_id, day))
        total += len(matches)
        for level in CONFIDENCE_LEVELS:
            held[level] += sum(m.actual >= m.forecast - loo[level] for m in matches)
    return [
        {"confidence": level, "marginMW": all_margins[level], "backtestHeld": held[level] / total if total else None}
        for level in CONFIDENCE_LEVELS
    ]


def _by_hour(matches: list[Matched]) -> list[dict]:
    buckets: dict[int, list[Matched]] = {}
    for m in matches:
        buckets.setdefault(m.target.astimezone(UK_TZ).hour, []).append(m)
    return [
        {
            "hour": hour,
            "count": len(ms),
            "mae": mean([abs(m.error) for m in ms]),
            "bias": mean([m.error for m in ms]),
        }
        for hour, ms in sorted(buckets.items())
    ]


def _by_level(matches: list[Matched]) -> list[dict]:
    out = []
    for low, high in LEVEL_BINS:
        ms = [m for m in matches if m.forecast >= low and (high is None or m.forecast < high)]
        if not ms:
            continue
        errors = [m.error for m in ms]
        out.append(
            {
                "from": low,
                "to": high,
                "count": len(ms),
                "mae": mean([abs(e) for e in errors]),
                "bias": mean(errors),
                "p90Error": quantile(errors, 0.9),
            }
        )
    return out


# -- forecast horizon study ------------------------------------------------------


def _window_targets() -> list[datetime]:
    start, _ = uk_day_bounds(DELIVERY_FIRST)
    _, end = uk_day_bounds(DELIVERY_LAST)
    return hourly_targets(start, end)


def horizon_matches(data: WindData, horizon: float, targets: list[datetime]) -> list[Matched]:
    """Latest forecast published at least `horizon` hours before each target."""
    selected = (data.forecast_for(t, t - timedelta(hours=horizon)) for t in targets)
    return _match(data, [s for s in selected if s is not None])


@lru_cache(maxsize=1)
def horizon_report() -> dict:
    data, targets = get_data(), _window_targets()
    rows = []
    for hours in range(MAX_HORIZON_HOURS + 1):
        matches = horizon_matches(data, hours, targets)
        s = summarize([m.forecast for m in matches], [m.actual for m in matches])
        rows.append(
            {
                "hours": hours,
                "count": s["count"],
                "mae": s["mae"],
                "rmse": s["rmse"],
                "bias": s["bias"],
                "p10Error": s["errorQuantiles"]["p10"],
                "p90Error": s["errorQuantiles"]["p90"],
                "meanActualHorizon": mean([m.horizon_hours for m in matches]),
            }
        )
    return {"horizons": rows}


def explorer(start_day: date, end_day: date, horizon: float) -> dict:
    """Actual vs the forecast available `horizon` hours ahead, for a range of UK days."""
    data = get_data()
    start, _ = uk_day_bounds(start_day)
    _, end = uk_day_bounds(end_day)
    matches = {m.target: m for m in horizon_matches(data, horizon, hourly_targets(start, end))}
    points = []
    for t, actual in data.actuals_between(start, end):
        row: dict = {"time": iso(t), "actual": actual}
        if t in matches:
            row |= {"forecast": matches[t].forecast, "publishTime": iso(matches[t].publish_time)}
        points.append(row)
    ms = list(matches.values())
    return {
        "start": start_day.isoformat(),
        "end": end_day.isoformat(),
        "horizon": horizon,
        "points": points,
        "summary": summarize([m.forecast for m in ms], [m.actual for m in ms]),
    }
