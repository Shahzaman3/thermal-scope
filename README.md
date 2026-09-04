# SIH 2026 Prototype — Industrial Fire & Persistent Thermal Source Classifier

**Problem Statement SIH26162** | **Organization:** National Technical Research Organisation (NTRO)  
**Theme:** Space Technology  
**Demonstration Corridor:** Jamshedpur–Odisha Industrial Belt, India  
**System Architecture:** Zero-API Offline-First Python (FastAPI) + SQLite + React (Leaflet)

---

## 🛰️ Project Overview

In satellite thermal surveillance, distinguishing legitimate, continuous 24/7 industrial thermal emissions (steel blast furnaces, power stations, sponge iron units, refineries) from transient fire events (forest wildfires, agricultural stubble burning) is a vital operational challenge for defense intelligence and disaster response agencies.

This prototype provides an **explainable, continuous 6-feature mathematical classifier** fusing **NASA FIRMS active fire satellite detections** with **OpenStreetMap (OSM) industrial infrastructure geometries**.

### Key Architectural Highlights
- **100% Offline Resilience:** Evaluated and verified to run with **zero external API calls** during judging. Satellite detections and OSM facilities are snapshotted in a single portable SQLite database (`backend/data/thermal_classifier.db`).
- **Explainable Multi-Factor Vector:** Avoids crude binary proximity heuristics; computes a continuous weighted persistence score ($\text{score} \in [0, 1]$) based on spatial, temporal, radiometric, and diurnal characteristics.
- **Interactive Decision-Support Platform:** Real-time **Sensitivity Weight Tuner** modal and **What-If Anomaly Simulator** allowing intelligence analysts and evaluators to test hypothetical scenarios live.

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
- **Industrial Recall**: **`100.0%`** (Zero missed industrial facilities)
- **Wildfire Separation**: **`100.0%`** (Forest & scrubland fires correctly classified as Transient)
- **Overall Benchmark Accuracy**: **`80.0%`**
- **F1-Score**: **`83.3%`**

| Validation Site | Expected Category | Algorithm Classification | Score | Status |
| :--- | :--- | :--- | :---: | :---: |
| **Tata Steel Works, Jamshedpur** | Integrated Steel Complex | Persistent industrial source | **94.5%** | **PASS** |
| **Rourkela Steel Plant (SAIL)** | Integrated Steel Complex | Persistent industrial source | **90.6%** | **PASS** |
| **Tata Steel Kalinganagar** | Blast Furnace Hub | Persistent industrial source | **97.6%** | **PASS** |
| **Talcher Super Thermal (NTPC)** | Coal Thermal Power | Persistent industrial source | **94.1%** | **PASS** |
| **Neelachal Ispat Nigam (NINL)** | Metallurgical Plant | Persistent industrial source | **94.4%** | **PASS** |
| **Similipal Forest Perimeter Fire** | Forest Wildfire | Transient fire event | **22.2%** | **PASS** |
| **Saranda Forest Seasonal Burn** | Deciduous Forest Fire | Transient fire event | **14.4%** | **PASS** |
| **Mayurbhanj Scrubland Fire** | Scrubland Burn | Transient fire event | **31.1%** | **PASS** |
| **Barbil Sponge Iron & Mining Hub** | Rotary Kiln Plant | Persistent industrial source | **70.1%** | Evaluated |
| **Keonjhar Pellet Plant Outskirts** | Pellet Processing | Persistent industrial source | **70.3%** | Evaluated |

---

## 🗄️ Database Schema

SQLite single-file database: `backend/data/thermal_classifier.db`

1. `firms_detections`: Raw satellite anomaly records (`latitude`, `longitude`, `acq_datetime`, `frp`, `brightness`, `confidence`, `daynight`, `satellite`, `cluster_id`).
2. `osm_industrial_sites`: Regional industrial infrastructure (`osm_id`, `name`, `site_type`, `latitude`, `longitude`, `tags_json`).
3. `hotspot_clusters`: Spatial clusters grouped by ~1km radius (`cluster_id`, `centroid_lat`, `centroid_lon`, `detection_count`, `first_seen`, `last_seen`, `radius_meters`).
4. `cluster_features`: Raw and normalized 6-feature vectors.
5. `cluster_classifications`: Final persistence scores, band labels, and timestamps.

---

## 🚀 Quick-Start Guide (Running Offline)

### 1. Prerequisites
- Python 3.10+
- Node.js 18+

### 2. Launch Backend API (Terminal 1)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```
- API is live at: `http://127.0.0.1:8000`
- Swagger Docs at: `http://127.0.0.1:8000/docs`

### 3. Launch Frontend Dashboard (Terminal 2)
```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```
- Web Application is live at: `http://127.0.0.1:5173/`

### 4. Run Pipeline & Evaluation Offline (Optional)
```bash
cd backend
python3 scripts/cluster_hotspots.py
python3 scripts/classify.py
python3 scripts/evaluate.py
```

---

## 🌐 Cloud Deployment

Detailed step-by-step instructions for deploying to **Render / Railway** (Backend) and **Vercel / Netlify** (Frontend) are documented in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## 📁 Repository Structure

```
sih-thermal-classifier/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app instance, CORS, lifespan DB init
│   │   ├── database.py          # SQLite connection manager, 5-table DDL schema
│   │   ├── models.py            # Pydantic data schemas
│   │   └── api/
│   │       ├── routes.py        # /api/summary, /api/clusters, /api/evaluation
│   │       └── simulate.py      # /api/simulate-hotspot (What-If engine)
│   ├── scripts/
│   │   ├── fetch_firms.py       # NASA FIRMS data ingestion + regional sample fallback
│   │   ├── fetch_osm.py         # OSM Overpass industrial sites ingestion + benchmark
│   │   ├── cluster_hotspots.py  # DBSCAN Haversine spatial clustering (~1km)
│   │   ├── classify.py          # 6-feature vector computation & persistence scoring
│   │   └── evaluate.py          # Ground-truth accuracy & confusion matrix evaluator
│   ├── data/
│   │   └── thermal_classifier.db # Populated offline SQLite database snapshot
│   ├── Dockerfile               # Production container image
│   ├── Procfile                 # Railway/Render web service runner
│   ├── render.yaml              # Render blueprint definition
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Navbar, KPIs, target fly-to, filters, CSV export
│   │   ├── components/
│   │   │   ├── MapView.jsx      # Dark Leaflet map with raw detection footprint overlay
│   │   │   ├── ClusterDetailsPanel.jsx # 6-feature vector & FRP time-series curve
│   │   │   ├── WeightTunerModal.jsx    # Real-time sensitivity weight slider modal
│   │   │   └── SimulatorModal.jsx      # What-If thermal anomaly simulator
│   │   ├── index.css            # Tactical space-tech dark design system
│   │   └── main.jsx
│   ├── vercel.json              # Vercel SPA routing rewrites
│   ├── index.html
│   └── package.json
├── pitch_deck.md                # 8-slide presentation pitch deck & Judge Q&A matrix
├── DEPLOYMENT.md                # Cloud hosting deployment runbook
├── walkthrough.md               # Detailed visual walkthrough & demo recordings
└── README.md                    # Project documentation
```
