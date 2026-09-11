import React, { useState } from 'react';
import {
  Crosshair,
  Printer,
  Download,
  FileCode,
  X,
  Layers,
  Clock,
  Radio,
  CheckCircle2,
  MapPin,
  Scale,
  Building2
} from 'lucide-react';
import HistoricalThermalAnalysis from './HistoricalThermalAnalysis';

/**
 * Tactical FRP Time Series Chart
 * Clean axis lines, threshold markers, and hover feedback.
 */
function FrpTimeSeriesChart({ detections, band }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (!detections || detections.length === 0) {
    return (
      <div className="chart-empty-state">
        No chronological satellite detections recorded for this cluster.
      </div>
    );
  }

  // Sort detections chronologically
  const sorted = [...detections].sort((a, b) => new Date(a.acq_datetime) - new Date(b.acq_datetime));
  const frpValues = sorted.map(d => parseFloat(d.frp || 0));
  const maxFrp = Math.max(...frpValues, 20);
  const minFrp = 0;
  const avgFrp = frpValues.reduce((a, b) => a + b, 0) / (frpValues.length || 1);

  // SVG dimensions
  const width = 400;
  const height = 110;
  const padX = 28;
  const padY = 14;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  // Compute coordinates
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
    <div className="frp-chart-container">
      <div className="chart-header-row">
        <div>
          <div className="chart-main-title">Observed FRP Chronology</div>
          <div className="chart-subtitle">Fire Radiative Power (MW) across {sorted.length} satellite passes</div>
        </div>
        <div className="chart-stat-pill">
          <span>Mean: <b style={{ color: strokeColor }}>{avgFrp.toFixed(1)} MW</b></span>
          <span className="pill-dot">•</span>
          <span>Peak: <b>{maxFrp.toFixed(1)} MW</b></span>
        </div>
      </div>

      <div className="chart-svg-wrapper">
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="frp-svg" role="img" aria-label="FRP Emission Time Series Chart">
          <defs>
            <linearGradient id="frpAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Upper reference grid line */}
          <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          {/* Baseline grid line */}
          <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="rgba(255,255,255,0.12)" />

          {/* Mean reference line */}
          <line x1={padX} y1={avgY} x2={width - padX} y2={avgY} stroke={strokeColor} strokeOpacity="0.45" strokeDasharray="3 3" />
          <text x={padX + 2} y={Math.max(9, avgY - 3)} fill={strokeColor} fontSize="8" fontFamily="var(--font-mono)" opacity="0.8">
            MEAN {avgFrp.toFixed(1)} MW
          </text>

          {/* Area fill */}
          {areaD && <path d={areaD} fill="url(#frpAreaGrad)" />}

          {/* Smooth line */}
          {pathD && <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}

          {/* Data Points */}
          {points.map((p, i) => {
            const isDay = p.d.daynight === 'D';
            const isHovered = hoveredPoint === i;
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={isHovered ? 4.5 : 2.5}
                fill={isDay ? '#fbbf24' : '#818cf8'}
                stroke="#090d16"
                strokeWidth={isHovered ? 1.5 : 1}
                className="chart-dot"
                onMouseEnter={() => setHoveredPoint(i)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            );
          })}
        </svg>

        {/* Hover Tooltip */}
        {hoveredPoint !== null && points[hoveredPoint] && (
          <div
            className="chart-hover-tip"
            style={{
              left: `${Math.min(width - 120, Math.max(10, points[hoveredPoint].x - 50))}px`,
              top: `${Math.max(2, points[hoveredPoint].y - 42)}px`
            }}
          >
            <div><b>{points[hoveredPoint].d.frp || 0} MW</b> ({points[hoveredPoint].d.daynight === 'D' ? 'Day' : 'Night'})</div>
            <div>{points[hoveredPoint].d.acq_date} {points[hoveredPoint].d.acq_time || ''}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Cluster Assessment Panel — Professional GIS Intelligence Workstation
 * Decision-support view providing scientific evidence, 6-feature formulation breakdown,
 * and contextual analysis for human analysts.
 */
export default function ClusterDetailsPanel({
  detail,
  onClose,
  loading,
  onFlyTo,
  onOpenPrintDossier,
  onExportSingleGeoJson
}) {
  const [activeTab, setActiveTab] = useState('features'); // 'features' | 'temporal' | 'detections'

  if (loading) {
    return (
      <aside className="inspector-panel is-loading" aria-label="Loading Cluster Assessment">
        <div className="panel-loading-state">
          <div className="loading-spinner-ring" />
          <div className="loading-label">Retrieving cluster assessment telemetry...</div>
        </div>
      </aside>
    );
  }

  if (!detail || !detail.cluster) {
    return null;
  }

  const { cluster, classification, features, closest_industrial_sites, detections } = detail;
  const score = classification ? classification.persistence_score : 0;
  const band = classification ? classification.band_label : 'Unknown';

  const isPersistent = band === 'Persistent industrial source';
  const isAmbiguous = band === 'Ambiguous / flagged for review';

  const getBarColor = (val) => {
    if (val >= 0.70) return '#10b981';
    if (val >= 0.40) return '#f59e0b';
    return '#ef4444';
  };

  const getBandClass = () => {
    if (isPersistent) return 'persistent';
    if (isAmbiguous) return 'ambiguous';
    return 'transient';
  };

  // Export full cluster intelligence dossier as JSON
  const handleExportJson = () => {
    const reportData = {
      assessment_type: "Satellite Thermal Anomaly Cluster Assessment",
      cluster_id: cluster.cluster_id,
      classification: {
        persistence_score: score,
        band_label: band,
        confidence_gate: "PASSED (Radiometric Quality Verified)"
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
    a.download = `Cluster_${cluster.cluster_id}_Intelligence_Assessment.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [reviewStatus, setReviewStatus] = useState('UNREVIEWED');
  const [notes, setNotes] = useState('');
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [reviewSavedMsg, setReviewSavedMsg] = useState('');

  const handleSaveReview = async () => {
    setIsSavingReview(true);
    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      const res = await fetch(`${API_BASE}/api/v1/clusters/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster_id: cluster.cluster_id,
          review_status: reviewStatus,
          notes: notes,
          analyst_name: 'Analyst'
        })
      });
      if (res.ok) {
        setReviewSavedMsg('Analyst review saved');
        setTimeout(() => setReviewSavedMsg(''), 3000);
      }
    } catch (e) {
      console.error('Failed to submit review:', e);
    } finally {
      setIsSavingReview(false);
    }
  };

  // Scientific analyst explanation derived from observed features
  const getAnalystAssessment = () => {
    if (isPersistent) {
      return (
        <div className="analyst-explanation persistent">
          <div className="explanation-title">Observed Evidence & Assessment</div>
          <p>
            Thermal observations are consistent with a <b>persistent industrial source</b>. Detections demonstrate continuous multi-week recurrence ({cluster.detection_count} satellite passes), balanced day/night observations, and close proximity to registered heavy industrial infrastructure.
          </p>
          <div className="analyst-action-note">
            <b>Recommended analyst action:</b> Filter from emergency wildfire suppression queue; maintain passive facility thermal baseline.
          </div>
        </div>
      );
    }
    if (isAmbiguous) {
      return (
        <div className="analyst-explanation ambiguous">
          <div className="explanation-title">Observed Evidence & Assessment</div>
          <p>
            Thermal observations exhibit an <b>intermediate persistence profile</b> (score: {(score * 100).toFixed(1)}%). Physical indicators suggest sporadic rotary kiln flaring, mining operations, or localized burning on an industrial periphery requiring analyst review.
          </p>
          <div className="analyst-action-note">
            <b>Recommended analyst action:</b> Dispatch secondary verification or request high-resolution optical imagery.
          </div>
        </div>
      );
    }
    return (
      <div className="analyst-explanation transient">
        <div className="explanation-title">Observed Evidence & Assessment</div>
        <p>
          Thermal observations demonstrate rapid temporal decay, low recurrence, and wide spatial separation from industrial infrastructure. Characteristics are consistent with a <b>transient fire event</b> (wildfire or agricultural crop residue burn).
        </p>
        <div className="analyst-action-note">
          <b>Recommended analyst action:</b> Route to forest / agricultural fire management assessment.
        </div>
      </div>
    );
  };

  const featureConfigs = [
    {
      key: 'recurrence_count',
      name: 'Recurrence Count',
      weight: '25%',
      raw: `${features?.recurrence_count ?? cluster.detection_count} passes`,
      norm: features?.recurrence_count_norm ?? 0,
      desc: 'Normalized observation count across the corridor monitoring window'
    },
    {
      key: 'recurrence_regularity',
      name: 'Recurrence Regularity',
      weight: '20%',
      raw: `CV = ${(features?.recurrence_regularity ?? 0).toFixed(2)}`,
      norm: features?.regularity_norm ?? 0,
      desc: 'Inverted coefficient of variation of inter-pass time gaps (low CV indicates continuous 24/7 operations)'
    },
    {
      key: 'dist_to_nearest_industrial',
      name: 'Industrial Proximity',
      weight: '20%',
      raw: `${((features?.dist_to_nearest_industrial ?? 0) / 1000).toFixed(2)} km`,
      norm: features?.dist_to_industrial_norm ?? 0,
      desc: 'Distance to registered OSM industrial site geometry (inverted: closer = higher score)'
    },
    {
      key: 'spatial_stability',
      name: 'Spatial Stability',
      weight: '15%',
      raw: `σ = ${(features?.spatial_stability ?? 0).toFixed(1)} m`,
      norm: features?.spatial_stability_norm ?? 0,
      desc: 'Centroid tightness (low spread confirms stationary point emitter vs roaming fire front)'
    },
    {
      key: 'frp_trend',
      name: 'FRP Stability Trend',
      weight: '10%',
      raw: `Slope = ${(features?.frp_trend ?? 0).toFixed(3)} MW/hr`,
      norm: features?.frp_trend_norm ?? 0,
      desc: 'Slope of Fire Radiative Power (flat slope indicates sustained furnace emission vs rapid decay)'
    },
    {
      key: 'day_night_ratio',
      name: 'Day / Night Balance',
      weight: '10%',
      raw: `${Math.round((features?.day_night_ratio ?? 0) * 100)}% Day / ${Math.round((1 - (features?.day_night_ratio ?? 0)) * 100)}% Night`,
      norm: features?.day_night_ratio_norm ?? 0,
      desc: 'Closeness to balanced diurnal distribution (continuous industrial facilities operate day and night)'
    }
  ];

  return (
    <aside className="inspector-panel" id="cluster-inspector-panel" aria-label="Thermal Cluster Assessment Panel">
      {/* Top Header */}
      <div className="panel-header">
        <div className="panel-header-titles">
          <span className="panel-pretitle">CLUSTER ASSESSMENT</span>
          <h2 className="panel-main-title">Cluster #{cluster.cluster_id}</h2>
        </div>
        <div className="panel-header-actions">
          {onFlyTo && (
            <button
              type="button"
              className="panel-tool-btn"
              onClick={() => onFlyTo({ lat: cluster.centroid_lat, lon: cluster.centroid_lon })}
              title="Center map on cluster"
              aria-label="Center map"
            >
              <Crosshair size={14} />
            </button>
          )}
          {onOpenPrintDossier && (
            <button
              type="button"
              className="panel-tool-btn print-tool-btn"
              onClick={onOpenPrintDossier}
              title="Open Printable Intelligence Dossier"
              aria-label="Printable Dossier"
            >
              <Printer size={14} />
            </button>
          )}
          {onExportSingleGeoJson && (
            <button
              type="button"
              className="panel-tool-btn"
              onClick={onExportSingleGeoJson}
              title="Export cluster as GeoJSON Feature"
              aria-label="Export Cluster GeoJSON"
            >
              <Download size={14} />
            </button>
          )}
          <button
            type="button"
            className="panel-tool-btn"
            onClick={handleExportJson}
            title="Export assessment telemetry as JSON"
            aria-label="Export JSON"
          >
            <FileCode size={14} />
          </button>
          <button
            type="button"
            className="panel-tool-btn close-btn"
            onClick={onClose}
            title="Close assessment panel"
            aria-label="Close Panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="panel-content">
        {/* Persistence Score & Band Card */}
        <section className={`score-hero ${getBandClass()}`} aria-label="Persistence Score Assessment">
          <div className="score-hero-header">
            <span className={`band-pill ${getBandClass()}`}>
              {isPersistent ? 'Persistent industrial source' : (isAmbiguous ? 'Review / ambiguous' : 'Transient fire event')}
            </span>
            <span className="score-threshold-context">
              {isPersistent ? 'Threshold: ≥ 0.70' : (isAmbiguous ? 'Threshold: 0.40–0.69' : 'Threshold: < 0.40')}
            </span>
          </div>

          <div className="score-display-row">
            <div className="score-value-block">
              <span className="score-label-sub">Persistence score</span>
              <div className="score-numeric-wrap">
                <span className="score-number" style={{ color: getBarColor(score) }}>
                  {score.toFixed(3)}
                </span>
                <span className="score-percentage">
                  ({(score * 100).toFixed(1)}%)
                </span>
              </div>
            </div>
            <div className="confidence-gate-tag">
              <CheckCircle2 size={13} className="gate-check-icon" />
              <span>Radiometric confidence gate: Verified</span>
            </div>
          </div>

          {/* Concise Analyst Assessment */}
          {getAnalystAssessment()}

          {/* Embedded FRP Temporal Progression */}
          <div className="embedded-chart-section">
            <FrpTimeSeriesChart detections={detections} band={band} />
          </div>
        </section>

        {/* Tab Navigation */}
        <div className="panel-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'features'}
            onClick={() => setActiveTab('features')}
            className={`tab-btn ${activeTab === 'features' ? 'is-active' : ''}`}
          >
            <Layers size={13} className="tab-icon-svg" />
            <span>Feature Assessment</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'temporal'}
            onClick={() => setActiveTab('temporal')}
            className={`tab-btn ${activeTab === 'temporal' ? 'is-active' : ''}`}
          >
            <Clock size={13} className="tab-icon-svg" />
            <span>Historical Activity</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'detections'}
            onClick={() => setActiveTab('detections')}
            className={`tab-btn ${activeTab === 'detections' ? 'is-active' : ''}`}
          >
            <Radio size={13} className="tab-icon-svg" />
            <span>Thermal Observations ({detections?.length || 0})</span>
          </button>
        </div>

        {/* Tab 1: 6-Feature Mathematical Formulation */}
        {activeTab === 'features' && (
          <div className="tab-body" role="tabpanel">
            {/* Cluster Geospatial Coordinates */}
            <div className="info-card">
              <div className="info-card-title">
                <MapPin size={13} className="card-title-icon-svg" />
                <span>Geospatial & Temporal Coordinates</span>
              </div>
              <div className="coords-grid">
                <div className="coords-cell">
                  <div className="cell-label">Centroid Coordinates</div>
                  <div className="cell-val">
                    {cluster.centroid_lat.toFixed(4)}°N, {cluster.centroid_lon.toFixed(4)}°E
                  </div>
                </div>
                <div className="coords-cell">
                  <div className="cell-label">Spatial Spread</div>
                  <div className="cell-val">
                    Radius: {(cluster.radius_meters || 0).toFixed(0)} m
                  </div>
                </div>
                <div className="coords-cell">
                  <div className="cell-label">First Observed</div>
                  <div className="cell-val">
                    {cluster.first_seen ? cluster.first_seen.replace('T', ' ') : 'N/A'}
                  </div>
                </div>
                <div className="coords-cell">
                  <div className="cell-label">Last Observed</div>
                  <div className="cell-val">
                    {cluster.last_seen ? cluster.last_seen.replace('T', ' ') : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* 6-Feature Evaluation Bars */}
            <div className="info-card">
              <div className="info-card-title">
                <Scale size={13} className="card-title-icon-svg" />
                <span>Feature Assessment (6-Feature Formulation)</span>
              </div>
              <div className="feature-list">
                {featureConfigs.map((f) => (
                  <div key={f.key} className="feature-item">
                    <div className="feature-header">
                      <div className="feature-name-group">
                        <span className="feature-name">{f.name}</span>
                        <span className="feature-weight-tag" title="Baseline formulation weight">{f.weight}</span>
                      </div>
                      <div className="feature-values">
                        <span className="feature-raw">{f.raw}</span>
                        <b className="feature-score" style={{ color: getBarColor(f.norm) }}>
                          {(f.norm * 100).toFixed(0)}%
                        </b>
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
                    <div className="feature-desc">{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Industrial Context / Infrastructure Proximity */}
            {closest_industrial_sites && closest_industrial_sites.length > 0 && (
              <div className="info-card">
                <div className="info-card-title">
                  <Building2 size={13} className="card-title-icon-svg" />
                  <span>Industrial Context & Proximity</span>
                </div>
                <div className="osm-proximity-list">
                  {closest_industrial_sites.map((site, i) => (
                    <div key={i} className="osm-proximity-item">
                      <div>
                        <div className="osm-site-name">{site.name}</div>
                        <div className="osm-site-type">{site.site_type || 'industrial facility'}</div>
                      </div>
                      <div
                        className="osm-distance"
                        style={{ color: site.distance_meters < 1000 ? '#10b981' : '#38bdf8' }}
                      >
                        {site.distance_meters < 1000 ? `${site.distance_meters.toFixed(0)} m` : `${(site.distance_meters / 1000).toFixed(1)} km`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Analyst Review & Verification Workflow (Phase 5) */}
            <div className="info-card" style={{ marginTop: '12px' }}>
              <div className="info-card-title">
                <CheckCircle2 size={13} className="card-title-icon-svg" />
                <span>Analyst Verification & Review Status</span>
              </div>
              <div className="analyst-review-card-body" style={{ marginTop: '8px' }}>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.75rem', display: 'block', color: 'var(--text-muted, #aaa)', marginBottom: '4px' }}>VERIFICATION STATUS</label>
                  <select
                    className="tactical-select"
                    style={{ width: '100%', fontSize: '0.8rem', padding: '6px' }}
                    value={reviewStatus}
                    onChange={(e) => setReviewStatus(e.target.value)}
                  >
                    <option value="UNREVIEWED">⚪ UNREVIEWED (Pending Verification)</option>
                    <option value="UNDER_INVESTIGATION">🟡 UNDER INVESTIGATION (Further Review Required)</option>
                    <option value="VERIFIED_INDUSTRIAL">🟢 VERIFIED INDUSTRIAL (Confirmed Heavy Site)</option>
                    <option value="VERIFIED_WILDFIRE">🔴 VERIFIED WILDFIRE / TRANSIENT (Confirmed Event)</option>
                    <option value="DISMISSED">⚪ DISMISSED (Noise / Duplicate)</option>
                  </select>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.75rem', display: 'block', color: 'var(--text-muted, #aaa)', marginBottom: '4px' }}>ANALYST LOG &amp; ASSESSMENT NOTES</label>
                  <textarea
                    rows={2}
                    placeholder="Enter analyst notes or ground-truth verification comments..."
                    style={{ width: '100%', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px', borderRadius: '4px' }}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="tactical-btn"
                    style={{ fontSize: '0.75rem', padding: '4px 12px' }}
                    onClick={handleSaveReview}
                    disabled={isSavingReview}
                  >
                    {isSavingReview ? 'Saving...' : 'Save Verification'}
                  </button>
                  {reviewSavedMsg && <span style={{ fontSize: '0.75rem', color: '#4caf50' }}>{reviewSavedMsg}</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Historical Activity & Multi-Temporal FRP Analytics */}
        {activeTab === 'temporal' && (
          <div className="tab-body" role="tabpanel">
            <HistoricalThermalAnalysis
              cluster={cluster}
              classification={classification}
              detections={detections}
            />
          </div>
        )}

        {/* Tab 3: Thermal Observations Table */}
        {activeTab === 'detections' && (
          <div className="tab-body" role="tabpanel">
            <div className="info-card" style={{ padding: '8px' }}>
              <div className="detections-table-wrapper">
                <table className="detections-table" aria-label="Member satellite detections">
                  <thead>
                    <tr>
                      <th>Acquisition Time</th>
                      <th>Sensor</th>
                      <th>FRP (MW)</th>
                      <th>Pass</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detections && detections.map((d) => (
                      <tr key={d.id}>
                        <td className="cell-timestamp">{d.acq_date} {d.acq_time}</td>
                        <td className="cell-satellite">{d.satellite || 'VIIRS'}</td>
                        <td className="cell-frp">{d.frp ? d.frp.toFixed(1) : '-'}</td>
                        <td>
                          <span className={`pass-badge ${d.daynight === 'D' ? 'is-day' : 'is-night'}`}>
                            {d.daynight === 'D' ? 'DAY' : 'NIGHT'}
                          </span>
                        </td>
                        <td className="cell-conf">{d.confidence || 'nominal'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
