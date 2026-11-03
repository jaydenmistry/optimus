"""
Overview dashboard API endpoints
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timedelta

from ..database import get_db
from ..models import Store, SKU, InventorySnapshot
from ..services.forecasting import (
    calculate_demand_forecast,
    calculate_days_of_cover,
    predict_stockout_date
)
from ..services.confidence_scorer import calculate_confidence_score
from ..services.transfer_optimizer import get_transfer_opportunities_summary

router = APIRouter()


@router.get("/stores")
async def list_stores(db: Session = Depends(get_db)):
    """
    List all stores (used by the store pickers in the UI)
    """
    stores = db.query(Store).order_by(Store.id).all()
    return [
        {"id": s.id, "name": s.name, "location": s.location}
        for s in stores
    ]


@router.get("/overview")
async def get_overview(
    store_id: Optional[int] = Query(None, description="Filter by store ID"),
    risk_only: bool = Query(False, description="Show only high-risk items"),
    min_confidence: int = Query(0, description="Minimum confidence score"),
    limit: int = Query(100, description="Maximum results"),
    db: Session = Depends(get_db)
):
    """
    Get inventory overview with health metrics
    """
    # Get latest inventory date
    latest_date = datetime.now().date() - timedelta(days=1)
    
    # Build query
    query = db.query(
        InventorySnapshot.store_id,
        InventorySnapshot.sku_id,
        InventorySnapshot.on_hand,
        Store.name.label("store_name"),
        SKU.name.label("sku_name"),
        SKU.category
    ).join(
        Store, InventorySnapshot.store_id == Store.id
    ).join(
        SKU, InventorySnapshot.sku_id == SKU.id
    ).filter(
        InventorySnapshot.ts_date == latest_date
    ).order_by(
        InventorySnapshot.store_id,  # Order by store first to distribute evenly
        InventorySnapshot.sku_id
    )
    
    # Apply filters
    if store_id:
        query = query.filter(InventorySnapshot.store_id == store_id)
    
    results = query.limit(limit * 10).all()  # Get 10x more records to ensure all stores represented
    
    items = []
    
    for store_id, sku_id, on_hand, store_name, sku_name, category in results:
        # Calculate metrics
        forecast = calculate_demand_forecast(db, store_id, sku_id)
        days_cover = calculate_days_of_cover(db, store_id, sku_id, on_hand)
        stockout_date = predict_stockout_date(db, store_id, sku_id, on_hand)
        confidence = calculate_confidence_score(db, store_id, sku_id)
        
        # Determine risk level
        if days_cover < 3:
            risk_level = "critical"
        elif days_cover < 7:
            risk_level = "high"
        elif days_cover < 14:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        # Determine suggested action
        if days_cover < 7:
            suggested_action = "Transfer or reorder immediately"
        elif confidence["score"] < 70:
            suggested_action = "Schedule cycle count"
        elif days_cover < 14:
            suggested_action = "Monitor closely"
        else:
            suggested_action = "No action needed"
        
        item = {
            "store_id": store_id,
            "store_name": store_name,
            "sku_id": sku_id,
            "sku_name": sku_name,
            "category": category,
            "on_hand": on_hand,
            "daily_demand": forecast["daily_demand"],
            "days_of_cover": days_cover,
            "stockout_date": stockout_date.isoformat() if stockout_date else None,
            "confidence_score": confidence["score"],
            "confidence_grade": confidence["grade"],
            "risk_level": risk_level,
            "suggested_action": suggested_action
        }
        
        # Apply filters
        if risk_only and risk_level not in ["critical", "high"]:
            continue
        
        if confidence["score"] < min_confidence:
            continue
        
        items.append(item)
    
    # Sort by risk (critical first)
    risk_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    items.sort(key=lambda x: (risk_order[x["risk_level"]], x["days_of_cover"]))
    
    # Limit results
    items = items[:limit]
    
    # Calculate alerts
    critical_stockouts = sum(1 for i in items if i["risk_level"] == "critical")
    low_confidence = sum(1 for i in items if i["confidence_score"] < 70)
    
    # Get transfer opportunities
    transfer_summary = get_transfer_opportunities_summary(db)
    
    return {
        "items": items,
        "total": len(items),
        "alerts": {
            "critical_stockouts": critical_stockouts,
            "low_confidence": low_confidence,
            "transfer_opportunities": transfer_summary["total_opportunities"]
        },
        "filters": {
            "store_id": store_id,
            "risk_only": risk_only,
            "min_confidence": min_confidence
        }
    }


@router.get("/alerts")
async def get_alerts(db: Session = Depends(get_db)):
    """
    Get top alerts for dashboard
    """
    latest_date = datetime.now().date() - timedelta(days=1)
    
    # Get critical stockouts
    critical_items = db.query(
        InventorySnapshot.store_id,
        InventorySnapshot.sku_id,
        Store.name.label("store_name"),
        SKU.name.label("sku_name")
    ).join(
        Store, InventorySnapshot.store_id == Store.id
    ).join(
        SKU, InventorySnapshot.sku_id == SKU.id
    ).filter(
        InventorySnapshot.ts_date == latest_date
    ).limit(50).all()
    
    critical_stockouts = []
    
    for store_id, sku_id, store_name, sku_name in critical_items:
        days_cover = calculate_days_of_cover(db, store_id, sku_id)
        
        if days_cover < 3:
            critical_stockouts.append({
                "store_name": store_name,
                "sku_name": sku_name,
                "days_of_cover": days_cover,
                "message": f"{sku_name} at {store_name} will stock out in {days_cover:.1f} days"
            })
    
    # Sort by urgency
    critical_stockouts.sort(key=lambda x: x["days_of_cover"])
    
    return {
        "critical_stockouts": critical_stockouts[:5],
        "total_critical": len(critical_stockouts)
    }
