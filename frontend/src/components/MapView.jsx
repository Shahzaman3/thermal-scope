import React, { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default marker icons in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapRecenter({ targetCoords, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (targetCoords) {
      map.flyTo([targetCoords.lat, targetCoords.lon], zoom || 12, {
        duration: 1.4
      });
    }
  }, [targetCoords, zoom, map]);
  return null;
}

export default function MapView({
  clusters,
  selectedCluster,
  clusterDetail,
  onSelectCluster,
  osmSites,
  showOsmSites,
  flyToTarget
}) {
  const getMarkerColor = (band) => {
    if (band === 'Persistent industrial source') return '#10b981';
    if (band === 'Ambiguous / flagged for review') return '#f59e0b';
    return '#ef4444';
  };

  const getMarkerRadius = (count) => {
    return Math.min(24, Math.max(10, 8 + Math.sqrt(count) * 2.2));
  };

  // Custom icon for OSM Industrial sites
  const osmIcon = L.divIcon({
    className: 'osm-marker-icon',
    html: `<div style="
      width: 12px;
      height: 12px;
      background: #0284c7;
      border: 2px solid #38bdf8;
      transform: rotate(45deg);
      box-shadow: 0 0 8px #38bdf8;
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  const activeFlyTarget = flyToTarget || (selectedCluster ? { lat: selectedCluster.centroid_lat, lon: selectedCluster.centroid_lon } : null);

  return (
    <div className="map-viewport" id="map-viewport">
      <MapContainer
        center={[21.9, 85.6]}
        zoom={8}
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%' }}
      >
        {/* CartoDB Dark Matter Tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          maxZoom={19}
        />

        <MapRecenter targetCoords={activeFlyTarget} zoom={selectedCluster ? 13 : 11} />

        {/* OSM Industrial Sites Reference Layer */}
        {showOsmSites && osmSites.map((site) => (
          <Marker
            key={site.id || site.osm_id}
            position={[site.latitude, site.longitude]}
            icon={osmIcon}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#0284c7' }}>
                🏢 {site.name}
                <div style={{ fontSize: '10px', color: '#64748b' }}>{site.site_type}</div>
              </div>
            </Tooltip>
          </Marker>
        ))}

        {/* Member Raw Hotspots Footprint Overlay (Rendered when cluster is inspected) */}
        {selectedCluster && clusterDetail && clusterDetail.detections && (
          clusterDetail.detections.map((det) => (
            <CircleMarker
              key={`det-${det.id}`}
              center={[det.latitude, det.longitude]}
              radius={Math.max(3, Math.min(7, (det.frp || 10) / 25))}
              pathOptions={{
                color: det.daynight === 'D' ? '#fbbf24' : '#818cf8',
                fillColor: det.daynight === 'D' ? '#fbbf24' : '#818cf8',
                fillOpacity: 0.85,
                weight: 1
              }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={0.9}>
                <div style={{ fontSize: '10px', color: '#0f172a' }}>
                  <b>{det.satellite || 'VIIRS'} Pass</b> | FRP: {det.frp} MW<br />
                  {det.acq_date} {det.acq_time} ({det.daynight === 'D' ? 'Day' : 'Night'})
                </div>
              </Tooltip>
            </CircleMarker>
          ))
        )}

        {/* Hotspot Clusters Layer */}
        {clusters.map((c) => {
          const isSelected = selectedCluster && selectedCluster.cluster_id === c.cluster_id;
          const color = getMarkerColor(c.band_label);
          const radius = getMarkerRadius(c.detection_count);

          return (
            <React.Fragment key={c.cluster_id}>
              {/* Highlight halo when selected */}
              {isSelected && (
                <CircleMarker
                  center={[c.centroid_lat, c.centroid_lon]}
                  radius={radius + 12}
                  pathOptions={{
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.2,
                    weight: 2,
                    dashArray: '4, 4'
                  }}
                />
              )}

              <CircleMarker
                center={[c.centroid_lat, c.centroid_lon]}
                radius={radius}
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: isSelected ? 0.9 : 0.65,
                  weight: isSelected ? 3 : 1.5
                }}
                eventHandlers={{
                  click: () => onSelectCluster(c)
                }}
              >
                <Tooltip direction="top" offset={[0, -radius]} opacity={0.95}>
                  <div style={{ padding: '2px', color: '#0f172a' }}>
                    <div style={{ fontWeight: 800, fontSize: '12px' }}>
                      Cluster #{c.cluster_id}
                    </div>
                    <div style={{ color: color, fontWeight: 700, fontSize: '11px' }}>
                      {c.band_label}
                    </div>
                    <div style={{ fontSize: '11px', color: '#334155', marginTop: '2px' }}>
                      Score: <b>{(c.persistence_score * 100).toFixed(1)}%</b> | Detections: <b>{c.detection_count}</b>
                    </div>
                    {c.dist_to_nearest_industrial !== undefined && (
                      <div style={{ fontSize: '10px', color: '#64748b' }}>
                        Nearest Industry: {(c.dist_to_nearest_industrial / 1000).toFixed(1)} km
                      </div>
                    )}
                  </div>
                </Tooltip>
              </CircleMarker>
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
