"""
Request-scoped prefetch cache.

The overview and transfer endpoints score hundreds of store/SKU pairs per
request. Each score used to run its own small queries (sales history,
anomalies, last cycle count, SKU), and the same pair was often scored several
times, so a single page load ran thousands of queries.

`with_request_cache` loads those inputs for every pair in a handful of bulk
queries at the start of the request, and the service functions read from
memory while it is active. Outside a cached request the services fall back to
their normal per-pair queries, so results are identical either way.
"""
import functools
from collections import defaultdict
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import SKU, AnomalyEvent, CycleCount, SalesDaily

SALES_WINDOW_DAYS = 28
ANOMALY_WINDOW_DAYS = 30

_cache: ContextVar[Optional[Dict]] = ContextVar("request_cache", default=None)


def _load(db: Session) -> Dict:
    today = datetime.now().date()

    # Daily sales for the forecast window, oldest first (matches get_sales_history)
    sales_start = today - timedelta(days=SALES_WINDOW_DAYS)
    sales: Dict = defaultdict(list)
    for store_id, sku_id, ts_date, qty_sold in db.query(
        SalesDaily.store_id, SalesDaily.sku_id, SalesDaily.ts_date, SalesDaily.qty_sold
    ).filter(
        SalesDaily.ts_date >= sales_start,
        SalesDaily.ts_date <= today,
    ).order_by(SalesDaily.ts_date).all():
        sales[(store_id, sku_id)].append({
            "date": ts_date,
            "qty_sold": qty_sold,
            "is_weekend": ts_date.weekday() >= 5,
        })

    # Anomalies in the confidence window, in insertion order
    anomaly_start = today - timedelta(days=ANOMALY_WINDOW_DAYS)
    anomalies: Dict = defaultdict(list)
    for a in db.query(AnomalyEvent).filter(
        AnomalyEvent.ts_date >= anomaly_start
    ).order_by(AnomalyEvent.id).all():
        anomalies[(a.store_id, a.sku_id)].append(a)

    # Most recent cycle count date per pair
    last_counts = {
        (store_id, sku_id): last_date
        for store_id, sku_id, last_date in db.query(
            CycleCount.store_id, CycleCount.sku_id, func.max(CycleCount.ts_date)
        ).group_by(CycleCount.store_id, CycleCount.sku_id).all()
    }

    skus = {s.id: s for s in db.query(SKU).all()}

    return {
        "today": today,
        "sales": sales,
        "anomalies": anomalies,
        "last_counts": last_counts,
        "skus": skus,
    }


@contextmanager
def request_cache(db: Session):
    token = _cache.set(_load(db))
    try:
        yield
    finally:
        _cache.reset(token)


def with_request_cache(endpoint):
    """Decorator for async FastAPI endpoints that take a `db` session."""
    @functools.wraps(endpoint)
    async def wrapper(*args, **kwargs):
        with request_cache(kwargs["db"]):
            return await endpoint(*args, **kwargs)
    return wrapper


def _active() -> Optional[Dict]:
    cache = _cache.get()
    # Ignore a cache built before midnight; the date windows would be off by one
    if cache is None or cache["today"] != datetime.now().date():
        return None
    return cache


# --- Lookups used by the services. Each returns None when no cache is active
# --- (or the request is outside the cached window) so callers can fall back.

def cached_sales(store_id: int, sku_id: int, days: int) -> Optional[List[Dict]]:
    cache = _active()
    if cache is None or days != SALES_WINDOW_DAYS:
        return None
    return list(cache["sales"].get((store_id, sku_id), []))


def cached_anomalies(store_id: int, sku_id: int, days: int) -> Optional[List[AnomalyEvent]]:
    """Anomalies with ts_date >= today - days (no upper bound), insertion order."""
    cache = _active()
    if cache is None or days != ANOMALY_WINDOW_DAYS:
        return None
    return list(cache["anomalies"].get((store_id, sku_id), []))


def cached_last_count_date(store_id: int, sku_id: int) -> Optional[Dict]:
    """{'date': date | None} when cached, None when there is no cache."""
    cache = _active()
    if cache is None:
        return None
    return {"date": cache["last_counts"].get((store_id, sku_id))}


def cached_sku(sku_id: int) -> Optional[Dict]:
    """{'sku': SKU | None} when cached, None when there is no cache."""
    cache = _active()
    if cache is None:
        return None
    return {"sku": cache["skus"].get(sku_id)}
