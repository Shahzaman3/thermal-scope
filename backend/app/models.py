from typing import Optional, Dict, Any
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    database: Dict[str, Any]
    firms_service: Optional[str] = "unconfigured"
    pipeline: Optional[str] = "available"
    operational_status: Optional[str] = "OFFLINE"


class FirmsDetectionItem(BaseModel):
    id: Optional[int] = None
    latitude: float
    longitude: float
    brightness: Optional[float] = None
    scan: Optional[float] = None
    track: Optional[float] = None
    acq_date: str
    acq_time: str
    acq_datetime: str
    satellite: Optional[str] = None
    instrument: Optional[str] = None
    confidence: Optional[str] = None
    version: Optional[str] = None
    bright_t31: Optional[float] = None
    frp: Optional[float] = None
    daynight: Optional[str] = None
    cluster_id: Optional[int] = None


class OsmIndustrialSiteItem(BaseModel):
    id: Optional[int] = None
    osm_id: Optional[str] = None
    name: Optional[str] = None
    site_type: Optional[str] = None
    latitude: float
    longitude: float
    tags_json: Optional[str] = None


class ClusterFeatureVector(BaseModel):
    cluster_id: int
    recurrence_count: float
    recurrence_regularity: float
    dist_to_nearest_industrial: float
    spatial_stability: float
    frp_trend: float
    day_night_ratio: float
    recurrence_count_norm: float
    regularity_norm: float
    dist_to_industrial_norm: float
    spatial_stability_norm: float
    frp_trend_norm: float
    day_night_ratio_norm: float


class ClusterClassificationItem(BaseModel):
    cluster_id: int
    persistence_score: float
    band_label: str
    confidence_prefilter_passed: int = 1
    classified_at: str


class ClusterDetail(BaseModel):
    cluster_id: int
    centroid_lat: float
    centroid_lon: float
    detection_count: int
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None
    radius_meters: Optional[float] = None
    features: Optional[ClusterFeatureVector] = None
    classification: Optional[ClusterClassificationItem] = None


class ClusterItem(BaseModel):
    cluster_id: int
    centroid_lat: float
    centroid_lon: float
    detection_count: int
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None
    radius_meters: Optional[float] = None
    features: Optional[ClusterFeatureVector] = None
    classification: Optional[ClusterClassificationItem] = None


class FirmsIngestRequest(BaseModel):
    days: int = Field(default=2, ge=1, le=5, description="Days of satellite observations to request (1-5)")
    source: Optional[str] = Field(default=None, description="Specific sensor (e.g., VIIRS_SNPP_NRT) or None for all primary sensors")
    bbox: Optional[str] = Field(default=None, description="Geographic extent: min_lon,min_lat,max_lon,max_lat")
    run_pipeline: bool = Field(default=True, description="Automatically trigger DBSCAN clustering and 6-feature classification")


class FirmsIngestResponse(BaseModel):
    status: str
    run_id: Optional[int] = None
    source: str
    operational_status: str = "LIVE"
    requested_window_days: Optional[int] = None
    product_queried: Optional[str] = None
    records_received: int
    records_valid: int
    records_inserted: int
    records_skipped_duplicate: int
    records_rejected: int
    message: str
    latest_observation_datetime: Optional[str] = None
    latest_observation_utc: Optional[str] = None
    latest_observation_ist: Optional[str] = None
    last_successful_ingestion_utc: Optional[str] = None
    last_successful_ingestion_ist: Optional[str] = None
    pipeline_executed: bool = False
    pipeline_status: Optional[str] = None
    pipeline: Optional[Dict[str, Any]] = None



class FirmsStatusResponse(BaseModel):
    source: str
    provenance: str = "OFFLINE_DEMO"
    operational_status: str = "OFFLINE"  # LIVE | STALE | OFFLINE | ERROR
    is_live: bool = False
    configured: bool = False
    last_attempt: Optional[str] = None
    last_attempt_utc: Optional[str] = None
    last_attempt_ist: Optional[str] = None
    last_success: Optional[str] = None
    last_successful_ingestion: Optional[str] = None
    last_successful_ingestion_utc: Optional[str] = None
    last_successful_ingestion_ist: Optional[str] = None
    latest_observation_datetime: Optional[str] = None
    latest_observation_utc: Optional[str] = None
    latest_observation_ist: Optional[str] = None
    observation_age_minutes: Optional[float] = None
    observation_age_hours: Optional[float] = None
    observation_freshness_label: Optional[str] = None
    requested_window_days: Optional[int] = None
    product_queried: Optional[str] = None
    records_received: int = 0
    records_valid: int = 0
    records_inserted: int = 0
    records_skipped: int = 0
    records_rejected: int = 0
    pipeline_executed: bool = False
    pipeline_status: Optional[str] = None  # COMPLETED | NOT_RUN | FAILED | None
    error_category: Optional[str] = None
    last_error: Optional[str] = None
    message: str

class FirmsIngestionRun(BaseModel):
    id: int
    started_at: str
    completed_at: Optional[str] = None
    source: Optional[str] = None
    bbox: Optional[str] = None
    days_requested: Optional[int] = None
    records_received: int = 0
    records_validated: int = 0
    records_inserted: int = 0
    records_duplicate: int = 0
    records_rejected: int = 0
    status: str
    error_message: Optional[str] = None
    pipeline_status: Optional[str] = None
    pipeline_started_at: Optional[str] = None
    pipeline_completed_at: Optional[str] = None

class IngestionHistoryResponse(BaseModel):
    history: list[FirmsIngestionRun]
    total_runs: int
