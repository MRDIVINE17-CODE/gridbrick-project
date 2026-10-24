import math

import pytest

from backend.app.metrics import histogram, quantile, summarize


def test_quantile_matches_numpy_linear_method():
    values = [1, 2, 3, 4]
    assert quantile(values, 0) == 1
    assert quantile(values, 1) == 4
    assert quantile(values, 0.5) == 2.5
    assert quantile(values, 0.9) == pytest.approx(3.7)


def test_quantile_rejects_empty():
    with pytest.raises(ValueError):
        quantile([], 0.5)


def test_summarize_signs_and_scores():
    # Errors (forecast - actual): +100, -50, +250, 0
    forecasts = [1100, 950, 1250, 1000]
    actuals = [1000, 1000, 1000, 1000]
    s = summarize(forecasts, actuals)
    assert s["count"] == 4
    assert s["mae"] == pytest.approx(100)
    assert s["bias"] == pytest.approx(75)
    assert s["rmse"] == pytest.approx(math.sqrt((100**2 + 50**2 + 250**2) / 4))
    assert s["nmae"] == pytest.approx(0.1)
    assert s["maxOverForecast"] == 250
    assert s["maxUnderForecast"] == 50
    assert s["forecastEnergyGWh"] == pytest.approx(4.3)


def test_summarize_never_reports_negative_extremes():
    s = summarize([1010, 1020], [1000, 1000])
    assert s["maxUnderForecast"] == 0


def test_summarize_empty():
    assert summarize([], []) == {"count": 0}


def test_histogram_counts_every_value():
    values = [-600, -10, 0, 499, 500, 1999]
    bins = histogram(values, 500)
    assert sum(b["count"] for b in bins) == len(values)
    assert bins[0]["from"] == -1000
    assert bins[-1]["to"] == 2000
