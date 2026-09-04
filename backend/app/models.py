from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    database: Dict[str, Any]


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
