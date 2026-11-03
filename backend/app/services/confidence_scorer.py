"""
Inventory accuracy confidence scoring service
"""
from datetime import datetime, timedelta
from typing import Dict
from sqlalchemy.orm import Session
from ..models import AnomalyEvent, CycleCount, SKU
from .anomaly_detector import find_anomaly_patterns
from .request_cache import cached_anomalies, cached_last_count_date, cached_sku


def calculate_confidence_score(
    db: Session,
    store_id: int,
    sku_id: int
) -> Dict:
    """
    Calculate inventory accuracy confidence score (0-100)
    Starts at 100, deducts points for various risk factors
    """
    score = 100.0
    deductions = []
    
    # Get SKU info
    hit = cached_sku(sku_id)
    sku = hit["sku"] if hit is not None else db.query(SKU).filter(SKU.id == sku_id).first()
    if not sku:
        return {"score": 0, "grade": "F", "deductions": ["SKU not found"]}
    
    # 1. Anomaly frequency penalty (max -30 points)
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=30)
    
    anomalies = cached_anomalies(store_id, sku_id, 30)
    if anomalies is None:
        anomalies = db.query(AnomalyEvent).filter(
            AnomalyEvent.store_id == store_id,
            AnomalyEvent.sku_id == sku_id,
            AnomalyEvent.ts_date >= start_date
        ).all()
    
    anomaly_count = len(anomalies)
    if anomaly_count > 0:
        anomaly_penalty = min(anomaly_count * 5, 30)
        score -= anomaly_penalty
        deductions.append(f"Anomaly frequency: -{anomaly_penalty} ({anomaly_count} events in 30 days)")
    
    # 2. Anomaly magnitude penalty (max -20 points)
    if anomalies:
        total_residual = sum(abs(a.residual) for a in anomalies)
        magnitude_penalty = min(total_residual * 0.5, 20)
        score -= magnitude_penalty
        deductions.append(f"Anomaly magnitude: -{magnitude_penalty:.0f} ({total_residual:.0f} units lost)")
    
    # 3. Days since last cycle count penalty (max -20 points)
    hit = cached_last_count_date(store_id, sku_id)
    if hit is not None:
        last_count_date = hit["date"]
    else:
        last_count = db.query(CycleCount).filter(
            CycleCount.store_id == store_id,
            CycleCount.sku_id == sku_id
        ).order_by(CycleCount.ts_date.desc()).first()
        last_count_date = last_count.ts_date if last_count else None
    
    if last_count_date:
        days_since_count = (datetime.now().date() - last_count_date).days
        count_penalty = min(days_since_count * 0.3, 20)
        score -= count_penalty
        deductions.append(f"Days since count: -{count_penalty:.0f} ({days_since_count} days)")
    else:
        score -= 30
        deductions.append("Never counted: -30")
    
    # 4. Perishable item penalty (if no recent count)
    if sku.is_perishable:
        if not last_count_date or (datetime.now().date() - last_count_date).days > 7:
            score -= 10
            deductions.append("Perishable without recent count: -10")
    
    # 5. Systematic shrink pattern penalty (max -15 points)
    pattern = find_anomaly_patterns(db, store_id, sku_id, days=30)
    if pattern["has_pattern"]:
        score -= 15
        deductions.append(f"Systematic shrink pattern: -15 ({pattern['negative_ratio']*100:.0f}% negative)")
    
    # Ensure score is between 0 and 100
    final_score = max(0, min(100, score))
    
    # Assign grade
    if final_score >= 90:
        grade = "A"
    elif final_score >= 80:
        grade = "B"
    elif final_score >= 70:
        grade = "C"
    elif final_score >= 60:
        grade = "D"
    else:
        grade = "F"
    
    return {
        "score": round(final_score, 1),
        "grade": grade,
        "deductions": deductions,
        "anomaly_count": anomaly_count,
        "days_since_count": days_since_count if last_count_date else None,
        "has_systematic_pattern": pattern["has_pattern"]
    }


def get_low_confidence_items(
    db: Session,
    threshold: int = 70,
    limit: int = 50
) -> list:
    """
    Get store/SKU combinations with low confidence scores
    """
    # Get all recent inventory items
    recent_date = datetime.now().date() - timedelta(days=1)
    
    from ..models import InventorySnapshot
    recent_items = db.query(
        InventorySnapshot.store_id,
        InventorySnapshot.sku_id
    ).filter(
        InventorySnapshot.ts_date == recent_date
    ).limit(limit * 2).all()  # Get more than needed, filter by score
    
    low_confidence_items = []
    
    for store_id, sku_id in recent_items:
        confidence = calculate_confidence_score(db, store_id, sku_id)
        
        if confidence["score"] < threshold:
            low_confidence_items.append({
                "store_id": store_id,
                "sku_id": sku_id,
                "confidence": confidence
            })
    
    # Sort by score (lowest first)
    low_confidence_items.sort(key=lambda x: x["confidence"]["score"])
    
    return low_confidence_items[:limit]


def recommend_cycle_count_priority(
    db: Session,
    store_id: int,
    limit: int = 20
) -> list:
    """
    Recommend which SKUs should be cycle counted first
    Based on confidence score and business impact
    """
    from ..models import InventorySnapshot, SKU
    
    # Get all SKUs at this store
    recent_date = datetime.now().date() - timedelta(days=1)
    
    items = db.query(
        InventorySnapshot.sku_id,
        InventorySnapshot.on_hand,
        SKU.name,
        SKU.category,
        SKU.price,
        SKU.is_perishable
    ).join(
        SKU, InventorySnapshot.sku_id == SKU.id
    ).filter(
        InventorySnapshot.store_id == store_id,
        InventorySnapshot.ts_date == recent_date
    ).all()
    
    recommendations = []
    
    for sku_id, on_hand, name, category, price, is_perishable in items:
        confidence = calculate_confidence_score(db, store_id, sku_id)
        
        # Calculate priority score
        # Lower confidence = higher priority
        # Higher value = higher priority
        # Perishable = higher priority
        
        confidence_factor = (100 - confidence["score"]) / 100  # 0-1, higher is worse
        value_factor = min(on_hand * price / 1000, 1.0)  # Normalize value
        perishable_factor = 0.3 if is_perishable else 0
        
        priority_score = confidence_factor * 0.6 + value_factor * 0.3 + perishable_factor
        
        recommendations.append({
            "sku_id": sku_id,
            "sku_name": name,
            "category": category,
            "confidence": confidence,
            "on_hand": on_hand,
            "value": round(on_hand * price, 2),
            "is_perishable": is_perishable,
            "priority_score": round(priority_score, 3),
            "priority": "High" if priority_score > 0.7 else "Medium" if priority_score > 0.4 else "Low"
        })
    
    # Sort by priority score (highest first)
    recommendations.sort(key=lambda x: x["priority_score"], reverse=True)
    
    return recommendations[:limit]
