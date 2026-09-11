"""
DBSCAN Spatial Clustering & Confidence Pre-Filter Test Suite (Phase 2).
Tests:
- Radiometric confidence pre-filter gating (VIIRS/MODIS)
- Great-circle Haversine clustering with ~1km epsilon
- Multi-point cluster coalescence vs distant point separation
- Idempotent clustering execution safety and foreign key integrity
"""

import sqlite3
import pytest
import numpy as np
from math import radians
from sklearn.cluster import DBSCAN
from cluster_hotspots import (
    is_high_confidence,
    haversine_distance_meters,
    EPS_RADIANS,
    EARTH_RADIUS_KM
)
from app.database import get_db, init_db


class TestConfidencePreFilter:
    @pytest.mark.parametrize("conf_val,expected", [
        # VIIRS categorical confidence
        ("high", True),
        ("nominal", True),
        ("h", True),
        ("n", True),
        ("low", False),
        ("l", False),
        # MODIS numeric percentage confidence (0-100)
        ("100", True),
        ("80", True),
        ("50", True),
        ("49.9", False),
        ("30", False),
        ("0", False),
        (80, True),
        (40, False),
        # Edge cases
        (None, False),
        ("", True),  # default fallback if unparseable
    ])
    def test_confidence_values(self, conf_val, expected):
        assert is_high_confidence(conf_val) == expected


class TestDBSCANSpatialGrouping:
    def test_coalescence_within_one_km(self):
        # Two points separated by ~250m inside Tata Steel
        lat1, lon1 = 22.8015, 86.1950
        lat2, lon2 = 22.8035, 86.1960

        dist_m = haversine_distance_meters(lat1, lon1, lat2, lon2)
        assert dist_m < 1000.0, f"Expected < 1000m, got {dist_m}m"

        coords = np.array([[radians(lat1), radians(lon1)], [radians(lat2), radians(lon2)]])
        db = DBSCAN(eps=EPS_RADIANS, min_samples=1, metric="haversine")
        labels = db.fit_predict(coords)

        # Both points must belong to the exact same cluster label
        assert labels[0] == labels[1]
        assert len(set(labels)) == 1

    def test_separation_beyond_one_km(self):
        # Tata Steel Jamshedpur vs Similipal Forest (> 100 km apart)
        lat1, lon1 = 22.8015, 86.1950
        lat2, lon2 = 21.8200, 86.3500

        dist_m = haversine_distance_meters(lat1, lon1, lat2, lon2)
        assert dist_m > 1000.0

        coords = np.array([[radians(lat1), radians(lon1)], [radians(lat2), radians(lon2)]])
        db = DBSCAN(eps=EPS_RADIANS, min_samples=1, metric="haversine")
        labels = db.fit_predict(coords)

        # Must produce 2 distinct cluster labels
        assert labels[0] != labels[1]
        assert len(set(labels)) == 2


class TestClusteringDatabaseExecution:
    def test_idempotent_clustering_run(self, temp_db):
        """
        Verify that clustering can run repeatedly on a database without causing
        foreign key violations, duplicate clusters, or orphaned detections.
        """
        with get_db(temp_db) as conn:
            cursor = conn.cursor()
            # Seed 3 detections: 2 close together, 1 distant
            cursor.execute("""
                INSERT INTO firms_detections (
                    latitude, longitude, brightness, acq_date, acq_time, acq_datetime,
                    satellite, instrument, confidence, frp, daynight
                ) VALUES 
                (22.8015, 86.1950, 320.0, '2026-08-01', '1000', '2026-08-01T10:00:00', 'Terra', 'MODIS', '85', 120.0, 'D'),
                (22.8020, 86.1955, 318.0, '2026-08-02', '1000', '2026-08-02T10:00:00', 'Aqua', 'MODIS', '80', 115.0, 'D'),
                (21.8200, 86.3500, 305.0, '2026-08-03', '1000', '2026-08-03T10:00:00', 'Terra', 'MODIS', '75', 60.0, 'D');
            """)

        # Execute clustering pipeline using temp_db
        def run_custom_clustering(db_path):
            with get_db(db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id, latitude, longitude, acq_datetime, confidence FROM firms_detections")
                rows = cursor.fetchall()
                gated = [r for r in rows if is_high_confidence(r["confidence"])]

                coords = np.array([[radians(d["latitude"]), radians(d["longitude"])] for d in gated])
                db = DBSCAN(eps=EPS_RADIANS, min_samples=1, metric="haversine")
                labels = db.fit_predict(coords)

                # Safe deletion with child reference nullification
                cursor.execute("UPDATE firms_detections SET cluster_id = NULL;")
                cursor.execute("DELETE FROM cluster_classifications;")
                cursor.execute("DELETE FROM cluster_features;")
                cursor.execute("DELETE FROM hotspot_clusters;")

                cluster_map = {}
                for idx, lbl in enumerate(labels):
                    cid = int(lbl) + 1
                    cluster_map.setdefault(cid, []).append(gated[idx])

                for cid, dets in cluster_map.items():
                    c_lat = float(np.mean([d["latitude"] for d in dets]))
                    c_lon = float(np.mean([d["longitude"] for d in dets]))
                    cursor.execute("""
                        INSERT INTO hotspot_clusters (cluster_id, centroid_lat, centroid_lon, detection_count)
                        VALUES (?, ?, ?, ?)
                    """, (cid, c_lat, c_lon, len(dets)))
                    for d in dets:
                        cursor.execute("UPDATE firms_detections SET cluster_id = ? WHERE id = ?", (cid, d["id"]))

        # Run twice in succession
        run_custom_clustering(temp_db)
        run_custom_clustering(temp_db)

        # Verify database integrity and referential safety
        with get_db(temp_db) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as cnt FROM hotspot_clusters")
            cluster_count = cursor.fetchone()["cnt"]
            assert cluster_count == 2  # 1 cluster for Tata Steel pair, 1 for Similipal point

            cursor.execute("SELECT COUNT(*) as cnt FROM firms_detections WHERE cluster_id IS NULL")
            orphans = cursor.fetchone()["cnt"]
            assert orphans == 0, "No high-confidence detections should be unmapped"

            cursor.execute("PRAGMA foreign_key_check;")
            violations = cursor.fetchall()
            assert len(violations) == 0, f"Foreign key check failed: {violations}"
