"""Test suite for What-If hotspot simulation.

Validates:
- Industrial scenario classification (expected Persistent, score >= 0.70).
- Forest / agricultural scenario classification (expected Transient, score < 0.40).
- Ambiguous scenarios (0.40 <= score < 0.70).
- Boundary coordinates and edge values.
- Shared classifier service mathematical consistency.
"""
import pytest
from app.services.classifier_service import (
    evaluate_simulation_anomaly,
    compute_persistence_score,
    classify_band,
    BAND_PERSISTENT,
    BAND_AMBIGUOUS,
    BAND_TRANSIENT
)


# Sample reference OSM sites for simulation
MOCK_OSM_SITES = [
    {
        "name": "Tata Steel Jamshedpur",
        "site_type": "steel_plant",
        "latitude": 22.8015,
        "longitude": 86.1950
    },
    {
        "name": "Rourkela Steel Plant",
        "site_type": "steel_plant",
        "latitude": 22.2285,
        "longitude": 84.8690
    },
    {
        "name": "Barbil Mining & Sponge Iron Cluster",
        "site_type": "sponge_iron",
        "latitude": 22.1150,
        "longitude": 85.3950
    }
]


def test_simulate_industrial_scenario():
    """Known industrial scenario: high pass count, near steel plant, flat FRP trend."""
    result = evaluate_simulation_anomaly(
        latitude=22.8020,
        longitude=86.1960,
        passes_count=60,
        timespan_days=40,
        day_ratio=0.52,
        spread_m=180.0,
        frp_stability="flat",
        osm_sites=MOCK_OSM_SITES
    )
    assert result["persistence_score"] >= 0.70
    assert result["band_label"] == BAND_PERSISTENT
    assert "closest_site" in result
    assert result["closest_site"]["name"] == "Tata Steel Jamshedpur"
    assert result["closest_site"]["distance_meters"] < 500
    assert "feature_vector_evaluation" in result
    for key, val in result["feature_vector_evaluation"].items():
        assert 0.0 <= val <= 1.0


def test_simulate_forest_fire_scenario():
    """Known transient forest fire scenario: 1 pass, wide from industry, decaying."""
    result = evaluate_simulation_anomaly(
        latitude=21.6500,
        longitude=86.3500,
        passes_count=1,
        timespan_days=1,
        day_ratio=1.0,
        spread_m=600.0,
        frp_stability="decaying",
        osm_sites=MOCK_OSM_SITES
    )
    assert result["persistence_score"] < 0.40
    assert result["band_label"] == BAND_TRANSIENT


def test_simulate_ambiguous_scenario():
    """Scenario in ambiguous zone (Barbil Intermittent Sponge Iron Kiln from UI presets)."""
    result = evaluate_simulation_anomaly(
        latitude=22.1160,
        longitude=85.3960,
        passes_count=20,
        timespan_days=28,
        day_ratio=0.65,
        spread_m=450.0,
        frp_stability="spiking",
        osm_sites=MOCK_OSM_SITES
    )
    assert 0.40 <= result["persistence_score"] < 0.70
    assert result["band_label"] == BAND_AMBIGUOUS


def test_simulate_custom_weights():
    """Verify compute_persistence_score works with custom normalized weights."""
    custom_weights = {
        "recurrence_count": 0.05,
        "recurrence_regularity": 0.05,
        "dist_to_nearest_industrial": 0.70,
        "spatial_stability": 0.10,
        "frp_trend": 0.05,
        "day_night_ratio": 0.05
    }
    score = compute_persistence_score(
        rc_norm=0.5,
        reg_norm=0.5,
        dist_norm=0.9,
        stab_norm=0.5,
        frp_norm=0.5,
        dn_norm=0.5,
        weights=custom_weights
    )
    assert 0.0 <= score <= 1.0
    # Proximity is 0.70 * 0.9 = 0.63, plus others (~0.15) -> > 0.75
    assert score > 0.75


def test_simulate_boundary_conditions():
    """Test boundary inputs (minimum passes, zero timespan, large spread)."""
    res_min = evaluate_simulation_anomaly(
        latitude=20.0,
        longitude=84.0,
        passes_count=1,
        timespan_days=1,
        day_ratio=0.0,
        spread_m=5000.0,
        frp_stability="decaying",
        osm_sites=MOCK_OSM_SITES
    )
    assert res_min["persistence_score"] < 0.40
    assert res_min["band_label"] == BAND_TRANSIENT

    res_max = evaluate_simulation_anomaly(
        latitude=22.8015,
        longitude=86.1950,
        passes_count=100,
        timespan_days=60,
        day_ratio=0.5,
        spread_m=50.0,
        frp_stability="flat",
        osm_sites=MOCK_OSM_SITES
    )
    assert res_max["persistence_score"] >= 0.70
    assert res_max["band_label"] == BAND_PERSISTENT
