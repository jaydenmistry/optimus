"""
Demand forecasting service with weekday/weekend patterns
"""
from datetime import datetime, timedelta, date
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models import SalesDaily, InventorySnapshot
from .request_cache import cached_sales


def calculate_weighted_average(values: List[float], decay: float = 0.95) -> float:
    """
    Calculate weighted moving average with exponential decay
    Recent values weighted higher
    """
    if not values:
        return 0.0
    
    weights = [decay ** i for i in range(len(values))]
    weights.reverse()  # Most recent gets highest weight
    
    weighted_sum = sum(v * w for v, w in zip(values, weights))
    weight_sum = sum(weights)
    
    return weighted_sum / weight_sum if weight_sum > 0 else 0.0


def get_sales_history(
    db: Session,
    store_id: int,
    sku_id: int,
    days: int = 28
) -> List[Dict]:
    """Get sales history for a store/SKU"""
    cached = cached_sales(store_id, sku_id, days)
    if cached is not None:
        return cached

    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)
    
    sales = db.query(SalesDaily).filter(
        SalesDaily.store_id == store_id,
        SalesDaily.sku_id == sku_id,
        SalesDaily.ts_date >= start_date,
        SalesDaily.ts_date <= end_date
    ).order_by(SalesDaily.ts_date).all()
    
    return [
        {
            "date": s.ts_date,
            "qty_sold": s.qty_sold,
            "is_weekend": s.ts_date.weekday() >= 5
        }
        for s in sales
    ]


def calculate_demand_forecast(
    db: Session,
    store_id: int,
    sku_id: int,
    window_days: int = 28
) -> Dict:
    """
    Calculate demand forecast using weighted moving average
    Accounts for weekday vs weekend patterns
    """
    # Get historical sales
    sales_history = get_sales_history(db, store_id, sku_id, window_days)
    
    if not sales_history:
        return {
            "daily_demand": 0.0,
            "demand_std": 0.0,
            "weekday_avg": 0.0,
            "weekend_avg": 0.0,
            "confidence": "low",
            "data_points": 0
        }
    
    # Separate weekday vs weekend
    weekday_sales = [s["qty_sold"] for s in sales_history if not s["is_weekend"]]
    weekend_sales = [s["qty_sold"] for s in sales_history if s["is_weekend"]]
    
    # Calculate weighted averages
    weekday_avg = calculate_weighted_average(weekday_sales) if weekday_sales else 0.0
    weekend_avg = calculate_weighted_average(weekend_sales) if weekend_sales else 0.0
    
    # Overall average (weighted by frequency: 5 weekdays, 2 weekend days)
    if weekday_avg > 0 or weekend_avg > 0:
        daily_demand = (weekday_avg * 5 + weekend_avg * 2) / 7
    else:
        daily_demand = 0.0
    
    # Calculate standard deviation for variability
    all_sales = [s["qty_sold"] for s in sales_history]
    if len(all_sales) > 1:
        mean = sum(all_sales) / len(all_sales)
        variance = sum((x - mean) ** 2 for x in all_sales) / len(all_sales)
        demand_std = variance ** 0.5
    else:
        demand_std = 0.0
    
    # Confidence based on data availability
    confidence = "high" if len(sales_history) >= window_days * 0.8 else \
                 "medium" if len(sales_history) >= window_days * 0.5 else "low"
    
    return {
        "daily_demand": round(daily_demand, 2),
        "demand_std": round(demand_std, 2),
        "weekday_avg": round(weekday_avg, 2),
        "weekend_avg": round(weekend_avg, 2),
        "confidence": confidence,
        "data_points": len(sales_history)
    }


def calculate_days_of_cover(
    db: Session,
    store_id: int,
    sku_id: int,
    on_hand: Optional[int] = None
) -> float:
    """
    Calculate days of cover (inventory / daily demand)
    """
    # Get current inventory if not provided
    if on_hand is None:
        latest_snapshot = db.query(InventorySnapshot).filter(
            InventorySnapshot.store_id == store_id,
            InventorySnapshot.sku_id == sku_id
        ).order_by(InventorySnapshot.ts_date.desc()).first()
        
        on_hand = latest_snapshot.on_hand if latest_snapshot else 0
    
    # Get demand forecast
    forecast = calculate_demand_forecast(db, store_id, sku_id)
    daily_demand = forecast["daily_demand"]
    
    # Avoid division by zero
    if daily_demand < 0.1:
        return 999.0  # Effectively infinite if no demand
    
    return round(on_hand / daily_demand, 2)


def predict_stockout_date(
    db: Session,
    store_id: int,
    sku_id: int,
    on_hand: Optional[int] = None
) -> Optional[date]:
    """
    Predict when SKU will stock out based on current inventory and demand
    """
    days_cover = calculate_days_of_cover(db, store_id, sku_id, on_hand)
    
    if days_cover >= 999:
        return None  # No stockout expected
    
    stockout_date = datetime.now().date() + timedelta(days=int(days_cover))
    return stockout_date


def calculate_reorder_point(
    db: Session,
    store_id: int,
    sku_id: int,
    lead_time_days: int = 3,
    safety_stock_days: int = 2
) -> Dict:
    """
    Calculate reorder point and recommended order quantity
    """
    forecast = calculate_demand_forecast(db, store_id, sku_id)
    daily_demand = forecast["daily_demand"]
    demand_std = forecast["demand_std"]
    
    # Reorder point = (daily_demand * lead_time) + safety_stock
    safety_stock = daily_demand * safety_stock_days + demand_std * 1.65  # 95% service level
    reorder_point = daily_demand * lead_time_days + safety_stock
    
    # Recommended order quantity (Economic Order Quantity simplified)
    # Order enough for 2 weeks
    order_qty = daily_demand * 14
    
    return {
        "reorder_point": round(reorder_point, 0),
        "order_qty": round(order_qty, 0),
        "safety_stock": round(safety_stock, 0),
        "lead_time_days": lead_time_days
    }


def get_forecast_next_n_days(
    db: Session,
    store_id: int,
    sku_id: int,
    days: int = 7
) -> List[Dict]:
    """
    Get demand forecast for next N days
    """
    forecast = calculate_demand_forecast(db, store_id, sku_id)
    weekday_avg = forecast["weekday_avg"]
    weekend_avg = forecast["weekend_avg"]
    
    predictions = []
    start_date = datetime.now().date() + timedelta(days=1)
    
    for i in range(days):
        pred_date = start_date + timedelta(days=i)
        is_weekend = pred_date.weekday() >= 5
        
        predicted_demand = weekend_avg if is_weekend else weekday_avg
        
        predictions.append({
            "date": pred_date.isoformat(),
            "predicted_demand": round(predicted_demand, 1),
            "is_weekend": is_weekend
        })
    
    return predictions
