"""
Automated FIRMS Monitoring & Refresh Service (Phase 4C.1).
Provides lightweight, resilient, and non-blocking background satellite thermal
anomaly refresh orchestration using FastAPI's lifespan and asyncio background tasks.

Constraints:
1. Offline-First Safety: Disabled by default (FIRMS_AUTO_REFRESH_ENABLED=false).
2. Zero API Surprise: Does NOT query NASA FIRMS immediately on startup; waits the configured interval.
3. Overlap Protection: Guards against concurrent manual and automated ingestion runs.
4. Resilient: Ingestion failures never terminate the scheduler or crash the application.
5. Reuses existing ingestion, validation, deduplication, and database logic.
"""

import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from threading import Lock

# pyrefly: ignore [missing-import]
from .firms_ingestion_service import (
    ingest_live_firms_data,
    update_ingestion_run_pipeline,
    format_utc,
    format_ist
)

logger = logging.getLogger("ignitra.scheduler")

# Configuration constants
DEFAULT_INTERVAL_MINUTES = 60
MINIMUM_SAFE_INTERVAL_MINUTES = 60

# Internal state
_scheduler_task: Optional[asyncio.Task] = None
_scheduler_running: bool = False
_ingestion_mutex = Lock()
_current_ingestion_running: bool = False
_last_scheduled_run: Optional[str] = None
_next_scheduled_run: Optional[str] = None

# Allow internal test suite to override minimum interval without exposing to production
_test_min_interval_override: Optional[int] = None


def is_auto_refresh_enabled() -> bool:
    """Check if automated FIRMS monitoring is enabled via environment variable."""
    val = os.getenv("FIRMS_AUTO_REFRESH_ENABLED", "false").strip().lower()
    return val in ("true", "1", "yes", "on")


def get_auto_refresh_interval_minutes() -> int:
    """
    Retrieve configured auto-refresh interval in minutes.
    Enforces a minimum safe interval to prevent accidental API flooding.
    """
    raw_val = os.getenv("FIRMS_AUTO_REFRESH_INTERVAL_MINUTES", str(DEFAULT_INTERVAL_MINUTES))
    try:
        val = int(raw_val)
    except (ValueError, TypeError):
        val = DEFAULT_INTERVAL_MINUTES

    min_interval = _test_min_interval_override if _test_min_interval_override is not None else MINIMUM_SAFE_INTERVAL_MINUTES
    if val < min_interval:
        logger.warning(
            f"Configured interval {val} min is below safe minimum {min_interval} min. "
            f"Clamping to {min_interval} min."
        )
        return min_interval
    return val


# Aliases for naming compatibility
SAFE_MINIMUM_INTERVAL_MINUTES = MINIMUM_SAFE_INTERVAL_MINUTES
is_scheduler_enabled = is_auto_refresh_enabled
get_refresh_interval_minutes = get_auto_refresh_interval_minutes


def is_ingestion_in_progress() -> bool:
    """Return whether any FIRMS ingestion run (manual or scheduled) is currently executing."""
    return _current_ingestion_running


class IngestionGuard:
    """Context manager ensuring mutually exclusive ingestion runs."""
    def __enter__(self):
        global _current_ingestion_running
        acquired = _ingestion_mutex.acquire(blocking=False)
        if not acquired:
            raise RuntimeError("Another FIRMS ingestion run is already in progress.")
        _current_ingestion_running = True
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        global _current_ingestion_running
        _current_ingestion_running = False
        _ingestion_mutex.release()


def get_scheduler_status() -> Dict[str, Any]:
    """Retrieve operational status telemetry for automated monitoring."""
    last_dt = None
    next_dt = None
    if _last_scheduled_run:
        try:
            last_dt = datetime.fromisoformat(_last_scheduled_run)
        except Exception:
            pass
    if _next_scheduled_run:
        try:
            next_dt = datetime.fromisoformat(_next_scheduled_run)
        except Exception:
            pass

    return {
        "auto_refresh_enabled": is_auto_refresh_enabled(),
        "auto_refresh_interval_minutes": get_auto_refresh_interval_minutes(),
        "scheduler_running": _scheduler_running,
        "last_scheduled_run": _last_scheduled_run,
        "last_scheduled_run_utc": format_utc(last_dt) if last_dt else None,
        "last_scheduled_run_ist": format_ist(last_dt) if last_dt else None,
        "next_scheduled_run": _next_scheduled_run,
        "next_scheduled_run_utc": format_utc(next_dt) if next_dt else None,
        "next_scheduled_run_ist": format_ist(next_dt) if next_dt else None,
        "current_ingestion_running": _current_ingestion_running
    }


def execute_scheduled_refresh_cycle(
    custom_db_path=None,
    days: int = 2,
    source: Optional[str] = None
) -> Dict[str, Any]:
    """
    Synchronous worker executing one automated refresh cycle:
    1. Acquires ingestion lock (skips cycle if another run is in progress)
    2. Calls existing live ingestion service
    3. Runs clustering and classification pipeline if new observations were committed
    4. Never raises uncaught exceptions to caller
    """
    global _last_scheduled_run
    now_iso = datetime.now(timezone.utc).isoformat()
    _last_scheduled_run = now_iso

    try:
        with IngestionGuard():
            # Trigger existing FIRMS ingestion service
            ingest_result = ingest_live_firms_data(
                days=days,
                source=source,
                custom_db_path=custom_db_path
            )

            # Trigger pipeline if new records were inserted
            if ingest_result.get("status") == "success" and ingest_result.get("records_inserted", 0) > 0:
                try:
                    import sys
                    from pathlib import Path
                    scripts_dir = Path(__file__).resolve().parent.parent.parent / "scripts"
                    if str(scripts_dir) not in sys.path:
                        sys.path.insert(0, str(scripts_dir))
                    from cluster_hotspots import run_clustering
                    from classify import run_classification
                    run_clustering(db_path=custom_db_path) if custom_db_path else run_clustering()
                    run_classification(db_path=custom_db_path) if custom_db_path else run_classification()
                    if ingest_result.get("run_id"):
                        update_ingestion_run_pipeline(
                            run_id=ingest_result["run_id"],
                            pipeline_status="COMPLETED",
                            custom_db_path=custom_db_path
                        )
                except Exception as p_err:
                    logger.error(f"Automated pipeline update error: {p_err}")
                    if ingest_result.get("run_id"):
                        update_ingestion_run_pipeline(
                            run_id=ingest_result["run_id"],
                            pipeline_status="FAILED",
                            custom_db_path=custom_db_path
                        )

            return ingest_result

    except RuntimeError:
        logger.info("Scheduled refresh cycle skipped: another ingestion run is currently in progress.")
        return {
            "status": "skipped",
            "message": "Automated refresh skipped because an ingestion run is currently active."
        }
    except Exception as ex:
        logger.error(f"Unexpected error during scheduled refresh: {ex}")
        return {
            "status": "error",
            "message": f"Unexpected error during automated refresh: {str(ex)}"
        }


async def _scheduler_loop():
    """
    Async background loop:
    Waits the configured interval before the first automatic run,
    then periodically executes automated ingestion while the application is running.
    """
    global _next_scheduled_run
    logger.info("IGNITRA automated FIRMS monitoring loop started.")

    while _scheduler_running:
        interval_minutes = get_auto_refresh_interval_minutes()
        interval_seconds = interval_minutes * 60

        next_dt = datetime.now(timezone.utc) + timedelta(seconds=interval_seconds)
        _next_scheduled_run = next_dt.isoformat()

        # Responsive sleep loop checking cancellation every second
        sleep_elapsed = 0.0
        while sleep_elapsed < interval_seconds and _scheduler_running:
            await asyncio.sleep(min(1.0, interval_seconds - sleep_elapsed))
            sleep_elapsed += 1.0

        if not _scheduler_running:
            break

        if is_auto_refresh_enabled():
            logger.info("Triggering scheduled NASA FIRMS refresh cycle...")
            try:
                # Run synchronous ingestion in threadpool to keep event loop responsive
                await asyncio.to_thread(execute_scheduled_refresh_cycle)
            except Exception as e:
                logger.error(f"Error in automated refresh execution: {e}")

    _next_scheduled_run = None
    logger.info("IGNITRA automated FIRMS monitoring loop stopped.")


def start_scheduler() -> Optional[asyncio.Task]:
    """
    Start the background monitoring task if enabled and not already running.
    Returns the asyncio.Task if active/started, or None if disabled.
    """
    global _scheduler_task, _scheduler_running
    if not is_auto_refresh_enabled():
        logger.info("Automated FIRMS refresh is disabled (FIRMS_AUTO_REFRESH_ENABLED=false).")
        return None

    if _scheduler_task is not None and not _scheduler_task.done():
        logger.debug("Scheduler task already active. Skipping duplicate creation.")
        return _scheduler_task

    _scheduler_running = True
    _scheduler_task = asyncio.create_task(_scheduler_loop())
    logger.info(f"Automated FIRMS monitoring task launched (Interval: {get_auto_refresh_interval_minutes()} min).")
    return _scheduler_task


async def stop_scheduler():
    """Cleanly cancel and await the background monitoring task on application shutdown."""
    global _scheduler_task, _scheduler_running, _next_scheduled_run
    _scheduler_running = False
    _next_scheduled_run = None

    if _scheduler_task is not None:
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except (asyncio.CancelledError, Exception):
            pass
        _scheduler_task = None
        logger.info("Automated FIRMS monitoring task cleanly stopped.")


def reset_scheduler_state():
    """Reset internal scheduler state (for test isolation)."""
    global _scheduler_task, _scheduler_running, _last_scheduled_run, _next_scheduled_run, _current_ingestion_running, _test_min_interval_override
    _scheduler_running = False
    _scheduler_task = None
    _last_scheduled_run = None
    _next_scheduled_run = None
    _current_ingestion_running = False
    _test_min_interval_override = None
