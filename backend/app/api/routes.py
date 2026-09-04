from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from ..database import get_db
import sys
from pathlib import Path

# Add scripts directory for evaluate module
scripts_dir = Path(__file__).resolve().parent.parent.parent / "scripts"
sys.path.insert(0, str(scripts_dir))
try:
    from evaluate import run_evaluation
except ImportError:
    run_evaluation = None

router = APIRouter(prefix="/api", tags=["Clusters & Classifications"])


@router.get("/evaluation")
def get_evaluation_metrics() -> Dict[str, Any]:
    """Return ground-truth benchmark accuracy, precision, recall, and site validations."""
    if run_evaluation:
        return run_evaluation()
    return {"error": "Evaluation module unavailable"}


@router.get("/summary")
def get_summary() -> Dict[str, Any]:
    """Return high-level summary KPIs of classified thermal clusters and detections."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) as cnt FROM firms_detections")
        total_detections = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM osm_industrial_sites")
        total_osm_sites = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM hotspot_clusters")
        total_clusters = cursor.fetchone()["cnt"]

        cursor.execute("""
            SELECT band_label, COUNT(*) as count, AVG(persistence_score) as avg_score
            FROM cluster_classifications
            GROUP BY band_label
        """)
        bands = {row["band_label"]: {"count": row["count"], "avg_score": round(row["avg_score"] or 0, 4)} for row in cursor.fetchall()}

    return {
        "total_detections": total_detections,
        "total_osm_sites": total_osm_sites,
        "total_clusters": total_clusters,
        "bands": {
            "persistent": bands.get("Persistent industrial source", {"count": 0, "avg_score": 0.0}),
            "ambiguous": bands.get("Ambiguous / flagged for review", {"count": 0, "avg_score": 0.0}),
            "transient": bands.get("Transient fire event", {"count": 0, "avg_score": 0.0}),
        }
    }


@router.get("/clusters")
def get_clusters(band: Optional[str] = Query(None, description="Filter by band label")) -> List[Dict[str, Any]]:
    """Return all classified clusters for map rendering."""
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT 
                c.cluster_id,
                c.centroid_lat,
                c.centroid_lon,
                c.detection_count,
                c.first_seen,
                c.last_seen,
                c.radius_meters,
                cl.persistence_score,
                cl.band_label,
                f.dist_to_nearest_industrial,
                f.day_night_ratio,
                f.recurrence_count_norm,
                f.regularity_norm,
                f.dist_to_industrial_norm,
                f.spatial_stability_norm,
                f.frp_trend_norm,
                f.day_night_ratio_norm
            FROM hotspot_clusters c
            LEFT JOIN cluster_classifications cl ON c.cluster_id = cl.cluster_id
            LEFT JOIN cluster_features f ON c.cluster_id = f.cluster_id
        """
        params = []
        if band:
            query += " WHERE cl.band_label = ?"
            params.append(band)

        query += " ORDER BY cl.persistence_score DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()

    return [dict(r) for r in rows]


@router.get("/clusters/{cluster_id}")
def get_cluster_detail(cluster_id: int) -> Dict[str, Any]:
    """Return full inspection details for a single cluster, including feature breakdown and raw detections."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Cluster info
        cursor.execute("""
            SELECT cluster_id, centroid_lat, centroid_lon, detection_count, first_seen, last_seen, radius_meters
            FROM hotspot_clusters
            WHERE cluster_id = ?
        """, (cluster_id,))
        cluster_row = cursor.fetchone()
        if not cluster_row:
            raise HTTPException(status_code=404, detail=f"Cluster {cluster_id} not found")

        # Classification info
        cursor.execute("""
            SELECT persistence_score, band_label, confidence_prefilter_passed, classified_at
            FROM cluster_classifications
            WHERE cluster_id = ?
        """, (cluster_id,))
        classification_row = cursor.fetchone()

        # Feature vector
        cursor.execute("""
            SELECT 
                recurrence_count, recurrence_regularity, dist_to_nearest_industrial,
                spatial_stability, frp_trend, day_night_ratio,
                recurrence_count_norm, regularity_norm, dist_to_industrial_norm,
                spatial_stability_norm, frp_trend_norm, day_night_ratio_norm
            FROM cluster_features
            WHERE cluster_id = ?
        """, (cluster_id,))
        features_row = cursor.fetchone()

        # Member detections
        cursor.execute("""
            SELECT id, latitude, longitude, acq_date, acq_time, acq_datetime,
                   brightness, frp, daynight, satellite, instrument, confidence
            FROM firms_detections
            WHERE cluster_id = ?
            ORDER BY acq_datetime DESC
        """, (cluster_id,))
        detections = [dict(d) for d in cursor.fetchall()]

        # Top 3 closest OSM industrial sites
        cursor.execute("""
            SELECT osm_id, name, site_type, latitude, longitude
            FROM osm_industrial_sites
        """)
        osm_sites = cursor.fetchall()

    # Compute distances to find closest OSM sites
    from math import radians, cos, sin, asin, sqrt
    c_lat, c_lon = cluster_row["centroid_lat"], cluster_row["centroid_lon"]
    
    def dist_m(s_lat, s_lon):
        r_lat1, r_lon1, r_lat2, r_lon2 = map(radians, [c_lat, c_lon, s_lat, s_lon])
        dlat = r_lat2 - r_lat1
        dlon = r_lon2 - r_lon1
        a = sin(dlat / 2)**2 + cos(r_lat1) * cos(r_lat2) * sin(dlon / 2)**2
        return 2 * asin(sqrt(a)) * 6371008.8

    closest_sites = []
    for s in osm_sites:
        d = dist_m(s["latitude"], s["longitude"])
        closest_sites.append({
            "osm_id": s["osm_id"],
            "name": s["name"],
            "site_type": s["site_type"],
            "latitude": s["latitude"],
            "longitude": s["longitude"],
            "distance_meters": round(d, 1)
        })
    closest_sites.sort(key=lambda x: x["distance_meters"])
    closest_sites = closest_sites[:3]

    return {
        "cluster": dict(cluster_row),
        "classification": dict(classification_row) if classification_row else None,
        "features": dict(features_row) if features_row else None,
        "detections": detections,
        "closest_industrial_sites": closest_sites
    }


@router.get("/osm-sites")
def get_osm_sites(limit: int = 200) -> List[Dict[str, Any]]:
    """Return OSM industrial sites for map overlay."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, osm_id, name, site_type, latitude, longitude
            FROM osm_industrial_sites
            LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
    return [dict(r) for r in rows]
