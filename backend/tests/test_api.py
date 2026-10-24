"""End-to-end checks against the committed January 2026 snapshot."""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_meta_describes_the_window():
    body = client.get("/api/meta").json()
    assert body["deliveryDays"][0] == "2026-01-02"
    assert body["deliveryDays"][-1] == "2026-02-01"
    assert len(body["deliveryDays"]) == 31
    assert body["publishScheduleUtc"] == ["02:30", "04:30", "07:30", "09:30", "11:30", "15:30", "18:30", "22:30"]


@pytest.mark.parametrize("gate", ["epex-60", "n2ex", "epex-30"])
def test_no_day_uses_a_forecast_published_after_gate_closure(gate):
    for day in client.get("/api/meta").json()["deliveryDays"]:
        body = client.get(f"/api/day/{day}", params={"gate": gate}).json()
        closes_at = body["gate"]["closesAt"]
        assert body["decisionRun"]["publishTimes"], day
        assert all(p < closes_at for p in body["decisionRun"]["publishTimes"]), day
        decision = [r for r in body["revisions"] if r["isDecision"]]
        assert all(r["availableAtGate"] for r in decision)


def test_day_view_shape():
    body = client.get("/api/day/2026-01-15").json()
    assert len(body["points"]) == 48
    hourly = [p for p in body["points"] if "forecast" in p]
    assert len(hourly) == 24
    for p in hourly:
        assert 0 <= p["low"] <= p["high"]
        assert p["firm"] <= p["forecast"]
    assert body["summary"]["count"] == 24


def test_accuracy_margins_increase_with_confidence():
    margins = client.get("/api/accuracy").json()["margins"]
    values = [m["marginMW"] for m in margins]
    assert values == sorted(values)
    assert all(0 < m["backtestHeld"] <= 1 for m in margins)


def test_horizon_report_covers_0_to_48():
    rows = client.get("/api/horizons").json()["horizons"]
    assert [r["hours"] for r in rows] == list(range(49))
    assert all(r["meanActualHorizon"] >= r["hours"] for r in rows)


def test_explorer_respects_horizon():
    body = client.get("/api/explorer", params={"start": "2026-01-10", "end": "2026-01-10", "horizon": 6}).json()
    assert len(body["points"]) == 48
    for p in body["points"]:
        if "publishTime" in p:
            assert p["publishTime"] <= p["time"]


@pytest.mark.parametrize(
    ("url", "status"),
    [
        ("/api/day/2026-01-01", 404),
        ("/api/day/2026-01-15?confidence=0.7", 422),
        ("/api/day/2026-01-15?gate=nope", 422),
        ("/api/explorer?start=2025-12-01&end=2026-01-02", 422),
        ("/api/explorer?start=2026-01-05&end=2026-01-06&horizon=72", 422),
    ],
)
def test_bad_requests_are_rejected(url, status):
    assert client.get(url).status_code == status
