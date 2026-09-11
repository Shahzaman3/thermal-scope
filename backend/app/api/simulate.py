"""
Interactive Hotspot Simulation API Endpoint (Phase 1).
Allows operators to test the classification algorithm against hypothetical thermal scenarios
using the unified classifier service.
"""

from typing import Dict, Any, Optional
from fastapi import APIRouter
from pydantic import BaseModel, Field
from ..database import get_db
from ..services.classifier_service import evaluate_simulation_anomaly

router = APIRouter(prefix="/api", tags=["Simulation"])


class SimulationRequest(BaseModel):
    scenario_name: Optional[str] = "Custom Anomaly"
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    frp: float = Field(default=85.0, ge=1.0)
    passes_count: int = Field(default=1, ge=1, le=200)
    timespan_days: int = Field(default=1, ge=1, le=90)
    day_ratio: float = Field(default=0.5, ge=0.0, le=1.0)
    spread_m: float = Field(default=200.0, ge=0.0)
    frp_stability: str = Field(default="flat")  # "flat", "decaying", "spiking"


@router.post("/simulate-hotspot")
def simulate_hotspot(req: SimulationRequest) -> Dict[str, Any]:
    """
    Simulate a hypothetical thermal anomaly and compute its 6-feature persistence score
    in real time against regional industrial infrastructure using the unified classifier service.
    """
    # 1. Fetch OSM sites from database
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, site_type, latitude, longitude FROM osm_industrial_sites")
        osm_sites = [dict(s) for s in cursor.fetchall()]

    # 2. Delegate to unified classifier service
    eval_result = evaluate_simulation_anomaly(
        latitude=req.latitude,
        longitude=req.longitude,
        passes_count=req.passes_count,
        timespan_days=req.timespan_days,
        day_ratio=req.day_ratio,
        spread_m=req.spread_m,
        frp_stability=req.frp_stability,
        osm_sites=osm_sites
    )

    # 3. Return backward-compatible response dictionary for SimulatorModal.jsx
    return {
        "scenario_name": req.scenario_name,
        "input_parameters": req.model_dump() if hasattr(req, "model_dump") else req.dict(),
        "closest_industrial_site": eval_result["closest_site"],
        "feature_vector_evaluation": eval_result["feature_vector_evaluation"],
        "persistence_score": eval_result["persistence_score"],
        "band_label": eval_result["band_label"],
        "confidence_prefilter": "PASSED (Simulated nominal)",
        "tactical_recommendation": eval_result["tactical_recommendation"]
    }
