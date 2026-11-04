"""
Simulation scenario model (demo mode)
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from ..database import Base


class SimulationScenario(Base):
    """
    A visitor-triggered demo scenario (cooler failure, catering order, ...).

    `journal` records every change the scenario made as JSON deltas, so it can
    be undone exactly when it expires or someone ends it.
    """
    __tablename__ = "simulation_scenarios"
    __table_args__ = (Index("ix_simulation_scenarios_active", "ended_at", "expires_at"),)

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String, nullable=False)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)  # UTC
    expires_at = Column(DateTime, nullable=False)  # UTC
    ended_at = Column(DateTime, nullable=True)  # UTC, set when undone
    summary = Column(Text, nullable=False, default="")
    journal = Column(Text, nullable=False, default="{}")

    def __repr__(self):
        return f"<SimulationScenario({self.kind} store={self.store_id} ended={self.ended_at})>"
