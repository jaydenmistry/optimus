"""
Daily roll-forward: keeps the demo data set current.

Every page reads "yesterday's" inventory snapshot, so a data set generated
once goes blank the next day. `catch_up` fills in each missing day since the
last snapshot, continuing each item's own demand pattern:

* Sales follow the item's recent weekday and weekend averages, with noise,
  and can't exceed what's on hand.
* Stores reorder when stock drops below a per-item reorder point, so most
  items cycle between a few days and a few weeks of cover, and a handful are
  always close to running out.
* A few items get cycle counted each day, and now and then an unexplained
  loss is injected, so confidence scores and anomalies stay realistic.
* Hourly sales for the Peak Hours page continue each item's hour-by-hour
  pattern.

Old rows are pruned so the database stays the same size over months.
"""
import logging
import random
import zlib
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Dict, Optional, Tuple

from sqlalchemy import case, delete, func, insert
from sqlalchemy.orm import Session

from ..models import (
    AnomalyEvent, CycleCount, InventorySnapshot, ReceiptsDaily, SalesDaily,
    SalesHourly, Telemetry,
)
from ..services.anomaly_detector import classify_severity

log = logging.getLogger(__name__)

# If the server was down longer than this, rebuilding from scratch is faster
# and gives a cleaner data set than simulating every missing day.
MAX_CATCH_UP_DAYS = 45

DEMAND_WINDOW_DAYS = 28
HOURLY_WINDOW_DAYS = 14
OPEN_HOURS = range(6, 23)
PEAK_HOURS = {11, 12, 13, 17, 18, 19}

# Retention keeps the database bounded no matter how long the demo runs
RETENTION_DAYS = {
    "daily": 90,      # snapshots, sales, receipts, anomalies
    "counts": 120,    # cycle counts (only the latest per item matters)
    "hourly": 28,     # hourly sales
}
TELEMETRY_RETENTION_HOURS = 24

# Tuned so the dashboard looks like a normal week: most items are fine, a
# few are close to a stockout and a few need a physical count.
REORDER_PROBABILITY = 0.6     # chance per day an order arrives once below the reorder point
CYCLE_COUNT_RATE = 0.06       # share of items counted per store per day
DAILY_ANOMALY_PROBABILITY = 0.3


def _pair_seed(store_id: int, sku_id: int) -> int:
    return zlib.crc32(f"{store_id}:{sku_id}".encode())


# Most items are well stocked; a small share runs lean, the way some items do
# in a real chain. Those lean items are what keep a few stockout risks and
# transfer opportunities on the dashboard every day.
LEAN_ITEM_SHARE = 0.07


def _reorder_policy(store_id: int, sku_id: int) -> Tuple[float, float, float]:
    """(reorder point, min order-up-to, max order-up-to) in days of cover, stable per item."""
    r = random.Random(_pair_seed(store_id, sku_id))
    if r.random() < LEAN_ITEM_SHARE:
        reorder_point = r.uniform(0.8, 3.0)
        return reorder_point, reorder_point + 6, reorder_point + 14
    reorder_point = r.uniform(9.0, 12.0)
    return reorder_point, reorder_point + 16, reorder_point + 30


def _is_weekend(d: date) -> bool:
    return d.weekday() >= 5


def _demand_bases(db: Session, end: date) -> Dict[Tuple[int, int], Tuple[float, float]]:
    """(weekday average, weekend average) units per day for every store/SKU."""
    start = end - timedelta(days=DEMAND_WINDOW_DAYS)
    weekend = case((func.strftime("%w", SalesDaily.ts_date).in_(["0", "6"]), 1), else_=0)
    rows = db.query(
        SalesDaily.store_id, SalesDaily.sku_id, weekend, func.avg(SalesDaily.qty_sold)
    ).filter(
        SalesDaily.ts_date > start, SalesDaily.ts_date <= end
    ).group_by(SalesDaily.store_id, SalesDaily.sku_id, weekend).all()

    found: Dict[Tuple[int, int], Dict[int, float]] = defaultdict(dict)
    for store_id, sku_id, is_we, avg in rows:
        found[(store_id, sku_id)][int(is_we)] = float(avg)

    bases = {}
    for pair, by_flag in found.items():
        wd = by_flag.get(0)
        we = by_flag.get(1)
        # The generator sells ~30% more on weekends; keep that ratio when one side is missing
        if wd is None:
            wd = we / 1.3
        if we is None:
            we = wd * 1.3
        bases[pair] = (max(wd, 0.5), max(we, 0.5))
    return bases


def _hourly_bases(db: Session, end: date) -> Dict[Tuple[int, int], Dict[Tuple[int, bool], float]]:
    """Average units per (hour, weekend) for each store/SKU tracked hourly."""
    start = datetime.combine(end - timedelta(days=HOURLY_WINDOW_DAYS), datetime.min.time())
    stop = datetime.combine(end + timedelta(days=1), datetime.min.time())
    rows = db.query(
        SalesHourly.store_id, SalesHourly.sku_id, SalesHourly.hour_of_day,
        SalesHourly.day_of_week, func.avg(SalesHourly.qty_sold)
    ).filter(
        SalesHourly.ts_datetime >= start, SalesHourly.ts_datetime < stop
    ).group_by(
        SalesHourly.store_id, SalesHourly.sku_id, SalesHourly.hour_of_day, SalesHourly.day_of_week
    ).all()

    sums: Dict[Tuple[int, int], Dict[Tuple[int, bool], list]] = defaultdict(lambda: defaultdict(list))
    for store_id, sku_id, hour, dow, avg in rows:
        sums[(store_id, sku_id)][(hour, dow >= 5)].append(float(avg))
    return {
        pair: {key: sum(v) / len(v) for key, v in by_key.items()}
        for pair, by_key in sums.items()
    }


def last_snapshot_date(db: Session) -> Optional[date]:
    return db.query(func.max(InventorySnapshot.ts_date)).scalar()


def catch_up(db: Session, today: Optional[date] = None, rng: Optional[random.Random] = None) -> int:
    """
    Fill in every missing day through yesterday. Returns the number of days
    added, or -1 if the gap was too large and the data set was regenerated.
    """
    today = today or datetime.now().date()
    target = today - timedelta(days=1)
    last = last_snapshot_date(db)
    if last is None or last >= target:
        return 0

    gap = (target - last).days
    if gap > MAX_CATCH_UP_DAYS:
        log.info("Demo data is %s days old; regenerating instead of catching up", gap)
        from ..utils.demo_data import generate_demo_data
        db.close()
        generate_demo_data()
        return -1

    rng = rng or random.Random()

    # Scenario changes sit on yesterday's snapshot; undo them before building on top
    from .scenarios import end_inventory_scenarios
    end_inventory_scenarios(db)

    on_hand: Dict[Tuple[int, int], int] = {
        (s, k): q for s, k, q in db.query(
            InventorySnapshot.store_id, InventorySnapshot.sku_id, InventorySnapshot.on_hand
        ).filter(InventorySnapshot.ts_date == last).all()
    }
    bases = _demand_bases(db, last)
    hourly = _hourly_bases(db, last)
    policy = {pair: _reorder_policy(*pair) for pair in on_hand}
    pairs = sorted(on_hand)

    for offset in range(1, gap + 1):
        day = last + timedelta(days=offset)
        weekend = _is_weekend(day)
        snapshots, sales, receipts, counts = [], [], [], []

        # At most one unexplained loss per day across the whole chain
        loss_pair = rng.choice(pairs) if pairs and rng.random() < DAILY_ANOMALY_PROBABILITY else None

        for pair in pairs:
            store_id, sku_id = pair
            wd, we = bases.get(pair, (3.0, 3.9))
            base = we if weekend else wd
            stock = on_hand[pair]

            sold = min(stock, int(round(base * rng.uniform(0.7, 1.3))))
            stock -= sold

            reorder_point, up_to_min, up_to_max = policy[pair]
            received = 0
            if stock < base * reorder_point and rng.random() < REORDER_PROBABILITY:
                received = max(1, int(base * rng.uniform(up_to_min, up_to_max)) - stock)
            stock += received

            if pair == loss_pair and stock >= 12:
                loss = rng.randint(6, 14)
                stock -= loss
                db.add(AnomalyEvent(
                    store_id=store_id, sku_id=sku_id, ts_date=day, residual=-loss,
                    severity=classify_severity(-loss),
                    explanation_hint=f"Unexplained inventory drop of {loss} units. Possible shrink or unrecorded transaction.",
                ))

            on_hand[pair] = stock
            snapshots.append({"store_id": store_id, "sku_id": sku_id, "ts_date": day, "on_hand": stock})
            if sold:
                sales.append({"store_id": store_id, "sku_id": sku_id, "ts_date": day, "qty_sold": sold})
            if received:
                receipts.append({"store_id": store_id, "sku_id": sku_id, "ts_date": day, "qty_received": received})
            if rng.random() < CYCLE_COUNT_RATE:
                counts.append({
                    "store_id": store_id, "sku_id": sku_id, "ts_date": day,
                    "counted_qty": max(0, stock + rng.randint(-2, 2)),
                })

        hourly_rows = []
        for (store_id, sku_id), by_key in hourly.items():
            for hour in OPEN_HOURS:
                avg = by_key.get((hour, weekend)) or by_key.get((hour, not weekend))
                if not avg:
                    continue
                qty = int(round(avg * rng.uniform(0.85, 1.15)))
                if qty > 0:
                    hourly_rows.append({
                        "store_id": store_id, "sku_id": sku_id,
                        "ts_datetime": datetime.combine(day, datetime.min.time()).replace(hour=hour),
                        "qty_sold": qty, "hour_of_day": hour, "day_of_week": day.weekday(),
                        "is_peak_hour": hour in PEAK_HOURS,
                    })

        for model, rows in (
            (InventorySnapshot, snapshots), (SalesDaily, sales), (ReceiptsDaily, receipts),
            (CycleCount, counts), (SalesHourly, hourly_rows),
        ):
            if rows:
                db.execute(insert(model), rows)
        db.commit()

    prune(db, today)
    log.info("Demo data rolled forward %s day(s) to %s", gap, target)
    return gap


def prune(db: Session, today: Optional[date] = None) -> None:
    """Drop rows past their retention window."""
    today = today or datetime.now().date()
    daily_cutoff = today - timedelta(days=RETENTION_DAYS["daily"])
    for model in (InventorySnapshot, SalesDaily, ReceiptsDaily, AnomalyEvent):
        db.execute(delete(model).where(model.ts_date < daily_cutoff))
    db.execute(delete(CycleCount).where(CycleCount.ts_date < today - timedelta(days=RETENTION_DAYS["counts"])))
    hourly_cutoff = datetime.combine(today - timedelta(days=RETENTION_DAYS["hourly"]), datetime.min.time())
    db.execute(delete(SalesHourly).where(SalesHourly.ts_datetime < hourly_cutoff))
    prune_telemetry(db)
    db.commit()


def prune_telemetry(db: Session) -> None:
    cutoff = datetime.utcnow() - timedelta(hours=TELEMETRY_RETENTION_HOURS)
    db.execute(delete(Telemetry).where(Telemetry.ts_datetime < cutoff))
