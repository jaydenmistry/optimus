"""
Demo-mode simulation endpoints.

These are public on purpose, so anyone viewing the demo can trigger a
scenario. They're safe to expose because every scenario is bounded, undone
automatically within minutes, rate limited per client and capped globally.
"""
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Deque, Dict, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import SimulationScenario
from ..simulation import SIMULATION_LOCK, runner, scenarios
from ..simulation.daily import last_snapshot_date

router = APIRouter()

ScenarioKind = Literal["cooler_failure", "catering_order", "unrecorded_loss", "deliveries"]


class ScenarioRequest(BaseModel):
    kind: ScenarioKind
    store_id: int = Field(..., ge=1)


# --------------------------------------------------------------------------- #
# Rate limiting (in memory; the API runs as a single process)                 #
# --------------------------------------------------------------------------- #

class _Limiter:
    def __init__(self, limit: int, window_s: int):
        self.limit, self.window = limit, window_s
        self.hits: Dict[str, Deque[float]] = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                retry = int(self.window - (now - q[0])) + 1
                raise HTTPException(
                    status_code=429,
                    detail="You're starting scenarios quickly. Give it a minute and try again.",
                    headers={"Retry-After": str(retry)},
                )
            q.append(now)
            if len(self.hits) > 10_000:  # bound memory under abuse
                self.hits.clear()


_start_limiter = _Limiter(limit=6, window_s=300)
_control_limiter = _Limiter(limit=30, window_s=60)
GLOBAL_STARTS_PER_5_MIN = 40


def _client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _require_enabled() -> None:
    if not (settings.SIMULATION_ENABLED and settings.SCENARIOS_ENABLED):
        raise HTTPException(status_code=403, detail="Simulation scenarios are turned off on this server.")


# --------------------------------------------------------------------------- #
# Endpoints                                                                   #
# --------------------------------------------------------------------------- #

@router.get("/simulation/status")
def get_simulation_status(db: Session = Depends(get_db)):
    """What's being simulated, how current the data is, and active scenarios."""
    with SIMULATION_LOCK:
        scenarios.expire_due(db)
        active = [scenarios.describe(s) for s in scenarios.active_scenarios(db)]
    last = last_snapshot_date(db)
    return {
        "enabled": settings.SIMULATION_ENABLED,
        "sensors_simulated": settings.SIMULATION_ENABLED and settings.SIMULATE_SENSORS,
        "sensor_interval_seconds": settings.SIMULATION_INTERVAL_SECONDS,
        "scenarios_enabled": settings.SIMULATION_ENABLED and settings.SCENARIOS_ENABLED,
        "data_through": last.isoformat() if last else None,
        "catalog": scenarios.catalog(),
        "active": active,
        "runner": runner.status(),
    }


@router.post("/simulation/scenarios")
def start_scenario(body: ScenarioRequest, request: Request, db: Session = Depends(get_db)):
    """Start a scenario at a store. Undone automatically when it expires."""
    _require_enabled()
    _start_limiter.check(_client(request))
    with SIMULATION_LOCK:
        if scenarios.count_since(db, datetime.utcnow() - timedelta(minutes=5)) >= GLOBAL_STARTS_PER_5_MIN:
            raise HTTPException(status_code=429, detail="The demo is busy right now. Try again in a few minutes.")
        try:
            scenario = scenarios.start(db, body.kind, body.store_id)
        except scenarios.ScenarioError as e:
            db.rollback()
            raise HTTPException(status_code=e.status_code, detail=str(e))
        return scenarios.describe(scenario)


@router.post("/simulation/scenarios/{scenario_id}/end")
def end_scenario(scenario_id: int, request: Request, db: Session = Depends(get_db)):
    """End a scenario early and undo its changes."""
    _require_enabled()
    _control_limiter.check(_client(request))
    with SIMULATION_LOCK:
        scenario = db.get(SimulationScenario, scenario_id)
        if not scenario:
            raise HTTPException(status_code=404, detail="Scenario not found.")
        scenarios.end(db, scenario)
    return {"ended": scenario_id}


@router.post("/simulation/reset")
def reset_scenarios(request: Request, db: Session = Depends(get_db)):
    """End every running scenario and undo all of their changes."""
    _require_enabled()
    _control_limiter.check(_client(request))
    with SIMULATION_LOCK:
        ended = scenarios.end_all(db)
    return {"ended": ended}
