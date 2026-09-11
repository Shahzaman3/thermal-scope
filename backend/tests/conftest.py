"""
Shared Pytest Fixtures for SIH26162 Automated Test Suite.
Provides:
- Isolated temporary database fixture (protecting production/demo database)
- FastAPI TestClient fixture
- Calibrated sample FIRMS detection and OSM industrial site fixtures
- Reference path to populated baseline database for read-only regression checks
"""

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

# Also add scripts directory for pipeline modules
scripts_dir = backend_root / "scripts"
if str(scripts_dir) not in sys.path:
    sys.path.insert(0, str(scripts_dir))

from app.main import app
from app.database import init_db, get_db, DB_PATH


@pytest.fixture(scope="session")
def demo_db_path() -> Path:
    """Path to the baseline populated SQLite database."""
    assert DB_PATH.exists(), f"Demo database missing at {DB_PATH}"
    return DB_PATH


@pytest.fixture
def temp_db(tmp_path: Path):
    """
    Isolated temporary SQLite database.
    Ensures destructive tests never modify or corrupt backend/data/thermal_classifier.db.
    """
    test_db_file = tmp_path / "test_thermal_classifier.db"
    init_db(test_db_file)
    yield test_db_file
    if test_db_file.exists():
        try:
            test_db_file.unlink()
        except PermissionError:
            pass


@pytest.fixture
def client():
    """FastAPI TestClient instance connected to main application."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def sample_osm_sites():
    """Sample industrial infrastructure records for testing distance and classification."""
    return [
        {
            "id": 1,
            "osm_id": "way/tata_steel_jamshedpur",
            "name": "Tata Steel Jamshedpur Works",
            "site_type": "steel_plant",
            "latitude": 22.8015,
            "longitude": 86.1950
        },
        {
            "id": 2,
            "osm_id": "way/sail_rourkela",
            "name": "Rourkela Steel Plant (SAIL)",
            "site_type": "steel_plant",
            "latitude": 22.2285,
            "longitude": 84.8690
        }
    ]


@pytest.fixture
def sample_detections():
    """Multi-pass synthetic detection records for cluster feature calculation."""
    return [
        {
            "id": 1,
            "latitude": 22.8015,
            "longitude": 86.1950,
            "acq_datetime": "2026-08-01T10:30:00",
            "frp": 120.0,
            "confidence": "high",
            "daynight": "D"
        },
        {
            "id": 2,
            "latitude": 22.8017,
            "longitude": 86.1952,
            "acq_datetime": "2026-08-02T22:15:00",
            "frp": 118.5,
            "confidence": "nominal",
            "daynight": "N"
        },
        {
            "id": 3,
            "latitude": 22.8014,
            "longitude": 86.1949,
            "acq_datetime": "2026-08-03T11:00:00",
            "frp": 122.0,
            "confidence": "high",
            "daynight": "D"
        }
    ]
