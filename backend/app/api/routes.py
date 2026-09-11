from typing import List, Optional, Dict, Any
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException, Query
# pyrefly: ignore [missing-import]
from ..database import get_db, get_db_stats
from ..models import FirmsIngestRequest, FirmsIngestResponse, FirmsStatusResponse, HealthResponse, IngestionHistoryResponse
from ..services.firms_ingestion_service import get_ingestion_status, ingest_live_firms_data, get_ingestion_history, update_ingestion_run_pipeline, _state
import sys
from pathlib import Path

# Add scripts directory for evaluate, clustering, and classification modules
scripts_dir = Path(__file__).resolve().parent.parent.parent / "scripts"
sys.path.insert(0, str(scripts_dir))
try:
    from evaluate import run_evaluation
except ImportError:
    run_evaluation = None

try:
    from cluster_hotspots import run_clustering
except ImportError:
    run_clustering = None

try:
    from classify import run_classification
except ImportError:
    run_classification = None

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


@router.get("/firms/status", response_model=FirmsStatusResponse, tags=["NASA FIRMS Live Ingestion"])
def get_firms_status_endpoint() -> Dict[str, Any]:
    """Return operational ingestion status, provenance, and configuration availability."""
    return get_ingestion_status()


@router.get("/health", response_model=HealthResponse, tags=["Health"])
def get_api_health_endpoint() -> Dict[str, Any]:
    """Lightweight operational health endpoint verifying DB connection, FIRMS service, and pipeline readiness."""
    db_stats = get_db_stats()
    firms_status = get_ingestion_status()
    return {
        "status": "ok",
        "service": "SIH 2026 Industrial Fire & Persistent Thermal Source Classifier",
        "version": "1.0.0",
        "database": db_stats,
        "firms_service": "configured" if firms_status.get("configured") else "unconfigured",
        "pipeline": "available" if (run_clustering and run_classification) else "unavailable",
        "operational_status": firms_status.get("operational_status", "OFFLINE")
    }


@router.post("/firms/ingest", response_model=FirmsIngestResponse, tags=["NASA FIRMS Live Ingestion"])
def ingest_firms_endpoint(req: Optional[FirmsIngestRequest] = None) -> Dict[str, Any]:
    """
    Trigger user-initiated live NASA FIRMS near real-time thermal anomaly ingestion:
    1. Authenticates securely via backend environment (never exposes MAP_KEY).
    2. Retrieves and validates observations for the Jamshedpur-Odisha industrial corridor.
    3. Deduplicates against existing SQLite observations.
    4. Automatically updates DBSCAN clustering and 6-feature classification if new observations are added.
    """
    params = req or FirmsIngestRequest()
    ingest_result = ingest_live_firms_data(
        days=params.days,
        source=params.source,
        bbox=params.bbox
    )

    if ingest_result.get("status") != "success":
        _state.pipeline_executed = False
        _state.pipeline_status = "NOT_RUN"
        return {
            "status": "error",
            "run_id": ingest_result.get("run_id"),
            "source": ingest_result.get("source", "OFFLINE_DEMO"),
            "operational_status": "ERROR",
            "records_received": ingest_result.get("records_received", 0),
            "records_valid": ingest_result.get("records_valid", 0),
            "records_inserted": 0,
            "records_skipped_duplicate": 0,
            "records_rejected": ingest_result.get("records_rejected", 0),
            "message": ingest_result.get("message", "Live ingestion failed. Existing data remains active."),
            "latest_observation_datetime": None,
            "latest_observation_utc": None,
            "latest_observation_ist": None,
            "last_successful_ingestion_utc": None,
            "last_successful_ingestion_ist": None,
            "pipeline_executed": False,
            "pipeline_status": "NOT_RUN",
            "pipeline": None
        }

    pipeline_summary = None
    pipeline_executed = False
    pipeline_status = "NOT_RUN"

    if params.run_pipeline and ingest_result.get("records_inserted", 0) > 0:
        if run_clustering and run_classification:
            try:
                cluster_res = run_clustering()
                classify_res = run_classification()
                pipeline_executed = True
                pipeline_status = "COMPLETED"
                pipeline_summary = {
                    "clusters_processed": cluster_res.get("clusters_formed", 0),
                    "classifications_updated": classify_res.get("total_clusters", 0),
                    "classification_summary": {
                        "persistent_industrial": classify_res.get("persistent_count", 0),
                        "ambiguous_review": classify_res.get("ambiguous_count", 0),
                        "transient_fire": classify_res.get("transient_count", 0)
                    }
                }
            except Exception as e:
                pipeline_executed = False
                pipeline_status = "FAILED"
                pipeline_summary = {"error": f"Clustering/classification update error: {str(e)}"}
        else:
            pipeline_status = "FAILED"
    elif params.run_pipeline and ingest_result.get("records_inserted", 0) == 0:
        # Zero new records inserted; existing clusters remain current and validated
        pipeline_executed = False
        pipeline_status = "NOT_RUN"

    _state.pipeline_executed = pipeline_executed
    _state.pipeline_status = pipeline_status

    if ingest_result.get("run_id"):
        update_ingestion_run_pipeline(
            run_id=ingest_result["run_id"],
            pipeline_status=pipeline_status
        )

    return {
        "status": "success",
        "run_id": ingest_result.get("run_id"),
        "source": ingest_result["source"],
        "operational_status": ingest_result.get("operational_status", "LIVE"),
        "requested_window_days": ingest_result.get("requested_window_days", params.days),
        "product_queried": ingest_result.get("product_queried", params.source or "ALL"),
        "records_received": ingest_result["records_received"],
        "records_valid": ingest_result["records_valid"],
        "records_inserted": ingest_result["records_inserted"],
        "records_skipped_duplicate": ingest_result["records_skipped_duplicate"],
        "records_rejected": ingest_result["records_rejected"],
        "message": ingest_result["message"],

        "latest_observation_datetime": ingest_result.get("latest_observation_datetime"),
        "latest_observation_utc": ingest_result.get("latest_observation_utc"),
        "latest_observation_ist": ingest_result.get("latest_observation_ist"),
        "last_successful_ingestion_utc": ingest_result.get("last_successful_ingestion_utc"),
        "last_successful_ingestion_ist": ingest_result.get("last_successful_ingestion_ist"),
        "pipeline_executed": pipeline_executed,
        "pipeline_status": pipeline_status,
        "pipeline": pipeline_summary
    }


@router.get("/v1/firms/ingest/history", tags=["NASA FIRMS Live Ingestion"])
@router.get("/firms/ingest/history", tags=["NASA FIRMS Live Ingestion"])
def get_firms_ingestion_history(limit: int = Query(default=50, ge=1, le=500, description="Maximum number of historical runs to retrieve")) -> IngestionHistoryResponse:
    """Retrieve historical NASA FIRMS satellite thermal anomaly ingestion logs and source provenance."""
    history_records = get_ingestion_history(limit=limit)
    return IngestionHistoryResponse(
        history=history_records,
        total_runs=len(history_records)
    )


@router.post("/pipeline/run", tags=["Pipeline"])
def run_pipeline(ingest_live: bool = Query(default=False, description="Optionally pull latest NASA FIRMS NRT data before pipeline execution")) -> Dict[str, Any]:
    """
    Trigger the complete thermal anomaly processing pipeline:
    1. (Optional) Ingest live NASA FIRMS detections if ingest_live=True
    2. Confidence pre-filter gating & DBSCAN spatial clustering (~1km)
    3. 6-feature vector extraction & min-max normalization via classifier service
    4. Composite persistence scoring & 3-tier band classification
    """
    if not run_clustering or not run_classification:
        raise HTTPException(
            status_code=503,
            detail="Pipeline processing modules are unavailable on the server"
        )

    ingest_report = None
    if ingest_live:
        ingest_report = ingest_live_firms_data(days=2)

    try:
        # Step 1: Spatial clustering
        cluster_res = run_clustering()
        if not cluster_res or "clusters_formed" not in cluster_res:
            raise HTTPException(
                status_code=500,
                detail="Clustering stage failed to produce valid spatial clusters"
            )

        # Step 2: Feature extraction & classification
        classify_res = run_classification()
        if not classify_res or "total_clusters" not in classify_res:
            raise HTTPException(
                status_code=500,
                detail="Classification stage failed to evaluate feature vectors"
            )

        return {
            "status": "success",
            "message": "Thermal classification pipeline executed successfully",
            "ingest_report": ingest_report,
            "detections_processed": cluster_res.get("raw_detections", 0),
            "detections_passed_gate": cluster_res.get("gated_detections", 0),
            "clusters_processed": cluster_res.get("clusters_formed", 0),
            "classifications_updated": classify_res.get("total_clusters", 0),
            "classification_summary": {
                "persistent_industrial": classify_res.get("persistent_count", 0),
                "ambiguous_review": classify_res.get("ambiguous_count", 0),
                "transient_fire": classify_res.get("transient_count", 0)
            }
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred during pipeline execution."
        )
