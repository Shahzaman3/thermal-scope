"""
OpenStreetMap (OSM) Overpass Data Ingestion Script (Phase 3).
Pulls industrial sites (steel plants, refineries, mining, quarries, works)
in the Jamshedpur-Odisha bounding box.
Falls back to high-fidelity regional industrial catalog if Overpass API is unreachable.
Saves data into the local SQLite 'osm_industrial_sites' table.
"""

import sys
import json
import argparse
from pathlib import Path
# pyrefly: ignore [missing-import]
import requests

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pyrefly: ignore [missing-import]
from app.database import get_db, init_db

# Bounding box in Overpass format: (min_lat, min_lon, max_lat, max_lon)
# Matching our region: lat 20.5 to 23.2, lon 84.5 to 86.8
DEFAULT_BBOX = (20.5, 84.5, 23.2, 86.8)

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
]

# Benchmark industrial sites in Jamshedpur–Odisha belt for offline/fallback guarantees
BENCHMARK_OSM_SITES = [
    {
        "osm_id": "way/tata_steel_jamshedpur",
        "name": "Tata Steel Jamshedpur Works",
        "site_type": "steel_plant",
        "latitude": 22.8015,
        "longitude": 86.1950,
        "tags": {"landuse": "industrial", "industrial": "steelworks", "operator": "Tata Steel", "name": "Tata Steel Jamshedpur Works"}
    },
    {
        "osm_id": "way/sail_rourkela",
        "name": "Rourkela Steel Plant (SAIL)",
        "site_type": "steel_plant",
        "latitude": 22.2285,
        "longitude": 84.8690,
        "tags": {"landuse": "industrial", "industrial": "steelworks", "operator": "Steel Authority of India", "name": "Rourkela Steel Plant"}
    },
    {
        "osm_id": "way/tata_steel_kalinganagar",
        "name": "Tata Steel Kalinganagar Industrial Complex",
        "site_type": "steel_plant",
        "latitude": 20.9650,
        "longitude": 86.0120,
        "tags": {"landuse": "industrial", "industrial": "steelworks", "name": "Tata Steel Kalinganagar"}
    },
    {
        "osm_id": "way/talcher_thermal_ntpc",
        "name": "Talcher Thermal Power Station (NTPC)",
        "site_type": "power_plant",
        "latitude": 20.9150,
        "longitude": 85.2200,
        "tags": {"power": "plant", "plant:source": "coal", "name": "Talcher Super Thermal Power Station"}
    },
    {
        "osm_id": "way/mcl_talcher_coal",
        "name": "Talcher Coalfields (Mahanadi Coalfields)",
        "site_type": "mine",
        "latitude": 20.9500,
        "longitude": 85.1800,
        "tags": {"landuse": "quarry", "resource": "coal", "name": "Talcher Coalfield"}
    },
    {
        "osm_id": "way/neelachal_ispat_jajpur",
        "name": "Neelachal Ispat Nigam Ltd (NINL)",
        "site_type": "steel_plant",
        "latitude": 20.9420,
        "longitude": 85.9800,
        "tags": {"landuse": "industrial", "industrial": "metallurgical", "name": "Neelachal Ispat Nigam Ltd"}
    },
    {
        "osm_id": "way/vedanta_jharsuguda",
        "name": "Vedanta Aluminium Smelter Jharsuguda",
        "site_type": "smelter",
        "latitude": 21.8500,
        "longitude": 84.0300,
        "tags": {"landuse": "industrial", "industrial": "aluminium_smelter", "name": "Vedanta Aluminium Ltd"}
    },
    {
        "osm_id": "way/barbil_sponge_iron",
        "name": "Barbil Sponge Iron & Pellet Hub",
        "site_type": "sponge_iron",
        "latitude": 22.1150,
        "longitude": 85.3950,
        "tags": {"landuse": "industrial", "name": "Barbil Sponge Iron Cluster"}
    },
    {
        "osm_id": "way/keonjhar_pellet",
        "name": "Keonjhar Iron Ore Pellet Plant",
        "site_type": "processing_plant",
        "latitude": 21.6300,
        "longitude": 85.5800,
        "tags": {"landuse": "industrial", "name": "Keonjhar Pellet Plant"}
    },
    {
        "osm_id": "way/adityapur_industrial_area",
        "name": "Adityapur Industrial Area (AIADA)",
        "site_type": "industrial_estate",
        "latitude": 22.7800,
        "longitude": 86.1500,
        "tags": {"landuse": "industrial", "name": "Adityapur Industrial Area"}
    },
    {
        "osm_id": "way/angul_jspl",
        "name": "Jindal Steel & Power Angul Plant",
        "site_type": "steel_plant",
        "latitude": 20.8650,
        "longitude": 85.1200,
        "tags": {"landuse": "industrial", "industrial": "steelworks", "name": "Jindal Steel and Power Limited Angul"}
    },
    {
        "osm_id": "way/jaduguda_uranium_mill",
        "name": "UCIL Uranium Processing Plant, Jaduguda",
        "site_type": "mineral_processing",
        "latitude": 22.6550,
        "longitude": 86.3500,
        "tags": {"landuse": "industrial", "name": "UCIL Jaduguda"}
    }
]


def fetch_from_overpass(bbox=DEFAULT_BBOX):
    """Query Overpass API for industrial tags in bounding box."""
    min_lat, min_lon, max_lat, max_lon = bbox
    query = f"""[out:json][timeout:30];
(
  node["landuse"="industrial"]({min_lat},{min_lon},{max_lat},{max_lon});
  way["landuse"="industrial"]({min_lat},{min_lon},{max_lat},{max_lon});
  node["industrial"]({min_lat},{min_lon},{max_lat},{max_lon});
  way["industrial"]({min_lat},{min_lon},{max_lat},{max_lon});
  node["man_made"="works"]({min_lat},{min_lon},{max_lat},{max_lon});
  way["man_made"="works"]({min_lat},{min_lon},{max_lat},{max_lon});
  node["power"="plant"]({min_lat},{min_lon},{max_lat},{max_lon});
  way["power"="plant"]({min_lat},{min_lon},{max_lat},{max_lon});
);
out center 150 tags;
"""
    headers = {
        "User-Agent": "SIH2026-ThermalClassifier/1.0 (contact: test@hackathon.org)",
        "Content-Type": "application/x-www-form-urlencoded"
    }

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            print(f"Querying Overpass API at {endpoint}...")
            res = requests.post(endpoint, data={"data": query}, headers=headers, timeout=25)
            if res.status_code == 200:
                data = res.json()
                elements = data.get("elements", [])
                print(f"Retrieved {len(elements)} OSM industrial entities from Overpass.")
                return elements
            else:
                print(f"Endpoint {endpoint} returned status {res.status_code}")
        except Exception as e:
            print(f"Overpass query error on {endpoint}: {e}")

    return None


def insert_osm_sites(sites_data):
    """Insert parsed OSM industrial sites into SQLite osm_industrial_sites table."""
    inserted = 0
    skipped = 0

    with get_db() as conn:
        cursor = conn.cursor()
        for site in sites_data:
            osm_id = str(site["osm_id"])
            name = site.get("name") or "Unnamed Industrial Site"
            site_type = site.get("site_type") or "industrial"
            lat = float(site["latitude"])
            lon = float(site["longitude"])
            tags_json = json.dumps(site.get("tags", {}))

            cursor.execute("SELECT id FROM osm_industrial_sites WHERE osm_id = ?", (osm_id,))
            if cursor.fetchone():
                skipped += 1
                continue

            cursor.execute("""
                INSERT INTO osm_industrial_sites (osm_id, name, site_type, latitude, longitude, tags_json)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (osm_id, name, site_type, lat, lon, tags_json))
            inserted += 1

    print(f"Summary: Inserted {inserted} OSM industrial sites ({skipped} skipped).")
    return inserted


def main():
    parser = argparse.ArgumentParser(description="Fetch OSM industrial sites and populate SQLite.")
    parser.add_argument("--benchmark-only", action="store_true", help="Seed curated benchmark industrial catalog")
    args = parser.parse_args()

    init_db()

    # Always seed the ground-truth benchmark industrial catalog first
    print("Inserting known ground-truth industrial complexes for Jamshedpur-Odisha...")
    insert_osm_sites(BENCHMARK_OSM_SITES)

    if not args.benchmark_only:
        print("\nAttempting live Overpass API query for comprehensive regional coverage...")
        elements = fetch_from_overpass()
        if elements:
            parsed_sites = []
            for el in elements:
                el_id = f"{el.get('type', 'node')}/{el.get('id')}"
                tags = el.get("tags", {})
                name = tags.get("name") or tags.get("operator") or tags.get("industrial") or "Industrial Site"
                site_type = tags.get("industrial") or tags.get("landuse") or tags.get("man_made") or tags.get("power") or "industrial"
                
                # Coordinate: node has lat/lon, way/relation has center.lat/center.lon
                lat = el.get("lat") or (el.get("center", {}).get("lat") if el.get("center") else None)
                lon = el.get("lon") or (el.get("center", {}).get("lon") if el.get("center") else None)

                if lat is not None and lon is not None:
                    parsed_sites.append({
                        "osm_id": el_id,
                        "name": name,
                        "site_type": site_type,
                        "latitude": lat,
                        "longitude": lon,
                        "tags": tags
                    })

            if parsed_sites:
                insert_osm_sites(parsed_sites)
        else:
            print("Overpass API query unavailable or timed out; regional benchmark sites are safely saved.")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM osm_industrial_sites")
        cnt = cursor.fetchone()["cnt"]
        print(f"\nTotal OSM industrial sites in database: {cnt}")


if __name__ == "__main__":
    main()
