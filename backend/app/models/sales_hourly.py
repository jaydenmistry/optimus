"""
Hourly sales model for peak hour forecasting
"""
from sqlalchemy import Column, Integer, DateTime, ForeignKey, Boolean, Index
from sqlalchemy.orm import relationship
from ..database import Base


class SalesHourly(Base):
    """Hourly sales transactions model for intra-day forecasting"""
    
    __tablename__ = "sales_hourly"
    # Per-item lookups filter on store + SKU + date
    __table_args__ = (Index("ix_sales_hourly_store_sku_date", "store_id", "sku_id", "ts_datetime"),)
    
    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    sku_id = Column(Integer, ForeignKey("skus.id"), nullable=False)
    ts_datetime = Column(DateTime, nullable=False, index=True)
    qty_sold = Column(Integer, nullable=False, default=0)
    hour_of_day = Column(Integer, nullable=False)  # 0-23
    day_of_week = Column(Integer, nullable=False)  # 0-6 (Monday=0)
    is_peak_hour = Column(Boolean, default=False)  # Lunch/dinner rush
    
    # Relationships
    store = relationship("Store")
    sku = relationship("SKU")
    
    def __repr__(self):
        return f"<SalesHourly(store={self.store_id}, sku={self.sku_id}, datetime={self.ts_datetime}, qty={self.qty_sold})>"
