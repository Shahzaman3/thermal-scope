import os
from pathlib import Path
from contextlib import asynccontextmanager
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

# Load local environment variables from backend/.env or root .env
for env_candidate in [Path(__file__).resolve().parent.parent / ".env", Path.cwd() / ".env", Path.cwd() / "backend" / ".env"]:
    if env_candidate.is_file():
        load_dotenv(dotenv_path=env_candidate, override=True)
        break

# pyrefly: ignore [missing-import]
from fastapi import FastAPI
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from .database import init_db, get_db_stats
# pyrefly: ignore [missing-import]
from .models import HealthResponse
# pyrefly: ignore [missing-import]
from .api.routes import router as api_router
# pyrefly: ignore [missing-import]
from .api.simulate import router as simulate_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite schema and tables on startup
    init_db()
    yield


app = FastAPI(
    title="SIH 2026 Industrial Thermal Classifier API",
    description="Offline-first API for AI-based detection and classification of industrial fires and persistent thermal sources.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local React development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API endpoints
app.include_router(api_router)
app.include_router(simulate_router)


@app.get("/health", response_model=HealthResponse, tags=["Health"])
def health_check():
    """Health check endpoint: verifies service status, SQLite table states, FIRMS service, and pipeline readiness."""
    db_stats = get_db_stats()
    try:
        from .services.firms_ingestion_service import get_ingestion_status
        from .api.routes import run_clustering, run_classification
        firms_status = get_ingestion_status()
        firms_srv = "configured" if firms_status.get("configured") else "unconfigured"
        pipeline_status = "available" if (run_clustering and run_classification) else "unavailable"
        op_status = firms_status.get("operational_status", "OFFLINE")
    except Exception:
        firms_srv = "unconfigured"
        pipeline_status = "unavailable"
        op_status = "OFFLINE"

    return HealthResponse(
        status="ok",
        service="SIH 2026 Industrial Fire & Persistent Thermal Source Classifier",
        version="1.0.0",
        database=db_stats,
        firms_service=firms_srv,
        pipeline=pipeline_status,
        operational_status=op_status
    )
