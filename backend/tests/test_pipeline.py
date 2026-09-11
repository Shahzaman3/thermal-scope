"""Test suite for pipeline execution and idempotency.

Validates:
- POST /api/pipeline/run execution.
- Preservation of database integrity across repeated runs.
- Production of exactly 17 clusters, 8 persistent, 9 transient.
- Zero orphan detections or foreign key violations.
"""
import pytest
from fastapi.testclient import TestClient
from app.database import get_db


def test_pipeline_run_endpoint(client: TestClient):
    """Calling POST /api/pipeline/run should execute successfully and return stats."""
    response = client.post("/api/pipeline/run")
    assert response.status_code == 200
    data = response.json()

    assert data.get("status") == "success"
    assert "clusters_processed" in data
    assert "classifications_updated" in data
    assert "classification_summary" in data

    assert data["clusters_processed"] == 17
    assert data["classifications_updated"] == 17
    summary = data["classification_summary"]
    assert summary["persistent_industrial"] == 8
    assert summary["transient_fire"] == 9
    assert summary["ambiguous_review"] == 0


def test_pipeline_idempotency(client: TestClient):
    """Running the pipeline twice in succession must not duplicate or corrupt data."""
    # First execution
    res1 = client.post("/api/pipeline/run")
    assert res1.status_code == 200
    d1 = res1.json()

    # Second execution immediately after
    res2 = client.post("/api/pipeline/run")
    assert res2.status_code == 200
    d2 = res2.json()

    assert d1["clusters_processed"] == d2["clusters_processed"] == 17
    assert d1["classifications_updated"] == d2["classifications_updated"] == 17
    assert d1["classification_summary"]["persistent_industrial"] == 8
    assert d1["classification_summary"]["transient_fire"] == 9

    # Verify via summary endpoint
    summary = client.get("/api/summary").json()
    assert summary["total_clusters"] == 17
    assert summary["total_detections"] == 407
    assert summary["bands"]["persistent"]["count"] == 8
    assert summary["bands"]["transient"]["count"] == 9


def test_pipeline_no_orphan_detections():
    """Verify that after pipeline runs, all FIRMS detections have valid cluster references or NULL if unclustered."""
    with get_db() as conn:
        cursor = conn.cursor()
        # Find any detections with a cluster_id that does not exist in hotspot_clusters
        cursor.execute("""
            SELECT COUNT(*) FROM firms_detections
            WHERE cluster_id IS NOT NULL
              AND cluster_id NOT IN (SELECT cluster_id FROM hotspot_clusters)
        """)
        orphans = cursor.fetchone()[0]
        assert orphans == 0, f"Found {orphans} orphaned detections in database"


def test_pipeline_cluster_feature_ranges():
    """Verify that all generated clusters have feature values within [0.0, 1.0]."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT f.cluster_id, f.recurrence_count_norm, f.regularity_norm, f.dist_to_industrial_norm,
                   f.spatial_stability_norm, f.frp_trend_norm, f.day_night_ratio_norm, c.persistence_score
            FROM cluster_features f
            JOIN cluster_classifications c ON f.cluster_id = c.cluster_id
        """)
        rows = cursor.fetchall()
        assert len(rows) == 17

        for row in rows:
            for val in row[1:]:
                assert 0.0 <= val <= 1.0, f"Cluster {row[0]} has out-of-bounds metric: {val}"
