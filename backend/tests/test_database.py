"""
Database Layer & Schema Referential Integrity Test Suite (Phase 2).
Tests:
- Database creation & table schema generation
- Column constraints and data types
- Foreign key cascade deletions (ON DELETE CASCADE)
- Transaction rollback safety on failure
- Queryability and get_db_stats accuracy
"""

import sqlite3
import pytest
from pathlib import Path
from app.database import init_db, get_db, get_db_stats


class TestDatabaseSchema:
    def test_init_creates_all_tables(self, temp_db):
        with get_db(temp_db) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = {row["name"] for row in cursor.fetchall()}

        expected_tables = {
            "firms_detections",
            "osm_industrial_sites",
            "hotspot_clusters",
            "cluster_features",
            "cluster_classifications"
        }
        assert expected_tables.issubset(tables)

    def test_foreign_keys_pragma_enabled(self, temp_db):
        with get_db(temp_db) as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA foreign_keys;")
            assert cursor.fetchone()[0] == 1

    def test_cascade_delete_behavior(self, temp_db):
        """
        Verify that deleting a hotspot cluster cascades to delete its
        associated cluster_features and cluster_classifications rows.
        """
        with get_db(temp_db) as conn:
            cursor = conn.cursor()
            # 1. Insert parent cluster
            cursor.execute("""
                INSERT INTO hotspot_clusters (cluster_id, centroid_lat, centroid_lon, detection_count)
                VALUES (101, 22.8015, 86.1950, 10)
            """)

            # 2. Insert child feature record
            cursor.execute("""
                INSERT INTO cluster_features (cluster_id, recurrence_count, persistence_score)
                VALUES (101, 10.0, 0.85)
            """) if "persistence_score" in [c["name"] for c in cursor.execute("PRAGMA table_info(cluster_features)").fetchall()] else cursor.execute("""
                INSERT INTO cluster_features (cluster_id, recurrence_count)
                VALUES (101, 10.0)
            """)

            # 3. Insert child classification record
            cursor.execute("""
                INSERT INTO cluster_classifications (cluster_id, persistence_score, band_label, classified_at)
                VALUES (101, 0.85, 'Persistent industrial source', '2026-09-01T12:00:00')
            """)

            # Verify rows exist
            cursor.execute("SELECT COUNT(*) as cnt FROM cluster_features WHERE cluster_id = 101")
            assert cursor.fetchone()["cnt"] == 1
            cursor.execute("SELECT COUNT(*) as cnt FROM cluster_classifications WHERE cluster_id = 101")
            assert cursor.fetchone()["cnt"] == 1

            # 4. Delete parent cluster
            cursor.execute("DELETE FROM hotspot_clusters WHERE cluster_id = 101")

            # 5. Verify children were cascade-deleted
            cursor.execute("SELECT COUNT(*) as cnt FROM cluster_features WHERE cluster_id = 101")
            assert cursor.fetchone()["cnt"] == 0
            cursor.execute("SELECT COUNT(*) as cnt FROM cluster_classifications WHERE cluster_id = 101")
            assert cursor.fetchone()["cnt"] == 0

    def test_transaction_rollback_on_error(self, temp_db):
        """Verify transaction rollbacks keep data clean when an exception is raised."""
        with pytest.raises(ValueError):
            with get_db(temp_db) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO hotspot_clusters (cluster_id, centroid_lat, centroid_lon, detection_count)
                    VALUES (999, 22.0, 85.0, 1)
                """)
                # Explicitly raise exception to force contextmanager rollback
                raise ValueError("Simulated unexpected failure")

        # Verify cluster was NOT committed
        with get_db(temp_db) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as cnt FROM hotspot_clusters WHERE cluster_id = 999")
            assert cursor.fetchone()["cnt"] == 0

    def test_get_db_stats(self, temp_db):
        stats = get_db_stats(temp_db)
        assert stats["db_path"] == str(temp_db)
        assert stats["db_size_bytes"] > 0
        assert len(stats["table_counts"]) == 5
        assert stats["table_counts"]["firms_detections"] == 0
