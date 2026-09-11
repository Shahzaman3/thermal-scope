"""
NASA FIRMS Live Ingestion Service — Phase 4A / Phase 4B.1
Provides secure, validated, and deduplicated satellite thermal anomaly ingestion
and comprehensive operational status tracking for the Jamshedpur-Odisha Industrial Corridor.

Crucial Constraints:
1. Live ingestion is an additive layer. It NEVER replaces or deletes the existing offline demonstration dataset.
2. Credentials (MAP_KEY) exist strictly on the backend and are NEVER logged, returned in APIs, or exposed to the client.
3. Offline fallback is 100% resilient; errors gracefully preserve database state and notify the caller.
4. Distinguishes 0-new-records (all duplicates) as a SUCCESSFUL live query, not an error or "no data".
"""

import os
import io
import csv
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import requests

from dotenv import load_dotenv

from ..database import get_db, DB_PATH

# Load local environment variables from backend/.env or root .env
for env_candidate in [Path(__file__).resolve().parent.parent.parent / ".env", Path.cwd() / ".env", Path.cwd() / "backend" / ".env"]:
    if env_candidate.is_file():
        load_dotenv(dotenv_path=env_candidate, override=True)
        break

# Default Bounding Box for Jamshedpur–Odisha industrial belt (min_lon, min_lat, max_lon, max_lat)
DEFAULT_BBOX = os.getenv("FIRMS_BBOX", "84.5,20.5,86.8,23.2")
DEFAULT_BASE_URL = os.getenv("FIRMS_BASE_URL", "https://firms.modaps.eosdis.nasa.gov/api/area/csv")
PRIMARY_SOURCES = ["VIIRS_NOAA21_NRT", "VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT", "MODIS_NRT"]

# Indian Standard Time (IST) offset = UTC + 5:30
IST_TZ = timezone(timedelta(hours=5, minutes=30))


def get_configured_map_key(explicit_key: Optional[str] = None) -> str:
    """Retrieve FIRMS_MAP_KEY safely from parameter, environment, or .env file."""
    if explicit_key is not None:
        return explicit_key.strip()
    if "FIRMS_MAP_KEY" in os.environ:
        return os.environ["FIRMS_MAP_KEY"].strip()
    for env_candidate in [Path(__file__).resolve().parent.parent.parent / ".env", Path.cwd() / ".env", Path.cwd() / "backend" / ".env"]:
        if env_candidate.is_file():
            try:
                with open(env_candidate, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("FIRMS_MAP_KEY=") and not line.startswith("#"):
                            return line.split("=", 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass
    return ""


class IngestionState:
    """Singleton tracking current ingestion provenance and operational status."""
    source: str = "OFFLINE_DEMO"
    provenance: str = "OFFLINE_DEMO"
    operational_status: str = "OFFLINE"  # LIVE | STALE | OFFLINE | ERROR
    is_live: bool = False
    last_attempt: Optional[str] = None
    last_success: Optional[str] = None
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
    message: str = "System operating on validated offline demonstration dataset (407 detections, 17 clusters)."


_state = IngestionState()


def parse_iso_or_utc(ts_str: Optional[str]) -> Optional[datetime]:
    """Parse an ISO format or UTC timestamp string into timezone-aware datetime."""
    if not ts_str:
        return None
    try:
        clean_str = ts_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        try:
            # Fallback for "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS"
            clean_str = ts_str.replace("T", " ")
            dt = datetime.strptime(clean_str[:19], "%Y-%m-%d %H:%M:%S")
            return dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None


def format_utc(dt: Optional[datetime]) -> Optional[str]:
    """Format datetime as UTC string."""
    if not dt:
        return None
    utc_dt = dt.astimezone(timezone.utc)
    return utc_dt.strftime("%d %b %Y · %H:%M UTC")


def format_ist(dt: Optional[datetime]) -> Optional[str]:
    """Format datetime as Indian Standard Time (IST) string."""
    if not dt:
        return None
    ist_dt = dt.astimezone(IST_TZ)
    return ist_dt.strftime("%d %b %Y · %H:%M IST")


def get_latest_observation_info(custom_db_path: Optional[Path] = None) -> Tuple[Optional[str], Optional[float], Optional[float], Optional[str]]:
    """
    Retrieve latest satellite observation timestamp from SQLite database and compute age metrics.
    Returns: (latest_iso, age_minutes, age_hours, freshness_label)
    """
    try:
        with get_db(custom_db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT MAX(acq_datetime) FROM firms_detections")
            row = cursor.fetchone()
            max_dt_str = row[0] if row and row[0] else None

        if not max_dt_str:
            return None, None, None, None

        obs_dt = parse_iso_or_utc(max_dt_str)
        if not obs_dt:
            return max_dt_str, None, None, None

        now_utc = datetime.now(timezone.utc)
        diff_seconds = max(0.0, (now_utc - obs_dt).total_seconds())
        age_minutes = round(diff_seconds / 60.0, 1)
        age_hours = round(diff_seconds / 3600.0, 2)

        if age_minutes < 60:
            freshness_label = f"{int(age_minutes)} min ago" if age_minutes >= 1 else "just now"
        elif age_hours < 24:
            h = int(age_hours)
            m = int(age_minutes % 60)
            freshness_label = f"{h}h {m}m ago" if m > 0 else f"{h}h ago"
        else:
            days = int(age_hours // 24)
            rem_h = int(age_hours % 24)
            freshness_label = f"{days}d {rem_h}h ago" if rem_h > 0 else f"{days}d ago"

        return obs_dt.isoformat(), age_minutes, age_hours, freshness_label
    except Exception:
        return None, None, None, None


def determine_operational_status(state: IngestionState, custom_db_path: Optional[Path] = None) -> str:
    """
    Determine current operational state:
    - LIVE: Recent successful NASA FIRMS ingestion (within freshness threshold) and operational backend
    - STALE: Previous successful NASA FIRMS ingestion, but older than threshold (default 24h)
    - OFFLINE: Operating on verified baseline demonstration dataset (no live ingestion attempted/succeeded)
    - ERROR: Live ingestion was attempted and failed (offline dataset remains available)
    """
    if state.error_category is not None or state.last_error is not None:
        return "ERROR"

    if state.last_success is not None and state.source == "LIVE_FIRMS":
        success_dt = parse_iso_or_utc(state.last_success)
        if success_dt:
            now_utc = datetime.now(timezone.utc)
            hours_since_success = (now_utc - success_dt).total_seconds() / 3600.0
            stale_threshold = float(os.getenv("FIRMS_STALE_THRESHOLD_HOURS", "24.0"))
            if hours_since_success > stale_threshold:
                return "STALE"
        return "LIVE"

    return "OFFLINE"


def get_ingestion_status(custom_db_path: Optional[Path] = None) -> Dict[str, Any]:
    """Return comprehensive safe operational metadata regarding data provenance and ingestion status."""
    map_key = get_configured_map_key()
    latest_obs_iso, age_min, age_hr, freshness_label = get_latest_observation_info(custom_db_path)
    latest_obs_dt = parse_iso_or_utc(latest_obs_iso)
    last_success_dt = parse_iso_or_utc(_state.last_success)
    last_attempt_dt = parse_iso_or_utc(_state.last_attempt)

    op_status = determine_operational_status(_state, custom_db_path)
    _state.operational_status = op_status

    return {
        "source": _state.source,
        "provenance": _state.provenance,
        "operational_status": op_status,
        "is_live": _state.is_live,
        "configured": bool(map_key),
        "last_attempt": _state.last_attempt,
        "last_attempt_utc": format_utc(last_attempt_dt),
        "last_attempt_ist": format_ist(last_attempt_dt),
        "last_success": _state.last_success,
        "last_successful_ingestion": _state.last_success,
        "last_successful_ingestion_utc": format_utc(last_success_dt),
        "last_successful_ingestion_ist": format_ist(last_success_dt),
        "latest_observation_datetime": latest_obs_iso,
        "latest_observation_utc": format_utc(latest_obs_dt),
        "latest_observation_ist": format_ist(latest_obs_dt),
        "observation_age_minutes": age_min,
        "observation_age_hours": age_hr,
        "observation_freshness_label": freshness_label,
        "requested_window_days": _state.requested_window_days,
        "product_queried": _state.product_queried,
        "records_received": _state.records_received,
        "records_valid": _state.records_valid,
        "records_inserted": _state.records_inserted,
        "records_skipped": _state.records_skipped,
        "records_rejected": _state.records_rejected,
        "pipeline_executed": _state.pipeline_executed,
        "pipeline_status": _state.pipeline_status,
        "error_category": _state.error_category,
        "last_error": _state.last_error,
        "message": _state.message
    }


def reset_ingestion_state() -> None:
    """Reset status tracking to default offline baseline (useful for testing)."""
    _state.source = "OFFLINE_DEMO"
    _state.provenance = "OFFLINE_DEMO"
    _state.operational_status = "OFFLINE"
    _state.is_live = False
    _state.last_attempt = None
    _state.last_success = None
    _state.requested_window_days = None
    _state.product_queried = None
    _state.records_received = 0
    _state.records_valid = 0
    _state.records_inserted = 0
    _state.records_skipped = 0
    _state.records_rejected = 0
    _state.pipeline_executed = False
    _state.pipeline_status = None
    _state.error_category = None
    _state.last_error = None
    _state.message = "System operating on validated offline demonstration dataset (407 detections, 17 clusters)."


def validate_raw_record(row: Dict[str, Any], bbox: str = DEFAULT_BBOX) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
    """
    Validate a single parsed FIRMS CSV record.
    Returns: (is_valid, normalized_dict_or_none, rejection_reason_or_none)
    """
    try:
        lat_raw = row.get("latitude")
        lon_raw = row.get("longitude")
        if lat_raw is None or lon_raw is None:
            return False, None, "Missing coordinates"

        lat = float(lat_raw)
        lon = float(lon_raw)

        if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
            return False, None, f"Coordinates out of physical bounds: [{lat}, {lon}]"

        try:
            min_lon, min_lat, max_lon, max_lat = map(float, bbox.split(","))
            if not ((min_lat - 0.5) <= lat <= (max_lat + 0.5) and (min_lon - 0.5) <= lon <= (max_lon + 0.5)):
                return False, None, f"Detection outside regional corridor extent [{bbox}]: [{lat}, {lon}]"
        except Exception:
            pass

        acq_date = str(row.get("acq_date", "")).strip()
        acq_time_raw = str(row.get("acq_time", "")).strip()
        if not acq_date or not acq_time_raw:
            return False, None, "Missing acquisition date or time"

        acq_time = acq_time_raw.zfill(4)
        try:
            dt_obj = datetime.strptime(f"{acq_date} {acq_time}", "%Y-%m-%d %H%M")
            acq_datetime = dt_obj.isoformat()
        except Exception:
            return False, None, f"Invalid acquisition date/time format: {acq_date} {acq_time_raw}"

        frp_raw = row.get("frp")
        frp = float(frp_raw) if frp_raw is not None and str(frp_raw).strip() != "" else 0.0
        if frp < 0.0:
            return False, None, f"Negative FRP measurement: {frp}"

        brightness_raw = row.get("brightness") or row.get("bright_ti4") or row.get("bright_t31")
        brightness = float(brightness_raw) if brightness_raw is not None and str(brightness_raw).strip() != "" else None

        bright_t31_raw = row.get("bright_t31") or row.get("bright_ti5")
        bright_t31 = float(bright_t31_raw) if bright_t31_raw is not None and str(bright_t31_raw).strip() != "" else None

        scan = float(row.get("scan")) if row.get("scan") is not None and str(row.get("scan")).strip() != "" else None
        track = float(row.get("track")) if row.get("track") is not None and str(row.get("track")).strip() != "" else None

        satellite = str(row.get("satellite", "")).strip() or None
        instrument = str(row.get("instrument", "")).strip() or None
        confidence = str(row.get("confidence", "")).strip() or None
        version = str(row.get("version", "")).strip() or None
        daynight = str(row.get("daynight", "D")).strip().upper() or "D"

        normalized = {
            "latitude": lat,
            "longitude": lon,
            "brightness": brightness,
            "scan": scan,
            "track": track,
            "acq_date": acq_date,
            "acq_time": acq_time,
            "acq_datetime": acq_datetime,
            "satellite": satellite,
            "instrument": instrument,
            "confidence": confidence,
            "version": version,
            "bright_t31": bright_t31,
            "frp": frp,
            "daynight": daynight
        }
        return True, normalized, None

    except ValueError as ve:
        return False, None, f"Numerical parsing error: {str(ve)}"
    except Exception as ex:
        return False, None, f"Malformed record format: {str(ex)}"


def fetch_firms_source_csv(
    map_key: str,
    source: str,
    bbox: str,
    days: int = 2,
    session: Optional[requests.Session] = None
) -> Tuple[int, List[Dict[str, Any]], Optional[str], Optional[str]]:
    """
    Fetch raw CSV telemetry for a single FIRMS product source.
    Returns: (status_code, parsed_rows, error_category_or_none, error_summary_or_none)
    """
    url = f"{DEFAULT_BASE_URL}/{map_key}/{source}/{bbox}/{days}"
    http = session or requests

    try:
        response = http.get(url, timeout=12)

        if response.status_code == 200:
            text = response.text.strip()
            if not text:
                return 200, [], None, None

            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)
            return 200, rows, None, None

        elif response.status_code in (401, 403):
            return response.status_code, [], "AUTHENTICATION_ERROR", "NASA FIRMS MAP_KEY rejected or invalid."
        elif response.status_code == 429:
            return response.status_code, [], "RATE_LIMIT", "NASA FIRMS API rate limit exceeded. Please retry shortly."
        elif 500 <= response.status_code <= 599:
            return response.status_code, [], "SERVER_ERROR", f"NASA FIRMS server error (HTTP {response.status_code})."
        else:
            return response.status_code, [], "HTTP_ERROR", f"NASA FIRMS returned HTTP {response.status_code}."

    except requests.exceptions.Timeout:
        return 408, [], "TIMEOUT", "Connection to NASA FIRMS modaps server timed out."
    except requests.exceptions.ConnectionError:
        return 503, [], "NETWORK_ERROR", "Could not establish network connection to NASA FIRMS server."
    except Exception as ex:
        ex_str = str(ex).lower()
        if "timed out" in ex_str or "timeout" in ex_str:
            return 408, [], "TIMEOUT", f"Connection to NASA FIRMS modaps server timed out: {str(ex)}"
        if "connection" in ex_str or "network" in ex_str:
            return 503, [], "NETWORK_ERROR", f"Network error communicating with NASA FIRMS: {str(ex)}"
        return 500, [], "UNEXPECTED_ERROR", f"Unexpected error while querying NASA FIRMS: {str(ex)}"



def ingest_live_firms_data(
    days: int = 2,
    source: Optional[str] = None,
    bbox: Optional[str] = None,
    map_key: Optional[str] = None,
    custom_db_path: Optional[Path] = None,
    session: Optional[requests.Session] = None
) -> Dict[str, Any]:
    """
    Ingest live satellite thermal observations safely and additively into SQLite.
    Never deletes or alters existing baseline observations.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    _state.last_attempt = now_iso
    _state.requested_window_days = days
    _state.product_queried = source or "ALL"

    active_key = get_configured_map_key(map_key)
    if not active_key:
        _state.error_category = "CONFIGURATION_ERROR"
        _state.last_error = "NASA FIRMS credentials are not configured."
        _state.operational_status = "ERROR"
        _state.message = "NASA FIRMS credentials are not configured. Offline demonstration mode remains active."
        return {
            "status": "error",
            "source": _state.source,
            "provenance": _state.provenance,
            "operational_status": "ERROR",
            "error_category": "CONFIGURATION_ERROR",
            "last_error": _state.last_error,
            "message": _state.message,
            "records_received": 0,
            "records_valid": 0,
            "records_inserted": 0,
            "records_skipped_duplicate": 0,
            "records_rejected": 0
        }

    target_bbox = (bbox or DEFAULT_BBOX).strip()
    target_sources = PRIMARY_SOURCES if (not source or source.strip().upper() == "ALL") else [source.strip()]

    total_received = 0
    total_valid = 0
    total_rejected = 0
    total_inserted = 0
    total_skipped = 0

    all_normalized_records = []
    error_summary = None
    error_cat = None

    for s in target_sources:
        status_code, rows, err_cat, err_msg = fetch_firms_source_csv(
            map_key=active_key,
            source=s,
            bbox=target_bbox,
            days=days,
            session=session
        )

        if err_cat:
            error_cat = err_cat
            error_summary = err_msg
            break

        total_received += len(rows)
        for r in rows:
            is_valid, norm_data, rej_reason = validate_raw_record(r, bbox=target_bbox)
            if is_valid and norm_data:
                total_valid += 1
                all_normalized_records.append(norm_data)
            else:
                total_rejected += 1

    if error_cat:
        _state.error_category = error_cat
        _state.last_error = error_summary or "Ingestion encountered an error."
        _state.operational_status = "ERROR"
        _state.message = f"NASA FIRMS could not be reached. The verified offline dataset remains available. ({error_cat})"
        return {
            "status": "error",
            "source": _state.source,
            "provenance": _state.provenance,
            "operational_status": "ERROR",
            "error_category": error_cat,
            "last_error": _state.last_error,
            "message": _state.message,
            "records_received": total_received,
            "records_valid": total_valid,
            "records_inserted": 0,
            "records_skipped_duplicate": 0,
            "records_rejected": total_rejected
        }

    # Safe atomic database insertion with deduplication
    with get_db(custom_db_path) as conn:
        cursor = conn.cursor()

        for d in all_normalized_records:
            cursor.execute("""
                SELECT id FROM firms_detections
                WHERE latitude = ? AND longitude = ? AND acq_date = ? AND acq_time = ? AND satellite = ?
            """, (d["latitude"], d["longitude"], d["acq_date"], d["acq_time"], d["satellite"]))

            if cursor.fetchone():
                total_skipped += 1
                continue

            cursor.execute("""
                INSERT INTO firms_detections (
                    latitude, longitude, brightness, scan, track,
                    acq_date, acq_time, acq_datetime, satellite, instrument,
                    confidence, version, bright_t31, frp, daynight
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                d["latitude"], d["longitude"], d["brightness"], d["scan"], d["track"],
                d["acq_date"], d["acq_time"], d["acq_datetime"], d["satellite"], d["instrument"],
                d["confidence"], d["version"], d["bright_t31"], d["frp"], d["daynight"]
            ))
            total_inserted += 1

    # Update state: successful live query
    _state.records_received = total_received
    _state.records_valid = total_valid
    _state.records_inserted = total_inserted
    _state.records_skipped = total_skipped
    _state.records_rejected = total_rejected
    _state.last_success = now_iso
    _state.error_category = None
    _state.last_error = None
    _state.source = "LIVE_FIRMS"
    _state.provenance = "LIVE_FIRMS"
    _state.is_live = True
    _state.operational_status = "LIVE"

    if total_inserted > 0:
        _state.message = f"Live FIRMS ingestion successful: {total_inserted} new observations committed ({total_skipped} duplicates skipped)."
    else:
        _state.message = "Live FIRMS request successful. All returned observations were already present in the local dataset."

    latest_obs_iso, age_min, age_hr, freshness_label = get_latest_observation_info(custom_db_path)
    latest_obs_dt = parse_iso_or_utc(latest_obs_iso)
    last_success_dt = parse_iso_or_utc(now_iso)

    return {
        "status": "success",
        "source": _state.source,
        "provenance": _state.provenance,
        "operational_status": _state.operational_status,
        "requested_window_days": days,
        "product_queried": _state.product_queried,
        "is_live": _state.is_live,
        "records_received": total_received,
        "records_valid": total_valid,
        "records_inserted": total_inserted,
        "records_skipped_duplicate": total_skipped,
        "records_rejected": total_rejected,
        "latest_observation_datetime": latest_obs_iso,
        "latest_observation_utc": format_utc(latest_obs_dt),
        "latest_observation_ist": format_ist(latest_obs_dt),
        "last_successful_ingestion_utc": format_utc(last_success_dt),
        "last_successful_ingestion_ist": format_ist(last_success_dt),
        "message": _state.message
    }

