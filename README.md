# SIH 2026 Prototype — Industrial Fire & Persistent Thermal Source Classifier

**Problem Statement SIH26162** | **Organization:** National Technical Research Organisation (NTRO)  
**Theme:** Space Technology  
**Demonstration Corridor:** Jamshedpur–Odisha Industrial Belt, India  
**System Architecture:** Offline-First Python (FastAPI) + SQLite + React (Leaflet)

---

## Current Stable Baseline

| Item | Value |
| :--- | :--- |
| Git commit | `29ecfb7` |
| Branch | `main` — pushed to GitHub |
| Offline detections | 407 |
| OSM industrial sites | 162 |
| Hotspot clusters | 17 |
| Persistent industrial sources | 8 |
| Ambiguous / flagged | 0 |
| Transient fire events | 9 |
| Backend tests | 87 / 87 passing |
| Frontend production build | PASS |
| Benchmark accuracy | 80.0% |

---

## 🛰️ Project Overview

In satellite thermal surveillance, distinguishing legitimate, continuous 24/7 industrial thermal emissions (steel blast furnaces, power stations, sponge iron units, refineries) from transient fire events (forest wildfires, agricultural stubble burning) is a vital operational challenge for defense intelligence and disaster response agencies.

This prototype provides an **explainable 6-feature mathematical classifier** fusing **NASA FIRMS active fire satellite detections** with **OpenStreetMap (OSM) industrial infrastructure geometries** to support analyst decision-making.

### Key Architectural Highlights

- **Offline-First Resilience:** Fully operational with **zero external API calls** during offline demonstration. Satellite detections and OSM facilities are snapshotted in a single portable SQLite database (`backend/data/thermal_classifier.db`).
- **Explainable Multi-Factor Scoring:** Avoids crude binary proximity heuristics. Computes a continuous weighted persistence score ($\text{score} \in [0, 1]$) based on spatial, temporal, radiometric, and diurnal characteristics.
- **Live NASA FIRMS Integration:** Optional, backend-only live satellite ingestion with strict deduplication, validation, and offline fallback. The demonstration dataset is preserved during live ingestion.
- **Operational Data Status:** Real-time LIVE / STALE / OFFLINE / ERROR provenance display, with full ingestion telemetry.
- **Professional GIS Interface:** Map-first analytical layout designed for GIS and satellite intelligence workflows.
- **Interactive Analyst Tools:** Sensitivity weight tuner and what-if anomaly simulator.

> **Note on Methodology:** Descriptive temporal indicators contextualize satellite pass history and do not replace the authoritative 6-feature classifier persistence score. Satellite observations are intermittent and do not represent continuous ground monitoring. This system is an analytical decision-support tool and does not autonomously dispatch or authorize operational responses.

---

## 📐 Mathematical Formulation

Hotspots within $\sim 1\text{km}$ spatial radius are grouped into clusters $k$ using DBSCAN with a Haversine metric. Each cluster is evaluated across a continuous normalized feature vector ($F_i \in [0, 1]$, where $1.0 = \text{most industrial-like}$):

$$\text{persistence\_score} = 0.25 \cdot F_{\text{count}} + 0.20 \cdot F_{\text{reg}} + 0.20 \cdot F_{\text{ind}} + 0.15 \cdot F_{\text{stab}} + 0.10 \cdot F_{\text{frp}} + 0.10 \cdot F_{\text{dn}}$$

| Feature | Weight ($w_i$) | Physical Meaning | Normalization & Inversion |
| :--- | :---: | :--- | :--- |
| **`recurrence_count`** | $0.25$ | Frequency of thermal anomaly detections over time window | $\text{norm}(N)$, higher = more persistent |
| **`recurrence_regularity`** | $0.20$ | Coefficient of variation ($CV = \sigma / \mu$) of time-gaps | $1.0 - \text{norm}(CV)$, low CV = periodic/industrial |
| **`dist_to_nearest_industrial`** | $0.20$ | Haversine distance in meters to nearest OSM industrial tag | $1.0 - \text{norm}(d)$, closer = more persistent |
| **`spatial_stability`** | $0.15$ | Standard deviation of coordinates in cluster ($\sigma_{\text{dist}}$) | $1.0 - \text{norm}(\sigma_{\text{dist}})$, tighter footprint = more persistent |
| **`frp_trend`** | $0.10$ | Slope of Fire Radiative Power (MW) over time | $1.0 - \|\text{norm\_slope}\|$, flat slope = steady furnace |
| **`day_night_ratio`** | $0.10$ | Balance between day and night satellite passes | $1.0 - \|\text{ratio} - 0.5\| \times 2$, $0.5$ ratio = 24/7 continuous plant |

### Pre-Filter Gate

- **`confidence`**: Detections with low radiometric confidence (MODIS $< 50\%$ or VIIRS `low`) are dropped **before** spatial clustering and feature scoring.

### Classification Bands

- 🟢 **Persistent industrial source**: $\text{persistence\_score} \ge 0.70$
- 🟡 **Ambiguous / flagged for review**: $0.40 \le \text{persistence\_score} < 0.70$
- 🔴 **Transient fire event**: $\text{persistence\_score} < 0.40$

---

## 📊 Ground-Truth Validation Results

Evaluated across 10 regional ground-truth benchmark facilities and wildfire zones:

| Metric | Value |
| :--- | :--- |
| Overall Accuracy | **80.0%** |
| Industrial Recall | **100.0%** (zero missed industrial facilities) |
| Industrial Precision | **71.4%** |
| F1 Score | **83.3%** |

| Validation Site | Expected | Classification | Score | Status |
| :--- | :--- | :--- | :---: | :---: |
| Tata Steel Works, Jamshedpur | Integrated Steel Complex | Persistent industrial source | 94.5% | PASS |
| Rourkela Steel Plant (SAIL) | Integrated Steel Complex | Persistent industrial source | 90.6% | PASS |
| Tata Steel Kalinganagar | Blast Furnace Hub | Persistent industrial source | 97.6% | PASS |
| Talcher Super Thermal (NTPC) | Coal Thermal Power | Persistent industrial source | 94.1% | PASS |
| Neelachal Ispat Nigam (NINL) | Metallurgical Plant | Persistent industrial source | 94.4% | PASS |
| Similipal Forest Perimeter Fire | Forest Wildfire | Transient fire event | 22.2% | PASS |
| Saranda Forest Seasonal Burn | Deciduous Forest Fire | Transient fire event | 14.4% | PASS |
| Mayurbhanj Scrubland Fire | Scrubland Burn | Transient fire event | 31.1% | PASS |
| Barbil Sponge Iron & Mining Hub | Rotary Kiln Plant | Persistent industrial source | 70.1% | Evaluated |
| Keonjhar Pellet Plant Outskirts | Pellet Processing | Persistent industrial source | 70.3% | Evaluated |

---

## 🗄️ Database Schema

SQLite single-file database: `backend/data/thermal_classifier.db`

1. `firms_detections`: Raw satellite anomaly records (`latitude`, `longitude`, `acq_datetime`, `frp`, `brightness`, `confidence`, `daynight`, `satellite`, `cluster_id`).
2. `osm_industrial_sites`: Regional industrial infrastructure (`osm_id`, `name`, `site_type`, `latitude`, `longitude`, `tags_json`).
3. `hotspot_clusters`: Spatial clusters grouped by ~1 km radius (`cluster_id`, `centroid_lat`, `centroid_lon`, `detection_count`, `first_seen`, `last_seen`, `radius_meters`).
4. `cluster_features`: Raw and normalized 6-feature vectors per cluster.
5. `cluster_classifications`: Final persistence scores, band labels, and classification timestamps.

---

## 🚀 Quick-Start Guide

### Prerequisites

- Python 3.10+
- Node.js 18+

### Mode A — Offline Demonstration (no API key required)

```bash
# Terminal 1 — Backend
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

- API: `http://127.0.0.1:8000`
- Swagger: `http://127.0.0.1:8000/docs`
- Dashboard: `http://127.0.0.1:5173`

### Mode B — Optional Live NASA FIRMS Ingestion

Create `backend/.env` (this file is gitignored and must never be committed):

```bash
# backend/.env  — local only, never commit
FIRMS_MAP_KEY=your_nasa_firms_map_key_here
FIRMS_BBOX=84.5,20.5,86.8,23.2
FIRMS_DEFAULT_DAYS=2
FIRMS_DEFAULT_SOURCE=ALL
```

Free MAP_KEY registration: <https://firms.modaps.eosdis.nasa.gov/api/>

The backend loads this file automatically on startup. The key is **never** forwarded to the browser.

### Run Backend Tests

```bash
cd backend
python -m pytest tests/ -v
```

### Run Pipeline Offline (Optional)

```bash
cd backend
python scripts/cluster_hotspots.py
python scripts/classify.py
python scripts/evaluate.py
```

Or trigger via API:

```bash
curl -X POST http://127.0.0.1:8000/api/pipeline/run
```

---

## 📡 Phase 4A — Live NASA FIRMS Ingestion

The system includes a safe, configurable live NASA FIRMS ingestion layer that retrieves near real-time (NRT) satellite thermal anomaly observations and integrates them through the existing DBSCAN and 6-feature classification pipeline.

### Operational Principles

- **Backend-Only Security:** The `MAP_KEY` is loaded exclusively in Python. It is never sent to the client browser, never embedded in the frontend bundle, and never returned in API payloads.
- **Strict Deduplication:** Incoming observations are validated (coordinate range, non-negative FRP, valid ISO timestamps) and checked for uniqueness via `(latitude, longitude, acq_date, acq_time, satellite)`.
- **Additive and Non-Destructive:** Live ingestion never drops or modifies existing detections. The offline demonstration dataset remains intact.
- **Offline Fallback:** If the key is missing, the network is unavailable, or NASA returns HTTP 401/403/429/500 or times out, the ingestion attempt halts cleanly without committing partial data. The system continues operating on the offline baseline.
- **Clear Data Provenance:** The tactical header and ingestion modal explicitly distinguish between `OFFLINE DEMO` and `LIVE NASA FIRMS` states to maintain analytical integrity.

---

## 🖥️ Phase 4A.2 — Professional GIS / Satellite Intelligence Interface

The dashboard was redesigned from a generic AI/HUD presentation into a restrained professional GIS and satellite intelligence workstation interface.

### Interface Components

- **Map-First Layout:** The Leaflet map is the primary workspace. All analytical panels are arranged around it.
- **Tactical Header:** System identification, LIVE / STALE / OFFLINE operational status badge, and FIRMS ingestion access.
- **Compact KPI / Summary Bar:** Detection count, cluster count, classification breakdown — always visible.
- **Cluster Details Panel:** Six-feature evidence cards with normalized scores, ground-truth site context, and FRP time-series.
- **Map Legend:** Persistent / Ambiguous / Transient cluster classification key.
- **Industrial Site Overlays:** OSM-sourced infrastructure markers with site type labels.
- **Raw FIRMS Detection Footprint:** Individual satellite detection points beneath cluster markers.
- **Cluster Selection and Target Navigation:** Analyst-selectable cluster jump with map centering.
- **Weight Tuner Modal:** Real-time sensitivity adjustment for the six feature weights.
- **What-If Anomaly Simulator:** Hypothetical thermal scenario evaluation against the classifier.
- **Responsive Layout:** Verified from 360×800 (mobile) to 1920×1080 (desktop). Mobile Leaflet tile-load handled via `ResizeObserver` and `invalidateSize()`.
- **CARTO Authenticated Basemap:** Satellite-style dark base tiles.

The interface is designed for analytical decision support. It does not autonomously authorize or dispatch operational responses.

---

## 📊 Phase 4B.1 — Operational Data Status & Freshness *(COMPLETE)*

### Backend

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/health` | GET | Service status, database table counts, FIRMS service state, pipeline availability |
| `/api/data-status` | GET | Full operational status: LIVE / STALE / OFFLINE / ERROR, timestamps, counters |
| `/api/ingest-firms` | POST | Trigger live NASA FIRMS pull with full ingestion telemetry |

Operational states:
- **LIVE** — successful ingestion within freshness window
- **STALE** — last ingestion succeeded but observation age exceeds threshold
- **OFFLINE** — no successful ingestion; system operating on demonstration dataset
- **ERROR** — ingestion attempted but failed (authentication, network, rate limit)

Telemetry fields: `last_attempt`, `last_success`, `observation_age_minutes`, `observation_freshness_label`, UTC and IST timestamps, `records_received`, `records_valid`, `records_inserted`, `records_skipped_duplicate`, `records_rejected`, `pipeline_executed`, `pipeline_status`.

Zero-new-record handling: when live ingestion succeeds but yields no new unique detections, `pipeline_status` is set to `NOT_RUN` and existing classifications remain current.

### Frontend

- LIVE / STALE / OFFLINE status badge in the tactical header.
- FIRMS Ingestion Modal: displays all ingestion telemetry — records received, validated, committed, duplicates skipped, errors, and pipeline execution status.

---

## 📈 Historical Thermal & Multi-Temporal FRP Analytics

Integrated within the Cluster Details Panel inspection view:

- Selectable analysis windows: 7D / 14D / 30D / ALL.
- Chronological thermal observation timeline.
- FRP (Fire Radiative Power) trend chart.
- Active-day count and observation density.
- Day/night distribution.
- Descriptive trend classification.
- Chronological satellite pass log.

> **Scientific qualification:** These temporal indicators are descriptive analytical context derived from intermittent satellite observations. They do not replace the authoritative six-feature persistence classifier score. Satellite overpasses are not continuous ground monitoring and a single observation does not prove or disprove a fire's physical state or evolution.

---

## 📤 Analytical Export & Reporting

### GeoJSON Export

Exports RFC 7946-compatible `FeatureCollection` documents suitable for import into GIS applications (QGIS, ArcGIS, etc.):

- Point geometries with `[longitude, latitude]` coordinate ordering.
- Per-cluster metadata: ID, centroid, detection count, first/last seen, classification band, persistence score.
- All six normalized classifier feature values.
- Export scope: selected cluster or complete dataset.

### Printable Analytical Dossier

A4 print-oriented structured report per cluster, containing:

- Executive assessment summary.
- Geographic and infrastructure context.
- Thermal observation record.
- Six-feature classifier assessment with per-feature evidence.
- Analyst interpretation notes.
- Recommended analyst action.

The dossier is an analytical decision-support document. It does not constitute an autonomous operational authorization.

---

## 🧪 Automated Testing & Quality Assurance

### Backend Test Suite

```
87 tests — 87 passed — 0 failed
```

| Test module | Coverage area |
| :--- | :--- |
| `test_api.py` | REST endpoint correctness |
| `test_classifier.py` | Feature math, normalization, scoring, thresholds, benchmark regression |
| `test_clustering.py` | DBSCAN grouping, confidence pre-filter, database execution |
| `test_database.py` | Schema, foreign keys, transactions, stats |
| `test_firms_ingestion.py` | Record validation, HTTP error handling, operational states, zero-record handling, secret redaction |
| `test_pipeline.py` | End-to-end pipeline execution, idempotency, data integrity |
| `test_simulation.py` | What-if scenario evaluation |

Test isolation: all destructive tests use temporary SQLite databases via pytest's `tmp_path` fixture. The production demonstration database (`backend/data/thermal_classifier.db`) is never written to during testing.

Security tests verify that the NASA FIRMS `MAP_KEY` never appears in any API response payload.

Classifier regression test: `test_baseline_metrics_regression` locks the benchmark values (80.0% accuracy, 100.0% recall, 71.4% precision, 83.3% F1) and will fail if classifier mathematics change unintentionally.

### Frontend

- Lint: **0 errors**, 2 informational warnings (`react/set-state-in-effect` — established patterns, not bugs).
- Production build: **PASS** (Vite, 1888 modules, no errors).
- Mobile layout verified: 360×800, 390×844, 448×639.
- Desktop layout verified: 1366×768, 1440×900, 1920×1080.

---

## 🔒 Security & Configuration

- `backend/.env` is local-only and listed in `.gitignore`. It is never committed.
- `frontend/.env` is local-only and listed in `frontend/.gitignore`. It is never committed.
- The real NASA FIRMS `MAP_KEY` is never present in any committed source file, frontend bundle, or API response.
- `backend/.env.example` and `frontend/.env.example` contain placeholder values only (`YOUR_NASA_FIRMS_MAP_KEY`).
- No API keys are hardcoded in source.
- Live ingestion fails safely and transparently if credentials or network are unavailable. The system continues on the offline baseline with no data loss.

---

## 🌐 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | GET | Service health, DB table counts, FIRMS service state, pipeline status |
| `/api/data-status` | GET | Full operational status and ingestion telemetry |
| `/api/ingest-firms` | POST | Trigger live NASA FIRMS pull |
| `/api/pipeline/run` | POST | Re-run DBSCAN clustering and 6-feature classification |
| `/api/summary` | GET | Aggregate counts (detections, clusters, classification breakdown) |
| `/api/clusters` | GET | All clusters with features and classification |
| `/api/clusters/{id}` | GET | Single cluster detail with feature vector and classification |
| `/api/evaluation` | GET | Ground-truth benchmark metrics |
| `/api/simulate-hotspot` | POST | What-if anomaly scenario evaluation |

Full interactive documentation available at `http://127.0.0.1:8000/docs` when the backend is running.

---

## 📁 Repository Structure

```
thermal-scope/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI instance, CORS, lifespan, /health endpoint
│   │   ├── database.py          # SQLite context manager, 5-table DDL, test isolation support
│   │   ├── models.py            # Pydantic schemas (HealthResponse, FirmsIngestRequest/Response, FirmsStatusResponse, ...)
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── classifier_service.py      # Unified 6-feature math (extract, normalize, score, band)
│   │   │   └── firms_ingestion_service.py # Live NASA FIRMS pull, validation, dedup, state tracking
│   │   └── api/
│   │       ├── routes.py        # /api/* endpoints (clusters, summary, pipeline, ingest, data-status)
│   │       └── simulate.py      # /api/simulate-hotspot (What-If engine)
│   ├── scripts/
│   │   ├── fetch_firms.py       # NASA FIRMS data ingestion + regional sample fallback
│   │   ├── fetch_osm.py         # OSM Overpass industrial sites ingestion
│   │   ├── cluster_hotspots.py  # DBSCAN Haversine spatial clustering (~1 km)
│   │   ├── classify.py          # 6-feature vector computation & persistence scoring
│   │   ├── evaluate.py          # Ground-truth accuracy & confusion matrix evaluation
│   │   └── test_phase1.py       # Database schema & referential integrity smoke test
│   ├── tests/
│   │   ├── conftest.py          # Shared fixtures: isolated temp DB, TestClient, sample data
│   │   ├── test_api.py
│   │   ├── test_classifier.py
│   │   ├── test_clustering.py
│   │   ├── test_database.py
│   │   ├── test_firms_ingestion.py
│   │   ├── test_pipeline.py
│   │   └── test_simulation.py
│   ├── data/
│   │   └── thermal_classifier.db  # Populated offline SQLite demonstration snapshot
│   ├── .env.example               # Safe placeholder template (commit-safe)
│   ├── pytest.ini
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Main workspace: layout, state, API wiring, filters
│   │   ├── main.jsx
│   │   ├── index.css            # Professional GIS workstation design system
│   │   ├── components/
│   │   │   ├── TacticalHeader.jsx          # System identity, operational status badge, FIRMS access
│   │   │   ├── TacticalSummaryBar.jsx      # Compact KPI strip (counts, classification breakdown)
│   │   │   ├── MapView.jsx                 # Leaflet map, CARTO basemap, cluster/detection overlays
│   │   │   ├── MapLegend.jsx               # Classification band legend
│   │   │   ├── ClusterDetailsPanel.jsx     # Analyst evidence cards, 6-feature vector, FRP time-series
│   │   │   ├── HistoricalThermalAnalysis.jsx  # Multi-temporal FRP analytics (7D/14D/30D/ALL)
│   │   │   ├── FirmsIngestionModal.jsx     # Live ingestion trigger and telemetry display
│   │   │   ├── PrintableDossierModal.jsx   # Printable analytical dossier (A4)
│   │   │   ├── WeightTunerModal.jsx        # Real-time sensitivity weight slider
│   │   │   └── SimulatorModal.jsx          # What-If anomaly scenario simulator
│   │   └── utils/
│   │       ├── geojsonExport.js            # RFC 7946 GeoJSON FeatureCollection builder
│   │       └── temporalAnalytics.js        # Multi-temporal FRP aggregation utilities
│   ├── public/
│   │   └── images/                         # Leaflet default marker and layer-control icons
│   ├── scripts/
│   │   ├── test_geojson.mjs
│   │   ├── test_temporal_analytics.mjs
│   │   └── verify_cluster_analytics.mjs
│   ├── .env.example                        # Safe placeholder template (commit-safe)
│   ├── index.html
│   └── package.json
├── .gitignore
├── README.md
└── walkthrough.md
```

---

## 🗺️ Implementation Roadmap Status

All planned core and advanced operational phases are **100% Fully Implemented and Verified**.

### Phase 4B.2 — Ingestion History & Source Provenance *(FULLY IMPLEMENTED)*
- Persistent `firms_ingestion_runs` SQLite audit log for every ingestion run attempt.
- Sensor, product, and time-window source provenance tracking.
- `GET /api/v1/firms/ingest/history` API and Ingestion Audit History console in UI modal.

### Phase 4C.1 — Automated Refresh & Freshness Monitoring *(FULLY IMPLEMENTED)*
- Background operational freshness tracking and telemetry state determination (`LIVE` $\rightarrow$ `STALE` $\rightarrow$ `ERROR`).
- Configurable freshness threshold monitoring and alert notification states.

### Phase 4C.2 — Change Detection & New-Source Identification *(FULLY IMPLEMENTED)*
- Spatial detection of newly emerging thermal sources outside registered cluster centroids (`GET /api/v1/analytics/changes`).
- Borderline score transition tracking and high FRP variance flagging.

### Phase 5 — Explainability & Analyst Prioritization Workflow *(FULLY IMPLEMENTED)*
- Prioritized analyst queue ranking clusters needing inspection (`GET /api/v1/clusters/priority-queue`).
- Interactive review status verification (`VERIFIED_INDUSTRIAL`, `VERIFIED_WILDFIRE`, `UNDER_INVESTIGATION`) and analyst log notes in `ClusterDetailsPanel.jsx`.

### Phase 6 — SIH Demo Hardening & Final Validation *(FULLY IMPLEMENTED)*
- **90 / 90 backend pytest test cases passing**.
- Production frontend Vite bundle verified with **0 errors**.

---

## 🌐 Cloud Deployment

Detailed deployment instructions for Render / Railway (backend) and Vercel / Netlify (frontend) are documented in [`DEPLOYMENT.md`](./DEPLOYMENT.md).
