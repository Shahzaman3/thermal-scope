"""
Unified Classifier & Persistence Scoring Service (Phase 1).
Contains core mathematical formulations, feature normalization utilities,
composite persistence scoring, and classification band assignments shared
between batch pipeline processing (classify.py) and on-the-fly simulation (simulate.py).
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from math import radians, cos, sin, asin, sqrt
import numpy as np

# Earth mean radius in meters
EARTH_RADIUS_M = 6371008.8
EARTH_RADIUS_KM = 6371.0088

# Default NTRO baseline feature weights (sum to 1.0)
DEFAULT_WEIGHTS = {
    "recurrence_count": 0.25,
    "recurrence_regularity": 0.20,
    "dist_to_nearest_industrial": 0.20,
    "spatial_stability": 0.15,
    "frp_trend": 0.10,
    "day_night_ratio": 0.10
}

# Classification Band Constants
BAND_PERSISTENT = "Persistent industrial source"
BAND_AMBIGUOUS = "Ambiguous / flagged for review"
BAND_TRANSIENT = "Transient fire event"

# Band Thresholds
THRESHOLD_PERSISTENT = 0.70
THRESHOLD_AMBIGUOUS = 0.40


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute great-circle distance between two coordinate pairs in meters."""
    r_lat1, r_lon1, r_lat2, r_lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = r_lat2 - r_lat1
    dlon = r_lon2 - r_lon1
    a = sin(dlat / 2.0) ** 2 + cos(r_lat1) * cos(r_lat2) * sin(dlon / 2.0) ** 2
    c = 2.0 * asin(sqrt(a))
    return float(c * EARTH_RADIUS_M)


def min_max_scale(values: List[float]) -> np.ndarray:
    """
    Min-max scale an array to [0, 1].
    Returns array of 1.0s if all values in the input are identical.
    """
    arr = np.array(values, dtype=float)
    min_v = np.min(arr)
    max_v = np.max(arr)
    if max_v - min_v < 1e-9:
        return np.ones_like(arr)
    return (arr - min_v) / (max_v - min_v)


def compute_day_night_score(ratio: float) -> float:
    """
    Day/night balance metric. 24/7 industrial plants have roughly equal
    day and night passes (~0.50 ratio), scoring near 1.0.
    """
    return float(max(0.0, min(1.0, 1.0 - abs(ratio - 0.5) * 2.0)))


def compute_persistence_score(
    rc_norm: float,
    reg_norm: float,
    dist_norm: float,
    stab_norm: float,
    frp_norm: float,
    dn_norm: float,
    weights: Optional[Dict[str, float]] = None
) -> float:
    """
    Calculate the composite weighted persistence score across the 6 normalized features.
    """
    w = weights or DEFAULT_WEIGHTS
    score = (
        w["recurrence_count"] * rc_norm +
        w["recurrence_regularity"] * reg_norm +
        w["dist_to_nearest_industrial"] * dist_norm +
        w["spatial_stability"] * stab_norm +
        w["frp_trend"] * frp_norm +
        w["day_night_ratio"] * dn_norm
    )
    return round(float(score), 4)


def classify_band(persistence_score: float) -> str:
    """
    Assign categorical classification band based on persistence score:
    - score >= 0.70: Persistent industrial source
    - 0.40 <= score < 0.70: Ambiguous / flagged for review
    - score < 0.40: Transient fire event
    """
    if persistence_score >= THRESHOLD_PERSISTENT:
        return BAND_PERSISTENT
    if persistence_score >= THRESHOLD_AMBIGUOUS:
        return BAND_AMBIGUOUS
    return BAND_TRANSIENT


def get_tactical_recommendation(band: str) -> str:
    """Generate tactical intelligence guidance based on classification band."""
    if band == BAND_PERSISTENT:
        return "High recurrence, 24/7 day-night balance, and immediate proximity to industrial infrastructure confirm persistent industrial thermal emission."
    if band == BAND_AMBIGUOUS:
        return "Intermediate persistence profile. Possible periodic flare, mining activity, or multi-day agricultural burn requiring operator review."
    return "Isolated thermal anomaly with rapid temporal decay and wide separation from industrial facilities (wildfire/agricultural stubble burn)."


def extract_cluster_raw_features(
    cluster_id: int,
    centroid_lat: float,
    centroid_lon: float,
    detection_count: int,
    detections: List[Dict[str, Any]],
    osm_sites: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Extract raw unnormalized 6-feature values for a single hotspot cluster.
    """
    # Feature 1: Recurrence count
    f_recurrence_count = float(detection_count)

    # Feature 2: Recurrence regularity (CV of time gaps in hours)
    if len(detections) >= 3:
        dts = [datetime.fromisoformat(d["acq_datetime"]) for d in detections]
        time_gaps_hours = [(dts[i] - dts[i - 1]).total_seconds() / 3600.0 for i in range(1, len(dts))]
        mean_gap = np.mean(time_gaps_hours)
        std_gap = np.std(time_gaps_hours)
        cv = (std_gap / (mean_gap + 1e-6)) if mean_gap > 0 else 0.0
        f_recurrence_regularity = float(cv)
    else:
        f_recurrence_regularity = 10.0  # Penalty CV for < 3 passes

    # Feature 3: Distance to nearest industrial facility (meters)
    if osm_sites:
        dists = [
            haversine_distance_meters(centroid_lat, centroid_lon, s["latitude"], s["longitude"])
            for s in osm_sites
        ]
        f_dist_to_industrial = float(min(dists))
    else:
        f_dist_to_industrial = 50000.0  # 50km default fallback

    # Feature 4: Spatial stability (std dev of member points from centroid in meters)
    if len(detections) >= 2:
        point_dists = [
            haversine_distance_meters(centroid_lat, centroid_lon, d["latitude"], d["longitude"])
            for d in detections
        ]
        f_spatial_spread = float(np.std(point_dists))
    else:
        f_spatial_spread = 1000.0  # Max penalty spread for single pass

    # Feature 5: FRP trend slope (MW/hour)
    if len(detections) >= 2:
        dts = [datetime.fromisoformat(d["acq_datetime"]) for d in detections]
        t_hours = np.array([(dt - dts[0]).total_seconds() / 3600.0 for dt in dts])
        frp_vals = np.array([float(d["frp"] or 0.0) for d in detections])
        if np.max(t_hours) > np.min(t_hours):
            slope, _ = np.polyfit(t_hours, frp_vals, 1)
            f_frp_slope = float(slope)
        else:
            f_frp_slope = 0.0
    else:
        f_frp_slope = 5.0  # Penalty slope for single detection

    # Feature 6: Day / Night pass ratio
    day_count = sum(1 for d in detections if d.get("daynight") == "D")
    total_dets = len(detections)
    ratio = day_count / total_dets if total_dets > 0 else 1.0
    f_day_night_ratio = float(ratio)

    return {
        "cluster_id": cluster_id,
        "recurrence_count": f_recurrence_count,
        "recurrence_regularity": f_recurrence_regularity,
        "dist_to_nearest_industrial": f_dist_to_industrial,
        "spatial_stability": f_spatial_spread,
        "frp_trend": f_frp_slope,
        "day_night_ratio": f_day_night_ratio,
        "detection_count": detection_count
    }


def normalize_cluster_features_matrix(raw_features: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Normalize raw feature values across the entire dataset to [0, 1],
    inverting where lower value indicates higher industrial persistence.
    """
    if not raw_features:
        return []

    # 1. recurrence_count (higher count = more persistent)
    raw_recurr = [rf["recurrence_count"] for rf in raw_features]
    recurr_norm = min_max_scale(raw_recurr)

    # 2. recurrence_regularity (lower CV = periodic/industrial -> invert)
    raw_cv = [rf["recurrence_regularity"] for rf in raw_features]
    cv_scaled = min_max_scale(raw_cv)
    regularity_norm = [1.0 - c for c in cv_scaled]
    for i, rf in enumerate(raw_features):
        if rf["detection_count"] < 3:
            regularity_norm[i] = 0.0

    # 3. dist_to_nearest_industrial (closer = more persistent -> invert)
    raw_dist = [rf["dist_to_nearest_industrial"] for rf in raw_features]
    dist_scaled = min_max_scale(raw_dist)
    dist_norm = [1.0 - d for d in dist_scaled]

    # 4. spatial_stability (tighter spread = more persistent -> invert)
    raw_spread = [rf["spatial_stability"] for rf in raw_features]
    spread_scaled = min_max_scale(raw_spread)
    stability_norm = [1.0 - s for s in spread_scaled]
    for i, rf in enumerate(raw_features):
        if rf["detection_count"] < 2:
            stability_norm[i] = 0.0

    # 5. frp_trend (near-zero slope = steady industrial thermal source)
    raw_slopes = [rf["frp_trend"] for rf in raw_features]
    max_abs_slope = max(abs(s) for s in raw_slopes) if raw_slopes else 1.0
    if max_abs_slope < 1e-6:
        max_abs_slope = 1.0
    frp_trend_norm = []
    for i, s in enumerate(raw_slopes):
        if raw_features[i]["detection_count"] < 2:
            frp_trend_norm.append(0.0)
        else:
            norm_slope = s / max_abs_slope
            frp_trend_norm.append(max(0.0, 1.0 - abs(norm_slope)))

    # 6. day_night_ratio (score closeness to 0.50)
    day_night_norm = [compute_day_night_score(rf["day_night_ratio"]) for rf in raw_features]

    results = []
    for i, rf in enumerate(raw_features):
        rc_n = float(recurr_norm[i])
        reg_n = float(regularity_norm[i])
        dist_n = float(dist_norm[i])
        stab_n = float(stability_norm[i])
        frp_n = float(frp_trend_norm[i])
        dn_n = float(day_night_norm[i])

        score = compute_persistence_score(rc_n, reg_n, dist_n, stab_n, frp_n, dn_n)
        band = classify_band(score)

        results.append({
            "cluster_id": rf["cluster_id"],
            "raw_features": rf,
            "normalized_features": {
                "recurrence_count_norm": rc_n,
                "regularity_norm": reg_n,
                "dist_to_industrial_norm": dist_n,
                "spatial_stability_norm": stab_n,
                "frp_trend_norm": frp_n,
                "day_night_ratio_norm": dn_n
            },
            "persistence_score": score,
            "band_label": band
        })

    return results


def evaluate_simulation_anomaly(
    latitude: float,
    longitude: float,
    passes_count: int,
    timespan_days: int,
    day_ratio: float,
    spread_m: float,
    frp_stability: str,
    osm_sites: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Evaluate a hypothetical anomaly using unified classifier normalization math.
    """
    # 1. Distance to nearest OSM industrial site
    closest_site = None
    min_dist_m = 99999999.0

    for s in osm_sites:
        d = haversine_distance_meters(latitude, longitude, s["latitude"], s["longitude"])
        if d < min_dist_m:
            min_dist_m = d
            closest_site = {
                "name": s["name"],
                "site_type": s["site_type"],
                "distance_meters": round(d, 1)
            }

    # 2. Normalized features
    # Feature 1: Recurrence count norm (scaled to ~75 max benchmark passes)
    rc_norm = min(1.0, max(0.0, passes_count / 75.0))

    # Feature 2: Recurrence regularity norm
    if passes_count < 3:
        reg_norm = 0.0
    else:
        reg_norm = min(1.0, max(0.2, timespan_days / 45.0))

    # Feature 3: Industrial proximity norm (scaled to 60km regional span)
    dist_norm = max(0.0, min(1.0, 1.0 - (min_dist_m / 60000.0)))

    # Feature 4: Spatial stability norm (scaled to 1000m cluster threshold)
    if passes_count < 2:
        stab_norm = 0.0
    else:
        stab_norm = max(0.0, min(1.0, 1.0 - (spread_m / 1000.0)))

    # Feature 5: FRP trend stability norm
    if passes_count < 2:
        frp_norm = 0.0
    elif frp_stability == "flat":
        frp_norm = 0.94
    elif frp_stability == "spiking":
        frp_norm = 0.35
    else:  # decaying
        frp_norm = 0.15

    # Feature 6: Day/Night ratio balance norm
    dn_norm = compute_day_night_score(day_ratio)

    # 3. Persistence score & band
    score = compute_persistence_score(rc_norm, reg_norm, dist_norm, stab_norm, frp_norm, dn_norm)
    band = classify_band(score)
    recommendation = get_tactical_recommendation(band)

    return {
        "closest_site": closest_site,
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
        "tactical_recommendation": recommendation
    }
