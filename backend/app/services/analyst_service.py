"""
Analyst Prioritization & Review Workflow Service (Phase 5)
Provides interactive review status tracking, prioritization queues, and analyst notes.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional
from ..database import get_db, DB_PATH


VALID_REVIEW_STATUSES = {"UNREVIEWED", "UNDER_INVESTIGATION", "VERIFIED_INDUSTRIAL", "VERIFIED_WILDFIRE", "DISMISSED"}


def submit_analyst_review(
    cluster_id: int,
    review_status: str,
    notes: Optional[str] = None,
    analyst_name: str = "Analyst",
    custom_db_path: Optional[Path] = None
) -> Dict[str, Any]:
    """Submit or update an analyst review verification status for a specific cluster."""
    status_clean = review_status.strip().upper()
    if status_clean not in VALID_REVIEW_STATUSES:
        raise ValueError(f"Invalid review_status '{review_status}'. Must be one of {VALID_REVIEW_STATUSES}")

    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db(custom_db_path) as conn:
        cursor = conn.cursor()

        # Check existing review entry
        cursor.execute("SELECT id FROM analyst_reviews WHERE cluster_id = ?", (cluster_id,))
        existing = cursor.fetchone()

        if existing:
            cursor.execute("""
                UPDATE analyst_reviews
                SET review_status = ?, notes = ?, analyst_name = ?, updated_at = ?
                WHERE cluster_id = ?
            """, (status_clean, notes, analyst_name, now_iso, cluster_id))
            review_id = existing["id"]
        else:
            cursor.execute("""
                INSERT INTO analyst_reviews (cluster_id, review_status, notes, analyst_name, updated_at)
                VALUES (?, ?, ?, ?, ?)
            """, (cluster_id, status_clean, notes, analyst_name, now_iso))
            review_id = cursor.lastrowid

    return {
        "status": "success",
        "review_id": review_id,
        "cluster_id": cluster_id,
        "review_status": status_clean,
        "notes": notes,
        "analyst_name": analyst_name,
        "updated_at": now_iso
    }


def get_analyst_review_for_cluster(
    cluster_id: int,
    custom_db_path: Optional[Path] = None
) -> Optional[Dict[str, Any]]:
    """Retrieve existing analyst review status and notes for a cluster."""
    with get_db(custom_db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, cluster_id, review_status, notes, analyst_name, updated_at
            FROM analyst_reviews
            WHERE cluster_id = ?
        """, (cluster_id,))
        row = cursor.fetchone()

    if not row:
        return None
    return {
        "id": row["id"],
        "cluster_id": row["cluster_id"],
        "review_status": row["review_status"],
        "notes": row["notes"],
        "analyst_name": row["analyst_name"],
        "updated_at": row["updated_at"]
    }


def get_priority_review_queue(
    limit: int = 50,
    custom_db_path: Optional[Path] = None
) -> List[Dict[str, Any]]:
    """
    Retrieve clusters ranked by analyst review priority.
    Highest priority goes to:
    1. Ambiguous band (score 0.40 - 0.70)
    2. Borderline / high variance clusters
    3. Unreviewed clusters
    """
    with get_db(custom_db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.cluster_id, c.centroid_lat, c.centroid_lon, c.detection_count,
                   cl.persistence_score, cl.band_label,
                   f.dist_to_nearest_industrial, f.frp_trend_norm,
                   r.review_status, r.notes, r.updated_at as review_updated_at
            FROM hotspot_clusters c
            LEFT JOIN cluster_classifications cl ON c.cluster_id = cl.cluster_id
            LEFT JOIN cluster_features f ON c.cluster_id = f.cluster_id
            LEFT JOIN analyst_reviews r ON c.cluster_id = r.cluster_id
            ORDER BY
                CASE
                    WHEN cl.band_label LIKE 'Ambiguous%' THEN 1
                    WHEN r.review_status IS NULL OR r.review_status = 'UNREVIEWED' THEN 2
                    WHEN r.review_status = 'UNDER_INVESTIGATION' THEN 3
                    ELSE 4
                END,
                cl.persistence_score DESC
            LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()

    queue = []
    for r in rows:
        queue.append({
            "cluster_id": r["cluster_id"],
            "centroid_lat": r["centroid_lat"],
            "centroid_lon": r["centroid_lon"],
            "detection_count": r["detection_count"],
            "persistence_score": r["persistence_score"],
            "band_label": r["band_label"],
            "dist_to_nearest_industrial": r["dist_to_nearest_industrial"],
            "review_status": r["review_status"] or "UNREVIEWED",
            "notes": r["notes"],
            "review_updated_at": r["review_updated_at"]
        })
    return queue
