"""
Peak hour forecasting API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from ..database import get_db
from ..models import Store, SKU, InventorySnapshot
from ..services.peak_hour_forecasting import (
    get_peak_hour_summary,
    generate_prep_schedule,
    save_prep_recommendations,
    get_hourly_forecast_for_day,
    predict_stockout_time
)

router = APIRouter()


@router.get("/peak-hours/{store_id}")
async def get_peak_hours_dashboard(
    store_id: int,
    db: Session = Depends(get_db)
):
    """
    Get peak hour dashboard data for a store
    """
    # Verify store exists
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    # Get peak hour summary
    summary = get_peak_hour_summary(db, store_id)
    
    # Generate prep schedule
    prep_schedule = generate_prep_schedule(db, store_id)
    
    # Get critical items (proteins and popular items) - LIMIT TO 5 FOR PERFORMANCE
    critical_skus = db.query(SKU).filter(
        SKU.category.in_(["Proteins", "Salsas & Sauces"])
    ).limit(5).all()
    
    critical_items = []
    
    for sku in critical_skus:
        latest_snapshot = db.query(InventorySnapshot).filter(
            InventorySnapshot.store_id == store_id,
            InventorySnapshot.sku_id == sku.id
        ).order_by(InventorySnapshot.ts_date.desc()).first()
        
        if latest_snapshot:
            stockout_pred = predict_stockout_time(
                db, store_id, sku.id, latest_snapshot.on_hand
            )
            
            hourly_forecast = get_hourly_forecast_for_day(db, store_id, sku.id)
            
            critical_items.append({
                "sku_id": sku.id,
                "sku_name": sku.name,
                "category": sku.category,
                "on_hand": latest_snapshot.on_hand,
                "stockout_prediction": stockout_pred,
                "hourly_forecast": hourly_forecast
            })
    
    return {
        "store": {
            "id": store.id,
            "name": store.name,
            "location": store.location
        },
        "summary": summary,
        "prep_schedule": prep_schedule,
        "critical_items": critical_items,
        "total_prep_tasks": len(prep_schedule)
    }


@router.get("/prep-schedule/{store_id}")
async def get_prep_schedule_endpoint(
    store_id: int,
    prep_lead_time: int = Query(2, ge=0, le=12, description="Prep lead time in hours"),
    db: Session = Depends(get_db)
):
    """
    Get prep schedule recommendations for a store
    """
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    prep_schedule = generate_prep_schedule(db, store_id, prep_lead_time)
    
    # Save recommendations
    saved_count = save_prep_recommendations(db, store_id, prep_schedule)
    
    return {
        "store_id": store_id,
        "store_name": store.name,
        "prep_schedule": prep_schedule,
        "total_tasks": len(prep_schedule),
        "saved": saved_count,
        "critical_tasks": sum(1 for p in prep_schedule if p["priority"] == "critical"),
        "high_priority_tasks": sum(1 for p in prep_schedule if p["priority"] == "high")
    }


@router.get("/sku/{store_id}/{sku_id}/hourly")
async def get_sku_hourly_forecast(
    store_id: int,
    sku_id: int,
    db: Session = Depends(get_db)
):
    """
    Get hourly forecast for a specific SKU
    """
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
    
    # Get hourly forecast
    hourly_forecast = get_hourly_forecast_for_day(db, store_id, sku_id)
    
    # Predict stockout
    stockout_pred = predict_stockout_time(db, store_id, sku_id, on_hand)
    
    # Calculate cumulative demand and remaining inventory by hour
    remaining = on_hand
    forecast_with_inventory = []
    
    for forecast in hourly_forecast:
        remaining -= forecast["predicted_demand"]
        forecast_with_inventory.append({
            **forecast,
            "remaining_inventory": max(0, round(remaining, 1)),
            "will_stockout_this_hour": remaining <= 0
        })
    
    return {
        "store": {"id": store.id, "name": store.name},
        "sku": {"id": sku.id, "name": sku.name, "category": sku.category},
        "current_on_hand": on_hand,
        "hourly_forecast": forecast_with_inventory,
        "stockout_prediction": stockout_pred,
        "peak_hours": {
            "lunch": [11, 12, 13],
            "dinner": [17, 18, 19]
        }
    }
