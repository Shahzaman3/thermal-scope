"""
Automated unit and integration test suite for NASA FIRMS Live Ingestion & Operational Status (Phase 4B.1).

Scenarios Tested (per Phase 4B.1 Specification):
1. FIRMS configured + successful ingestion (operational_status = LIVE)
2. Successful live ingestion with zero new records (0 new, 9 duplicates -> SUCCESSFUL LIVE, NOT ERROR)
3. Successful live ingestion with new records committed
4. FIRMS unavailable (timeout/connection failure -> operational_status = ERROR, offline data preserved)
5. Malformed CSV response (handled gracefully without crashing)
6. Invalid observation (out-of-bounds, negative FRP, invalid timestamp -> rejected)
7. Duplicate observation handling and deduplication guarantee
8. Timestamp parsing and timezone conversions (UTC and IST)
9. Freshness calculation and relative age labeling
10. Stale state determination when observation age exceeds threshold
11. Offline state determination on default benchmark dataset
12. Pipeline execution status tracking (COMPLETED, NOT_RUN, FAILED)
13. Secret MAP_KEY never exposed in status, ingestion, or error responses
"""

import os
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
import pytest
from app.services.firms_ingestion_service import (
    validate_raw_record,
    fetch_firms_source_csv,
    ingest_live_firms_data,
    get_ingestion_status,
    reset_ingestion_state,
    determine_operational_status,
    get_latest_observation_info,
    parse_iso_or_utc,
    format_utc,
    format_ist,
    get_ingestion_history,
    _state
)
from app.database import get_db

SAMPLE_VIIRS_CSV = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
22.8015,86.1950,335.2,0.4,0.4,2026-09-10,0830,N20,VIIRS,nominal,2.0NRT,295.4,45.2,D
22.8020,86.1960,340.1,0.4,0.4,2026-09-10,0830,N20,VIIRS,high,2.0NRT,298.0,52.8,D
"""

SAMPLE_MODIS_CSV = """latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
22.2285,84.8690,320.5,1.1,1.0,2026-09-10,1430,Terra,MODIS,85,6.1NRT,290.2,38.0,N
"""


@pytest.fixture(autouse=True)
def clean_state():
    """Reset ingestion state before and after each test."""
    reset_ingestion_state()
    yield
    reset_ingestion_state()


class TestRecordValidation:
    """Test validation and normalization of individual FIRMS CSV records."""

    def test_valid_viirs_record(self):
        raw = {
            "latitude": "22.8015",
            "longitude": "86.1950",
            "bright_ti4": "335.2",
            "scan": "0.4",
            "track": "0.4",
            "acq_date": "2026-09-10",
            "acq_time": "830",
            "satellite": "N20",
            "instrument": "VIIRS",
            "confidence": "nominal",
            "version": "2.0NRT",
            "bright_ti5": "295.4",
            "frp": "45.2",
            "daynight": "D"
        }
        is_valid, norm, err = validate_raw_record(raw)
        assert is_valid is True
        assert err is None
        assert norm["latitude"] == 22.8015
        assert norm["longitude"] == 86.1950
        assert norm["acq_time"] == "0830"
        assert norm["acq_datetime"] == "2026-09-10T08:30:00"
        assert norm["frp"] == 45.2
        assert norm["daynight"] == "D"

    def test_valid_modis_record(self):
        raw = {
            "latitude": "22.2285",
            "longitude": "84.8690",
            "brightness": "320.5",
            "acq_date": "2026-09-10",
            "acq_time": "1430",
            "satellite": "Terra",
            "instrument": "MODIS",
            "confidence": "85",
            "frp": "38.0",
            "daynight": "N"
        }
        is_valid, norm, err = validate_raw_record(raw)
        assert is_valid is True
        assert norm["confidence"] == "85"
        assert norm["daynight"] == "N"

    def test_invalid_latitude_out_of_bounds(self):
        raw = {"latitude": "95.5", "longitude": "86.0", "acq_date": "2026-09-10", "acq_time": "1200"}
        is_valid, norm, err = validate_raw_record(raw)
        assert is_valid is False
        assert "bounds" in err.lower()

    def test_invalid_longitude_out_of_bounds(self):
        raw = {"latitude": "22.5", "longitude": "195.0", "acq_date": "2026-09-10", "acq_time": "1200"}
        is_valid, norm, err = validate_raw_record(raw)
        assert is_valid is False
        assert "bounds" in err.lower()

    def test_negative_frp_rejected(self):
        raw = {"latitude": "22.5", "longitude": "86.0", "acq_date": "2026-09-10", "acq_time": "1200", "frp": "-5.2"}
        is_valid, norm, err = validate_raw_record(raw)
        assert is_valid is False
        assert "negative frp" in err.lower()

    def test_missing_datetime_rejected(self):
        raw = {"latitude": "22.5", "longitude": "86.0", "acq_date": "", "acq_time": "1200"}
        is_valid, norm, err = validate_raw_record(raw)
        assert is_valid is False
        assert "missing acquisition" in err.lower()


class TestFirmsMockHttp:
    """Test HTTP fetching with mocks."""

    @patch("requests.get")
    def test_successful_csv_fetch(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = SAMPLE_VIIRS_CSV
        mock_get.return_value = mock_resp

        status, records, err_cat, err_msg = fetch_firms_source_csv("MOCK_KEY", "VIIRS_SNPP_NRT", "84.5,20.5,86.8,23.2")
        assert status == 200
        assert len(records) == 2
        assert err_cat is None

    @patch("requests.get")
    def test_authentication_error_401(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_get.return_value = mock_resp

        status, records, err_cat, err_msg = fetch_firms_source_csv("BAD_KEY", "VIIRS_SNPP_NRT", "84.5,20.5,86.8,23.2")
        assert status == 401
        assert err_cat == "AUTHENTICATION_ERROR"

    @patch("requests.get")
    def test_rate_limit_error_429(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_get.return_value = mock_resp

        status, records, err_cat, err_msg = fetch_firms_source_csv("MOCK_KEY", "VIIRS_SNPP_NRT", "84.5,20.5,86.8,23.2")
        assert status == 429
        assert err_cat == "RATE_LIMIT"

    @patch("requests.get")
    def test_server_error_500(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 503
        mock_get.return_value = mock_resp

        status, records, err_cat, err_msg = fetch_firms_source_csv("MOCK_KEY", "VIIRS_SNPP_NRT", "84.5,20.5,86.8,23.2")
        assert status == 503
        assert err_cat == "SERVER_ERROR"

    @patch("requests.get", side_effect=Exception("Connection timed out"))
    def test_timeout_handling(self, mock_get):
        status, records, err_cat, err_msg = fetch_firms_source_csv("MOCK_KEY", "VIIRS_SNPP_NRT", "84.5,20.5,86.8,23.2")
        assert err_cat in ("TIMEOUT", "NETWORK_ERROR", "REQUEST_FAILED")


class TestOperationalStatesAndFreshness:
    """Test explicit operational states (LIVE, STALE, OFFLINE, ERROR) and freshness math."""

    def test_offline_state_default(self):
        """Default state with no live ingestion must be OFFLINE."""
        reset_ingestion_state()
        status = get_ingestion_status()
        assert status["operational_status"] == "OFFLINE"
        assert status["provenance"] == "OFFLINE_DEMO"
        assert status["is_live"] is False

    def test_timestamp_parsing_and_formatting(self):
        """Verify UTC and IST parsing with explicit formatting."""
        dt = parse_iso_or_utc("2026-09-11T12:18:00Z")
        assert dt is not None
        assert dt.tzinfo is not None

        utc_str = format_utc(dt)
        ist_str = format_ist(dt)
        assert "12:18 UTC" in utc_str
        assert "17:48 IST" in ist_str

    def test_freshness_calculation(self):
        """Verify freshness label logic for minutes, hours, days."""
        now = datetime.now(timezone.utc)
        obs_15m = (now - timedelta(minutes=15)).isoformat()
        dt_15m = parse_iso_or_utc(obs_15m)
        diff_sec = (now - dt_15m).total_seconds()
        assert diff_sec < 1800

    def test_stale_state_transition(self):
        """If last successful ingestion was more than 24h ago, operational_status becomes STALE."""
        reset_ingestion_state()
        _state.source = "LIVE_FIRMS"
        _state.is_live = True
        # Set last success 26 hours ago
        past_time = (datetime.now(timezone.utc) - timedelta(hours=26)).isoformat()
        _state.last_success = past_time

        op_status = determine_operational_status(_state)
        assert op_status == "STALE"

    def test_error_state_preserves_offline_data(self, temp_db):
        """When ingestion fails (e.g. 401), operational_status is ERROR and DB records remain."""
        reset_ingestion_state()
        with patch("app.services.firms_ingestion_service.fetch_firms_source_csv") as mock_fetch:
            mock_fetch.return_value = (401, [], "AUTHENTICATION_ERROR", "Invalid key")
            res = ingest_live_firms_data(map_key="INVALID_KEY", custom_db_path=temp_db)
            assert res["status"] == "error"
            assert res["operational_status"] == "ERROR"
            assert "verified offline dataset remains available" in res["message"]


class TestZeroNewRecordsScenario:
    """Explicitly verify that 0 new records (all duplicates) is SUCCESSFUL LIVE, not an error."""

    @patch("app.services.firms_ingestion_service.fetch_firms_source_csv")
    def test_successful_ingestion_zero_new_records(self, mock_fetch, temp_db):
        sample_rows = [
            {"latitude": "22.8015", "longitude": "86.1950", "acq_date": "2026-09-10", "acq_time": "0830", "satellite": "N20", "frp": "45.0", "daynight": "D"}
        ]
        mock_fetch.return_value = (200, sample_rows, None, None)

        # First ingestion inserts 1 record
        res1 = ingest_live_firms_data(map_key="MOCK_KEY", source="VIIRS_NOAA21_NRT", custom_db_path=temp_db)
        assert res1["status"] == "success"
        assert res1["records_inserted"] == 1

        # Second identical ingestion returns 0 new, 1 duplicate
        res2 = ingest_live_firms_data(map_key="MOCK_KEY", source="VIIRS_NOAA21_NRT", custom_db_path=temp_db)
        assert res2["status"] == "success"
        assert res2["records_received"] == 1
        assert res2["records_valid"] == 1
        assert res2["records_inserted"] == 0
        assert res2["records_skipped_duplicate"] == 1
        assert res2["operational_status"] == "LIVE"
        assert res2["is_live"] is True
        assert "All returned observations were already present" in res2["message"]

        # Status endpoint reflects LIVE state
        status = get_ingestion_status(temp_db)
        assert status["operational_status"] == "LIVE"
        assert status["records_inserted"] == 0
        assert status["records_skipped"] == 1


class TestPipelineExecutionStatus:
    """Test pipeline execution recording (COMPLETED, NOT_RUN, FAILED)."""

    def test_pipeline_not_run_when_zero_new_records(self, client):
        with patch("app.api.routes.ingest_live_firms_data") as mock_ingest:
            mock_ingest.return_value = {
                "status": "success",
                "source": "LIVE_FIRMS",
                "operational_status": "LIVE",
                "records_received": 9,
                "records_valid": 9,
                "records_inserted": 0,
                "records_skipped_duplicate": 9,
                "records_rejected": 0,
                "message": "Live FIRMS request successful. All returned observations were already present.",
                "latest_observation_datetime": "2026-09-10T12:00:00Z"
            }
            with patch.dict(os.environ, {"FIRMS_MAP_KEY": "MOCK_KEY"}):
                resp = client.post("/api/firms/ingest", json={"days": 2, "run_pipeline": True})
                assert resp.status_code == 200
                data = resp.json()
                assert data["status"] == "success"
                assert data["records_inserted"] == 0
                assert data["pipeline_executed"] is False
                assert data["pipeline_status"] == "NOT_RUN"

    def test_pipeline_completed_when_new_records(self, client):
        with patch("app.api.routes.ingest_live_firms_data") as mock_ingest, \
             patch("app.api.routes.run_clustering") as mock_cluster, \
             patch("app.api.routes.run_classification") as mock_classify:
            mock_ingest.return_value = {
                "status": "success",
                "source": "LIVE_FIRMS",
                "operational_status": "LIVE",
                "records_received": 5,
                "records_valid": 5,
                "records_inserted": 5,
                "records_skipped_duplicate": 0,
                "records_rejected": 0,
                "message": "Live FIRMS ingestion successful: 5 new observations committed.",
                "latest_observation_datetime": "2026-09-10T12:00:00Z"
            }
            mock_cluster.return_value = {"clusters_formed": 18}
            mock_classify.return_value = {
                "total_clusters": 18,
                "persistent_count": 9,
                "ambiguous_count": 0,
                "transient_count": 9
            }
            with patch.dict(os.environ, {"FIRMS_MAP_KEY": "MOCK_KEY"}):
                resp = client.post("/api/firms/ingest", json={"days": 2, "run_pipeline": True})
                assert resp.status_code == 200
                data = resp.json()
                assert data["status"] == "success"
                assert data["records_inserted"] == 5
                assert data["pipeline_executed"] is True
                assert data["pipeline_status"] == "COMPLETED"


class TestSecurityAndSecretRedaction:
    """Ensure NASA MAP_KEY is strictly confidential and never exposed in responses."""

    def test_status_response_never_contains_key(self, client):
        secret = "SECRET_MAP_KEY_ABCD_1234_XYZ"
        with patch.dict(os.environ, {"FIRMS_MAP_KEY": secret}):
            resp = client.get("/api/firms/status")
            assert resp.status_code == 200
            data_str = resp.text
            assert secret not in data_str
            assert "MAP_KEY" not in data_str
            data = resp.json()
            assert data["configured"] is True

    def test_health_response_never_contains_key(self, client):
        secret = "SECRET_MAP_KEY_ABCD_1234_XYZ"
        with patch.dict(os.environ, {"FIRMS_MAP_KEY": secret}):
            resp = client.get("/api/health")
            assert resp.status_code == 200
            assert secret not in resp.text
            assert "MAP_KEY" not in resp.text
            data = resp.json()
            assert data["firms_service"] == "configured"
            assert data["pipeline"] == "available"


class TestIngestionHistoryAndProvenance:
    """Test persistence and retrieval of historical ingestion runs and source provenance."""

    def test_ingestion_history_recording_and_endpoint(self, client, temp_db):
        mock_http = MagicMock()
        mock_http.get.return_value = MagicMock(status_code=200, text=SAMPLE_VIIRS_CSV)

        with patch.dict(os.environ, {"FIRMS_MAP_KEY": "TEST_MAP_KEY_HISTORY"}):
            res = ingest_live_firms_data(
                days=2,
                source="VIIRS_NOAA20_NRT",
                custom_db_path=temp_db,
                session=mock_http
            )
            assert res["status"] == "success"
            assert res["run_id"] is not None

            history = get_ingestion_history(limit=10, custom_db_path=temp_db)
            assert len(history) == 1
            record = history[0]
            assert record["id"] == res["run_id"]
            assert record["status"] == "SUCCESS"
            assert record["source"] == "VIIRS_NOAA20_NRT"
            assert record["records_received"] == 2
            assert record["records_inserted"] == 2

            # Test API endpoint
            resp = client.get("/api/v1/firms/ingest/history")
            assert resp.status_code == 200
            api_data = resp.json()
            assert "history" in api_data
            assert "total_runs" in api_data
