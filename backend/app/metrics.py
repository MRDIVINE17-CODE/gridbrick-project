"""Error statistics. Pure functions over plain floats, no numpy needed.

Sign convention used everywhere in the app:

    error = forecast - actual   (MW)

A positive error is an over-forecast: less wind turned up than planned, so the
buying team is short and has to cover the gap later at intraday/imbalance prices.
"""

from __future__ import annotations

import math
from collections.abc import Sequence


def quantile(values: Sequence[float], q: float) -> float:
    """Linear-interpolated quantile (same as numpy's default method)."""
    if not values:
        raise ValueError("quantile of empty sequence")
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    low = math.floor(position)
    high = math.ceil(position)
    if low == high:
        return ordered[low]
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


QUANTILES = (0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95)


def summarize(forecasts: Sequence[float], actuals: Sequence[float]) -> dict:
    """Accuracy summary for paired hourly forecast/actual values (MW)."""
    if len(forecasts) != len(actuals):
        raise ValueError("forecasts and actuals must be the same length")
    if not forecasts:
        return {"count": 0}

    errors = [f - a for f, a in zip(forecasts, actuals, strict=True)]
    abs_errors = [abs(e) for e in errors]
    mean_actual = mean(actuals)
    mae = mean(abs_errors)

    return {
        "count": len(errors),
        "mae": mae,
        "rmse": math.sqrt(mean([e * e for e in errors])),
        "bias": mean(errors),
        # MAE relative to average output; MAPE is avoided because it explodes at low wind.
        "nmae": mae / mean_actual if mean_actual else None,
        "medianAbsError": quantile(abs_errors, 0.5),
        "p90AbsError": quantile(abs_errors, 0.9),
        "maxOverForecast": max(0.0, max(errors)),
        "maxUnderForecast": max(0.0, -min(errors)),
        "correlation": _correlation(forecasts, actuals),
        "errorQuantiles": {f"p{round(q * 100)}": quantile(errors, q) for q in QUANTILES},
        # Each matched point is an hourly MW value, so the sum is MWh; report GWh.
        "forecastEnergyGWh": sum(forecasts) / 1000,
        "actualEnergyGWh": sum(actuals) / 1000,
    }


def histogram(values: Sequence[float], width: float) -> list[dict]:
    if not values:
        return []
    first = math.floor(min(values) / width) * width
    last = math.floor(max(values) / width) * width
    counts = {first + i * width: 0 for i in range(int(round((last - first) / width)) + 1)}
    for value in values:
        counts[math.floor(value / width) * width] += 1
    return [{"from": start, "to": start + width, "count": count} for start, count in counts.items()]


def _correlation(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    mx, my = mean(xs), mean(ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return None
    return sxy / math.sqrt(sxx * syy)
