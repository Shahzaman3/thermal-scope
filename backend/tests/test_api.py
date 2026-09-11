"""Test suite for FastAPI endpoints in backend/app/api/routes.py and main.py.

Validates:
- All 8 API endpoints (status code, payload shape, data types).
- Error conditions (404 for missing cluster, 422 for invalid payloads).
- Read-only integrity on demo database.
"""
import pytest
from fastapi.testclient import TestClient


def test_health_check(client: TestClient):
    """GET /health should return 200 and healthy status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"
    assert "database" in data
    assert "table_counts" in data["database"]
    assert data["database"]["table_counts"]["firms_detections"] == 407


def test_api_summary(client: TestClient):
    """GET /api/summary should return cluster breakdown and statistics."""
    response = client.get("/api/summary")
    assert response.status_code == 200
    data = response.json()

    assert "total_clusters" in data
    assert "total_detections" in data
    assert "total_osm_sites" in data
    assert "bands" in data

    assert data["total_clusters"] == 17
    assert data["total_detections"] == 407
    assert data["total_osm_sites"] == 162
    assert data["bands"]["persistent"]["count"] == 8
    assert data["bands"]["transient"]["count"] == 9
    assert data["bands"]["ambiguous"]["count"] == 0


def test_api_clusters_list(client: TestClient):
    """GET /api/clusters should return all clusters with optional filtering."""
    response = client.get("/api/clusters")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 17

    first = data[0]
    expected_fields = [
        "cluster_id", "centroid_lat", "centroid_lon", "detection_count",
        "persistence_score", "band_label"
    ]
    for field in expected_fields:
        assert field in first, f"Missing field {field} in cluster item"

    # Test band query filter
    res_persistent = client.get("/api/clusters?band=Persistent+industrial+source")
    assert res_persistent.status_code == 200
    assert len(res_persistent.json()) == 8

    res_transient = client.get("/api/clusters?band=Transient+fire+event")
    assert res_transient.status_code == 200
    assert len(res_transient.json()) == 9


def test_api_cluster_detail_valid(client: TestClient):
    """GET /api/clusters/{id} should return detail for an existing cluster."""
    response = client.get("/api/clusters/1")
    assert response.status_code == 200
    data = response.json()

    assert "cluster" in data
    assert "classification" in data
    assert "features" in data
    assert "detections" in data
    assert "closest_industrial_sites" in data
    assert data["cluster"]["cluster_id"] == 1
    assert isinstance(data["detections"], list)
    assert len(data["detections"]) > 0


def test_api_cluster_detail_not_found(client: TestClient):
    """GET /api/clusters/{id} with nonexistent ID should return 404."""
    response = client.get("/api/clusters/999999")
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data


def test_api_osm_sites(client: TestClient):
    """GET /api/osm-sites should return industrial sites."""
    response = client.get("/api/osm-sites")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 162

    first = data[0]
    assert "name" in first
    assert "site_type" in first
    assert "latitude" in first
    assert "longitude" in first


def test_api_evaluation(client: TestClient):
    """GET /api/evaluation should return ground truth benchmark metrics matching baseline."""
    response = client.get("/api/evaluation")
    assert response.status_code == 200
    data = response.json()

    assert "overall_accuracy_pct" in data
    assert "industrial_precision_pct" in data
    assert "industrial_recall_pct" in data
    assert "industrial_f1_score" in data
    assert "site_evaluations" in data

    assert data["overall_accuracy_pct"] == 80.0
    assert data["industrial_recall_pct"] == 100.0
    assert data["industrial_precision_pct"] == 71.4
    assert data["industrial_f1_score"] == 83.3


def test_api_simulate_hotspot_valid(client: TestClient):
    """POST /api/simulate-hotspot should compute prediction using classifier service."""
    payload = {
        "scenario_name": "Test Blast Furnace",
        "latitude": 22.8020,
        "longitude": 86.1960,
        "frp": 120.0,
        "passes_count": 60,
        "timespan_days": 40,
        "day_ratio": 0.52,
        "spread_m": 180.0,
        "frp_stability": "flat"
    }
    response = client.post("/api/simulate-hotspot", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "persistence_score" in data
    assert "band_label" in data
    assert "feature_vector_evaluation" in data
    assert "closest_industrial_site" in data
    assert "tactical_recommendation" in data
    assert data["band_label"] == "Persistent industrial source"
    assert data["persistence_score"] >= 0.70


def test_api_simulate_hotspot_invalid(client: TestClient):
    """POST /api/simulate-hotspot with missing required fields should return 422."""
    response = client.post("/api/simulate-hotspot", json={"latitude": 22.0})
    assert response.status_code == 422


def test_api_change_detection(client: TestClient):
    """GET /api/v1/analytics/changes should return emerging sources and score transitions."""
    response = client.get("/api/v1/analytics/changes")
    assert response.status_code == 200
    data = response.json()
    assert "emerging_sources_count" in data
    assert "flagged_transitions_count" in data
    assert "emerging_sources" in data
    assert "flagged_transitions" in data


def test_api_analyst_review_workflow(client: TestClient):
    """POST /api/v1/clusters/review and GET /api/v1/clusters/priority-queue should manage review state."""
    # Test Priority Queue
    res_q = client.get("/api/v1/clusters/priority-queue")
    assert res_q.status_code == 200
    queue = res_q.json()
    assert isinstance(queue, list)
    assert len(queue) > 0

    # Submit Review for cluster 1
    review_payload = {
        "cluster_id": 1,
        "review_status": "VERIFIED_INDUSTRIAL",
        "notes": "Tata Steel blast furnace confirmed by analyst.",
        "analyst_name": "Lead Analyst"
    }
    res_post = client.post("/api/v1/clusters/review", json=review_payload)
    assert res_post.status_code == 200
    post_data = res_post.json()
    assert post_data["status"] == "success"
    assert post_data["cluster_id"] == 1
    assert post_data["review_status"] == "VERIFIED_INDUSTRIAL"

    # Get single cluster review
    res_get = client.get("/api/v1/clusters/1/review")
    assert res_get.status_code == 200
    get_data = res_get.json()
    assert get_data["review_status"] == "VERIFIED_INDUSTRIAL"
    assert get_data["notes"] == "Tata Steel blast furnace confirmed by analyst."
