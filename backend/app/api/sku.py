"""
SKU detail API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from ..database import get_db
from ..models import Store, SKU, InventorySnapshot, SalesDaily, AnomalyEvent
from ..services.forecasting import (
    calculate_demand_forecast,
    calculate_days_of_cover,
    predict_stockout_date,
    calculate_reorder_point,
    get_forecast_next_n_days
)
from ..services.confidence_scorer import calculate_confidence_score
from ..services.anomaly_detector import find_anomaly_patterns

router = APIRouter()


@router.get("/sku/{store_id}/{sku_id}")
async def get_sku_detail(
    store_id: int,
    sku_id: int,
    days_history: int = Query(30, ge=1, le=120),
    db: Session = Depends(get_db)
):
    """
    Get detailed SKU information with forecast, anomalies, and recommendations
    """
    # Get store and SKU info
    store = db.query(Store).filter(Store.id == store_id).first()
    sku = db.query(SKU).filter(SKU.id == sku_id).first()
    
    if not store or not sku:
        raise HTTPException(status_code=404, detail="Store or SKU not found")
    
    # Get current inventory
    latest_snapshot = db.query(InventorySnapshot).filter(
        InventorySnapshot.store_id == store_id,
        InventorySnapshot.sku_id == sku_id
    ).order_by(InventorySnapshot.ts_date.desc()).first()
    
    on_hand = latest_snapshot.on_hand if latest_snapshot else 0
    
    # Calculate metrics
    forecast = calculate_demand_forecast(db, store_id, sku_id)
    days_cover = calculate_days_of_cover(db, store_id, sku_id, on_hand)
    stockout_date = predict_stockout_date(db, store_id, sku_id, on_hand)
    confidence = calculate_confidence_score(db, store_id, sku_id)
    reorder = calculate_reorder_point(db, store_id, sku_id)
    next_7_days = get_forecast_next_n_days(db, store_id, sku_id, 7)
    
    # Get historical data
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days_history)
    
    history = db.query(
        InventorySnapshot.ts_date,
        InventorySnapshot.on_hand,
        SalesDaily.qty_sold
    ).outerjoin(
        SalesDaily,
        (SalesDaily.store_id == InventorySnapshot.store_id) &
        (SalesDaily.sku_id == InventorySnapshot.sku_id) &
        (SalesDaily.ts_date == InventorySnapshot.ts_date)
    ).filter(
        InventorySnapshot.store_id == store_id,
        InventorySnapshot.sku_id == sku_id,
        InventorySnapshot.ts_date >= start_date
    ).order_by(InventorySnapshot.ts_date).all()
    
    history_data = [
        {
            "date": h.ts_date.isoformat(),
            "on_hand": h.on_hand,
            "sales": h.qty_sold if h.qty_sold else 0
        }
        for h in history
    ]
    
    # Get anomalies
    anomalies = db.query(AnomalyEvent).filter(
        AnomalyEvent.store_id == store_id,
        AnomalyEvent.sku_id == sku_id,
        AnomalyEvent.ts_date >= start_date
    ).order_by(AnomalyEvent.ts_date.desc()).all()
    
    anomaly_data = [
        {
            "date": a.ts_date.isoformat(),
            "residual": a.residual,
            "severity": a.severity,
            "explanation": a.explanation_hint
        }
        for a in anomalies
    ]
    
    # Get anomaly patterns
    patterns = find_anomaly_patterns(db, store_id, sku_id)
    
    # Generate recommendations
    recommendations = {
        "reorder": {
            "recommended": days_cover < 14,
            "qty": int(reorder["order_qty"]),
            "reorder_point": int(reorder["reorder_point"]),
            "reason": f"Current stock will last {days_cover:.1f} days. Reorder when inventory drops below {reorder['reorder_point']:.0f} units."
        },
        "transfer": {
            "recommended": days_cover < 7,
            "reason": "Check transfer recommendations page for available donors" if days_cover < 7 else None
        },
        "cycle_count": {
            "recommended": confidence["score"] < 80,
            "priority": "High" if confidence["score"] < 60 else "Medium" if confidence["score"] < 80 else "Low",
            "reason": f"Confidence score is {confidence['score']:.0f}%. Physical count recommended."
        }
    }
    
    return {
        "store": {
            "id": store.id,
            "name": store.name,
            "location": store.location
        },
        "sku": {
            "id": sku.id,
            "name": sku.name,
            "category": sku.category,
            "cost": sku.cost,
            "price": sku.price,
            "is_perishable": sku.is_perishable
        },
        "current_state": {
            "on_hand": on_hand,
            "daily_demand": forecast["daily_demand"],
            "days_of_cover": days_cover,
            "stockout_date": stockout_date.isoformat() if stockout_date else None,
            "confidence_score": confidence["score"],
            "confidence_grade": confidence["grade"]
        },
        "forecast": {
            **forecast,
            "next_7_days": next_7_days
        },
        "history": history_data,
        "anomalies": anomaly_data,
        "anomaly_patterns": patterns,
        "confidence_details": confidence,
        "recommendations": recommendations
    }
