"""Static configuration: analysis window, market gate closures, file locations."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, time
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = Path(os.getenv("WIND_DATA_FILE", BACKEND_DIR / "data" / "wind_jan2026.json"))

# Purchase decisions are made on the day before delivery. The brief limits the
# scope to decisions made in January 2026, so the decision days are 1-31 Jan and
# the delivery days they buy for are 2 Jan - 1 Feb (UK local dates).
DECISION_FIRST = date(2026, 1, 1)
DECISION_LAST = date(2026, 1, 31)
DELIVERY_FIRST = date(2026, 1, 2)
DELIVERY_LAST = date(2026, 2, 1)

# Horizon explorer covers every target hour in the window, horizons 0-48 h.
MAX_HORIZON_HOURS = 48


@dataclass(frozen=True)
class GateClosure:
    """A GB day-ahead auction; bids for day D close at `closes` UK time on D-1."""

    id: str
    venue: str
    product: str
    closes: time


GATE_CLOSURES: tuple[GateClosure, ...] = (
    GateClosure("epex-60", "EPEX SPOT", "GB hourly day-ahead auction", time(9, 20)),
    GateClosure("n2ex", "Nord Pool N2EX", "GB hourly day-ahead auction", time(9, 50)),
    GateClosure("epex-30", "EPEX SPOT", "GB half-hourly day-ahead auction", time(15, 30)),
)
DEFAULT_GATE = GATE_CLOSURES[0]

# Confidence levels offered for the "firm wind" planning line.
CONFIDENCE_LEVELS = (0.5, 0.8, 0.9, 0.95)
DEFAULT_CONFIDENCE = 0.9
