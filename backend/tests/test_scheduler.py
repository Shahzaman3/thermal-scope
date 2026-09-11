"""
Automated Unit and Integration Tests for Phase 4C.1: Automated FIRMS Monitoring & Refresh.

Verification Scenarios (per Phase 4C.1 Specification):
1. Scheduler disabled by default (FIRMS_AUTO_REFRESH_ENABLED=false).
2. Scheduler does not call FIRMS when disabled.
3. Scheduler starts background task when enabled.
4. Configured interval is respected and clamped to safe minimum (>= 60 minutes).
5. Existing ingestion service (ingest_live_firms_data) is called without duplication.
6. Failed ingestion does not crash the application or terminate the background loop.
7. Failed ingestion allows subsequent scheduled cycles to run (lock release guarantee).
8. Overlapping ingestion is prevented (IngestionGuard prevents concurrent runs; returns 409 on manual).
9. Scheduler shuts down cleanly with task cancellation and zero orphan tasks.
10. Missing FIRMS_MAP_KEY does not crash the scheduler or application.
11. Scheduler status telemetry is reported via get_scheduler_status and /api/firms/status.
12. Manual ingestion remains functional and available.
13. Ingestion history logging remains functional.
14. Offline baseline database remains completely intact.
"""

import os
import asyncio
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.services.scheduler_service import (
    start_scheduler,
    stop_scheduler,
    get_scheduler_status,
    reset_scheduler_state,
    execute_scheduled_refresh_cycle,
    IngestionGuard,
    is_scheduler_enabled,
    get_refresh_interval_minutes,
    SAFE_MINIMUM_INTERVAL_MINUTES
)
from app.services.firms_ingestion_service import reset_ingestion_state
from app.database import get_db
from app.main import app


@pytest.fixture(autouse=True)
def clean_scheduler_and_ingestion_state():
    """Ensure clean state before and after each scheduler test."""
    reset_scheduler_state()
    reset_ingestion_state()
    yield
    reset_scheduler_state()
    reset_ingestion_state()


class TestSchedulerConfiguration:
    """Test environment configuration parsing and interval safety clamping."""

    def test_scheduler_disabled_by_default(self):
        """1. Verify scheduler is disabled by default when env var is unset."""
        with patch.dict(os.environ, {}, clear=True):
            assert is_scheduler_enabled() is False
            status = get_scheduler_status()
            assert status["auto_refresh_enabled"] is False
            assert status["scheduler_running"] is False

    def test_scheduler_enabled_flag_parsing(self):
        """Verify various boolean truthy values enable the scheduler."""
        for truthy in ["true", "True", "TRUE", "1", "yes", "YES"]:
            with patch.dict(os.environ, {"FIRMS_AUTO_REFRESH_ENABLED": truthy}):
                assert is_scheduler_enabled() is True

        for falsy in ["false", "False", "0", "no", "disabled", ""]:
            with patch.dict(os.environ, {"FIRMS_AUTO_REFRESH_ENABLED": falsy}):
                assert is_scheduler_enabled() is False

    def test_configured_interval_and_clamping(self):
        """4. Verify configured interval respects safe minimum (60 minutes)."""
        # Under minimum -> clamped to SAFE_MINIMUM_INTERVAL_MINUTES (60)
        with patch.dict(os.environ, {"FIRMS_AUTO_REFRESH_INTERVAL_MINUTES": "15"}):
            assert get_refresh_interval_minutes() == SAFE_MINIMUM_INTERVAL_MINUTES

        # Equal or above minimum -> respected
        with patch.dict(os.environ, {"FIRMS_AUTO_REFRESH_INTERVAL_MINUTES": "120"}):
            assert get_refresh_interval_minutes() == 120

        # Invalid/non-integer string -> fallback to safe minimum
        with patch.dict(os.environ, {"FIRMS_AUTO_REFRESH_INTERVAL_MINUTES": "not-a-number"}):
            assert get_refresh_interval_minutes() == SAFE_MINIMUM_INTERVAL_MINUTES


class TestSchedulerLifecycle:
    """Test startup, shutdown, and background task management."""

    def test_scheduler_does_not_call_firms_when_disabled(self):
        """2. Verify scheduler does not start task or call FIRMS when disabled."""
        async def _run():
            with patch.dict(os.environ, {"FIRMS_AUTO_REFRESH_ENABLED": "false"}):
                with patch("app.services.scheduler_service.ingest_live_firms_data") as mock_ingest:
                    task = start_scheduler()
                    assert task is None
                    status = get_scheduler_status()
                    assert status["scheduler_running"] is False
                    mock_ingest.assert_not_called()

        asyncio.run(_run())

    def test_scheduler_starts_when_enabled(self):
        """3. Verify scheduler starts background loop and sets next run time when enabled."""
        async def _run():
            with patch.dict(os.environ, {
                "FIRMS_AUTO_REFRESH_ENABLED": "true",
                "FIRMS_AUTO_REFRESH_INTERVAL_MINUTES": "60"
            }):
                task = start_scheduler()
                try:
                    assert task is not None
                    assert not task.done()
                    # Allow loop task to execute initial setup
                    await asyncio.sleep(0.05)
                    status = get_scheduler_status()
                    assert status["auto_refresh_enabled"] is True
                    assert status["scheduler_running"] is True
                    assert status["next_scheduled_run"] is not None
                finally:
                    await stop_scheduler()

        asyncio.run(_run())

    def test_scheduler_clean_shutdown(self):
        """9. Verify scheduler shuts down cleanly and cancels background task."""
        async def _run():
            with patch.dict(os.environ, {"FIRMS_AUTO_REFRESH_ENABLED": "true"}):
                task = start_scheduler()
                assert task is not None
                assert get_scheduler_status()["scheduler_running"] is True

                await stop_scheduler()
                assert task.cancelled() or task.done()
                status = get_scheduler_status()
                assert status["scheduler_running"] is False
                assert status["next_scheduled_run"] is None

        asyncio.run(_run())

    def test_idempotent_start(self):
        """Verify repeated calls to start_scheduler do not create duplicate orphan tasks."""
        async def _run():
            with patch.dict(os.environ, {"FIRMS_AUTO_REFRESH_ENABLED": "true"}):
                task1 = start_scheduler()
                task2 = start_scheduler()
                try:
                    assert task1 is task2
                finally:
                    await stop_scheduler()

        asyncio.run(_run())


class TestSchedulerExecution:
    """Test execution cycle, error resilience, and overlap protection."""

    def test_existing_ingestion_service_called(self):
        """5. Verify scheduled cycle invokes existing ingest_live_firms_data without duplication."""
        mock_result = {
            "status": "success",
            "source": "NASA_FIRMS_NRT",
            "records_received": 10,
            "records_valid": 10,
            "records_inserted": 0,
            "records_skipped_duplicate": 10,
            "records_rejected": 0,
            "message": "Scheduled refresh completed",
            "run_id": 999
        }

        with patch("app.services.scheduler_service.ingest_live_firms_data", return_value=mock_result) as mock_ingest:
            result = execute_scheduled_refresh_cycle()
            assert result is not None
            assert result["status"] == "success"
            mock_ingest.assert_called_once_with(days=2, source=None, custom_db_path=None)

            status = get_scheduler_status()
            assert status["last_scheduled_run"] is not None
            assert status["current_ingestion_running"] is False

    def test_failed_ingestion_does_not_crash(self):
        """6. Verify exception in ingestion service does not crash application or loop."""
        with patch("app.services.scheduler_service.ingest_live_firms_data", side_effect=Exception("NASA API Timeout")):
            result = execute_scheduled_refresh_cycle()
            assert result is not None
            assert result["status"] == "error"
            assert "NASA API Timeout" in result["message"]

            status = get_scheduler_status()
            assert status["last_scheduled_run"] is not None
            assert status["current_ingestion_running"] is False

    def test_failed_ingestion_allows_next_cycle(self):
        """7. Verify failed cycle releases lock so subsequent scheduled cycles can run."""
        # Cycle 1: Failure
        with patch("app.services.scheduler_service.ingest_live_firms_data", side_effect=Exception("Network error")):
            res1 = execute_scheduled_refresh_cycle()
            assert res1["status"] == "error"

        # Lock should be completely free
        status = get_scheduler_status()
        assert status["current_ingestion_running"] is False

        # Cycle 2: Success
        mock_success = {
            "status": "success",
            "records_inserted": 0,
            "records_skipped_duplicate": 5,
            "run_id": 1001
        }
        with patch("app.services.scheduler_service.ingest_live_firms_data", return_value=mock_success):
            res2 = execute_scheduled_refresh_cycle()
            assert res2["status"] == "success"

    def test_overlapping_ingestion_prevented(self):
        """8. Verify IngestionGuard prevents overlapping concurrent runs."""
        # Hold the lock intentionally
        with IngestionGuard():
            assert get_scheduler_status()["current_ingestion_running"] is True

            # Attempting a second guard should raise RuntimeError
            with pytest.raises(RuntimeError) as exc_info:
                with IngestionGuard():
                    pass
            assert "already in progress" in str(exc_info.value)

            # A scheduled refresh cycle should cleanly skip
            result = execute_scheduled_refresh_cycle()
            assert result["status"] == "skipped"
            assert "currently active" in result["message"] or "already in progress" in result["message"]

        # Lock released
        assert get_scheduler_status()["current_ingestion_running"] is False

    def test_missing_firms_map_key_graceful(self, temp_db: Path):
        """10. Verify missing FIRMS_MAP_KEY gracefully falls back using isolated DB."""
        with patch.dict(os.environ, {"FIRMS_MAP_KEY": ""}):
            from app.services.firms_ingestion_service import ingest_live_firms_data
            res = ingest_live_firms_data(days=1, custom_db_path=temp_db)
            # Ingestion service returns success or graceful offline handling
            assert res["status"] in ("success", "error")
            assert res["source"] in ("OFFLINE_DEMO", "OFFLINE_FALLBACK", "NASA_FIRMS_NRT")


class TestApiIntegrationAndBaseline:
    """Test API endpoint responses, telemetry exposition, and database integrity."""

    def test_scheduler_status_reported_via_api(self, client: TestClient):
        """11. Verify GET /api/firms/status exposes scheduler operational telemetry."""
        with patch.dict(os.environ, {
            "FIRMS_AUTO_REFRESH_ENABLED": "true",
            "FIRMS_AUTO_REFRESH_INTERVAL_MINUTES": "90"
        }):
            response = client.get("/api/firms/status")
            assert response.status_code == 200
            data = response.json()

            assert "auto_refresh_enabled" in data
            assert data["auto_refresh_enabled"] is True
            assert data["auto_refresh_interval_minutes"] == 90
            assert "scheduler_running" in data
            assert "current_ingestion_running" in data
            assert "last_scheduled_run" in data
            assert "next_scheduled_run" in data

    def test_manual_ingestion_remains_functional(self, client: TestClient):
        """12. Verify manual ingestion endpoint /api/firms/ingest remains available."""
        mock_result = {
            "status": "success",
            "run_id": 9999,
            "source": "TEST_SOURCE",
            "records_received": 1,
            "records_valid": 1,
            "records_inserted": 0,
            "records_skipped_duplicate": 1,
            "records_rejected": 0,
            "message": "Manual ingestion successful",
            "latest_observation_datetime": "2026-09-10T12:00:00Z",
            "latest_observation_utc": "2026-09-10 12:00:00 UTC",
            "latest_observation_ist": "2026-09-10 17:30:00 IST",
            "last_successful_ingestion_utc": "2026-09-10 12:05:00 UTC",
            "last_successful_ingestion_ist": "2026-09-10 17:35:00 IST"
        }

        with patch("app.api.routes.ingest_live_firms_data", return_value=mock_result):
            response = client.post("/api/firms/ingest", json={"days": 1, "run_pipeline": False})
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "success"
            assert data["records_received"] == 1

    def test_manual_ingestion_conflict_409_when_running(self, client: TestClient):
        """Verify manual ingestion returns 409 Conflict when an ingestion is in progress."""
        with IngestionGuard():
            response = client.post("/api/firms/ingest", json={"days": 1})
            assert response.status_code == 409
            assert "in progress" in response.json()["detail"]

    def test_existing_ingestion_history_remains_functional(self, client: TestClient):
        """13. Verify historical audit log endpoint returns valid records."""
        response = client.get("/api/v1/firms/ingest/history?limit=10")
        assert response.status_code == 200
        data = response.json()
        assert "history" in data
        assert "total_runs" in data

    def test_offline_baseline_intact(self, demo_db_path):
        """
        14. Regression baseline test verifying database analytical records remain untouched:
        - 407 FIRMS detections
        - 162 OSM industrial sites
        - 17 clusters
        - 17 feature rows
        - 17 classification rows: 8 Persistent, 0 Ambiguous, 9 Transient
        """
        with get_db(demo_db_path) as conn:
            cursor = conn.cursor()

            cursor.execute("SELECT COUNT(*) FROM firms_detections")
            assert cursor.fetchone()[0] == 407

            cursor.execute("SELECT COUNT(*) FROM osm_industrial_sites")
            assert cursor.fetchone()[0] == 162

            cursor.execute("SELECT COUNT(*) FROM hotspot_clusters")
            assert cursor.fetchone()[0] == 17

            cursor.execute("SELECT COUNT(*) FROM cluster_features")
            assert cursor.fetchone()[0] == 17

            cursor.execute("SELECT COUNT(*) FROM cluster_classifications")
            assert cursor.fetchone()[0] == 17

            cursor.execute("SELECT band_label, COUNT(*) FROM cluster_classifications GROUP BY band_label")
            class_counts = dict(cursor.fetchall())
            assert class_counts.get("Persistent industrial source", 0) == 8
            assert class_counts.get("Ambiguous", 0) == 0
            assert class_counts.get("Transient fire event", 0) == 9
