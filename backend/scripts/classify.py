"""
Feature Vector Computation & Classification Script (Phases 5 & 6).
Calculates the 6-feature vector per hotspot cluster:
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
from math import radians, cos, sin, asin, sqrt
import numpy as np

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.database import get_db, init_db

EARTH_RADIUS_KM = 6371.0088


def haversine_distance_meters(lat1, lon1, lat2, lon2):
    """Haversine distance between two coordinates in meters."""
    r_lat1, r_lon1, r_lat2, r_lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = r_lat2 - r_lat1
    dlon = r_lon2 - r_lon1
    a = sin(dlat / 2)**2 + cos(r_lat1) * cos(r_lat2) * sin(dlon / 2)**2
    c = 2 * asin(sqrt(a))
    return c * EARTH_RADIUS_KM * 1000.0


def min_max_scale(values):
    """Min-max scale an array to [0, 1]. Returns 1.0s if all values are equal."""
    arr = np.array(values, dtype=float)
    min_v = np.min(arr)
    max_v = np.max(arr)
    if max_v - min_v < 1e-9:
        return np.ones_like(arr)
    return (arr - min_v) / (max_v - min_v)


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
        osm_sites = cursor.fetchall()

        if not clusters:
            print("No clusters found in 'hotspot_clusters'. Run cluster_hotspots.py first.")
            return

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
            detections = cursor.fetchall()

            # Feature 1: recurrence_count
            f_recurrence_count = float(det_count)

            # Feature 2: recurrence_regularity (Coefficient of variation of time-gaps)
            # Low CV = periodic/industrial; High CV = irregular/sporadic
            # Requires at least 2 time-gaps (i.e. >= 3 detections) for meaningful variance
            if len(detections) >= 3:
                dts = [datetime.fromisoformat(d["acq_datetime"]) for d in detections]
                time_gaps_hours = [(dts[i] - dts[i-1]).total_seconds() / 3600.0 for i in range(1, len(dts))]
                mean_gap = np.mean(time_gaps_hours)
                std_gap = np.std(time_gaps_hours)
                cv = (std_gap / (mean_gap + 1e-6)) if mean_gap > 0 else 0.0
                f_recurrence_regularity = float(cv)
            else:
                f_recurrence_regularity = 10.0  # High penalty CV for < 3 detections

            # Feature 3: dist_to_nearest_industrial (continuous distance in meters)
            if osm_sites:
                dists = [
                    haversine_distance_meters(c_lat, c_lon, s["latitude"], s["longitude"])
                    for s in osm_sites
                ]
                f_dist_to_industrial = float(min(dists))
            else:
                f_dist_to_industrial = 50000.0  # default 50km if no OSM data

            # Feature 4: spatial_stability (std-dev of positions within cluster in meters)
            # Tighter spread = higher stability
            if len(detections) >= 2:
                point_dists = [
                    haversine_distance_meters(c_lat, c_lon, d["latitude"], d["longitude"])
                    for d in detections
                ]
                f_spatial_spread = float(np.std(point_dists))
            else:
                f_spatial_spread = 1000.0  # Max penalty spread for isolated 1-time point

            # Feature 5: frp_trend (slope of Fire Radiative Power over time)
            # Near-zero slope = steady industrial thermal source; steep spike/decay = fire
            if len(detections) >= 2:
                dts = [datetime.fromisoformat(d["acq_datetime"]) for d in detections]
                t_hours = np.array([(dt - dts[0]).total_seconds() / 3600.0 for dt in dts])
                frp_vals = np.array([float(d["frp"] or 0.0) for d in detections])
                
                # If all points at exact same timestamp, slope is 0
                if np.max(t_hours) > np.min(t_hours):
                    # Linear regression slope: FRP change per hour
                    slope, _ = np.polyfit(t_hours, frp_vals, 1)
                    f_frp_slope = float(slope)
                else:
                    f_frp_slope = 0.0
            else:
                f_frp_slope = 5.0  # Penalty slope for single detection

            # Feature 6: day_night_ratio
            # 24/7 industrial sources are detected ~evenly day/night (~0.5 ratio)
            day_count = sum(1 for d in detections if d["daynight"] == "D")
            total_dets = len(detections)
            ratio = day_count / total_dets if total_dets > 0 else 1.0
            f_day_night_ratio = float(ratio)

            raw_features.append({
                "cluster_id": cid,
                "recurrence_count": f_recurrence_count,
                "recurrence_regularity": f_recurrence_regularity,
                "dist_to_nearest_industrial": f_dist_to_industrial,
                "spatial_stability": f_spatial_spread,
                "frp_trend": f_frp_slope,
                "day_night_ratio": f_day_night_ratio,
                "detection_count": det_count
            })

        # --- NORMALIZATION (0 to 1, where 1.0 = more persistent / industrial) ---
        n_clusters = len(raw_features)

        # 1. recurrence_count: higher is more persistent
        raw_recurr = [rf["recurrence_count"] for rf in raw_features]
        recurr_norm = min_max_scale(raw_recurr)

        # 2. recurrence_regularity: lower CV is more periodic -> invert
        raw_cv = [rf["recurrence_regularity"] for rf in raw_features]
        cv_scaled = min_max_scale(raw_cv)
        regularity_norm = [1.0 - c for c in cv_scaled]
        # Guarantee clusters with < 3 detections receive 0.0 regularity
        for i, rf in enumerate(raw_features):
            if rf["detection_count"] < 3:
                regularity_norm[i] = 0.0

        # 3. dist_to_nearest_industrial: closer to industrial is more persistent -> invert
        raw_dist = [rf["dist_to_nearest_industrial"] for rf in raw_features]
        dist_scaled = min_max_scale(raw_dist)
        dist_norm = [1.0 - d for d in dist_scaled]

        # 4. spatial_stability: tighter spread (lower std) is more persistent -> invert
        raw_spread = [rf["spatial_stability"] for rf in raw_features]
        spread_scaled = min_max_scale(raw_spread)
        stability_norm = [1.0 - s for s in spread_scaled]
        for i, rf in enumerate(raw_features):
            if rf["detection_count"] < 2:
                stability_norm[i] = 0.0

        # 5. frp_trend: near-zero slope is persistent; formula: 1 - abs(normalized_slope)
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

        # 6. day_night_ratio: score by closeness to 0.5: 1 - abs(ratio - 0.5) * 2
        day_night_norm = []
        for rf in raw_features:
            r = rf["day_night_ratio"]
            score = max(0.0, 1.0 - abs(r - 0.5) * 2.0)
            day_night_norm.append(score)

        # Clear existing feature/classification records
        cursor.execute("DELETE FROM cluster_classifications;")
        cursor.execute("DELETE FROM cluster_features;")

        classified_at = datetime.utcnow().isoformat()

        # Insert features and classifications
        persistent_count = 0
        ambiguous_count = 0
        transient_count = 0

        for i, rf in enumerate(raw_features):
            cid = rf["cluster_id"]
            rc_n = float(recurr_norm[i])
            reg_n = float(regularity_norm[i])
            dist_n = float(dist_norm[i])
            stab_n = float(stability_norm[i])
            frp_n = float(frp_trend_norm[i])
            dn_n = float(day_night_norm[i])

            # Persistence score formula:
            # persistence_score = 0.25·recurrence_count_norm + 0.20·regularity_norm +
            #                     0.20·dist_to_industrial_norm + 0.15·spatial_stability_norm +
            #                     0.10·frp_trend_norm + 0.10·day_night_ratio_norm
            score = (
                0.25 * rc_n +
                0.20 * reg_n +
                0.20 * dist_n +
                0.15 * stab_n +
                0.10 * frp_n +
                0.10 * dn_n
            )
            score = round(float(score), 4)

            # Classification bands:
            # - score >= 0.7 -> Persistent industrial source
            # - 0.4 <= score < 0.7 -> Ambiguous / flagged for review
            # - score < 0.4 -> Transient fire event
            if score >= 0.70:
                band_label = "Persistent industrial source"
                persistent_count += 1
            elif score >= 0.40:
                band_label = "Ambiguous / flagged for review"
                ambiguous_count += 1
            else:
                band_label = "Transient fire event"
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
                rc_n, reg_n, dist_n, stab_n, frp_n, dn_n
            ))

            cursor.execute("""
                INSERT INTO cluster_classifications (
                    cluster_id, persistence_score, band_label, confidence_prefilter_passed, classified_at
                ) VALUES (?, ?, ?, ?, ?)
            """, (cid, score, band_label, 1, classified_at))

    print("\n--- CLASSIFICATION RESULTS ---")
    print(f"Total Clusters Analyzed: {len(raw_features)}")
    print(f"  🟢 Persistent Industrial Sources (>= 0.7): {persistent_count}")
    print(f"  🟡 Ambiguous / Flagged For Review (0.4-0.7): {ambiguous_count}")
    print(f"  🔴 Transient Fire Events (< 0.4):          {transient_count}")


if __name__ == "__main__":
    run_classification()
