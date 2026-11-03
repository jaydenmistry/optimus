"""
Cycle count model
"""
from sqlalchemy import Column, Integer, Date, ForeignKey, Index
from sqlalchemy.orm import relationship
from ..database import Base


class CycleCount(Base):
    """Physical inventory count model"""
    
    __tablename__ = "cycle_counts"
    # Per-item lookups filter on store + SKU + date
    __table_args__ = (Index("ix_cycle_counts_store_sku_date", "store_id", "sku_id", "ts_date"),)
    
    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    sku_id = Column(Integer, ForeignKey("skus.id"), nullable=False)
    ts_date = Column(Date, nullable=False, index=True)
    counted_qty = Column(Integer, nullable=False)
    
    # Relationships
    store = relationship("Store")
    sku = relationship("SKU")
    
    def __repr__(self):
        return f"<CycleCount(store={self.store_id}, sku={self.sku_id}, date={self.ts_date}, counted={self.counted_qty})>"
