import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Generator, Dict, Any, Optional

# Root data directory
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "thermal_classifier.db"


@contextmanager
def get_db(custom_path: Optional[Path] = None) -> Generator[sqlite3.Connection, None, None]:
    """Context manager for SQLite database connection with test database isolation support."""
    target_path = str(custom_path or DB_PATH)
    conn = sqlite3.connect(target_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(custom_path: Optional[Path] = None) -> None:
    """Initialize SQLite database with the 5 required core tables and indexes."""
    with get_db(custom_path) as conn:
        cursor = conn.cursor()

        # 1. Raw NASA FIRMS Detections
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS firms_detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                brightness REAL,
                scan REAL,
                track REAL,
                acq_date TEXT NOT NULL,
                acq_time TEXT NOT NULL,
                acq_datetime TEXT NOT NULL,
                satellite TEXT,
                instrument TEXT,
                confidence TEXT,
                version TEXT,
                bright_t31 REAL,
                frp REAL,
                daynight TEXT,
                cluster_id INTEGER,
                FOREIGN KEY (cluster_id) REFERENCES hotspot_clusters (cluster_id)
            );
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_firms_coords ON firms_detections(latitude, longitude);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_firms_datetime ON firms_detections(acq_datetime);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_firms_cluster ON firms_detections(cluster_id);")

        # 1.5. FIRMS Ingestion Runs History
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS firms_ingestion_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                source TEXT,
                bbox TEXT,
                days_requested INTEGER,
                records_received INTEGER DEFAULT 0,
                records_validated INTEGER DEFAULT 0,
                records_inserted INTEGER DEFAULT 0,
                records_duplicate INTEGER DEFAULT 0,
                records_rejected INTEGER DEFAULT 0,
                status TEXT NOT NULL,
                error_message TEXT,
                pipeline_status TEXT,
                pipeline_started_at TEXT,
                pipeline_completed_at TEXT
            );
        """)

        # 2. OSM Industrial Sites
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS osm_industrial_sites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                osm_id TEXT UNIQUE,
                name TEXT,
                site_type TEXT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                tags_json TEXT
            );
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_osm_coords ON osm_industrial_sites(latitude, longitude);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_osm_type ON osm_industrial_sites(site_type);")

        # 3. Hotspot Clusters (~1km spatial groups)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hotspot_clusters (
                cluster_id INTEGER PRIMARY KEY,
                centroid_lat REAL NOT NULL,
                centroid_lon REAL NOT NULL,
                detection_count INTEGER NOT NULL,
                first_seen TEXT,
                last_seen TEXT,
                radius_meters REAL
            );
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cluster_coords ON hotspot_clusters(centroid_lat, centroid_lon);")

        # 4. Cluster Feature Vectors (raw & normalized 0-1)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cluster_features (
                cluster_id INTEGER PRIMARY KEY,
                recurrence_count REAL,
                recurrence_regularity REAL,
                dist_to_nearest_industrial REAL,
                spatial_stability REAL,
                frp_trend REAL,
                day_night_ratio REAL,
                recurrence_count_norm REAL,
                regularity_norm REAL,
                dist_to_industrial_norm REAL,
                spatial_stability_norm REAL,
                frp_trend_norm REAL,
                day_night_ratio_norm REAL,
                FOREIGN KEY (cluster_id) REFERENCES hotspot_clusters (cluster_id) ON DELETE CASCADE
            );
        """)

        # 5. Cluster Classifications (persistence score + band)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cluster_classifications (
                cluster_id INTEGER PRIMARY KEY,
                persistence_score REAL NOT NULL,
                band_label TEXT NOT NULL,
                confidence_prefilter_passed INTEGER DEFAULT 1,
                classified_at TEXT NOT NULL,
                FOREIGN KEY (cluster_id) REFERENCES hotspot_clusters (cluster_id) ON DELETE CASCADE
            );
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_class_band ON cluster_classifications(band_label);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_class_score ON cluster_classifications(persistence_score);")


def get_db_stats(custom_path: Optional[Path] = None) -> Dict[str, Any]:
    """Retrieve row counts and file size stats for database tables."""
    target_path = Path(custom_path) if custom_path else DB_PATH
    tables = [
        "firms_ingestion_runs",
        "firms_detections",
        "osm_industrial_sites",
        "hotspot_clusters",
        "cluster_features",
        "cluster_classifications"
    ]
    counts = {}
    with get_db(target_path) as conn:
        cursor = conn.cursor()
        for tbl in tables:
            try:
                cursor.execute(f"SELECT COUNT(*) as count FROM {tbl};")
                counts[tbl] = cursor.fetchone()["count"]
            except sqlite3.OperationalError:
                counts[tbl] = None

    file_size_bytes = target_path.stat().st_size if target_path.exists() else 0
    return {
        "db_path": str(target_path),
        "db_size_bytes": file_size_bytes,
        "table_counts": counts
    }
