import React, { useState } from 'react';
import { X, Flame, Factory, AlertTriangle, ShieldCheck, MapPin, BarChart2, Radio, Download, Activity, ExternalLink } from 'lucide-react';

function FrpTimeSeriesChart({ detections, band }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (!detections || detections.length === 0) {
    return <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '12px' }}>No temporal pass data available.</div>;
  }

  // Sort detections chronologically
  const sorted = [...detections].sort((a, b) => new Date(a.acq_datetime) - new Date(b.acq_datetime));
  const frpValues = sorted.map(d => parseFloat(d.frp || 0));
  const maxFrp = Math.max(...frpValues, 20);
  const minFrp = 0;
  const avgFrp = frpValues.reduce((a, b) => a + b, 0) / (frpValues.length || 1);

  // SVG dimensions
  const width = 380;
  const height = 110;
  const padX = 24;
  const padY = 16;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  // Compute point coordinates
  const points = sorted.map((d, i) => {
    const x = sorted.length === 1 ? padX + chartW / 2 : padX + (i / (sorted.length - 1)) * chartW;
    const y = padY + chartH - ((parseFloat(d.frp || 0) - minFrp) / (maxFrp - minFrp || 1)) * chartH;
    return { x, y, d };
  });

  const pathD = points.length > 1
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    : '';

  const areaD = points.length > 1
    ? `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height - padY} L ${points[0].x.toFixed(1)} ${height - padY} Z`
    : '';

  const strokeColor = band === 'Persistent industrial source' ? '#10b981' : (band === 'Ambiguous / flagged for review' ? '#f59e0b' : '#ef4444');
  const avgY = padY + chartH - ((avgFrp - minFrp) / (maxFrp - minFrp || 1)) * chartH;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '11px' }}>
        <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Activity size={12} /> FRP Emission Curve ({sorted.length} passes)
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', color: '#fff', fontSize: '10px' }}>
          Avg: <b style={{ color: strokeColor }}>{avgFrp.toFixed(1)} MW</b> | Max: {maxFrp.toFixed(1)} MW
        </span>
      </div>

      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '8px' }}>
        <defs>
          <linearGradient id="areaGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 2" />
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="rgba(255,255,255,0.08)" />

        {/* Average FRP baseline */}
        <line x1={padX} y1={avgY} x2={width - padX} y2={avgY} stroke={strokeColor} strokeOpacity="0.4" strokeDasharray="3 3" />

        {/* Area fill */}
        {areaD && <path d={areaD} fill="url(#areaGlow)" />}

        {/* Line */}
        {pathD && <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2" />}

        {/* Circles */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoveredPoint === i ? 5 : (sorted.length > 30 ? 2.5 : 3.5)}
            fill={p.d.daynight === 'D' ? '#fbbf24' : '#818cf8'}
            stroke="#0f172a"
            strokeWidth="1"
            style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
            onMouseEnter={() => setHoveredPoint(i)}
            onMouseLeave={() => setHoveredPoint(null)}
          />
        ))}
      </svg>

      {/* Point Hover Tooltip */}
      {hoveredPoint !== null && points[hoveredPoint] && (
        <div style={{
          position: 'absolute',
          top: '28px',
          left: `${Math.min(240, Math.max(10, points[hoveredPoint].x - 50))}px`,
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid var(--border-active)',
          borderRadius: '6px',
          padding: '4px 8px',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          color: '#fff',
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          zIndex: 20
        }}>
          <div>FRP: <b>{points[hoveredPoint].d.frp} MW</b></div>
          <div style={{ color: 'var(--text-muted)' }}>{points[hoveredPoint].d.acq_date} {points[hoveredPoint].d.acq_time} ({points[hoveredPoint].d.daynight === 'D' ? 'Day' : 'Night'})</div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px', padding: '0 4px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span><span style={{ color: '#fbbf24' }}>●</span> Day Pass</span>
          <span><span style={{ color: '#818cf8' }}>●</span> Night Pass</span>
        </div>
        <span>{sorted[0]?.acq_date} → {sorted[sorted.length - 1]?.acq_date}</span>
      </div>
    </div>
  );
}

export default function ClusterDetailsPanel({ detail, onClose, loading }) {
  const [activeTab, setActiveTab] = useState('features'); // 'features' | 'detections'

  if (loading) {
    return (
      <div className="inspector-panel">
        <div className="panel-header">
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading cluster telemetry...</div>
          <button className="close-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Fetching offline SQLite feature vector...
        </div>
      </div>
    );
  }

  if (!detail || !detail.cluster) {
    return null;
  }

  const { cluster, classification, features, detections, closest_industrial_sites } = detail;
  const score = classification ? classification.persistence_score : 0;
  const band = classification ? classification.band_label : 'Unknown';

  const getBandClass = () => {
    if (band === 'Persistent industrial source') return 'persistent';
    if (band === 'Ambiguous / flagged for review') return 'ambiguous';
    return 'transient';
  };

  const getBandIcon = () => {
    if (band === 'Persistent industrial source') return <Factory size={16} />;
    if (band === 'Ambiguous / flagged for review') return <AlertTriangle size={16} />;
    return <Flame size={16} />;
  };

  const getBarColor = (val) => {
    if (val >= 0.7) return '#10b981';
    if (val >= 0.4) return '#f59e0b';
    return '#ef4444';
  };

  const handleExportJson = () => {
    const reportData = {
      project: "SIH 2026 - Problem Statement SIH26162",
      theme: "NTRO Space Technology",
      dossier_type: "Hotspot Cluster Inspection Dossier",
      generated_at: new Date().toISOString(),
      cluster_id: cluster.cluster_id,
      classification: {
        persistence_score: score,
        band_label: band,
        confidence_gate: "PASSED"
      },
      coordinates: {
        centroid_lat: cluster.centroid_lat,
        centroid_lon: cluster.centroid_lon,
        radius_meters: cluster.radius_meters
      },
      temporal_span: {
        detection_count: cluster.detection_count,
        first_seen: cluster.first_seen,
        last_seen: cluster.last_seen
      },
      feature_vector_evaluation: features,
      closest_industrial_infrastructure: closest_industrial_sites,
      satellite_detections: detections
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NTRO_Cluster_${cluster.cluster_id}_Dossier.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const featureConfigs = [
    {
      key: 'recurrence_count',
      name: 'Recurrence Count',
      weight: '25%',
      raw: `${features?.recurrence_count ?? cluster.detection_count} detections`,
      norm: features?.recurrence_count_norm ?? 0,
      desc: 'Count of thermal anomalies across time window'
    },
    {
      key: 'recurrence_regularity',
      name: 'Recurrence Regularity',
      weight: '20%',
      raw: `CV = ${(features?.recurrence_regularity ?? 0).toFixed(2)}`,
      norm: features?.regularity_norm ?? 0,
      desc: 'Coefficient of variation of time-gaps (low CV = periodic/industrial)'
    },
    {
      key: 'dist_to_nearest_industrial',
      name: 'Industrial Proximity',
      weight: '20%',
      raw: `${((features?.dist_to_nearest_industrial ?? 0) / 1000).toFixed(2)} km`,
      norm: features?.dist_to_industrial_norm ?? 0,
      desc: 'Distance to nearest OSM industrial entity (closer = higher score)'
    },
    {
      key: 'spatial_stability',
      name: 'Spatial Stability',
      weight: '15%',
      raw: `Spread σ = ${(features?.spatial_stability ?? 0).toFixed(1)}m`,
      norm: features?.spatial_stability_norm ?? 0,
      desc: 'Standard deviation of coordinates (tight centroid footprint)'
    },
    {
      key: 'frp_trend',
      name: 'FRP Stability Trend',
      weight: '10%',
      raw: `Slope = ${(features?.frp_trend ?? 0).toFixed(3)} MW/hr`,
      norm: features?.frp_trend_norm ?? 0,
      desc: 'Slope of Fire Radiative Power (flat slope = steady furnace/flare)'
    },
    {
      key: 'day_night_ratio',
      name: 'Day / Night Balance',
      weight: '10%',
      raw: `${Math.round((features?.day_night_ratio ?? 0) * 100)}% Day / ${Math.round((1 - (features?.day_night_ratio ?? 0)) * 100)}% Night`,
      norm: features?.day_night_ratio_norm ?? 0,
      desc: '24/7 industrial plants emit both day & night (~0.5 ratio)'
    }
  ];

  return (
    <div className="inspector-panel" id="cluster-inspector-panel">
      {/* Header */}
      <div className="panel-header">
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            NTRO CLUSTER INSPECTOR
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Cluster #{cluster.cluster_id}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="close-btn" onClick={handleExportJson} title="Export NTRO Dossier (JSON)">
            <Download size={15} />
          </button>
          <button className="close-btn" onClick={onClose} title="Close Panel">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="panel-content">
        {/* Score & Band Hero */}
        <div className={`score-hero ${getBandClass()}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={`band-pill ${getBandClass()}`}>
              {getBandIcon()} {band}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              WEIGHTED SCORE
            </span>
          </div>

          <div className="score-display-row">
            <span className="score-number" style={{ color: getBarColor(score) }}>
              {(score * 100).toFixed(1)}%
            </span>
            <span className="score-scale">/ 100% (raw {score.toFixed(4)})</span>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {band === 'Persistent industrial source' && 'Detections exhibit persistent 24/7 periodicity, tight spatial footprint, and direct overlap with registered industrial infrastructure.'}
            {band === 'Ambiguous / flagged for review' && 'Intermediate persistence profile. Possible intermittent furnace flaring, mining operations, or multi-day localized burns.'}
            {band === 'Transient fire event' && 'Isolated thermal anomaly characterized by rapid temporal decay and wide separation from industrial infrastructure (wildfire/agricultural burn).'}
          </div>

          {/* Temporal FRP Curve embedded directly into the hero card */}
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <FrpTimeSeriesChart detections={detections} band={band} />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
          <button
            onClick={() => setActiveTab('features')}
            className={`filter-btn ${activeTab === 'features' ? 'active' : ''}`}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <BarChart2 size={14} /> 6-Feature Math Vector
          </button>
          <button
            onClick={() => setActiveTab('detections')}
            className={`filter-btn ${activeTab === 'detections' ? 'active' : ''}`}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <Radio size={14} /> Raw Passes ({detections?.length || 0})
          </button>
        </div>

        {/* Tab 1: Feature Vector */}
        {activeTab === 'features' && (
          <>
            {/* Cluster Telemetry Card */}
            <div className="info-card">
              <div className="info-card-title">
                <MapPin size={14} /> Spatial & Temporal Coordinates
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Centroid Lat / Lon</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {cluster.centroid_lat.toFixed(4)}°N, {cluster.centroid_lon.toFixed(4)}°E
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Cluster Radius Footprint</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {(cluster.radius_meters || 0).toFixed(0)} meters
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>First Detection</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                    {cluster.first_seen ? cluster.first_seen.replace('T', ' ') : 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Last Detection</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                    {cluster.last_seen ? cluster.last_seen.replace('T', ' ') : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Mathematical Feature Breakdown */}
            <div className="info-card">
              <div className="info-card-title">
                <ShieldCheck size={14} /> Feature-by-Feature Evaluation
              </div>
              <div className="feature-list">
                {featureConfigs.map((f) => (
                  <div key={f.key} className="feature-item">
                    <div className="feature-header">
                      <div className="feature-name">
                        <span>{f.name}</span>
                        <span className="feature-weight-tag">{f.weight}</span>
                      </div>
                      <div className="feature-values">
                        <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>{f.raw}</span>
                        <b style={{ color: getBarColor(f.norm) }}>{(f.norm * 100).toFixed(0)}%</b>
                      </div>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(100, Math.max(2, f.norm * 100))}%`,
                          backgroundColor: getBarColor(f.norm)
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {f.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Closest Industrial Landmark */}
            {closest_industrial_sites && closest_industrial_sites.length > 0 && (
              <div className="info-card">
                <div className="info-card-title">
                  <Factory size={14} /> Proximity to OSM Industrial Sites
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {closest_industrial_sites.map((site, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '12px'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{site.name}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{site.site_type}</div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: site.distance_meters < 1000 ? '#10b981' : '#94a3b8' }}>
                        {site.distance_meters < 1000 ? `${site.distance_meters.toFixed(0)} m` : `${(site.distance_meters / 1000).toFixed(1)} km`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Tab 2: Raw Satellite Detections Table */}
        {activeTab === 'detections' && (
          <div className="info-card" style={{ padding: '8px' }}>
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '6px' }}>Date/Time</th>
                    <th style={{ padding: '6px' }}>Sensor</th>
                    <th style={{ padding: '6px' }}>FRP (MW)</th>
                    <th style={{ padding: '6px' }}>Pass</th>
                    <th style={{ padding: '6px' }}>Conf</th>
                  </tr>
                </thead>
                <tbody>
                  {detections && detections.map((d) => (
                    <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '6px', color: '#fff' }}>
                        {d.acq_date} {d.acq_time}
                      </td>
                      <td style={{ padding: '6px', color: 'var(--text-secondary)' }}>
                        {d.satellite || 'VIIRS'}
                      </td>
                      <td style={{ padding: '6px', fontWeight: 700, color: '#f59e0b' }}>
                        {d.frp ? d.frp.toFixed(1) : '-'}
                      </td>
                      <td style={{ padding: '6px' }}>
                        <span style={{
                          padding: '1px 4px',
                          borderRadius: '3px',
                          fontSize: '9px',
                          background: d.daynight === 'D' ? 'rgba(245,158,11,0.2)' : 'rgba(99,102,241,0.2)',
                          color: d.daynight === 'D' ? '#fbbf24' : '#a5b4fc'
                        }}>
                          {d.daynight === 'D' ? 'DAY' : 'NIGHT'}
                        </span>
                      </td>
                      <td style={{ padding: '6px', color: 'var(--text-muted)' }}>
                        {d.confidence || 'nom'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
