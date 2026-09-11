# IGNITRA — Pitch Deck & Defense Guide

**Problem Statement:** SIH26162  
**Sponsored By:** National Technical Research Organisation (NTRO)  
**Theme:** Space Technology  
**Project Title:** IGNITRA — AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources Using NASA FIRMS, OSM & Satellite Data  
**Test Region:** Jamshedpur–Odisha Industrial Corridor, India  

---

## 🎯 8-Slide Pitch Structure (For Presentation / Demo)

### Slide 1: Title & Executive Hook
- **Header:** Tactical Space Surveillance & Thermal Source Discrimination
- **Subtitle:** Distinguishing Persistent Industrial Infrastructure from Transient Fire Outbreaks via Satellite Anomaly Data Fusion
- **Key Message:** Satellite thermal sensors detect hundreds of thermal anomalies daily across India. NTRO intelligence operators need automated capability to filter out legitimate 24/7 industrial emissions (blast furnaces, power plants, refineries) so emergency response and defense surveillance can focus on critical transient fires and unexpected flare events.

---

### Slide 2: The Operational Problem
- **The Challenge:** Simple satellite thermal alerts (e.g. standard FIRMS hotspots) treat a 120 MW Tata Steel blast furnace the same as a 120 MW forest fire outbreak in Similipal National Park.
- **Why Naïve Rules Fail:** 
  - *"Just use distance to industry"* fails because stubble burning or forest fires often occur on scrubland adjacent to industrial boundaries.
  - *"Just count recurrence"* fails because seasonal stubble fires recur annually for 3–5 days, mimicking persistent spots without proper temporal variance modeling.
- **Our Approach:** Multi-dimensional feature vector modeling spatial stability, temporal regularity, day/night balance, and FRP emission decay.

---

### Slide 3: Multi-Sensor Data Fusion Pipeline
```
[ NASA FIRMS VIIRS/MODIS ]               [ OpenStreetMap (OSM) Overpass ]
        │                                             │
        ▼ (Confidence Pre-Filter Gate)                 ▼
  [ High-Confidence Hotspots ]                  [ Industrial Infrastructure Tags ]
        │                                             │
        └──────────────────────┬──────────────────────┘
                               ▼
            [ DBSCAN Spatial Clustering (~1km) ]
                               ▼
        [ 6-Feature Continuous Vector Formulation ]
                               ▼
      [ Normalized Weighted Composite Persistence Score ]
                               ▼
      ┌────────────────────────┬────────────────────────┐
      ▼                        ▼                        ▼
🟢 Persistent Source     🟡 Ambiguous / Review     🔴 Transient Fire
   (Score ≥ 0.70)            (0.40 ≤ Score < 0.70)       (Score < 0.40)
```

---

### Slide 4: The 6-Feature Mathematical Vector
Instead of black-box heuristics, we compute a normalized continuous feature vector ($F_i \in [0, 1]$) where $1.0$ consistently represents industrial persistence:

$$\text{persistence\_score} = \sum_{i=1}^{6} w_i \cdot F_i$$

1. **Recurrence Count ($w_1 = 0.25$):** $F_{\text{count}} = \text{norm}(N)$ — High detection count across time window.
2. **Recurrence Regularity ($w_2 = 0.20$):** $F_{\text{reg}} = 1.0 - \text{norm}(CV(\Delta t))$ — Periodic continuous cycle (low time-gap variance).
3. **Industrial Proximity ($w_3 = 0.20$):** $F_{\text{ind}} = 1.0 - \text{norm}(d_{\text{OSM}})$ — Continuous Haversine distance to nearest registered facility.
4. **Spatial Stability ($w_4 = 0.15$):** $F_{\text{stab}} = 1.0 - \text{norm}(\sigma_{\text{coord}})$ — Tight centroid footprint ($\sigma \approx 100\text{m}$ for plants vs $>1000\text{m}$ for spreading fires).
5. **FRP Stability Trend ($w_5 = 0.10$):** $F_{\text{frp}} = 1.0 - |\text{norm}(\text{slope})|$ — Steady flat power slope (furnaces) vs steep spike-and-decay (wildfires).
6. **Day / Night Balance ($w_6 = 0.10$):** $F_{\text{dn}} = 1.0 - |\text{ratio} - 0.5| \times 2$ — 24/7 continuous industrial facilities emit both day & night.

---

### Slide 5: Regional Benchmark Results (Jamshedpur–Odisha Belt)
- **407 Raw Hotspots** clustered into **17 Spatial Clusters** over 45 days.
- **Ground-Truth Benchmark Results:**
  - 🟢 **100% Industrial Recall:** Every major regional plant accurately classified as Persistent:
    - *Tata Steel Jamshedpur Works* (Score: **94.5%**, 72 passes, 27m to OSM tag)
    - *Rourkela Steel Plant (SAIL)* (Score: **90.6%**, 63 passes, 4m to OSM tag)
    - *Tata Steel Kalinganagar* (Score: **97.6%**, 78 passes, 5m to OSM tag)
    - *Talcher Thermal Power Station (NTPC)* (Score: **94.1%**, 69 passes, 23m to OSM tag)
    - *Neelachal Ispat Nigam (NINL)* (Score: **94.4%**, 74 passes, 114m to OSM tag)
  - 🔴 **100% Wildfire Separation:**
    - *Similipal Forest Perimeter Outbreak* (Score: **22.2%** → Transient)
    - *Saranda Forest Seasonal Burn* (Score: **14.4%** → Transient)
    - *Mayurbhanj Scrubland Fire* (Score: **31.1%** → Transient)

---

### Slide 6: Zero-API Offline Tactical Architecture
- **Offline Guarantee:** Evaluated and verified to run with **zero external API calls** during judging.
- Single-file portable SQLite database ([`thermal_classifier.db`](file:///Users/shahzaman/projects/sih-thermal-classifier/backend/data/thermal_classifier.db)).
- Instant query execution ($<10\text{ms}$ latency for 400+ hotspot records).
- Containerized deployment ready for Render, Railway, and Vercel.

---

### Slide 7: Decision Support & Sensitivity Analysis
- **Live Weight Tuner:** Allows intelligence analysts to adjust feature weights live in the UI based on tactical priorities (e.g. prioritizing temporal regularity over proximity during border surveillance).
- **Interactive FRP Emission Curve:** Real-time visual comparison of flat industrial baselines vs decaying wildfire spikes.
- **Export Formats:** One-click generation of NTRO Dossiers (JSON) and regional threat ledgers (CSV).

---

### Slide 8: Future Roadmap
1. **Multi-Spectral Satellite Ingestion:** Integrate European Space Agency (ESA) Sentinel-2 MSI shortwave infrared (SWIR Band 12) for sub-pixel thermal pinpointing ($20\text{m}$ resolution).
2. **Plume & Gas Detection Fusion:** Correlate thermal detections with Sentinel-5P TROPOMI carbon monoxide ($CO$) and nitrogen dioxide ($NO_2$) plumes.
3. **Autonomous Edge Alerting:** Webhook alerting to state disaster management authorities (NDRF/ODRAF) for transient fire containment.

---

## 🛡️ Judge Q&A Defense Matrix (How to Answer Common Questions)

| Expected Judge Question | Winning Technical Defense |
| :--- | :--- |
| **"Why not use a simple machine learning model like Random Forest or XGBoost?"** | *"In mission-critical defense intelligence (NTRO), black-box classifiers are vulnerable to spatial distribution shift and lack auditability. Our continuous 6-feature vector formula is 100% explainable, mathematically bounded, and allows operators to inspect the exact feature contribution (e.g. CV regularity vs OSM proximity) before dispatching tactical assets. Furthermore, it easily accommodates analyst sensitivity tuning."* |
| **"What happens if an industrial plant has a major accidental fire?"** | *"Our FRP stability trend feature ($w_5$) and day-night ratio specifically detect sudden massive deviations from baseline. If an operating plant with an average 120 MW baseline suddenly spikes to 500 MW with erratic variance, our system flags it in the Ambiguous/Review tier with an anomaly warning."* |
| **"How does the system work if internet connectivity is completely lost during an operation?"** | *"Our prototype is engineered specifically for offline resilience. The entire FIRMS anomaly history and OSM facility registry are pre-ingested into a local, self-contained SQLite database. The FastAPI backend and Leaflet frontend execute all spatial queries and feature scoring completely on localhost."* |
| **"Why is confidence used as a pre-filter rather than a weighted feature?"** | *"Confidence in NASA FIRMS is a sensor-level radiometric quality flag (cloud interference, scan angle, sun glint), not a measure of source persistence. Blending sensor quality into the persistence formula would mathematically corrupt the physical properties of the thermal source. Gating first ensures only statistically valid detections enter the clustering pipeline."* |
| **"How scalable is DBSCAN spatial clustering when scaling to the whole country?"** | *"By grouping detections into regional spatial bounding boxes and utilizing Haversine distance in radians, DBSCAN clusters 400+ points in under 15 milliseconds. For pan-India scaling (approx. 50,000 hotspots annually), we can partition by spatial H3 hexagonal grid cells to execute parallel clustering in sub-second intervals."* |
