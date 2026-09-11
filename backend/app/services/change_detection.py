"""
Change Detection & Transition Tracking Service (Phase 4C.2)
Identifies newly emerging thermal sources outside registered cluster boundaries and tracks score transitions.
"""

from pathlib import Path
from typing import Dict, Any, List, Optional
import math
from ..database import get_db, DB_PATH


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the Great Circle distance in meters between two lat/lon points."""
    R = 6371000.0  # Earth's mean radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def detect_emerging_sources(
    distance_threshold_meters: float = 2000.0,
    custom_db_path: Optional[Path] = None
) -> List[Dict[str, Any]]:
    """Identify thermal detections located outside existing cluster footprints."""
    with get_db(custom_db_path) as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT cluster_id, centroid_lat, centroid_lon FROM hotspot_clusters")
        clusters = cursor.fetchall()

        cursor.execute("""
            SELECT id, latitude, longitude, acq_datetime, frp, satellite, confidence
            FROM firms_detections
            ORDER BY acq_datetime DESC
            LIMIT 100
        """)
        recent_detections = cursor.fetchall()

    emerging = []
    for d in recent_detections:
        min_dist = float('inf')
        nearest_cluster_id = None
        for c in clusters:
            dist = haversine_distance(d["latitude"], d["longitude"], c["centroid_lat"], c["centroid_lon"])
            if dist < min_dist:
                min_dist = dist
                nearest_cluster_id = c["cluster_id"]

        if min_dist > distance_threshold_meters:
            emerging.append({
                "detection_id": d["id"],
                "latitude": d["latitude"],
                "longitude": d["longitude"],
                "acq_datetime": d["acq_datetime"],
                "frp": d["frp"],
                "satellite": d["satellite"],
                "confidence": d["confidence"],
                "dist_to_nearest_cluster_meters": round(min_dist, 1),
                "nearest_cluster_id": nearest_cluster_id
            })

    return emerging


def detect_score_transitions(custom_db_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Identify clusters with potential band transitions or high variance needing analyst review."""
    with get_db(custom_db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.cluster_id, c.centroid_lat, c.centroid_lon, c.detection_count,
                   cl.persistence_score, cl.band_label, f.frp_trend_norm, f.regularity_norm
            FROM hotspot_clusters c
            JOIN cluster_classifications cl ON c.cluster_id = cl.cluster_id
            JOIN cluster_features f ON c.cluster_id = f.cluster_id
            ORDER BY cl.persistence_score DESC
        """)
        clusters = cursor.fetchall()

    flagged_transitions = []
    for r in clusters:
        score = r["persistence_score"]

        # Borderline score check (near classification boundaries 0.40 or 0.70)
        is_borderline = (0.35 <= score <= 0.45) or (0.65 <= score <= 0.75)
        high_variance = (r["frp_trend_norm"] or 0) > 0.5

        if is_borderline or high_variance:
            flagged_transitions.append({
                "cluster_id": r["cluster_id"],
                "centroid_lat": r["centroid_lat"],
                "centroid_lon": r["centroid_lon"],
                "persistence_score": r["persistence_score"],
                "band_label": r["band_label"],
                "is_borderline": is_borderline,
                "high_variance": high_variance,
                "reason": "Borderline persistence score near boundary" if is_borderline else "High FRP trend fluctuation"
            })

    return flagged_transitions


def get_change_detection_summary(custom_db_path: Optional[Path] = None) -> Dict[str, Any]:
    """Retrieve full change detection summary for analytics dashboard."""
    emerging = detect_emerging_sources(custom_db_path=custom_db_path)
    transitions = detect_score_transitions(custom_db_path=custom_db_path)
    return {
        "emerging_sources_count": len(emerging),
        "flagged_transitions_count": len(transitions),
        "emerging_sources": emerging[:10],
        "flagged_transitions": transitions
    }
