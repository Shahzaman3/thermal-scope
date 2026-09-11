"""
Database Integrity & Smoke Verification Test (Phase 0 & 1).
Verifies:
1. SQLite connection and PRAGMA configuration
2. Existence of all 5 required tables
3. Required schema columns per table
4. Table queryability (populated or fresh)
5. Foreign key referential integrity
6. FastAPI health statistics endpoint
"""

import sys
import sqlite3
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.database import init_db, get_db, get_db_stats, DB_PATH
from app.main import app

REQUIRED_TABLES = {
    "firms_detections": ["id", "latitude", "longitude", "acq_datetime", "frp", "confidence", "daynight", "cluster_id"],
    "osm_industrial_sites": ["id", "osm_id", "name", "site_type", "latitude", "longitude"],
    "hotspot_clusters": ["cluster_id", "centroid_lat", "centroid_lon", "detection_count", "first_seen", "last_seen"],
    "cluster_features": ["cluster_id", "recurrence_count", "recurrence_regularity", "dist_to_nearest_industrial", "spatial_stability", "frp_trend", "day_night_ratio"],
    "cluster_classifications": ["cluster_id", "persistence_score", "band_label", "confidence_prefilter_passed", "classified_at"]
}


def test_database_integrity():
    print("==================================================")
    print("SIH26162 — SQLite Database Integrity & Smoke Test")
    print("==================================================")

    # 1. Ensure initialization does not error
    init_db()
    assert DB_PATH.exists(), f"Database file not found at: {DB_PATH}"
    print(f"[OK] Database file exists: {DB_PATH}")

    # 2. Verify connection and table existence
    with get_db() as conn:
        cursor = conn.cursor()

        # Check PRAGMA foreign keys
        cursor.execute("PRAGMA foreign_keys;")
        fk_enabled = cursor.fetchone()[0]
        assert fk_enabled == 1, "Foreign keys PRAGMA must be enabled (got 0)"
        print("[OK] Foreign key constraints: ENABLED")

        # Check all required tables exist
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        existing_tables = {row["name"] for row in cursor.fetchall()}

        for table_name, expected_cols in REQUIRED_TABLES.items():
            assert table_name in existing_tables, f"Missing required table: {table_name}"

            # Check required columns
            cursor.execute(f"PRAGMA table_info({table_name});")
            col_info = cursor.fetchall()
            existing_cols = {col["name"] for col in col_info}

            for col in expected_cols:
                assert col in existing_cols, f"Missing column '{col}' in table '{table_name}'"

            # Verify table can be queried
            cursor.execute(f"SELECT COUNT(*) as cnt FROM {table_name};")
            count = cursor.fetchone()["cnt"]
            assert count is not None and count >= 0, f"Failed to query row count from '{table_name}'"
            print(f"[OK] Table '{table_name}': OK ({count} records, {len(existing_cols)} columns)")

        # 3. Check Foreign Key referential integrity
        cursor.execute("PRAGMA foreign_key_check;")
        fk_violations = cursor.fetchall()
        assert len(fk_violations) == 0, f"Foreign key constraint violations detected: {fk_violations}"
        print("[OK] Referential Integrity: ZERO foreign key violations")

    # 4. Verify get_db_stats helper
    stats = get_db_stats()
    assert stats["db_path"] == str(DB_PATH)
    assert stats["db_size_bytes"] > 0
    assert len(stats["table_counts"]) == 5
    print("[OK] FastAPI Database Stats Reporter: OK")

    print("\nDatabase integrity & smoke verification: ALL CHECKS PASSED!\n")


if __name__ == "__main__":
    test_database_integrity()
