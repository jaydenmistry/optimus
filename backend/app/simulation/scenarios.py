"""
Visitor-triggered demo scenarios.

Each scenario changes the data the way a real event would, so its effects
show up across the dashboard (Overview, Transfers, item pages, Sensors).
Every change is journaled as a delta and undone automatically when the
scenario expires, so the next visitor always finds a normal demo.

Inventory changes are applied to yesterday's snapshot, because that's the
"current" stock every page reads.
"""
import json
import random
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

from sqlalchemy import delete, func
from sqlalchemy.orm import Session

from ..models import (
    SKU, AnomalyEvent, InventorySnapshot, ReceiptsDaily, SalesDaily,
    SimulationScenario, Store,
)
from ..services.anomaly_detector import classify_severity
from ..services.forecasting import calculate_demand_forecast


class ScenarioError(Exception):
    """A scenario can't run right now (shown to the visitor as-is)."""

    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.status_code = status_code


# kind -> (title, description, duration)
SCENARIOS: Dict[str, Tuple[str, str, timedelta]] = {
    "cooler_failure": (
        "Cooler failure",
        "The walk-in cooler's compressor stops. Watch its temperature climb from Normal to Warning to Critical on the Overview sensors.",
        timedelta(minutes=5),
    ),
    "catering_order": (
        "Catering order",
        "A large catering order clears out proteins and salsas. Those items become stockout risks, and Transfers suggests stock from nearby stores.",
        timedelta(minutes=10),
    ),
    "unrecorded_loss": (
        "Unrecorded loss",
        "Stock disappears with no sale, delivery or transfer to explain it. An anomaly is flagged and the item's confidence grade drops.",
        timedelta(minutes=10),
    ),
    "deliveries": (
        "Deliveries arrive",
        "Supplier deliveries restock every item that's running low, clearing the store's stockout risks.",
        timedelta(minutes=10),
    ),
}
INVENTORY_KINDS = {"catering_order", "unrecorded_loss", "deliveries"}

MAX_ACTIVE = 8
COOLER_RAMP = timedelta(minutes=2, seconds=30)
COOLER_FAILURE_RISE_C = 7.0


def _yesterday() -> date:
    return datetime.now().date() - timedelta(days=1)


def active_scenarios(db: Session, now: Optional[datetime] = None) -> List[SimulationScenario]:
    now = now or datetime.utcnow()
    return db.query(SimulationScenario).filter(
        SimulationScenario.ended_at.is_(None), SimulationScenario.expires_at > now
    ).order_by(SimulationScenario.started_at).all()


def sensor_overlays(db: Session, now: Optional[datetime] = None) -> Dict[Tuple[int, str], float]:
    """Set-point shifts for active sensor scenarios (consumed by sensors.tick)."""
    now = now or datetime.utcnow()
    overlays: Dict[Tuple[int, str], float] = {}
    for s in active_scenarios(db, now):
        if s.kind == "cooler_failure":
            progress = min(1.0, (now - s.started_at) / COOLER_RAMP)
            overlays[(s.store_id, "cooler_temp_c")] = COOLER_FAILURE_RISE_C * progress
            overlays[(s.store_id, "cooler_humidity_pct")] = 6.0 * progress
    return overlays


# --------------------------------------------------------------------------- #
# Journal helpers                                                             #
# --------------------------------------------------------------------------- #

class _Journal:
    def __init__(self):
        self.snapshots: List[Tuple[int, int]] = []   # (snapshot id, delta)
        self.sales: List[Tuple[int, int]] = []       # (sales row id, delta)
        self.inserted: Dict[str, List[int]] = {"sales_daily": [], "receipts_daily": [], "anomaly_events": []}

    def to_json(self) -> str:
        return json.dumps({"snapshots": self.snapshots, "sales": self.sales, "inserted": self.inserted})


def _adjust_on_hand(db: Session, j: _Journal, snap: InventorySnapshot, delta: int) -> int:
    """Change a snapshot by `delta` (never below zero) and journal the real change."""
    new = max(0, snap.on_hand + delta)
    applied = new - snap.on_hand
    snap.on_hand = new
    if applied:
        j.snapshots.append((snap.id, applied))
    return applied


def _record_sale(db: Session, j: _Journal, store_id: int, sku_id: int, day: date, qty: int) -> None:
    row = db.query(SalesDaily).filter_by(store_id=store_id, sku_id=sku_id, ts_date=day).first()
    if row:
        row.qty_sold += qty
        j.sales.append((row.id, qty))
    else:
        row = SalesDaily(store_id=store_id, sku_id=sku_id, ts_date=day, qty_sold=qty)
        db.add(row)
        db.flush()
        j.inserted["sales_daily"].append(row.id)


def _snapshots_for(db: Session, store_id: int, day: date, categories: Optional[List[str]] = None):
    q = db.query(InventorySnapshot, SKU).join(SKU, SKU.id == InventorySnapshot.sku_id).filter(
        InventorySnapshot.store_id == store_id, InventorySnapshot.ts_date == day
    )
    if categories:
        q = q.filter(SKU.category.in_(categories))
    return q.all()


# --------------------------------------------------------------------------- #
# Scenario effects                                                            #
# --------------------------------------------------------------------------- #

def _catering_order(db: Session, store_id: int, j: _Journal, rng: random.Random) -> str:
    day = _yesterday()
    candidates = []
    for snap, sku in _snapshots_for(db, store_id, day, ["Proteins", "Salsas & Sauces"]):
        demand = calculate_demand_forecast(db, store_id, sku.id)["daily_demand"]
        # Only items that are currently healthy, so the change is visible
        if demand >= 1 and snap.on_hand > demand * 6:
            candidates.append((snap, sku, demand))
    if not candidates:
        raise ScenarioError("No healthy proteins or salsas left to sell at this store. Try another store.")
    rng.shuffle(candidates)
    hit = []
    for snap, sku, demand in candidates[:4]:
        leave = int(demand * rng.uniform(0.3, 1.5))
        used = snap.on_hand - leave
        _adjust_on_hand(db, j, snap, -used)
        _record_sale(db, j, store_id, sku.id, day, used)
        hit.append(sku.name)
    return f"Catering order used up {', '.join(hit)}."


def _unrecorded_loss(db: Session, store_id: int, j: _Journal, rng: random.Random) -> str:
    day = _yesterday()
    already = {a for (a,) in db.query(AnomalyEvent.sku_id).filter(
        AnomalyEvent.store_id == store_id, AnomalyEvent.ts_date >= day - timedelta(days=30)
    ).all()}
    options = [(snap, sku) for snap, sku in _snapshots_for(db, store_id, day, ["Proteins", "Dairy", "Produce"])
               if snap.on_hand >= 30 and sku.id not in already]
    if not options:
        raise ScenarioError("Every item at this store already has a recent anomaly. Try another store.")
    snap, sku = rng.choice(options)
    loss = rng.randint(16, 26)
    _adjust_on_hand(db, j, snap, -loss)
    event = AnomalyEvent(
        store_id=store_id, sku_id=sku.id, ts_date=day, residual=-loss,
        severity=classify_severity(-loss),
        explanation_hint=(
            f"Unexplained inventory drop of {loss} units. Sales, deliveries and transfers "
            "don't account for it. Possible theft, spoilage or a miscount."
        ),
    )
    db.add(event)
    db.flush()
    j.inserted["anomaly_events"].append(event.id)
    return f"{loss} units of {sku.name} went missing."


def _deliveries(db: Session, store_id: int, j: _Journal, rng: random.Random) -> str:
    day = _yesterday()
    restocked = 0
    for snap, sku in _snapshots_for(db, store_id, day):
        demand = calculate_demand_forecast(db, store_id, sku.id)["daily_demand"]
        if demand < 0.5 or snap.on_hand >= demand * 5:
            continue
        qty = max(1, int(demand * rng.uniform(12, 16)) - snap.on_hand)
        _adjust_on_hand(db, j, snap, qty)
        receipt = ReceiptsDaily(store_id=store_id, sku_id=sku.id, ts_date=day, qty_received=qty)
        db.add(receipt)
        db.flush()
        j.inserted["receipts_daily"].append(receipt.id)
        restocked += 1
        if restocked >= 40:
            break
    if not restocked:
        raise ScenarioError("Nothing at this store is running low, so there's nothing to deliver.")
    return f"Deliveries restocked {restocked} item{'s' if restocked != 1 else ''}."


_EFFECTS = {
    "catering_order": _catering_order,
    "unrecorded_loss": _unrecorded_loss,
    "deliveries": _deliveries,
}


# --------------------------------------------------------------------------- #
# Lifecycle                                                                   #
# --------------------------------------------------------------------------- #

def start(db: Session, kind: str, store_id: int, rng: Optional[random.Random] = None) -> SimulationScenario:
    if kind not in SCENARIOS:
        raise ScenarioError("Unknown scenario.", 422)
    store = db.get(Store, store_id)
    if not store:
        raise ScenarioError("Store not found.", 404)

    expire_due(db)
    running = active_scenarios(db)
    if any(s.kind == kind and s.store_id == store_id for s in running):
        raise ScenarioError(f"{SCENARIOS[kind][0]} is already running at this store.")
    if len(running) >= MAX_ACTIVE:
        raise ScenarioError("Lots of scenarios are running right now. Wait for one to finish or reset them.", 429)

    rng = rng or random.Random()
    title, _, duration = SCENARIOS[kind]
    j = _Journal()
    if kind == "cooler_failure":
        summary = f"The cooler at {store.name} stopped cooling."
    else:
        summary = _EFFECTS[kind](db, store_id, j, rng)

    now = datetime.utcnow()
    scenario = SimulationScenario(
        kind=kind, store_id=store_id, started_at=now, expires_at=now + duration,
        summary=summary, journal=j.to_json(),
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


def _undo(db: Session, scenario: SimulationScenario) -> None:
    data = json.loads(scenario.journal or "{}")
    for snap_id, delta in data.get("snapshots", []):
        snap = db.get(InventorySnapshot, snap_id)
        if snap:
            snap.on_hand = max(0, snap.on_hand - delta)
    for row_id, delta in data.get("sales", []):
        row = db.get(SalesDaily, row_id)
        if row:
            row.qty_sold = max(0, row.qty_sold - delta)
    for table, model in (("sales_daily", SalesDaily), ("receipts_daily", ReceiptsDaily), ("anomaly_events", AnomalyEvent)):
        ids = data.get("inserted", {}).get(table, [])
        if ids:
            db.execute(delete(model).where(model.id.in_(ids)))


def end(db: Session, scenario: SimulationScenario, commit: bool = True) -> None:
    if scenario.ended_at is not None:
        return
    _undo(db, scenario)
    scenario.ended_at = datetime.utcnow()
    if commit:
        db.commit()


def end_all(db: Session) -> int:
    open_ = db.query(SimulationScenario).filter(SimulationScenario.ended_at.is_(None)).all()
    for s in open_:
        end(db, s, commit=False)
    db.commit()
    return len(open_)


def expire_due(db: Session, now: Optional[datetime] = None) -> int:
    now = now or datetime.utcnow()
    due = db.query(SimulationScenario).filter(
        SimulationScenario.ended_at.is_(None), SimulationScenario.expires_at <= now
    ).all()
    for s in due:
        end(db, s, commit=False)
    if due:
        db.commit()
    return len(due)


def end_inventory_scenarios(db: Session) -> int:
    """Undo inventory scenarios (called before the daily roll-forward builds on top)."""
    open_ = db.query(SimulationScenario).filter(
        SimulationScenario.ended_at.is_(None), SimulationScenario.kind.in_(INVENTORY_KINDS)
    ).all()
    for s in open_:
        end(db, s, commit=False)
    db.commit()
    return len(open_)


def prune_history(db: Session, keep_days: int = 7) -> None:
    db.execute(delete(SimulationScenario).where(
        SimulationScenario.ended_at.is_not(None),
        SimulationScenario.ended_at < datetime.utcnow() - timedelta(days=keep_days),
    ))
    db.commit()


def describe(s: SimulationScenario, now: Optional[datetime] = None) -> dict:
    now = now or datetime.utcnow()
    title = SCENARIOS.get(s.kind, (s.kind,))[0]
    return {
        "id": s.id,
        "kind": s.kind,
        "title": title,
        "store_id": s.store_id,
        "summary": s.summary,
        "started_at": s.started_at.isoformat() + "Z",
        "expires_at": s.expires_at.isoformat() + "Z",
        "seconds_left": max(0, int((s.expires_at - now).total_seconds())),
    }


def catalog() -> List[dict]:
    return [
        {"kind": k, "title": t, "description": d, "duration_seconds": int(dur.total_seconds())}
        for k, (t, d, dur) in SCENARIOS.items()
    ]


def count_since(db: Session, since: datetime) -> int:
    return db.query(func.count(SimulationScenario.id)).filter(SimulationScenario.started_at >= since).scalar() or 0
