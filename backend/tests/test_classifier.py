"""
Comprehensive Classifier & Benchmark Regression Test Suite (Phase 2).
Tests:
- 6-feature mathematical extraction
- Matrix min-max normalization & inversion
- Persistence scoring formula & custom weight handling
- Exact threshold boundary classifications
- Known ground-truth facility regression
- Algorithmic benchmark metric locking (Recall=100%, Accuracy=80%, F1=83.3%)
"""

import pytest
import numpy as np
from app.services.classifier_service import (
    haversine_distance_meters,
    min_max_scale,
    compute_day_night_score,
    compute_persistence_score,
    classify_band,
    get_tactical_recommendation,
    extract_cluster_raw_features,
    normalize_cluster_features_matrix,
    DEFAULT_WEIGHTS,
    BAND_PERSISTENT,
    BAND_AMBIGUOUS,
    BAND_TRANSIENT,
    THRESHOLD_PERSISTENT,
    THRESHOLD_AMBIGUOUS
)
from evaluate import run_evaluation


class TestHaversineMath:
    def test_zero_distance(self):
        d = haversine_distance_meters(22.8015, 86.1950, 22.8015, 86.1950)
        assert d == pytest.approx(0.0, abs=1e-3)

    def test_known_distance(self):
        # Tata Steel Jamshedpur to SAIL Rourkela is approximately 150 km
        d = haversine_distance_meters(22.8015, 86.1950, 22.2285, 84.8690)
        assert 140000.0 < d < 160000.0


class TestFeatureCalculations:
    def test_day_night_score_balanced(self):
        # 50% day passes = 1.0 (24/7 continuous operation)
        assert compute_day_night_score(0.50) == pytest.approx(1.0)

    def test_day_night_score_skewed(self):
        # 100% day passes = 0.0 (wildfire/stubble burn signature)
        assert compute_day_night_score(1.0) == pytest.approx(0.0)
        # 100% night passes = 0.0
        assert compute_day_night_score(0.0) == pytest.approx(0.0)
        # 75% day passes = 0.5
        assert compute_day_night_score(0.75) == pytest.approx(0.5)

    def test_extract_raw_features_multi_pass(self, sample_detections, sample_osm_sites):
        rf = extract_cluster_raw_features(
            cluster_id=1,
            centroid_lat=22.8015,
            centroid_lon=86.1950,
            detection_count=3,
            detections=sample_detections,
            osm_sites=sample_osm_sites
        )
        assert rf["cluster_id"] == 1
        assert rf["recurrence_count"] == 3.0
        assert rf["dist_to_nearest_industrial"] < 100.0  # Coincides with Tata Steel
        assert rf["recurrence_regularity"] < 10.0  # Meaningful CV
        assert rf["spatial_stability"] < 100.0     # Tight coordinate footprint
        assert 0.0 <= rf["day_night_ratio"] <= 1.0

    def test_extract_raw_features_single_pass_penalty(self, sample_osm_sites):
        single_det = [{
            "id": 99,
            "latitude": 21.8200,
            "longitude": 86.3500,
            "acq_datetime": "2026-08-01T14:00:00",
            "frp": 65.0,
            "confidence": "80",
            "daynight": "D"
        }]
        rf = extract_cluster_raw_features(
            cluster_id=99,
            centroid_lat=21.8200,
            centroid_lon=86.3500,
            detection_count=1,
            detections=single_det,
            osm_sites=sample_osm_sites
        )
        # Single detection must receive maximum penalties
        assert rf["recurrence_regularity"] == 10.0
        assert rf["spatial_stability"] == 1000.0
        assert rf["frp_trend"] == 5.0


class TestNormalization:
    def test_min_max_scale_range(self):
        arr = [10.0, 20.0, 30.0, 40.0, 50.0]
        scaled = min_max_scale(arr)
        assert scaled[0] == pytest.approx(0.0)
        assert scaled[-1] == pytest.approx(1.0)
        assert np.all(scaled >= 0.0) and np.all(scaled <= 1.0)

    def test_min_max_scale_equal_values(self):
        arr = [25.0, 25.0, 25.0]
        scaled = min_max_scale(arr)
        assert np.all(scaled == 1.0)

    def test_matrix_normalization_bounds(self, sample_detections, sample_osm_sites):
        raw_list = [
            extract_cluster_raw_features(1, 22.8015, 86.1950, 3, sample_detections, sample_osm_sites),
            extract_cluster_raw_features(2, 21.8200, 86.3500, 1, sample_detections[:1], sample_osm_sites)
        ]
        norm_results = normalize_cluster_features_matrix(raw_list)
        assert len(norm_results) == 2
        for item in norm_results:
            for k, val in item["normalized_features"].items():
                assert 0.0 <= val <= 1.0, f"Normalized feature {k} out of bounds: {val}"
            assert 0.0 <= item["persistence_score"] <= 1.0


class TestPersistenceScoringAndWeights:
    def test_all_zeros(self):
        score = compute_persistence_score(0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        assert score == 0.0

    def test_all_ones(self):
        score = compute_persistence_score(1.0, 1.0, 1.0, 1.0, 1.0, 1.0)
        assert score == pytest.approx(1.0, abs=1e-4)

    def test_custom_weights(self):
        custom_weights = {
            "recurrence_count": 0.50,
            "recurrence_regularity": 0.10,
            "dist_to_nearest_industrial": 0.20,
            "spatial_stability": 0.10,
            "frp_trend": 0.05,
            "day_night_ratio": 0.05
        }
        score = compute_persistence_score(1.0, 0.0, 0.0, 0.0, 0.0, 0.0, weights=custom_weights)
        assert score == 0.50


class TestClassificationBands:
    @pytest.mark.parametrize("score,expected_band", [
        (0.0000, BAND_TRANSIENT),
        (0.1500, BAND_TRANSIENT),
        (0.3999, BAND_TRANSIENT),
        (0.4000, BAND_AMBIGUOUS),
        (0.5500, BAND_AMBIGUOUS),
        (0.6999, BAND_AMBIGUOUS),
        (0.7000, BAND_PERSISTENT),
        (0.9500, BAND_PERSISTENT),
        (1.0000, BAND_PERSISTENT),
    ])
    def test_threshold_boundaries(self, score, expected_band):
        assert classify_band(score) == expected_band

    def test_recommendation_strings(self):
        assert "confirm persistent industrial" in get_tactical_recommendation(BAND_PERSISTENT)
        assert "requiring operator review" in get_tactical_recommendation(BAND_AMBIGUOUS)
        assert "wildfire/agricultural stubble burn" in get_tactical_recommendation(BAND_TRANSIENT)


class TestGroundTruthBenchmarkRegression:
    def test_baseline_metrics_regression(self, demo_db_path):
        """
        Verify the algorithmic benchmark evaluation maintains exact known baseline results.
        Expected:
          - Total Clusters: 17
          - Overall Accuracy: 80.0%
          - Industrial Recall: 100.0%
          - Industrial Precision: 71.4%
          - F1-Score: 83.3%
        """
        eval_data = run_evaluation()
        assert eval_data is not None
        assert "error" not in eval_data

        assert eval_data["total_benchmarks"] == 10
        assert eval_data["correct_predictions"] == 8
        assert eval_data["overall_accuracy_pct"] == pytest.approx(80.0, abs=0.1)
        assert eval_data["industrial_recall_pct"] == pytest.approx(100.0, abs=0.1)
        assert eval_data["industrial_precision_pct"] == pytest.approx(71.4, abs=0.1)
        assert eval_data["industrial_f1_score"] == pytest.approx(83.3, abs=0.1)

    def test_known_ground_truth_sites(self, demo_db_path):
        """
        Verify every key ground-truth site receives its exact expected classification band.
        """
        eval_data = run_evaluation()
        site_map = {s["site_name"]: s for s in eval_data["site_evaluations"]}

        # 1. Industrial Benchmark Complexes (Must PASS with high persistence >= 0.90)
        assert site_map["Tata Steel Works, Jamshedpur"]["status"] == "PASS"
        assert site_map["Tata Steel Works, Jamshedpur"]["predicted_band"] == BAND_PERSISTENT
        assert site_map["Tata Steel Works, Jamshedpur"]["persistence_score"] >= 0.90

        assert site_map["Rourkela Steel Plant (SAIL)"]["status"] == "PASS"
        assert site_map["Rourkela Steel Plant (SAIL)"]["predicted_band"] == BAND_PERSISTENT
        assert site_map["Rourkela Steel Plant (SAIL)"]["persistence_score"] >= 0.90

        assert site_map["Tata Steel Kalinganagar"]["status"] == "PASS"
        assert site_map["Tata Steel Kalinganagar"]["predicted_band"] == BAND_PERSISTENT
        assert site_map["Tata Steel Kalinganagar"]["persistence_score"] >= 0.95

        assert site_map["Talcher Super Thermal Power (NTPC)"]["status"] == "PASS"
        assert site_map["Talcher Super Thermal Power (NTPC)"]["predicted_band"] == BAND_PERSISTENT
        assert site_map["Talcher Super Thermal Power (NTPC)"]["persistence_score"] >= 0.90

        assert site_map["Neelachal Ispat Nigam Ltd (NINL)"]["status"] == "PASS"
        assert site_map["Neelachal Ispat Nigam Ltd (NINL)"]["predicted_band"] == BAND_PERSISTENT
        assert site_map["Neelachal Ispat Nigam Ltd (NINL)"]["persistence_score"] >= 0.90

        # 2. Transient Wildfire Outbreaks (Must PASS with low persistence < 0.40)
        assert site_map["Similipal Forest Perimeter Fire"]["status"] == "PASS"
        assert site_map["Similipal Forest Perimeter Fire"]["predicted_band"] == BAND_TRANSIENT
        assert site_map["Similipal Forest Perimeter Fire"]["persistence_score"] < 0.40

        assert site_map["Saranda Forest Seasonal Burn"]["status"] == "PASS"
        assert site_map["Saranda Forest Seasonal Burn"]["predicted_band"] == BAND_TRANSIENT
        assert site_map["Saranda Forest Seasonal Burn"]["persistence_score"] < 0.40

        assert site_map["Mayurbhanj Scrubland Fire"]["status"] == "PASS"
        assert site_map["Mayurbhanj Scrubland Fire"]["predicted_band"] == BAND_TRANSIENT
        assert site_map["Mayurbhanj Scrubland Fire"]["persistence_score"] < 0.40
