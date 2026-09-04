from contextlib import asynccontextmanager
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
    """Health check endpoint: verifies service status and SQLite table states."""
    db_stats = get_db_stats()
    return HealthResponse(
        status="ok",
        service="SIH 2026 Industrial Fire & Persistent Thermal Source Classifier",
        version="1.0.0",
        database=db_stats
    )

