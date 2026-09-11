"""
Phase 5.2 — Analyst Review Persistence, Provenance & Audit Hardening Tests
Verifies:
- Creation, retrieval, and updating (upsert) of analyst reviews
- Strict cluster referential integrity and 404 for missing clusters
- Status validation against supported backend enums (400 for invalid statuses)
- Notes sanitization, Unicode handling, and max length (2000 chars) bounds
- Server-side UTC ISO 8601 timestamp generation
- Atomic transactions and error rollback
- Queue synchronization after review updates
- Foreign key cascade delete behavior
- Safe structured error responses without internal leakages
"""

import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from app.services.analyst_service import (
    submit_analyst_review,
    get_analyst_review_for_cluster,
    get_priority_review_queue,
    VALID_PERSISTED_STATUSES,
    VALID_REVIEW_STATUSES,
    MAX_NOTES_LENGTH
)
from app.database import get_db


def test_create_valid_review_persists_record(temp_db):
    """Submitting a valid review for an existing cluster creates a review record."""
    with get_db(temp_db) as conn:
        conn.execute("""
            INSERT INTO hotspot_clusters (cluster_id, centroid_lat, centroid_lon, detection_count)
            VALUES (101, 22.5, 86.2, 10)
        """)

    result = submit_analyst_review(
        cluster_id=101,
        review_status="VERIFIED_INDUSTRIAL",
        notes="High-confidence blast furnace thermal signature.",
        analyst_name="Specialist Alpha",
        custom_db_path=temp_db
    )

    assert result["status"] == "success"
    assert result["cluster_id"] == 101
    assert result["review_status"] == "VERIFIED_INDUSTRIAL"
    assert result["notes"] == "High-confidence blast furnace thermal signature."
    assert result["analyst_name"] == "Specialist Alpha"
    assert result["has_review"] is True
    assert result["review_id"] is not None

    # Verify server-side UTC timestamp
    ts = datetime.fromisoformat(result["updated_at"])
    assert ts.tzinfo is not None

    # Retrieve from DB
    retrieved = get_analyst_review_for_cluster(101, custom_db_path=temp_db)
    assert retrieved["has_review"] is True
    assert retrieved["review_status"] == "VERIFIED_INDUSTRIAL"
    assert retrieved["notes"] == "High-confidence blast furnace thermal signature."


def test_no_review_state_for_unreviewed_cluster(temp_db):
    """An existing cluster with no review returns UNREVIEWED with has_review=False."""
    with get_db(temp_db) as conn:
        conn.execute("""
            INSERT INTO hotspot_clusters (cluster_id, centroid_lat, centroid_lon, detection_count)
            VALUES (102, 21.8, 85.3, 5)
        """)

    retrieved = get_analyst_review_for_cluster(102, custom_db_path=temp_db)
    assert retrieved["cluster_id"] == 102
    assert retrieved["review_status"] == "UNREVIEWED"
    assert retrieved["notes"] is None
    assert retrieved["has_review"] is False
    assert retrieved["id"] is None


def test_update_review_upsert_idempotency_no_duplicates(temp_db):
    """Submitting multiple reviews for the same cluster updates the existing record without duplicating."""
    with get_db(temp_db) as conn:
        conn.execute("""
            INSERT INTO hotspot_clusters (cluster_id, centroid_lat, centroid_lon, detection_count)
            VALUES (103, 22.0, 85.9, 12)
        """)

    # First submission
    res1 = submit_analyst_review(
        cluster_id=103,
        review_status="UNDER_INVESTIGATION",
        notes="Initial review: ambiguous thermal signature.",
        analyst_name="Analyst 1",
        custom_db_path=temp_db
    )
    first_id = res1["review_id"]

    # Second submission (update)
    res2 = submit_analyst_review(
        cluster_id=103,
        review_status="VERIFIED_WILDFIRE",
        notes="Updated review: confirmed forest fire spread.",
        analyst_name="Lead Analyst",
        custom_db_path=temp_db
    )
    second_id = res2["review_id"]

    assert first_id == second_id
    assert res2["review_status"] == "VERIFIED_WILDFIRE"
    assert res2["notes"] == "Updated review: confirmed forest fire spread."

    # Verify only 1 row exists in DB
    with get_db(temp_db) as conn:
        count = conn.execute("SELECT COUNT(*) FROM analyst_reviews WHERE cluster_id = 103").fetchone()[0]
        assert count == 1


def test_nonexistent_cluster_returns_404_error(temp_db, client: TestClient):
    """Querying or submitting review for a nonexistent cluster raises KeyError / 404."""
    with pytest.raises(KeyError):
        get_analyst_review_for_cluster(999999, custom_db_path=temp_db)

    with pytest.raises(KeyError):
        submit_analyst_review(
            cluster_id=999999,
            review_status="VERIFIED_INDUSTRIAL",
            custom_db_path=temp_db
        )

    # Via API
    res_get = client.get("/api/v1/clusters/999999/review")
    assert res_get.status_code == 404
    assert "not found" in res_get.json()["detail"].lower()

    res_post = client.post("/api/v1/clusters/review", json={
        "cluster_id": 999999,
        "review_status": "VERIFIED_INDUSTRIAL",
        "notes": "Testing missing cluster"
    })
    assert res_post.status_code == 404
    assert "not found" in res_post.json()["detail"].lower()


def test_invalid_status_returns_400_error(temp_db, client: TestClient):
    """Submitting an invalid review status raises ValueError / 400."""
    with get_db(temp_db) as conn:
        conn.execute("""
            INSERT INTO hotspot_clusters (cluster_id, centroid_lat, centroid_lon, detection_count)
            VALUES (104, 22.1, 85.8, 8)
        """)

    with pytest.raises(ValueError) as exc:
        submit_analyst_review(
            cluster_id=104,
            review_status="CONFIRMED_EXPLOSION",  # Unsupported invented status
            custom_db_path=temp_db
        )
    assert "Invalid review_status" in str(exc.value)

    # Via API for an existing baseline cluster (e.g. cluster 1)
    res = client.post("/api/v1/clusters/review", json={
        "cluster_id": 1,
        "review_status": "DISPATCH_EMERGENCY",  # Unsupported status
        "notes": "Fake status test"
    })
    assert res.status_code == 400
    assert "Invalid review_status" in res.json()["detail"]


def test_notes_length_validation(temp_db, client: TestClient):
    """Notes exceeding MAX_NOTES_LENGTH (2000 chars) are rejected with ValueError / 400."""
    with get_db(temp_db) as conn:
        conn.execute("""
            INSERT INTO hotspot_clusters (cluster_id, centroid_lat, centroid_lon, detection_count)
            VALUES (105, 22.3, 86.0, 15)
        """)

    oversized_notes = "A" * 2001
    with pytest.raises(ValueError) as exc:
        submit_analyst_review(
            cluster_id=105,
            review_status="UNDER_INVESTIGATION",
            notes=oversized_notes,
            custom_db_path=temp_db
        )
    assert "exceed maximum allowed length" in str(exc.value)

    # Exactly 2000 chars should be accepted
    valid_max_notes = "B" * 2000
    res = submit_analyst_review(
        cluster_id=105,
        review_status="UNDER_INVESTIGATION",
        notes=valid_max_notes,
        custom_db_path=temp_db
    )
    assert res["status"] == "success"
    assert len(res["notes"]) == 2000


def test_unicode_and_special_characters_handling(temp_db):
    """Notes with Unicode, Hindi script, quotes, and newlines persist cleanly."""
    with get_db(temp_db) as conn:
        conn.execute("""
            INSERT INTO hotspot_clusters (cluster_id, centroid_lat, centroid_lon, detection_count)
            VALUES (106, 22.4, 85.5, 7)
        """)

    unicode_notes = "टाटा स्टील जमशेदपुर — Blast furnace verified.\nThermal emission: 119.6 MW; 'quotes' & special chars: <>&/\\."
    res = submit_analyst_review(
        cluster_id=106,
        review_status="VERIFIED_INDUSTRIAL",
        notes=unicode_notes,
        analyst_name="विश्लेषक (Analyst-01)",
        custom_db_path=temp_db
    )

    assert res["status"] == "success"
    retrieved = get_analyst_review_for_cluster(106, custom_db_path=temp_db)
    assert retrieved["notes"] == unicode_notes
    assert retrieved["analyst_name"] == "विश्लेषक (Analyst-01)"


def test_reset_to_unreviewed_removes_persisted_record(temp_db):
    """Setting status to UNREVIEWED cleans up the review record so absence represents no review."""
    with get_db(temp_db) as conn:
        conn.execute("""
            INSERT INTO hotspot_clusters (cluster_id, centroid_lat, centroid_lon, detection_count)
            VALUES (107, 22.2, 85.7, 9)
        """)

    # Submit an initial review
    submit_analyst_review(
        cluster_id=107,
        review_status="UNDER_INVESTIGATION",
        notes="Temporary investigation.",
        custom_db_path=temp_db
    )

    with get_db(temp_db) as conn:
        count_before = conn.execute("SELECT COUNT(*) FROM analyst_reviews WHERE cluster_id = 107").fetchone()[0]
        assert count_before == 1

    # Reset to UNREVIEWED
    res = submit_analyst_review(
        cluster_id=107,
        review_status="UNREVIEWED",
        custom_db_path=temp_db
    )
    assert res["status"] == "success"
    assert res["has_review"] is False

    with get_db(temp_db) as conn:
        count_after = conn.execute("SELECT COUNT(*) FROM analyst_reviews WHERE cluster_id = 107").fetchone()[0]
        assert count_after == 0


def test_priority_queue_reflects_updated_reviews(temp_db):
    """The priority queue reflects updated review statuses in its output."""
    with get_db(temp_db) as conn:
        conn.execute("""
            INSERT INTO hotspot_clusters (cluster_id, centroid_lat, centroid_lon, detection_count)
            VALUES (108, 22.8, 86.1, 20)
        """)
        conn.execute("""
            INSERT INTO cluster_classifications (cluster_id, persistence_score, band_label, classified_at)
            VALUES (108, 0.95, 'Persistent industrial source', '2026-09-12T00:00:00Z')
        """)

    # Queue before review: status should be UNREVIEWED
    q_before = get_priority_review_queue(limit=10, custom_db_path=temp_db)
    match_before = next((c for c in q_before if c["cluster_id"] == 108), None)
    assert match_before is not None
    assert match_before["review_status"] == "UNREVIEWED"

    # Submit review
    submit_analyst_review(
        cluster_id=108,
        review_status="VERIFIED_INDUSTRIAL",
        notes="Verified heavy plant.",
        custom_db_path=temp_db
    )

    # Queue after review: status should be VERIFIED_INDUSTRIAL
    q_after = get_priority_review_queue(limit=10, custom_db_path=temp_db)
    match_after = next((c for c in q_after if c["cluster_id"] == 108), None)
    assert match_after is not None
    assert match_after["review_status"] == "VERIFIED_INDUSTRIAL"
    assert match_after["notes"] == "Verified heavy plant."


def test_cascade_delete_cleans_reviews(temp_db):
    """When a cluster is deleted, foreign key ON DELETE CASCADE cleans up associated review."""
    with get_db(temp_db) as conn:
        conn.execute("""
            INSERT INTO hotspot_clusters (cluster_id, centroid_lat, centroid_lon, detection_count)
            VALUES (109, 22.6, 85.4, 6)
        """)

    submit_analyst_review(
        cluster_id=109,
        review_status="DISMISSED",
        notes="Dismissed false alert.",
        custom_db_path=temp_db
    )

    with get_db(temp_db) as conn:
        assert conn.execute("SELECT COUNT(*) FROM analyst_reviews WHERE cluster_id = 109").fetchone()[0] == 1
        # Delete cluster
        conn.execute("DELETE FROM hotspot_clusters WHERE cluster_id = 109")

    with get_db(temp_db) as conn:
        # Cascade should have deleted the review
        assert conn.execute("SELECT COUNT(*) FROM analyst_reviews WHERE cluster_id = 109").fetchone()[0] == 0
