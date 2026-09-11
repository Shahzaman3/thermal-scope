"""
Feature Vector Computation & Classification Script (Phases 5 & 6 / Phase 1 Refactor).
Calculates the 6-feature vector per hotspot cluster using the unified classifier_service:
1. recurrence_count (weight 0.25)
2. recurrence_regularity (weight 0.20)
3. dist_to_nearest_industrial (weight 0.20)
4. spatial_stability (weight 0.15)
5. frp_trend (weight 0.10)
6. day_night_ratio (weight 0.10)

Normalizes features 0-1 (inverting where lower is more persistent).
Computes persistence_score and bands into:
- Persistent industrial source (>= 0.7)
- Ambiguous / flagged for review (0.4 <= score < 0.7)
- Transient fire event (< 0.4)

Populates 'cluster_features' and 'cluster_classifications' tables.
"""

import sys
from datetime import datetime
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.database import get_db, init_db
from app.services.classifier_service import (
    extract_cluster_raw_features,
    normalize_cluster_features_matrix,
    BAND_PERSISTENT,
    BAND_AMBIGUOUS,
    BAND_TRANSIENT,
    THRESHOLD_PERSISTENT,
    THRESHOLD_AMBIGUOUS
)


def run_classification():
    init_db()

    with get_db() as conn:
        cursor = conn.cursor()

        # Load clusters
        cursor.execute("""
            SELECT cluster_id, centroid_lat, centroid_lon, detection_count, first_seen, last_seen, radius_meters
            FROM hotspot_clusters
            ORDER BY cluster_id ASC
        """)
        clusters = cursor.fetchall()

        # Load OSM industrial sites
        cursor.execute("SELECT id, name, site_type, latitude, longitude FROM osm_industrial_sites")
        osm_sites = [dict(s) for s in cursor.fetchall()]

        if not clusters:
            print("No clusters found in 'hotspot_clusters'. Run cluster_hotspots.py first.")
            return {"error": "No clusters found"}

        print(f"Processing {len(clusters)} clusters with {len(osm_sites)} OSM industrial sites...")

        raw_features = []

        for cl in clusters:
            cid = cl["cluster_id"]
            c_lat = cl["centroid_lat"]
            c_lon = cl["centroid_lon"]
            det_count = cl["detection_count"]

            # Fetch detections belonging to this cluster
            cursor.execute("""
                SELECT latitude, longitude, acq_datetime, frp, daynight
                FROM firms_detections
                WHERE cluster_id = ?
                ORDER BY acq_datetime ASC
            """, (cid,))
            detections = [dict(d) for d in cursor.fetchall()]

            # Extract raw feature vector using unified service
            rf = extract_cluster_raw_features(
                cluster_id=cid,
                centroid_lat=c_lat,
                centroid_lon=c_lon,
                detection_count=det_count,
                detections=detections,
                osm_sites=osm_sites
            )
            raw_features.append(rf)

        # Normalize across the cluster set using unified service
        normalized_results = normalize_cluster_features_matrix(raw_features)

        # Clear existing feature/classification records
        cursor.execute("DELETE FROM cluster_classifications;")
        cursor.execute("DELETE FROM cluster_features;")

        classified_at = datetime.utcnow().isoformat()

        # Insert features and classifications
        persistent_count = 0
        ambiguous_count = 0
        transient_count = 0

        for item in normalized_results:
            cid = item["cluster_id"]
            rf = item["raw_features"]
            nf = item["normalized_features"]
            score = item["persistence_score"]
            band_label = item["band_label"]

            if band_label == BAND_PERSISTENT:
                persistent_count += 1
            elif band_label == BAND_AMBIGUOUS:
                ambiguous_count += 1
            else:
                transient_count += 1

            cursor.execute("""
                INSERT INTO cluster_features (
                    cluster_id,
                    recurrence_count, recurrence_regularity, dist_to_nearest_industrial,
                    spatial_stability, frp_trend, day_night_ratio,
                    recurrence_count_norm, regularity_norm, dist_to_industrial_norm,
                    spatial_stability_norm, frp_trend_norm, day_night_ratio_norm
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                cid,
                rf["recurrence_count"], rf["recurrence_regularity"], rf["dist_to_nearest_industrial"],
                rf["spatial_stability"], rf["frp_trend"], rf["day_night_ratio"],
                nf["recurrence_count_norm"], nf["regularity_norm"], nf["dist_to_industrial_norm"],
                nf["spatial_stability_norm"], nf["frp_trend_norm"], nf["day_night_ratio_norm"]
            ))

            cursor.execute("""
                INSERT INTO cluster_classifications (
                    cluster_id, persistence_score, band_label, confidence_prefilter_passed, classified_at
                ) VALUES (?, ?, ?, ?, ?)
            """, (cid, score, band_label, 1, classified_at))

    print("\n--- CLASSIFICATION RESULTS ---")
    print(f"Total Clusters Analyzed: {len(normalized_results)}")
    print(f"  [Persistent] Industrial Sources (>= {THRESHOLD_PERSISTENT}): {persistent_count}")
    print(f"  [Ambiguous] Flagged For Review ({THRESHOLD_AMBIGUOUS}-{THRESHOLD_PERSISTENT}): {ambiguous_count}")
    print(f"  [Transient] Fire Events (< {THRESHOLD_AMBIGUOUS}): {transient_count}")

    return {
        "total_clusters": len(normalized_results),
        "persistent_count": persistent_count,
        "ambiguous_count": ambiguous_count,
        "transient_count": transient_count
    }


if __name__ == "__main__":
    run_classification()
