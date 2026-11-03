"""
Anomaly event model
"""
from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, Text, Index
from sqlalchemy.orm import relationship
from ..database import Base


class AnomalyEvent(Base):
    """Detected inventory anomaly model"""
    
    __tablename__ = "anomaly_events"
    # Per-item lookups filter on store + SKU + date
    __table_args__ = (Index("ix_anomaly_events_store_sku_date", "store_id", "sku_id", "ts_date"),)
    
    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    sku_id = Column(Integer, ForeignKey("skus.id"), nullable=False)
    ts_date = Column(Date, nullable=False, index=True)
    residual = Column(Float, nullable=False)  # Unexplained inventory change
    severity = Column(String, nullable=False)  # low, medium, high, critical
    explanation_hint = Column(Text, nullable=True)  # Plain-English explanation
    
    # Relationships
    store = relationship("Store")
    sku = relationship("SKU")
    
    def __repr__(self):
        return f"<AnomalyEvent(store={self.store_id}, sku={self.sku_id}, date={self.ts_date}, residual={self.residual}, severity='{self.severity}')>"
