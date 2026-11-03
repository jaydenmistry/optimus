"""
Anomaly detection service with explainable results
"""
from datetime import datetime, timedelta, date
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from ..models import (
    InventorySnapshot, SalesDaily, ReceiptsDaily, 
    Transfer, AnomalyEvent
)
from .request_cache import cached_anomalies


def detect_anomalies(
    db: Session,
    store_id: int,
    sku_id: int,
    check_date: date,
    threshold: float = -5.0
) -> Optional[Dict]:
    """
    Detect inventory anomalies by comparing expected vs actual changes
    Returns anomaly details if detected, None otherwise
    """
    # Get inventory snapshots
    today_snapshot = db.query(InventorySnapshot).filter(
        InventorySnapshot.store_id == store_id,
        InventorySnapshot.sku_id == sku_id,
        InventorySnapshot.ts_date == check_date
    ).first()
    
    yesterday_snapshot = db.query(InventorySnapshot).filter(
        InventorySnapshot.store_id == store_id,
        InventorySnapshot.sku_id == sku_id,
        InventorySnapshot.ts_date == check_date - timedelta(days=1)
    ).first()
    
    if not today_snapshot or not yesterday_snapshot:
        return None
    
    # Calculate actual change
    actual_delta = today_snapshot.on_hand - yesterday_snapshot.on_hand
    
    # Calculate expected change
    # Expected = receipts - sales + transfers_in - transfers_out
    
    # Get receipts
    receipts = db.query(ReceiptsDaily).filter(
        ReceiptsDaily.store_id == store_id,
        ReceiptsDaily.sku_id == sku_id,
        ReceiptsDaily.ts_date == check_date
    ).first()
    receipts_qty = receipts.qty_received if receipts else 0
    
    # Get sales
    sales = db.query(SalesDaily).filter(
        SalesDaily.store_id == store_id,
        SalesDaily.sku_id == sku_id,
        SalesDaily.ts_date == check_date
    ).first()
    sales_qty = sales.qty_sold if sales else 0
    
    # Get transfers in
    transfers_in = db.query(Transfer).filter(
        Transfer.to_store_id == store_id,
        Transfer.sku_id == sku_id,
        Transfer.received_at == check_date,
        Transfer.status == 'received'
    ).all()
    transfers_in_qty = sum(t.qty for t in transfers_in)
    
    # Get transfers out
    transfers_out = db.query(Transfer).filter(
        Transfer.from_store_id == store_id,
        Transfer.sku_id == sku_id,
        Transfer.created_at >= datetime.combine(check_date, datetime.min.time()),
        Transfer.created_at < datetime.combine(check_date + timedelta(days=1), datetime.min.time()),
        Transfer.status.in_(['approved', 'in_transit', 'received'])
    ).all()
    transfers_out_qty = sum(t.qty for t in transfers_out)
    
    # Calculate expected delta
    expected_delta = receipts_qty - sales_qty + transfers_in_qty - transfers_out_qty
    
    # Calculate residual (unexplained change)
    residual = actual_delta - expected_delta
    
    # Check if anomaly
    if residual < threshold:
        severity = classify_severity(residual)
        explanation = generate_explanation(
            residual, receipts_qty, sales_qty, 
            transfers_in_qty, transfers_out_qty,
            expected_delta, actual_delta
        )
        
        return {
            "is_anomaly": True,
            "residual": round(residual, 2),
            "severity": severity,
            "explanation": explanation,
            "expected_delta": expected_delta,
            "actual_delta": actual_delta,
            "receipts": receipts_qty,
            "sales": sales_qty,
            "transfers_in": transfers_in_qty,
            "transfers_out": transfers_out_qty
        }
    
    return None


def classify_severity(residual: float) -> str:
    """Classify anomaly severity based on magnitude"""
    if residual < -20:
        return "critical"
    elif residual < -15:
        return "high"
    elif residual < -10:
        return "medium"
    else:
        return "low"


def generate_explanation(
    residual: float,
    receipts: int,
    sales: int,
    transfers_in: int,
    transfers_out: int,
    expected_delta: int,
    actual_delta: int
) -> str:
    """
    Generate plain-English explanation for anomaly
    """
    abs_residual = abs(residual)
    
    # Case 1: Receiving error
    if receipts > 0 and residual < -5:
        return f"Expected +{receipts} units from shipment, but inventory only increased by {actual_delta} units. Possible receiving error, damage, or theft during receiving. Missing {abs_residual:.0f} units."
    
    # Case 2: Sales with unexplained drop
    if sales > 0 and residual < -5:
        return f"Expected -{sales} units from sales, but inventory dropped by {abs(actual_delta)} units. Possible shrink, unrecorded sales, or theft. Missing {abs_residual:.0f} units."
    
    # Case 3: Transfer discrepancy
    if (transfers_in > 0 or transfers_out > 0) and residual < -5:
        return f"Expected change of {expected_delta:+d} units from transfers, but actual change was {actual_delta:+d}. Transfer discrepancy of {abs_residual:.0f} units."
    
    # Case 4: No transactions but inventory dropped
    if receipts == 0 and sales == 0 and residual < -5:
        return f"Inventory dropped by {abs_residual:.0f} units with no recorded transactions. Likely theft, damage, or system error."
    
    # Default
    return f"Unexplained inventory change of {residual:.0f} units. Expected {expected_delta:+d}, actual {actual_delta:+d}."


def find_anomaly_patterns(
    db: Session,
    store_id: int,
    sku_id: int,
    days: int = 30
) -> Dict:
    """
    Find patterns in anomalies (e.g., systematic shrink)
    """
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)
    
    cached = cached_anomalies(store_id, sku_id, days)
    if cached is not None:
        anomalies = sorted((a for a in cached if a.ts_date <= end_date), key=lambda a: a.ts_date)
    else:
        anomalies = db.query(AnomalyEvent).filter(
            AnomalyEvent.store_id == store_id,
            AnomalyEvent.sku_id == sku_id,
            AnomalyEvent.ts_date >= start_date,
            AnomalyEvent.ts_date <= end_date
        ).order_by(AnomalyEvent.ts_date).all()
    
    if not anomalies:
        return {
            "has_pattern": False,
            "pattern_type": None,
            "frequency": 0,
            "total_loss": 0
        }
    
    # Check for systematic shrink (consistent negative residuals)
    negative_count = sum(1 for a in anomalies if a.residual < 0)
    total_loss = sum(abs(a.residual) for a in anomalies if a.residual < 0)
    
    # Pattern detected if 60%+ of anomalies are negative
    has_systematic_shrink = negative_count >= len(anomalies) * 0.6
    
    return {
        "has_pattern": has_systematic_shrink,
        "pattern_type": "systematic_shrink" if has_systematic_shrink else None,
        "frequency": len(anomalies),
        "total_loss": round(total_loss, 2),
        "negative_ratio": round(negative_count / len(anomalies), 2) if anomalies else 0
    }


def scan_for_anomalies(
    db: Session,
    days_back: int = 7,
    threshold: float = -5.0
) -> List[Dict]:
    """
    Scan all store/SKU combinations for anomalies in recent days
    """
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days_back)
    
    # Get all unique store/SKU combinations with recent activity
    recent_snapshots = db.query(
        InventorySnapshot.store_id,
        InventorySnapshot.sku_id
    ).filter(
        InventorySnapshot.ts_date >= start_date
    ).distinct().all()
    
    detected_anomalies = []
    
    for store_id, sku_id in recent_snapshots:
        for day_offset in range(days_back):
            check_date = end_date - timedelta(days=day_offset)
            
            anomaly = detect_anomalies(db, store_id, sku_id, check_date, threshold)
            
            if anomaly:
                # Check if already recorded
                existing = db.query(AnomalyEvent).filter(
                    AnomalyEvent.store_id == store_id,
                    AnomalyEvent.sku_id == sku_id,
                    AnomalyEvent.ts_date == check_date
                ).first()
                
                if not existing:
                    # Record new anomaly
                    new_anomaly = AnomalyEvent(
                        store_id=store_id,
                        sku_id=sku_id,
                        ts_date=check_date,
                        residual=anomaly["residual"],
                        severity=anomaly["severity"],
                        explanation_hint=anomaly["explanation"]
                    )
                    db.add(new_anomaly)
                    detected_anomalies.append({
                        "store_id": store_id,
                        "sku_id": sku_id,
                        "date": check_date.isoformat(),
                        **anomaly
                    })
    
    db.commit()
    
    return detected_anomalies
