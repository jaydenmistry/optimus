"""
Transfer management API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Literal, Optional

from ..database import get_db
from ..models import Transfer, Store, SKU
from ..services.transfer_optimizer import (
    generate_transfer_recommendations,
    save_transfer_recommendations,
    create_transfer_from_recommendation,
    get_transfer_opportunities_summary
)
from ..services.request_cache import with_request_cache
from ..security import require_admin

router = APIRouter()


TransferStatus = Literal["draft", "approved", "in_transit", "received", "cancelled"]

# Allowed lifecycle moves. Received and cancelled transfers are final.
ALLOWED_TRANSITIONS = {
    "draft": {"approved", "cancelled"},
    "approved": {"in_transit", "cancelled"},
    "in_transit": {"received"},
    "received": set(),
    "cancelled": set(),
}


class TransferCreate(BaseModel):
    from_store_id: int = Field(..., ge=1)
    to_store_id: int = Field(..., ge=1)
    sku_id: int = Field(..., ge=1)
    qty: int = Field(..., ge=1, le=10_000)
    recommendation_id: Optional[int] = None


class TransferUpdate(BaseModel):
    status: TransferStatus


@router.get("/transfers/recommendations")
@with_request_cache
async def get_transfer_recommendations(
    min_urgency: float = Query(0.5, ge=0, le=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """
    Get transfer recommendations
    """
    recommendations = generate_transfer_recommendations(
        db,
        min_urgency=min_urgency
    )
    
    # Limit results
    recommendations = recommendations[:limit]
    
    # Group by receiver store
    grouped = {}
    for rec in recommendations:
        receiver_name = rec['to_store_name']
        if receiver_name not in grouped:
            grouped[receiver_name] = []
        grouped[receiver_name].append(rec)
    
    return {
        "recommendations": recommendations,
        "grouped_by_receiver": grouped,
        "total": len(recommendations),
        "summary": get_transfer_opportunities_summary(db)
    }


@router.post("/transfers/draft")
async def create_transfer_draft(
    transfer: TransferCreate,
    db: Session = Depends(get_db)
):
    """
    Create a transfer draft
    """
    # Validate stores and SKU exist
    from_store = db.query(Store).filter(Store.id == transfer.from_store_id).first()
    to_store = db.query(Store).filter(Store.id == transfer.to_store_id).first()
    sku = db.query(SKU).filter(SKU.id == transfer.sku_id).first()
    
    if not from_store or not to_store or not sku:
        raise HTTPException(status_code=404, detail="Store or SKU not found")
    
    if transfer.from_store_id == transfer.to_store_id:
        raise HTTPException(status_code=400, detail="Cannot transfer to same store")
    
    # Create transfer
    new_transfer = Transfer(
        from_store_id=transfer.from_store_id,
        to_store_id=transfer.to_store_id,
        sku_id=transfer.sku_id,
        qty=transfer.qty,
        status="draft"
    )
    db.add(new_transfer)
    db.commit()
    db.refresh(new_transfer)
    
    return {
        "id": new_transfer.id,
        "from_store_id": new_transfer.from_store_id,
        "from_store_name": from_store.name,
        "to_store_id": new_transfer.to_store_id,
        "to_store_name": to_store.name,
        "sku_id": new_transfer.sku_id,
        "sku_name": sku.name,
        "qty": new_transfer.qty,
        "status": new_transfer.status,
        "created_at": new_transfer.created_at.isoformat()
    }


@router.get("/transfers")
async def get_transfers(
    status: Optional[TransferStatus] = None,
    store_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """
    Get transfers with optional filters
    """
    query = db.query(Transfer)
    
    if status:
        query = query.filter(Transfer.status == status)
    
    if store_id:
        query = query.filter(
            (Transfer.from_store_id == store_id) | (Transfer.to_store_id == store_id)
        )
    
    transfers = query.order_by(Transfer.created_at.desc()).limit(limit).all()
    
    result = []
    for t in transfers:
        from_store = db.query(Store).filter(Store.id == t.from_store_id).first()
        to_store = db.query(Store).filter(Store.id == t.to_store_id).first()
        sku = db.query(SKU).filter(SKU.id == t.sku_id).first()
        
        result.append({
            "id": t.id,
            "from_store_id": t.from_store_id,
            "from_store_name": from_store.name if from_store else None,
            "to_store_id": t.to_store_id,
            "to_store_name": to_store.name if to_store else None,
            "sku_id": t.sku_id,
            "sku_name": sku.name if sku else None,
            "qty": t.qty,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
            "received_at": t.received_at.isoformat() if t.received_at else None
        })
    
    return {
        "transfers": result,
        "total": len(result)
    }


@router.patch("/transfers/{transfer_id}")
async def update_transfer(
    transfer_id: int,
    update: TransferUpdate,
    db: Session = Depends(get_db)
):
    """
    Update transfer status
    """
    transfer = db.query(Transfer).filter(Transfer.id == transfer_id).first()
    
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    # Validate status transition
    if update.status not in ALLOWED_TRANSITIONS.get(transfer.status, set()):
        raise HTTPException(
            status_code=409,
            detail=f"Can't move a transfer from {transfer.status} to {update.status}."
        )
    
    transfer.status = update.status
    
    # Set received_at if status is received
    if update.status == "received":
        from datetime import datetime
        transfer.received_at = datetime.utcnow()
    
    db.commit()
    db.refresh(transfer)
    
    return {
        "id": transfer.id,
        "status": transfer.status,
        "received_at": transfer.received_at.isoformat() if transfer.received_at else None
    }


@router.post("/transfers/generate-recommendations", dependencies=[Depends(require_admin)])
@with_request_cache
async def generate_and_save_recommendations(
    target_cover_days: int = Query(10, ge=1, le=60),
    safety_buffer_days: int = Query(2, ge=0, le=30),
    min_urgency: float = Query(0.5, ge=0, le=1),
    db: Session = Depends(get_db)
):
    """
    Generate and save transfer recommendations
    """
    recommendations = generate_transfer_recommendations(
        db,
        target_cover_days=target_cover_days,
        safety_buffer_days=safety_buffer_days,
        min_urgency=min_urgency
    )
    
    saved_count = save_transfer_recommendations(db, recommendations)
    
    return {
        "generated": len(recommendations),
        "saved": saved_count,
        "message": f"Generated and saved {saved_count} transfer recommendations"
    }
