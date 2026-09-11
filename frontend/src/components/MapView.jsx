import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Satellite } from 'lucide-react';
import MapLegend from './MapLegend';

// Localized Leaflet default marker icons (offline-first, zero CDN dependency)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/images/marker-icon-2x.png',
  iconUrl: '/images/marker-icon.png',
  shadowUrl: '/images/marker-shadow.png',
});

function MapRecenter({ targetCoords, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (targetCoords) {
      map.flyTo([targetCoords.lat, targetCoords.lon], zoom || 12, {
        duration: 1.2
      });
    }
  }, [targetCoords, zoom, map]);
  return null;
}

function MapResizer() {
  const map = useMap();

  useEffect(() => {
    // Expose for inspection & debugging
    window._leaflet_map = map;

    // Invalidate size immediately
    map.invalidateSize({ pan: false });

    // Staggered invalidations to account for CSS/layout stabilization
    const timer1 = setTimeout(() => {
      map.invalidateSize({ pan: false });
    }, 100);

    const timer2 = setTimeout(() => {
      map.invalidateSize({ pan: false });
    }, 400);

    // Native ResizeObserver on container
    const container = map.getContainer();
    if (!container || typeof ResizeObserver === 'undefined') {
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }

    let resizeTimer = null;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            map.invalidateSize({ pan: false });
          }, 50);
        }
      }
    });

    observer.observe(container);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [map]);

  return null;
}


const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY;

// Basemap definitions: Authenticated CARTO + Keyless ESRI / OSM / Offline Grid
const BASEMAP_OPTIONS = {
  ...(CARTO_KEY ? {
    carto_dark: {
      id: 'carto_dark',
      name: 'CARTO Dark Matter (Authenticated)',
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_KEY}`,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 20,
      className: 'carto-dark-tiles'
    }
  } : {}),
  esri_dark: {
    id: 'esri_dark',
    name: 'ESRI Dark Gray (Keyless)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxNativeZoom: 16,
    maxZoom: 19,
    className: 'esri-dark-tiles'
  },
  osm_tactical: {
    id: 'osm_tactical',
    name: 'Tactical OpenStreetMap (Keyless)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    className: 'tactical-osm-tiles'
  },
  offline_grid: {
    id: 'offline_grid',
    name: 'Offline Tactical Grid (0 Network)',
    url: null,
    attribution: 'Offline Tactical Coordinate System • IGNITRA',
    className: 'offline-grid-tiles'
  }
};

export default function MapView({
  clusters,
  selectedCluster,
  clusterDetail,
  onSelectCluster,
  osmSites,
  showOsmSites,
  onToggleOsmSites,
  flyToTarget,
  changeData,
  showChangeLayer = true,
  onToggleChangeLayer,
  selectedChange,
  onSelectChange
}) {
  const [selectedBasemap, setSelectedBasemap] = useState(CARTO_KEY ? 'carto_dark' : 'esri_dark');
  const [tileOffline, setTileOffline] = useState(false);

  const activeBasemap = BASEMAP_OPTIONS[selectedBasemap] || (CARTO_KEY ? BASEMAP_OPTIONS.carto_dark : BASEMAP_OPTIONS.esri_dark) || BASEMAP_OPTIONS.esri_dark;

  const handleTileError = () => {
    // Graceful fallback chain: carto_dark -> esri_dark -> osm_tactical -> offline_grid
    if (selectedBasemap === 'carto_dark') {
      setSelectedBasemap('esri_dark');
    } else if (selectedBasemap === 'esri_dark') {
      setSelectedBasemap('osm_tactical');
    } else {
      setSelectedBasemap('offline_grid');
      setTileOffline(true);
    }
  };

  const getMarkerColor = (band) => {
    if (band === 'Persistent industrial source') return '#10b981';
    if (band === 'Ambiguous / flagged for review') return '#f59e0b';
    return '#ef4444';
  };

  const getMarkerRadius = (count) => {
    return Math.min(22, Math.max(9, 7 + Math.sqrt(count) * 2.0));
  };

  // Custom diamond icon for OSM Industrial sites
  const osmIcon = L.divIcon({
    className: 'osm-marker-icon',
    html: `<div class="osm-diamond-pin" title="OSM Industrial Infrastructure"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  const activeFlyTarget = flyToTarget || (selectedChange && selectedChange.lat && selectedChange.lon
    ? { lat: selectedChange.lat, lon: selectedChange.lon }
    : (selectedCluster ? { lat: selectedCluster.centroid_lat, lon: selectedCluster.centroid_lon } : null));

  return (
    <div className={`map-viewport ${selectedBasemap === 'offline_grid' || tileOffline ? 'is-offline' : ''}`} id="map-viewport">
      <MapContainer
        center={[21.9, 85.6]}
        zoom={8}
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%' }}
        className={selectedBasemap === 'offline_grid' ? 'offline-mode' : ''}
      >
        {/* Keyless, watermark-free basemap with automatic offline fallback */}
        {activeBasemap.url && (
          <TileLayer
            key={activeBasemap.id}
            attribution={activeBasemap.attribution}
            url={activeBasemap.url}
            subdomains={activeBasemap.subdomains || 'abc'}
            maxNativeZoom={activeBasemap.maxNativeZoom || 19}
            maxZoom={activeBasemap.maxZoom || 19}
            className={activeBasemap.className}
            eventHandlers={{
              tileerror: handleTileError
            }}
          />
        )}

        <MapRecenter targetCoords={activeFlyTarget} zoom={selectedCluster ? 13 : 11} />
        <MapResizer />


        {/* OSM Industrial Sites Reference Layer */}
        {showOsmSites && osmSites.map((site) => (
          <Marker
            key={site.id || site.osm_id}
            position={[site.latitude, site.longitude]}
            icon={osmIcon}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={0.96}>
              <div className="tactical-tooltip osm-tooltip">
                <div className="tooltip-badge">REGISTERED INDUSTRIAL SITE</div>
                <div className="tooltip-title">{site.name}</div>
                <div className="tooltip-sub">Type: {site.site_type || 'industrial entity'}</div>
                <div className="tooltip-coords">
                  {site.latitude.toFixed(4)}°N, {site.longitude.toFixed(4)}°E
                </div>
              </div>
            </Tooltip>
          </Marker>
        ))}

        {/* Raw Member Detections Overlay (active when cluster inspected) */}
        {selectedCluster && clusterDetail && clusterDetail.detections && (
          clusterDetail.detections.map((det) => (
            <CircleMarker
              key={`det-${det.id}`}
              center={[det.latitude, det.longitude]}
              radius={Math.max(3.5, Math.min(8, (det.frp || 10) / 22))}
              pathOptions={{
                color: det.daynight === 'D' ? '#fbbf24' : '#818cf8',
                fillColor: det.daynight === 'D' ? '#fbbf24' : '#818cf8',
                fillOpacity: 0.9,
                weight: 1.5
              }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={0.92}>
                <div className="tactical-tooltip detection-tooltip">
                  <div className="tooltip-badge">SATELLITE PASS • {det.satellite || 'VIIRS'}</div>
                  <div className="tooltip-title">FRP: <b>{det.frp ? `${det.frp} MW` : 'N/A'}</b></div>
                  <div className="tooltip-sub">
                    {det.acq_date} {det.acq_time} UTC • {det.daynight === 'D' ? 'Day pass' : 'Night pass'}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          ))
        )}

        {/* Classified Hotspot Clusters Layer */}
        {clusters.map((c) => {
          const isSelected = selectedCluster && selectedCluster.cluster_id === c.cluster_id;
          const color = getMarkerColor(c.band_label);
          const radius = getMarkerRadius(c.detection_count);
          const isPersistent = c.band_label === 'Persistent industrial source';
          const isAmbiguous = c.band_label === 'Ambiguous / flagged for review';

          return (
            <React.Fragment key={c.cluster_id}>
              {/* Outer Selection Halo */}
              {isSelected && (
                <CircleMarker
                  center={[c.centroid_lat, c.centroid_lon]}
                  radius={radius + 12}
                  pathOptions={{
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.18,
                    weight: 2,
                    dashArray: '4, 4'
                  }}
                />
              )}

              {/* Main Cluster Marker */}
              <CircleMarker
                center={[c.centroid_lat, c.centroid_lon]}
                radius={radius}
                pathOptions={{
                  color: isSelected ? '#ffffff' : color,
                  fillColor: color,
                  fillOpacity: isSelected ? 0.95 : 0.72,
                  weight: isSelected ? 3 : 1.5
                }}
                eventHandlers={{
                  click: () => onSelectCluster(c)
                }}
              >
                <Tooltip direction="top" offset={[0, -radius - 2]} opacity={0.98}>
                  <div className="tactical-tooltip cluster-tooltip">
                    <div className="tooltip-header-row">
                      <span className="tooltip-cluster-id">CLUSTER #{c.cluster_id}</span>
                      <span
                        className="tooltip-band-pill"
                        style={{
                          backgroundColor: `${color}25`,
                          color: color,
                          borderColor: `${color}60`
                        }}
                      >
                        {isPersistent ? 'PERSISTENT' : (isAmbiguous ? 'REVIEW' : 'TRANSIENT')}
                      </span>
                    </div>

                    <div className="tooltip-score-row">
                      <span className="tooltip-score-label">Persistence:</span>
                      <b className="tooltip-score-value" style={{ color }}>
                        {(c.persistence_score * 100).toFixed(1)}%
                      </b>
                      <span className="tooltip-count-badge">
                        {c.detection_count} passes
                      </span>
                    </div>

                    {c.dist_to_nearest_industrial !== undefined && (
                      <div className="tooltip-proximity">
                        Nearest Facility: <b>{(c.dist_to_nearest_industrial / 1000).toFixed(1)} km</b>
                      </div>
                    )}
                    <div className="tooltip-instruction">Click cluster to inspect 6-feature vector</div>
                  </div>
                </Tooltip>
              </CircleMarker>
            </React.Fragment>
          );
        })}

        {/* Phase 4C.2: Dedicated Change Detection Map Layer */}
        {showChangeLayer && changeData && (
          <>
            {/* 1. Emerging / New Thermal Sources */}
            {Array.isArray(changeData.emerging_sources) && changeData.emerging_sources.map((item, idx) => {
              const isSelected = selectedChange && (selectedChange.uid === `emerging-${item.detection_id || idx}` || selectedChange.raw?.detection_id === item.detection_id);
              return (
                <React.Fragment key={`emerging-${item.detection_id || idx}`}>
                  {/* Outer static accent ring */}
                  <CircleMarker
                    center={[item.latitude, item.longitude]}
                    radius={isSelected ? 18 : 14}
                    pathOptions={{
                      color: '#38bdf8',
                      fillColor: '#38bdf8',
                      fillOpacity: isSelected ? 0.25 : 0.12,
                      weight: isSelected ? 2.5 : 1.5,
                      dashArray: '3, 3'
                    }}
                  />
                  {/* Emerging core marker */}
                  <CircleMarker
                    center={[item.latitude, item.longitude]}
                    radius={isSelected ? 8 : 6}
                    pathOptions={{
                      color: isSelected ? '#ffffff' : '#38bdf8',
                      fillColor: '#0284c7',
                      fillOpacity: 0.95,
                      weight: isSelected ? 2.5 : 1.5
                    }}
                    eventHandlers={{
                      click: () => onSelectChange && onSelectChange({
                        uid: `emerging-${item.detection_id || idx}`,
                        category: 'EMERGING',
                        categoryLabel: 'Emerging Source',
                        targetId: `Detection #${item.detection_id}`,
                        clusterId: null,
                        lat: item.latitude,
                        lon: item.longitude,
                        frp: item.frp,
                        confidence: item.confidence,
                        satellite: item.satellite,
                        acq_datetime: item.acq_datetime,
                        dist_to_cluster: item.dist_to_nearest_cluster_meters,
                        nearest_cluster_id: item.nearest_cluster_id,
                        reason: `Detected ${(item.dist_to_nearest_cluster_meters / 1000).toFixed(1)} km from nearest cluster footprint`,
                        badgeColor: '#38bdf8',
                        raw: item
                      })
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -10]} opacity={0.98}>
                      <div className="tactical-tooltip change-tooltip">
                        <div className="tooltip-header-row">
                          <span className="tooltip-badge" style={{ color: '#38bdf8' }}>CHANGE • EMERGING SOURCE</span>
                          <span className="tooltip-band-pill" style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>NEW</span>
                        </div>
                        <div className="tooltip-title">Detection #{item.detection_id}</div>
                        <div className="tooltip-sub">
                          FRP: <b>{item.frp?.toFixed(1) || 'N/A'} MW</b> • {item.satellite || 'VIIRS'} ({item.confidence || 'verified'})
                        </div>
                        <div className="tooltip-coords">
                          Observed: <b>{item.acq_datetime || 'recent'}</b>
                        </div>
                        <div className="tooltip-proximity">
                          Distance: <b>{(item.dist_to_nearest_cluster_meters / 1000).toFixed(1)} km</b> to nearest cluster
                        </div>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                </React.Fragment>
              );
            })}

            {/* 2. Flagged Transition Accent Rings around Clusters */}
            {Array.isArray(changeData.flagged_transitions) && changeData.flagged_transitions.map((item) => {
              const isSelected = selectedChange && (selectedChange.uid === `transition-${item.cluster_id}` || selectedChange.clusterId === item.cluster_id);
              let ringColor = '#f97316';
              let ringLabel = 'HIGH FRP VARIANCE';
              if (item.is_borderline && item.high_variance) {
                ringColor = '#c084fc';
                ringLabel = 'BORDERLINE & HIGH VARIANCE';
              } else if (item.is_borderline) {
                ringColor = '#f59e0b';
                ringLabel = 'BORDERLINE SCORE';
              }

              return (
                <CircleMarker
                  key={`trans-ring-${item.cluster_id}`}
                  center={[item.centroid_lat, item.centroid_lon]}
                  radius={isSelected ? 26 : 21}
                  pathOptions={{
                    color: ringColor,
                    fillColor: ringColor,
                    fillOpacity: isSelected ? 0.22 : 0.08,
                    weight: isSelected ? 2.5 : 1.5,
                    dashArray: item.is_borderline ? '4, 4' : undefined
                  }}
                  eventHandlers={{
                    click: () => onSelectChange && onSelectChange({
                      uid: `transition-${item.cluster_id}`,
                      category: item.is_borderline && item.high_variance ? 'BORDERLINE_AND_VARIANCE' : (item.is_borderline ? 'BORDERLINE' : 'HIGH_VARIANCE'),
                      categoryLabel: ringLabel,
                      targetId: `Cluster #${item.cluster_id}`,
                      clusterId: item.cluster_id,
                      lat: item.centroid_lat,
                      lon: item.centroid_lon,
                      persistenceScore: item.persistence_score,
                      bandLabel: item.band_label,
                      isBorderline: item.is_borderline,
                      highVariance: item.high_variance,
                      reason: item.reason || (item.is_borderline ? 'Borderline persistence score near boundary' : 'High FRP trend fluctuation'),
                      badgeColor: ringColor,
                      raw: item
                    })
                  }}
                >
                  <Tooltip direction="bottom" offset={[0, 10]} opacity={0.98}>
                    <div className="tactical-tooltip change-tooltip">
                      <div className="tooltip-header-row">
                        <span className="tooltip-badge" style={{ color: ringColor }}>CHANGE • {ringLabel}</span>
                      </div>
                      <div className="tooltip-title">Cluster #{item.cluster_id}</div>
                      <div className="tooltip-sub">
                        Persistence: <b>{(item.persistence_score * 100).toFixed(1)}%</b> ({item.band_label})
                      </div>
                      <div className="tooltip-proximity">{item.reason}</div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </>
        )}
      </MapContainer>

      {/* Floating Tactical Map Legend */}
      <MapLegend
        showOsmSites={showOsmSites}
        onToggleOsmSites={onToggleOsmSites}
        totalClustersCount={clusters.length}
        osmSitesCount={osmSites.length}
        selectedBasemap={selectedBasemap}
        onSelectBasemap={(bm) => {
          setSelectedBasemap(bm);
          if (bm !== 'offline_grid') setTileOffline(false);
        }}
        basemapOptions={BASEMAP_OPTIONS}
        showChangeLayer={showChangeLayer}
        onToggleChangeLayer={onToggleChangeLayer}
      />

      {/* Offline Tactical Fallback Status Indicator */}
      {(tileOffline || selectedBasemap === 'offline_grid') && (
        <div className="offline-tactical-banner" role="alert">
          <Satellite size={14} className="banner-icon-svg" />
          <div className="banner-text">
            <b>Offline Coordinate Grid:</b> Zero-network mode • Hotspot clusters &amp; industrial facilities operational
          </div>
          {tileOffline && (
            <button
              type="button"
              className="offline-reconnect-btn"
              onClick={() => {
                setTileOffline(false);
                setSelectedBasemap('esri_dark');
              }}
            >
              Retry Online
            </button>
          )}
        </div>
      )}
    </div>
  );
}
