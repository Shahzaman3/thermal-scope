"""
Hotspot Clustering Script (Phase 4).
Groups raw FIRMS detections into spatial clusters within ~1km radius across the time window.
Applies FIRMS confidence pre-filter before clustering.
Populates SQLite 'hotspot_clusters' table and updates 'firms_detections.cluster_id'.
"""

import sys
from pathlib import Path
from datetime import datetime
import numpy as np
from sklearn.cluster import DBSCAN
from math import radians, cos, sin, asin, sqrt

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.database import get_db, init_db

# 1 km in radians for haversine metric (Earth radius ~ 6371.0088 km)
EARTH_RADIUS_KM = 6371.0088
EPS_RADIANS = 1.0 / EARTH_RADIUS_KM


def haversine_distance_meters(lat1, lon1, lat2, lon2):
    """Haversine distance between two points in meters."""
    r_lat1, r_lon1, r_lat2, r_lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = r_lat2 - r_lat1
    dlon = r_lon2 - r_lon1
    a = sin(dlat / 2)**2 + cos(r_lat1) * cos(r_lat2) * sin(dlon / 2)**2
    c = 2 * asin(sqrt(a))
    return c * EARTH_RADIUS_KM * 1000.0


def is_high_confidence(conf_val):
    """Confidence pre-filter gate: drops low-confidence detections."""
    if conf_val is None:
        return False
    conf_str = str(conf_val).strip().lower()
    # VIIRS format
    if conf_str in ("low", "l"):
        return False
    if conf_str in ("nominal", "high", "n", "h"):
        return True
    # MODIS format (0 - 100)
    try:
        score = float(conf_str)
        return score >= 50.0  # Gate at 50%
    except ValueError:
        return True


def run_clustering():
    init_db()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, latitude, longitude, acq_datetime, confidence, frp, daynight
            FROM firms_detections
            ORDER BY acq_datetime ASC
        """)
        rows = cursor.fetchall()

    if not rows:
        print("No detections found in firms_detections. Run fetch_firms.py first.")
        return

    print(f"Total raw FIRMS detections: {len(rows)}")

    # 1. Apply confidence pre-filter gate
    gated_detections = []
    dropped_count = 0
    for r in rows:
        if is_high_confidence(r["confidence"]):
            gated_detections.append(r)
        else:
            dropped_count += 1

    print(f"Confidence pre-filter: {len(gated_detections)} passed, {dropped_count} dropped.")

    if not gated_detections:
        print("No detections passed confidence pre-filter.")
        return

    # 2. Convert lat/lon to radians for DBSCAN with Haversine metric
    coords = np.array([[radians(d["latitude"]), radians(d["longitude"])] for d in gated_detections])

    db = DBSCAN(eps=EPS_RADIANS, min_samples=1, metric="haversine")
    labels = db.fit_predict(coords)

    unique_labels = set(labels)
    print(f"Formed {len(unique_labels)} spatial clusters (~1km radius).")

    # 3. Store clusters and update detection mappings
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Clear existing clusters for idempotent rerun
        cursor.execute("DELETE FROM cluster_classifications;")
        cursor.execute("DELETE FROM cluster_features;")
        cursor.execute("DELETE FROM hotspot_clusters;")
        cursor.execute("UPDATE firms_detections SET cluster_id = NULL;")

        # Group detections by cluster
        cluster_detections_map = {}
        for idx, cluster_label in enumerate(labels):
            cid = int(cluster_label) + 1  # 1-indexed cluster_id
            det = gated_detections[idx]
            cluster_detections_map.setdefault(cid, []).append(det)

        # 1. Insert into hotspot_clusters first to satisfy foreign key constraints
        for cid, dets in cluster_detections_map.items():
            lats = [d["latitude"] for d in dets]
            lons = [d["longitude"] for d in dets]
            timestamps = [d["acq_datetime"] for d in dets]

            centroid_lat = float(np.mean(lats))
            centroid_lon = float(np.mean(lons))
            first_seen = min(timestamps)
            last_seen = max(timestamps)
            count = len(dets)

            # Compute cluster radius in meters
            if count > 1:
                radii = [haversine_distance_meters(centroid_lat, centroid_lon, lat, lon) for lat, lon in zip(lats, lons)]
                radius_m = float(max(radii))
            else:
                radius_m = 0.0

            cursor.execute("""
                INSERT INTO hotspot_clusters (
                    cluster_id, centroid_lat, centroid_lon, detection_count, first_seen, last_seen, radius_meters
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (cid, centroid_lat, centroid_lon, count, first_seen, last_seen, radius_m))

        # 2. Update firms_detections.cluster_id now that parent clusters exist
        for cid, dets in cluster_detections_map.items():
            for det in dets:
                cursor.execute("UPDATE firms_detections SET cluster_id = ? WHERE id = ?", (cid, det["id"]))

    print(f"Successfully populated {len(cluster_detections_map)} clusters into 'hotspot_clusters' table.")


if __name__ == "__main__":
    run_clustering()
