"""Forecast selection rules: the app must never use a forecast published after the decision."""

from datetime import UTC, date, datetime, time, timedelta

from backend.app.analysis import decision_forecasts
from backend.app.config import GateClosure
from backend.app.data import WindData, gate_closure_utc, hourly_targets, uk_day_bounds


def utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


def snapshot_for_day(day: date) -> dict:
    """Three runs on the day before `day`, each covering all 24 hours of `day`."""
    start, end = uk_day_bounds(day)
    targets = hourly_targets(start, end)
    eve = day - timedelta(days=1)

    def run(hh: int, mm: int, value: int) -> dict:
        published = datetime.combine(eve, time(hh, mm), tzinfo=UTC)
        return {
            "publishTime": published.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "points": [[t.strftime("%Y-%m-%dT%H:%M:%SZ"), value] for t in targets],
        }

    return {
        "actuals": [[t.strftime("%Y-%m-%dT%H:%M:%SZ"), 1000] for t in targets],
        "forecasts": [run(7, 30, 1100), run(9, 30, 1200), run(15, 30, 1300)],
    }


DAY = date(2026, 1, 15)
DATA = WindData.from_snapshot(snapshot_for_day(DAY))


def test_picks_latest_run_before_gate_closure():
    gate = GateClosure("t", "Test", "test", time(9, 20))
    selected = decision_forecasts(DATA, DAY, gate)
    assert len(selected) == 24
    assert {s.publish_time for s in selected} == {utc(2026, 1, 14, 7, 30)}
    assert {s.value for s in selected} == {1100}


def test_later_gate_uses_later_run():
    gate = GateClosure("t", "Test", "test", time(9, 50))
    assert {s.value for s in decision_forecasts(DATA, DAY, gate)} == {1200}


def test_run_published_at_gate_closure_is_too_late():
    gate = GateClosure("t", "Test", "test", time(15, 30))
    assert {s.value for s in decision_forecasts(DATA, DAY, gate)} == {1200}


def test_falls_back_to_older_run_when_latest_lacks_target():
    target = utc(2026, 1, 15, 12)
    snapshot = snapshot_for_day(DAY)
    newest = snapshot["forecasts"][1]
    newest["points"] = [p for p in newest["points"] if p[0] != "2026-01-15T12:00:00Z"]
    data = WindData.from_snapshot(snapshot)
    chosen = data.forecast_for(target, utc(2026, 1, 14, 9, 45))
    assert chosen is not None and chosen.publish_time == utc(2026, 1, 14, 7, 30)


def test_horizon_selection_is_inclusive():
    target = utc(2026, 1, 15, 13)
    chosen = DATA.forecast_for(target, utc(2026, 1, 14, 9, 30))
    assert chosen is not None
    assert chosen.publish_time == utc(2026, 1, 14, 9, 30)
    assert chosen.horizon_hours == 27.5


def test_nothing_available_returns_none():
    assert DATA.forecast_for(utc(2026, 1, 15, 3), utc(2026, 1, 13)) is None


def test_backcast_points_are_dropped():
    snapshot = {
        "actuals": [],
        "forecasts": [
            {
                "publishTime": "2026-01-14T07:30:00Z",
                "points": [["2026-01-14T06:00:00Z", 5], ["2026-01-14T08:00:00Z", 6]],
            }
        ],
    }
    run = WindData.from_snapshot(snapshot).runs[0]
    assert list(run.points) == [utc(2026, 1, 14, 8)]


def test_uk_day_is_23_hours_on_spring_clock_change():
    start, end = uk_day_bounds(date(2026, 3, 29))
    assert len(hourly_targets(start, end)) == 23


def test_gate_closure_follows_uk_clock():
    winter = gate_closure_utc(date(2026, 1, 15), time(9, 20))
    summer = gate_closure_utc(date(2026, 7, 15), time(9, 20))
    assert winter == utc(2026, 1, 14, 9, 20)
    assert summer == utc(2026, 7, 14, 8, 20)  # 09:20 BST
