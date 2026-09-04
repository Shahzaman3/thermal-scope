"""
NASA FIRMS Data Ingestion Script (Phase 2).
Pulls active fire / thermal anomaly detections for the Jamshedpur-Odisha industrial belt,
or seeds realistic demo snapshot data if in offline/mock mode.
Saves data into the local SQLite 'firms_detections' table.
"""

import sys
import csv
import io
import os
import argparse
import random
from datetime import datetime, timedelta
from pathlib import Path
import requests

# Set path to import from app
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.database import get_db, init_db

# Default Bounding Box for Jamshedpur–Odisha industrial belt (min_lon, min_lat, max_lon, max_lat)
DEFAULT_BBOX = "84.5,20.5,86.8,23.2"

# Primary FIRMS sensors
SOURCES = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "MODIS_NRT"]


def fetch_from_firms_api(map_key: str, bbox: str, days: int = 10, source: str = "VIIRS_SNPP_NRT", date_str: str = None):
    """
    Fetch FIRMS CSV data for a given bounding box and source.
    API endpoint: https://firms.modaps.eosdis.nasa.gov/api/area/csv/[MAP_KEY]/[SOURCE]/[EXTENT]/[DAYS]/[DATE]
    """
    base_url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/{source}/{bbox}/{days}"
    if date_str:
        base_url += f"/{date_str}"

    print(f"Requesting FIRMS data ({source}) for bbox [{bbox}]...")
    response = requests.get(base_url, timeout=30)
    
    if response.status_code != 200:
        print(f"Error {response.status_code} fetching from FIRMS: {response.text}")
        return []

    # Parse CSV content
    reader = csv.DictReader(io.StringIO(response.text))
    records = []
    for row in reader:
        records.append(row)
    return records


def insert_detections(records):
    """Insert detection records into SQLite firms_detections table with deduplication."""
    inserted = 0
    skipped = 0

    with get_db() as conn:
        cursor = conn.cursor()
        for r in records:
            # Normalize fields across VIIRS and MODIS CSV formats
            lat = float(r.get("latitude", 0.0))
            lon = float(r.get("longitude", 0.0))
            acq_date = r.get("acq_date", "")
            acq_time = str(r.get("acq_time", "")).zfill(4)
            
            # Form ISO datetime
            try:
                dt_obj = datetime.strptime(f"{acq_date} {acq_time}", "%Y-%m-%d %H%M")
                acq_datetime = dt_obj.isoformat()
            except Exception:
                acq_datetime = f"{acq_date}T{acq_time[:2]}:{acq_time[2:]}:00"

            brightness = float(r.get("bright_ti4") or r.get("brightness") or 0.0)
            scan = float(r.get("scan", 0.0)) if r.get("scan") else None
            track = float(r.get("track", 0.0)) if r.get("track") else None
            satellite = r.get("satellite", "")
            instrument = r.get("instrument", "")
            confidence = str(r.get("confidence", ""))
            version = r.get("version", "")
            bright_t31 = float(r.get("bright_ti5") or r.get("bright_t31") or 0.0)
            frp = float(r.get("frp", 0.0)) if r.get("frp") else 0.0
            daynight = r.get("daynight", "D")

            # Check duplicate
            cursor.execute("""
                SELECT id FROM firms_detections 
                WHERE latitude = ? AND longitude = ? AND acq_date = ? AND acq_time = ? AND satellite = ?
            """, (lat, lon, acq_date, acq_time, satellite))
            
            if cursor.fetchone():
                skipped += 1
                continue

            cursor.execute("""
                INSERT INTO firms_detections (
                    latitude, longitude, brightness, scan, track,
                    acq_date, acq_time, acq_datetime, satellite, instrument,
                    confidence, version, bright_t31, frp, daynight
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                lat, lon, brightness, scan, track,
                acq_date, acq_time, acq_datetime, satellite, instrument,
                confidence, version, bright_t31, frp, daynight
            ))
            inserted += 1

    print(f"Summary: Inserted {inserted} new detections ({skipped} duplicates skipped).")
    return inserted


def seed_sample_data(days_back: int = 45):
    """
    Generate realistic benchmark detections in the Jamshedpur-Odisha belt.
    Includes:
    1. Known persistent industrial hubs (Tata Steel Jamshedpur, Rourkela Steel, Kalinganagar Steel, Talcher Thermal & Mines)
    2. Transient agricultural/forest fire events (Similipal hills, Saranda forest)
    3. Ambiguous sporadic flare/kiln operations (Sponge iron units in Barbil / Jharsuguda)
    """
    print(f"Generating realistic sample dataset for {days_back} days...")
    
    # Ground truth locations
    sites = [
        # Persistent Industrial
        {"name": "Tata Steel Works, Jamshedpur", "lat": 22.8015, "lon": 86.1950, "type": "persistent", "base_frp": 120.0, "spread_m": 250},
        {"name": "Rourkela Steel Plant (SAIL)", "lat": 22.2285, "lon": 84.8690, "type": "persistent", "base_frp": 140.0, "spread_m": 300},
        {"name": "Tata Steel Kalinganagar", "lat": 20.9650, "lon": 86.0120, "type": "persistent", "base_frp": 110.0, "spread_m": 200},
        {"name": "Talcher Thermal Power Station (NTPC)", "lat": 20.9150, "lon": 85.2200, "type": "persistent", "base_frp": 160.0, "spread_m": 350},
        {"name": "Neelachal Ispat Nigam, Jajpur", "lat": 20.9420, "lon": 85.9800, "type": "persistent", "base_frp": 85.0, "spread_m": 200},

        # Ambiguous / Semi-regular (Sponge Iron, Mining flares)
        {"name": "Barbil Mining & Sponge Iron Cluster", "lat": 22.1150, "lon": 85.3950, "type": "ambiguous", "base_frp": 45.0, "spread_m": 600},
        {"name": "Jharsuguda Industrial Outskirts", "lat": 21.8500, "lon": 84.0300, "type": "ambiguous", "base_frp": 50.0, "spread_m": 500},
        {"name": "Keonjhar Pellet Plant", "lat": 21.6300, "lon": 85.5800, "type": "ambiguous", "base_frp": 38.0, "spread_m": 450},

        # Transient / Wildfires / Stubble burns
        {"name": "Similipal Forest Perimeter Fire", "lat": 21.8200, "lon": 86.3500, "type": "transient", "base_frp": 65.0, "spread_m": 1200},
        {"name": "Saranda Forest Seasonal Burn", "lat": 22.3100, "lon": 85.2800, "type": "transient", "base_frp": 75.0, "spread_m": 1500},
        {"name": "Mayurbhanj Scrubland Fire", "lat": 21.9500, "lon": 86.7200, "type": "transient", "base_frp": 40.0, "spread_m": 1100}
    ]

    base_time = datetime.utcnow()
    records = []

    # 1. Generate Persistent detections (detected very frequently, low variance in location, day & night)
    for site in sites:
        stype = site["type"]
        slat = site["lat"]
        slon = site["lon"]
        base_frp = site["base_frp"]
        m_deg = 1.0 / 111000.0 # ~1 meter in degrees

        if stype == "persistent":
            # Detected on ~85% of days, multiple times per day (both Day and Night)
            for day_offset in range(days_back):
                if random.random() < 0.15: # occasional missed cloud pass
                    continue
                num_passes = random.randint(1, 3)
                for _ in range(num_passes):
                    pass_time = base_time - timedelta(days=day_offset, hours=random.randint(0, 23), minutes=random.randint(0, 59))
                    daynight = "D" if random.random() > 0.48 else "N"
                    # Tight spatial radius (< 250m)
                    lat_jitter = random.gauss(0, site["spread_m"] * m_deg)
                    lon_jitter = random.gauss(0, site["spread_m"] * m_deg)
                    # Steady FRP with slight noise
                    frp = max(10.0, base_frp + random.gauss(0, 8.0))
                    
                    records.append({
                        "latitude": round(slat + lat_jitter, 5),
                        "longitude": round(slon + lon_jitter, 5),
                        "brightness": round(330.0 + random.gauss(0, 10), 1),
                        "scan": 0.4,
                        "track": 0.4,
                        "acq_date": pass_time.strftime("%Y-%m-%d"),
                        "acq_time": pass_time.strftime("%H%M"),
                        "satellite": random.choice(["N", "1", "Terra", "Aqua"]),
                        "instrument": "VIIRS" if random.random() > 0.3 else "MODIS",
                        "confidence": random.choice(["nominal", "high", "95"]),
                        "version": "2.0NRT",
                        "bright_ti5": 295.0,
                        "frp": round(frp, 1),
                        "daynight": daynight
                    })

        elif stype == "ambiguous":
            # Detected intermittently (e.g. 8-15 detections over 45 days)
            num_events = random.randint(10, 18)
            chosen_days = sorted(random.sample(range(days_back), min(num_events, days_back)))
            for day_offset in chosen_days:
                pass_time = base_time - timedelta(days=day_offset, hours=random.randint(0, 23), minutes=random.randint(0, 59))
                daynight = "D" if random.random() > 0.35 else "N"
                lat_jitter = random.gauss(0, site["spread_m"] * m_deg)
                lon_jitter = random.gauss(0, site["spread_m"] * m_deg)
                frp = max(5.0, base_frp + random.gauss(0, 15.0))
                
                records.append({
                    "latitude": round(slat + lat_jitter, 5),
                    "longitude": round(slon + lon_jitter, 5),
                    "brightness": round(315.0 + random.gauss(0, 12), 1),
                    "scan": 0.4,
                    "track": 0.4,
                    "acq_date": pass_time.strftime("%Y-%m-%d"),
                    "acq_time": pass_time.strftime("%H%M"),
                    "satellite": "N",
                    "instrument": "VIIRS",
                    "confidence": "nominal",
                    "version": "2.0NRT",
                    "bright_ti5": 290.0,
                    "frp": round(frp, 1),
                    "daynight": daynight
                })

        elif stype == "transient":
            # Fire active for only 1 to 3 consecutive days, spike in FRP then decay, wider spread
            start_day = random.randint(5, days_back - 5)
            duration_days = random.randint(1, 3)
            for d in range(duration_days):
                day_offset = start_day + d
                for pass_i in range(random.randint(1, 2)):
                    pass_time = base_time - timedelta(days=day_offset, hours=10 + random.randint(0, 6), minutes=random.randint(0, 59))
                    daynight = "D" # Stubble / forest fires predominantly spotted in day passes
                    lat_jitter = random.gauss(0, site["spread_m"] * m_deg)
                    lon_jitter = random.gauss(0, site["spread_m"] * m_deg)
                    # Spikes on day 1, drops on day 2/3
                    decay_factor = 1.0 if d == 0 else (0.4 if d == 1 else 0.15)
                    frp = max(4.0, (base_frp * decay_factor) + random.gauss(0, 5.0))
                    
                    records.append({
                        "latitude": round(slat + lat_jitter, 5),
                        "longitude": round(slon + lon_jitter, 5),
                        "brightness": round(305.0 + random.gauss(0, 15), 1),
                        "scan": 0.5,
                        "track": 0.5,
                        "acq_date": pass_time.strftime("%Y-%m-%d"),
                        "acq_time": pass_time.strftime("%H%M"),
                        "satellite": "Terra",
                        "instrument": "MODIS",
                        "confidence": "80",
                        "version": "6.1NRT",
                        "bright_ti5": 288.0,
                        "frp": round(frp, 1),
                        "daynight": daynight
                    })

    print(f"Generated {len(records)} realistic detections across benchmark sites.")
    insert_detections(records)


def main():
    parser = argparse.ArgumentParser(description="Ingest NASA FIRMS active fire detections into SQLite.")
    parser.add_argument("--key", type=str, default=os.getenv("FIRMS_MAP_KEY"), help="NASA FIRMS MAP_KEY")
    parser.add_argument("--bbox", type=str, default=DEFAULT_BBOX, help="Bounding box min_lon,min_lat,max_lon,max_lat")
    parser.add_argument("--days", type=int, default=10, help="Days of detections to request (1-10 per pull)")
    parser.add_argument("--sample", action="store_true", help="Generate realistic offline benchmark dataset for demo")
    
    args = parser.parse_args()
    init_db()

    if args.sample:
        seed_sample_data(days_back=45)
        return

    if not args.key:
        print("ERROR: No NASA FIRMS MAP_KEY provided. Set FIRMS_MAP_KEY env var or pass --key <YOUR_KEY>.")
        print("Note: To run offline or test without an API key right now, use the --sample flag:")
        print("      python scripts/fetch_firms.py --sample")
        sys.exit(1)

    total_inserted = 0
    for source in SOURCES:
        try:
            records = fetch_from_firms_api(map_key=args.key, bbox=args.bbox, days=args.days, source=source)
            if records:
                inserted = insert_detections(records)
                total_inserted += inserted
        except Exception as e:
            print(f"Error fetching {source}: {e}")

    print(f"\nAll sources processed. Total new detections inserted: {total_inserted}")


if __name__ == "__main__":
    main()
