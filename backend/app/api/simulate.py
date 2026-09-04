"""
Interactive Hotspot Simulation API Endpoint (Phase 11).
Allows operators to test the classification algorithm against hypothetical thermal scenarios.
"""

from typing import Dict, Any, Optional
from math import radians, cos, sin, asin, sqrt
# pyrefly: ignore [missing-import]
from fastapi import APIRouter
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field
# pyrefly: ignore [missing-import]
from ..database import get_db

router = APIRouter(prefix="/api", tags=["Simulation"])

EARTH_RADIUS_M = 6371008.8


def haversine_m(lat1, lon1, lat2, lon2):
    r_lat1, r_lon1, r_lat2, r_lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = r_lat2 - r_lat1
    dlon = r_lon2 - r_lon1
    a = sin(dlat / 2)**2 + cos(r_lat1) * cos(r_lat2) * sin(dlon / 2)**2
    c = 2 * asin(sqrt(a))
    return c * EARTH_RADIUS_M


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
    in real time against regional industrial infrastructure.
    """
    # 1. Find distance to nearest OSM industrial site
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, site_type, latitude, longitude FROM osm_industrial_sites")
        osm_sites = cursor.fetchall()

    closest_site = None
    min_dist_m = 99999999.0

    for s in osm_sites:
        d = haversine_m(req.latitude, req.longitude, s["latitude"], s["longitude"])
        if d < min_dist_m:
            min_dist_m = d
            closest_site = {
                "name": s["name"],
                "site_type": s["site_type"],
                "distance_meters": round(d, 1)
            }

    # 2. Compute the 6 normalized features [0, 1]
    # Feature 1: Recurrence count norm (scaled to ~75 max benchmark)
    rc_norm = min(1.0, max(0.0, req.passes_count / 75.0))

    # Feature 2: Recurrence regularity norm
    if req.passes_count < 3:
        reg_norm = 0.0
    else:
        # Higher timespan over multiple passes signals steady regular cycles
        reg_norm = min(1.0, max(0.2, req.timespan_days / 45.0))

    # Feature 3: Industrial proximity norm (scaled to 60km regional span)
    dist_norm = max(0.0, min(1.0, 1.0 - (min_dist_m / 60000.0)))

    # Feature 4: Spatial stability norm (scaled to 1000m cluster threshold)
    if req.passes_count < 2:
        stab_norm = 0.0
    else:
        stab_norm = max(0.0, min(1.0, 1.0 - (req.spread_m / 1000.0)))

    # Feature 5: FRP trend stability norm
    if req.passes_count < 2:
        frp_norm = 0.0
    elif req.frp_stability == "flat":
        frp_norm = 0.94
    elif req.frp_stability == "spiking":
        frp_norm = 0.35
    else:  # decaying
        frp_norm = 0.15

    # Feature 6: Day/Night ratio balance norm: 1 - abs(ratio - 0.5) * 2
    dn_norm = max(0.0, min(1.0, 1.0 - abs(req.day_ratio - 0.5) * 2.0))

    # 3. Weighted composite persistence score:
    # 0.25*rc + 0.20*reg + 0.20*dist + 0.15*stab + 0.10*frp + 0.10*dn
    score = (
        0.25 * rc_norm +
        0.20 * reg_norm +
        0.20 * dist_norm +
        0.15 * stab_norm +
        0.10 * frp_norm +
        0.10 * dn_norm
    )
    score = round(float(score), 4)

    # 4. Band label assignment
    if score >= 0.70:
        band = "Persistent industrial source"
        explanation = "High recurrence, 24/7 day-night balance, and immediate proximity to industrial infrastructure confirm persistent industrial thermal emission."
    elif score >= 0.40:
        band = "Ambiguous / flagged for review"
        explanation = "Intermediate persistence profile. Possible periodic flare, mining activity, or multi-day agricultural burn requiring operator review."
    else:
        band = "Transient fire event"
        explanation = "Isolated thermal anomaly with rapid temporal decay and wide separation from industrial facilities (wildfire/agricultural stubble burn)."

    return {
        "scenario_name": req.scenario_name,
        "input_parameters": req.dict(),
        "closest_industrial_site": closest_site,
        "feature_vector_evaluation": {
            "recurrence_count_norm": round(rc_norm, 3),
            "regularity_norm": round(reg_norm, 3),
            "dist_to_industrial_norm": round(dist_norm, 3),
            "spatial_stability_norm": round(stab_norm, 3),
            "frp_trend_norm": round(frp_norm, 3),
            "day_night_ratio_norm": round(dn_norm, 3)
        },
        "persistence_score": score,
        "band_label": band,
        "confidence_prefilter": "PASSED (Simulated nominal)",
        "tactical_recommendation": explanation
    }
