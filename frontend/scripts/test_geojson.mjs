import { clustersToGeoJSON } from '../src/utils/geojsonExport.js';
import assert from 'node:assert';

// Mock cluster data representing actual API output
const mockClusters = [
  {
    cluster_id: 1,
    centroid_lat: 22.8015,
    centroid_lon: 86.195,
    persistence_score: 0.945,
    band_label: "Persistent industrial source",
    detection_count: 42,
    radius_meters: 350.5,
    first_seen: "2024-01-01T06:00:00",
    last_seen: "2024-01-31T22:00:00",
    dist_to_nearest_industrial: 120.4,
    day_night_ratio: 0.52,
    recurrence_count_norm: 0.95,
    regularity_norm: 0.9,
    dist_to_industrial_norm: 0.98,
    spatial_stability_norm: 0.88,
    frp_trend_norm: 0.82,
    day_night_ratio_norm: 0.94
  },
  {
    cluster_id: 2,
    centroid_lat: 22.1234,
    centroid_lon: 85.5678,
    persistence_score: 0.25,
    band_label: "Transient fire event",
    detection_count: 3,
    radius_meters: 800.0,
    first_seen: "2024-01-15T02:00:00",
    last_seen: "2024-01-15T14:00:00",
    dist_to_nearest_industrial: 15400.0,
    day_night_ratio: 1.0,
    recurrence_count_norm: 0.1,
    regularity_norm: 0.1,
    dist_to_industrial_norm: 0.05,
    spatial_stability_norm: 0.3,
    frp_trend_norm: 0.4,
    day_night_ratio_norm: 0.2
  }
];

const geojson = clustersToGeoJSON(mockClusters);

// 1. Valid JSON object
assert.strictEqual(typeof geojson, 'object');

// 2. Type is FeatureCollection
assert.strictEqual(geojson.type, 'FeatureCollection');

// 3. Metadata exists and is accurate
assert.strictEqual(geojson.metadata.project, 'SIH26162');
assert.strictEqual(geojson.metadata.feature_count, 2);

// 4. Features array matches length
assert.strictEqual(geojson.features.length, 2);

// 5. Each feature has type Feature and Point geometry
geojson.features.forEach((f, idx) => {
  assert.strictEqual(f.type, 'Feature');
  assert.strictEqual(f.geometry.type, 'Point');
  
  // Coordinates must be [longitude, latitude]
  const [lon, lat] = f.geometry.coordinates;
  assert.strictEqual(typeof lon, 'number');
  assert.strictEqual(typeof lat, 'number');
  assert(lon >= -180 && lon <= 180, 'Longitude out of bounds');
  assert(lat >= -90 && lat <= 90, 'Latitude out of bounds');
  assert.strictEqual(lon, mockClusters[idx].centroid_lon);
  assert.strictEqual(lat, mockClusters[idx].centroid_lat);

  // Properties validation
  assert.strictEqual(f.properties.cluster_id, mockClusters[idx].cluster_id);
  assert.strictEqual(f.properties.classification, mockClusters[idx].band_label);
  assert.strictEqual(f.properties.persistence_score, mockClusters[idx].persistence_score);
});

console.log("All GeoJSON serialization and RFC 7946 checks PASSED!");
