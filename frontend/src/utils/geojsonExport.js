/**
 * GeoJSON Exporter Utility for IGNITRA
 * Standards-compliant GeoJSON (RFC 7946) FeatureCollection serialization for QGIS/ArcGIS.
 * Coordinates are formatted strictly as [longitude, latitude].
 */

/**
 * Convert an array of cluster objects to a GeoJSON FeatureCollection.
 * @param {Array} clusters - Array of cluster objects from state/API.
 * @param {Object} [options] - Additional metadata options.
 * @returns {Object} Valid GeoJSON FeatureCollection.
 */
export function clustersToGeoJSON(clusters, options = {}) {
  if (!Array.isArray(clusters)) {
    throw new Error("Invalid clusters input: expected an array.");
  }

  const features = clusters.map((c) => {
    const lat = Number(c.centroid_lat);
    const lon = Number(c.centroid_lon);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new Error(`Invalid coordinate bounds in cluster #${c.cluster_id}: [${lat}, ${lon}]`);
    }

    const properties = {
      cluster_id: c.cluster_id,
      classification: c.band_label || "Unknown",
      band_label: c.band_label || "Unknown",
      persistence_score: typeof c.persistence_score === 'number' ? Number(c.persistence_score.toFixed(4)) : 0,
      detection_count: c.detection_count || 0,
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lon.toFixed(5)),
      radius_meters: typeof c.radius_meters === 'number' ? Number(c.radius_meters.toFixed(1)) : 0,
      first_seen: c.first_seen || null,
      last_seen: c.last_seen || null,
      dist_to_nearest_industrial_m: typeof c.dist_to_nearest_industrial === 'number' ? Number(c.dist_to_nearest_industrial.toFixed(1)) : null,
      day_night_ratio: typeof c.day_night_ratio === 'number' ? Number(c.day_night_ratio.toFixed(3)) : null,
      recurrence_count_norm: typeof c.recurrence_count_norm === 'number' ? Number(c.recurrence_count_norm.toFixed(3)) : null,
      regularity_norm: typeof c.regularity_norm === 'number' ? Number(c.regularity_norm.toFixed(3)) : null,
      dist_to_industrial_norm: typeof c.dist_to_industrial_norm === 'number' ? Number(c.dist_to_industrial_norm.toFixed(3)) : null,
      spatial_stability_norm: typeof c.spatial_stability_norm === 'number' ? Number(c.spatial_stability_norm.toFixed(3)) : null,
      frp_trend_norm: typeof c.frp_trend_norm === 'number' ? Number(c.frp_trend_norm.toFixed(3)) : null,
      day_night_ratio_norm: typeof c.day_night_ratio_norm === 'number' ? Number(c.day_night_ratio_norm.toFixed(3)) : null
    };

    return {
      type: "Feature",
      id: c.cluster_id,
      geometry: {
        type: "Point",
        // Strict RFC 7946 standard: [longitude, latitude]
        coordinates: [Number(lon.toFixed(5)), Number(lat.toFixed(5))]
      },
      properties
    };
  });

  return {
    type: "FeatureCollection",
    metadata: {
      project: "IGNITRA",
      system: "AI-Based Thermal Source Intelligence",
      region: "Jamshedpur–Odisha Industrial Corridor",
      generated_at: new Date().toISOString(),
      feature_count: features.length,
      classification_thresholds: {
        persistent: ">=0.70",
        ambiguous: "0.40-0.69",
        transient: "<0.40"
      },
      ...options.metadata
    },
    features
  };
}

/**
 * Trigger browser file download of GeoJSON.
 * @param {Object} geojsonObj - The GeoJSON FeatureCollection.
 * @param {string} filename - Target download filename.
 */
export function downloadGeoJSON(geojsonObj, filename) {
  const jsonStr = JSON.stringify(geojsonObj, null, 2);
  const blob = new Blob([jsonStr], { type: "application/geo+json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
