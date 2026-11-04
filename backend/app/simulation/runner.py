"""
Background loop for demo mode.

Runs inside the API process (one uvicorn worker), so there's exactly one
simulator. Database work happens in a worker thread under SIMULATION_LOCK so
it never blocks request handling.
"""
import asyncio
import logging
import time
from datetime import datetime
from typing import Optional

from ..config import settings
from ..database import SessionLocal
from . import SIMULATION_LOCK, daily, scenarios, sensors

log = logging.getLogger(__name__)

HOUSEKEEPING_EVERY_S = 300  # roll-forward check, pruning

_status = {"started_at": None, "last_tick": None, "last_roll_forward": None, "data_through": None}


def status() -> dict:
    return dict(_status)


def _housekeeping() -> None:
    db = SessionLocal()
    try:
        added = daily.catch_up(db)
        if added:
            _status["last_roll_forward"] = datetime.utcnow().isoformat() + "Z"
    finally:
        db.close()
    db = SessionLocal()
    try:
        daily.prune_telemetry(db)
        db.commit()
        scenarios.prune_history(db)
        last = daily.last_snapshot_date(db)
        _status["data_through"] = last.isoformat() if last else None
    finally:
        db.close()


def _tick() -> None:
    db = SessionLocal()
    try:
        scenarios.expire_due(db)
        if settings.SIMULATE_SENSORS:
            sensors.tick(db, overlays=scenarios.sensor_overlays(db))
        _status["last_tick"] = datetime.utcnow().isoformat() + "Z"
    finally:
        db.close()


def startup() -> None:
    """Bring the data set up to date before the API starts serving."""
    with SIMULATION_LOCK:
        _housekeeping()
        _tick()
    _status["started_at"] = datetime.utcnow().isoformat() + "Z"


def _step(last_housekeeping: float) -> float:
    with SIMULATION_LOCK:
        if time.monotonic() - last_housekeeping >= HOUSEKEEPING_EVERY_S:
            _housekeeping()
            last_housekeeping = time.monotonic()
        _tick()
    return last_housekeeping


async def run_forever(stop: Optional[asyncio.Event] = None) -> None:
    stop = stop or asyncio.Event()
    last_housekeeping = time.monotonic()
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.SIMULATION_INTERVAL_SECONDS)
            break
        except asyncio.TimeoutError:
            pass
        try:
            last_housekeeping = await asyncio.to_thread(_step, last_housekeeping)
        except Exception:
            # Keep the demo alive; one bad tick shouldn't stop the simulator
            log.exception("Simulation step failed")
