"""
Simulated IoT sensors.

The original Arduino isn't connected anymore, so this stands in for it: every
store gets cooler, humidity, freezer and ambient readings on a fixed
interval. Each value follows a mean-reverting random walk around a normal
set point, so it drifts like a real sensor instead of jumping around.

Readings are tagged `{"source": "simulator"}` in `metadata_json`, so the API
and the dashboard can label them as simulated. If a real device posts a
reading for a store/sensor, the simulator stays quiet for that sensor until
the device has been silent for a few minutes.
"""
import json
import random
from datetime import datetime, timedelta
from typing import Dict, Iterable, Optional, Tuple

from sqlalchemy import func, insert, or_
from sqlalchemy.orm import Session

from ..models import Store, Telemetry

SIMULATOR_TAG = json.dumps({"source": "simulator"})
REAL_DEVICE_GRACE = timedelta(minutes=5)

# set point, noise per tick, unit
SENSORS: Dict[str, Tuple[float, float, str]] = {
    "cooler_temp_c": (3.0, 0.12, "celsius"),
    "cooler_humidity_pct": (67.0, 0.5, "pct"),
    "freezer_temp_c": (-17.5, 0.15, "celsius"),
    "ambient_temp_c": (22.0, 0.15, "celsius"),
}
MEAN_REVERSION = 0.25  # share of the gap to the set point closed each tick

# Last simulated value per (store, sensor); lives for the process lifetime
_state: Dict[Tuple[int, str], float] = {}


def reset_state() -> None:
    _state.clear()


def _store_offset(store_id: int, sensor: str) -> float:
    """Small, stable per-store difference so stores don't read identically."""
    return random.Random(f"{store_id}:{sensor}").uniform(-0.4, 0.4)


def _recent_real_devices(db: Session, now: datetime) -> set:
    rows = db.query(Telemetry.store_id, Telemetry.sensor).filter(
        Telemetry.ts_datetime >= now - REAL_DEVICE_GRACE,
        or_(Telemetry.metadata_json.is_(None), Telemetry.metadata_json != SIMULATOR_TAG),
    ).distinct().all()
    return {(s, sensor) for s, sensor in rows}


def _seed_state(db: Session, store_ids: Iterable[int]) -> None:
    """Start each walk from the latest stored reading so restarts don't jump."""
    missing = [(s, sensor) for s in store_ids for sensor in SENSORS if (s, sensor) not in _state]
    if not missing:
        return
    latest = db.query(
        Telemetry.store_id, Telemetry.sensor, func.max(Telemetry.ts_datetime)
    ).group_by(Telemetry.store_id, Telemetry.sensor).subquery()
    rows = db.query(Telemetry.store_id, Telemetry.sensor, Telemetry.value).join(
        latest,
        (Telemetry.store_id == latest.c.store_id)
        & (Telemetry.sensor == latest.c.sensor)
        & (Telemetry.ts_datetime == latest.c[2]),
    ).all()
    found = {(s, sensor): v for s, sensor, v in rows}
    for key in missing:
        set_point = SENSORS[key[1]][0] + _store_offset(*key)
        value = found.get(key, set_point)
        # Ignore stale outliers (e.g. a cooler failure that was running at shutdown)
        _state[key] = value if abs(value - set_point) < 3 else set_point


def tick(
    db: Session,
    overlays: Optional[Dict[Tuple[int, str], float]] = None,
    now: Optional[datetime] = None,
    rng: Optional[random.Random] = None,
) -> int:
    """
    Write one reading per store and sensor. `overlays` shifts a sensor's set
    point, which is how scenarios like a cooler failure play out. Returns the
    number of readings written.
    """
    now = now or datetime.utcnow()
    rng = rng or random
    overlays = overlays or {}
    store_ids = [s for (s,) in db.query(Store.id).all()]
    _seed_state(db, store_ids)
    real = _recent_real_devices(db, now)

    rows = []
    for store_id in store_ids:
        for sensor, (set_point, noise, unit) in SENSORS.items():
            key = (store_id, sensor)
            if key in real:
                continue
            target = set_point + _store_offset(store_id, sensor) + overlays.get(key, 0.0)
            value = _state[key] + MEAN_REVERSION * (target - _state[key]) + rng.gauss(0, noise)
            _state[key] = value
            rows.append({
                "store_id": store_id, "sensor": sensor, "value": round(value, 2),
                "unit": unit, "ts_datetime": now, "metadata_json": SIMULATOR_TAG,
            })
    if rows:
        db.execute(insert(Telemetry), rows)
        db.commit()
    return len(rows)
