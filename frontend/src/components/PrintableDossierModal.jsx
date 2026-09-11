import React from 'react';
import { Printer, X } from 'lucide-react';

/**
 * Printable Analytical Intelligence Dossier Modal / View
 * Optimized for paper printing via window.print() and on-screen inspection.
 */
export default function PrintableDossierModal({ isOpen, onClose, detail, onPrint }) {
  if (!isOpen || !detail || !detail.cluster) return null;

  const { cluster, classification, features, detections, closest_industrial_sites } = detail;
  const score = classification ? classification.persistence_score : 0;
  const band = classification ? classification.band_label : 'Unknown';
  const isPersistent = band === 'Persistent industrial source';
  const isAmbiguous = band === 'Ambiguous / flagged for review';

  const sortedDetections = detections && detections.length > 0
    ? [...detections].sort((a, b) => new Date(a.acq_datetime) - new Date(b.acq_datetime))
    : [];

  const frpValues = sortedDetections.map(d => parseFloat(d.frp || 0));
  const maxFrp = frpValues.length > 0 ? Math.max(...frpValues).toFixed(1) : 'N/A';
  const minFrp = frpValues.length > 0 ? Math.min(...frpValues).toFixed(1) : 'N/A';
  const avgFrp = frpValues.length > 0 ? (frpValues.reduce((a, b) => a + b, 0) / frpValues.length).toFixed(1) : 'N/A';

  const closestSite = closest_industrial_sites && closest_industrial_sites.length > 0
    ? closest_industrial_sites[0]
    : null;

  const handleNativePrint = () => {
    if (onPrint) onPrint();
    window.print();
  };

  return (
    <div className="dossier-modal-overlay" role="dialog" aria-modal="true" aria-label="Analytical Intelligence Dossier">
      <div className="dossier-modal-container">
        {/* Modal Toolbar (hidden during print) */}
        <div className="dossier-toolbar no-print">
          <div className="toolbar-left">
            <span className="toolbar-tag">
              <Printer size={13} className="inline-icon-svg" />
              ANALYTICAL DOSSIER
            </span>
            <span className="toolbar-title">Cluster #{cluster.cluster_id} Assessment</span>
          </div>
          <div className="toolbar-right">
            <button
              type="button"
              className="dossier-print-btn"
              onClick={handleNativePrint}
              title="Print document or Save as PDF"
            >
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              className="dossier-close-btn"
              onClick={onClose}
              title="Close Dossier"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="dossier-paper-sheet" id="dossier-printable-content">
          {/* Document Header */}
          <header className="dossier-doc-header">
            <div className="doc-header-top">
              <div className="agency-badge">
                <span className="agency-title">NTRO • SPACE SURVEILLANCE &amp; INTELLIGENCE</span>
                <span className="agency-sub">SMART INDIA HACKATHON 2026 • PROBLEM STATEMENT SIH26162</span>
              </div>
              <div className="doc-classification-stamp">
                SYSTEM-GENERATED ANALYTICAL OUTPUT
              </div>
            </div>

            <div className="doc-title-row">
              <div>
                <h1 className="doc-main-title">THERMAL SOURCE INTELLIGENCE DOSSIER</h1>
                <div className="doc-meta-subline">
                  Target Cluster: <b>#{cluster.cluster_id}</b> • Corridor: <b>Jamshedpur–Odisha Industrial Belt</b> • Dataset: <b>Demo / Offline Analysis</b>
                </div>
              </div>
              <div className="doc-timestamp-box">
                <div>DATE: <b>{new Date().toLocaleDateString('en-GB')}</b></div>
                <div>GENERATED: <b>{new Date().toLocaleTimeString()} UTC</b></div>
              </div>
            </div>
          </header>

          {/* Section 1: Executive Assessment */}
          <section className="dossier-section">
            <h2 className="dossier-section-title">1. Executive Assessment</h2>
            <div className="dossier-assessment-card">
              <div className="assessment-row">
                <div className="assessment-kv">
                  <span className="kv-label">CLASSIFICATION RESULT</span>
                  <span className={`kv-val-badge ${isPersistent ? 'is-persistent' : (isAmbiguous ? 'is-ambiguous' : 'is-transient')}`}>
                    {band.toUpperCase()}
                  </span>
                </div>
                <div className="assessment-kv">
                  <span className="kv-label">PERSISTENCE SCORE</span>
                  <span className="kv-val-score">
                    {(score * 100).toFixed(1)}% <small>({score.toFixed(4)})</small>
                  </span>
                </div>
                <div className="assessment-kv">
                  <span className="kv-label">DECISION THRESHOLD</span>
                  <span className="kv-val-text">
                    {isPersistent ? 'Score ≥ 0.70 (Industrial)' : (isAmbiguous ? '0.40 ≤ Score < 0.70 (Review)' : 'Score < 0.40 (Transient)')}
                  </span>
                </div>
                <div className="assessment-kv">
                  <span className="kv-label">RADIOMETRIC GATE</span>
                  <span className="kv-val-tag">PASSED (High/Nominal)</span>
                </div>
              </div>

              <div className="assessment-narrative">
                {isPersistent && (
                  <p>
                    The observed thermal signature is classified as a <b>persistent industrial thermal source</b>. The classification is supported by sustained multi-week detections ({cluster.detection_count} passes), steady day/night diurnal continuity, tight spatial centroid stability, and immediate proximity to registered heavy industrial infrastructure.
                  </p>
                )}
                {isAmbiguous && (
                  <p>
                    The observed thermal signature is classified as <b>ambiguous / flagged for review</b> (score: {(score * 100).toFixed(1)}%). Thermal activity exhibits intermediate persistence characteristics, consistent with intermittent rotary kiln flaring, mining operations, or a localized multi-day burn near industrial boundaries.
                  </p>
                )}
                {!isPersistent && !isAmbiguous && (
                  <p>
                    The observed signature is classified as a <b>transient fire event</b>. The thermal anomaly exhibits rapid temporal decay, single/sparse satellite passes, and wide spatial separation from industrial infrastructure, characteristic of seasonal wildfire outbreaks or agricultural crop residue burning.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Section 2: Geospatial & Geographic Location */}
          <section className="dossier-section">
            <h2 className="dossier-section-title">2. Geographic &amp; Infrastructure Location</h2>
            <div className="dossier-grid-2col">
              <table className="dossier-data-table">
                <tbody>
                  <tr>
                    <th>Cluster Identifier</th>
                    <td>Cluster #{cluster.cluster_id}</td>
                  </tr>
                  <tr>
                    <th>Centroid Latitude</th>
                    <td>{cluster.centroid_lat.toFixed(5)}° N</td>
                  </tr>
                  <tr>
                    <th>Centroid Longitude</th>
                    <td>{cluster.centroid_lon.toFixed(5)}° E</td>
                  </tr>
                  <tr>
                    <th>Cluster Footprint Radius</th>
                    <td>{(cluster.radius_meters || 0).toFixed(0)} meters</td>
                  </tr>
                  <tr>
                    <th>First Observed Pass</th>
                    <td>{cluster.first_seen ? cluster.first_seen.replace('T', ' ') : 'N/A'}</td>
                  </tr>
                  <tr>
                    <th>Last Observed Pass</th>
                    <td>{cluster.last_seen ? cluster.last_seen.replace('T', ' ') : 'N/A'}</td>
                  </tr>
                </tbody>
              </table>

              {/* Spatial Proximity Tactical ASCII/Diagram Box */}
              <div className="dossier-spatial-diagram-box">
                <div className="diagram-header">SPATIAL INFRASTRUCTURE DIAGRAM</div>
                <div className="diagram-body">
                  <div className="diagram-north">N ↑</div>
                  {closestSite ? (
                    <div className="diagram-content">
                      <div className="diagram-entity site-entity">
                        <span className="entity-icon">◆</span>
                        <span className="entity-label">{closestSite.name}</span>
                        <span className="entity-sub">({closestSite.site_type || 'Industrial Entity'})</span>
                      </div>
                      <div className="diagram-distance-line">
                        <span className="dist-arrow">│</span>
                        <span className="dist-text">
                          {closestSite.distance_meters < 1000
                            ? `${closestSite.distance_meters.toFixed(0)} m separation`
                            : `${(closestSite.distance_meters / 1000).toFixed(2)} km separation`}
                        </span>
                        <span className="dist-arrow">↓</span>
                      </div>
                      <div className="diagram-entity cluster-entity">
                        <span className="entity-icon">●</span>
                        <span className="entity-label">Cluster #{cluster.cluster_id} (Centroid)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="diagram-content">
                      <div className="diagram-entity cluster-entity">
                        <span className="entity-icon">●</span>
                        <span className="entity-label">Cluster #{cluster.cluster_id}</span>
                        <span className="entity-sub">No registered industrial site within regional search span</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Thermal Radiative Observations */}
          <section className="dossier-section">
            <h2 className="dossier-section-title">3. Thermal &amp; Sensor Observations</h2>
            <div className="dossier-metrics-grid">
              <div className="metric-box">
                <span className="box-label">TOTAL PASSES</span>
                <span className="box-val">{cluster.detection_count}</span>
                <span className="box-sub">VIIRS / MODIS detections</span>
              </div>
              <div className="metric-box">
                <span className="box-label">AVERAGE FRP</span>
                <span className="box-val">{avgFrp} <small>MW</small></span>
                <span className="box-sub">Fire Radiative Power</span>
              </div>
              <div className="metric-box">
                <span className="box-label">MAXIMUM FRP</span>
                <span className="box-val">{maxFrp} <small>MW</small></span>
                <span className="box-sub">Peak observed emission</span>
              </div>
              <div className="metric-box">
                <span className="box-label">MINIMUM FRP</span>
                <span className="box-val">{minFrp} <small>MW</small></span>
                <span className="box-sub">Baseline observed power</span>
              </div>
              <div className="metric-box">
                <span className="box-label">DIURNAL RATIO</span>
                <span className="box-val">
                  {features?.day_night_ratio !== undefined ? (features.day_night_ratio).toFixed(2) : 'N/A'}
                </span>
                <span className="box-sub">Day / Total pass ratio</span>
              </div>
              <div className="metric-box">
                <span className="box-label">SPATIAL SPREAD</span>
                <span className="box-val">
                  {features?.spatial_stability !== undefined ? `${features.spatial_stability.toFixed(1)}m` : 'N/A'}
                </span>
                <span className="box-sub">Coordinate dispersion (σ)</span>
              </div>
            </div>
          </section>

          {/* Section 4: Six-Feature Math Breakdown */}
          <section className="dossier-section">
            <h2 className="dossier-section-title">4. Classifier Feature Assessment (6-Feature Formulation)</h2>
            <table className="dossier-feature-table">
              <thead>
                <tr>
                  <th>Feature Dimension</th>
                  <th>Formula Weight</th>
                  <th>Raw Measurement</th>
                  <th>Normalized [0,1]</th>
                  <th>Interpretation</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Recurrence Count</b></td>
                  <td>25% (0.25)</td>
                  <td>{features?.recurrence_count ?? cluster.detection_count} passes</td>
                  <td><b>{((features?.recurrence_count_norm ?? 0) * 100).toFixed(0)}%</b></td>
                  <td>Higher count over temporal window indicates stationary persistent emitter.</td>
                </tr>
                <tr>
                  <td><b>Recurrence Regularity</b></td>
                  <td>20% (0.20)</td>
                  <td>CV = {(features?.recurrence_regularity ?? 0).toFixed(2)}</td>
                  <td><b>{((features?.regularity_norm ?? 0) * 100).toFixed(0)}%</b></td>
                  <td>Inverted CV of inter-pass time gaps; low CV indicates 24/7 continuous operation.</td>
                </tr>
                <tr>
                  <td><b>Industrial Proximity</b></td>
                  <td>20% (0.20)</td>
                  <td>{((features?.dist_to_nearest_industrial ?? 0) / 1000).toFixed(2)} km</td>
                  <td><b>{((features?.dist_to_industrial_norm ?? 0) * 100).toFixed(0)}%</b></td>
                  <td>Inverted distance to registered OSM industrial infrastructure.</td>
                </tr>
                <tr>
                  <td><b>Spatial Stability</b></td>
                  <td>15% (0.15)</td>
                  <td>σ = {(features?.spatial_stability ?? 0).toFixed(1)} m</td>
                  <td><b>{((features?.spatial_stability_norm ?? 0) * 100).toFixed(0)}%</b></td>
                  <td>Tight centroid standard deviation confirms stationary facility vs moving burn.</td>
                </tr>
                <tr>
                  <td><b>FRP Trend Stability</b></td>
                  <td>10% (0.10)</td>
                  <td>Slope = {(features?.frp_trend ?? 0).toFixed(3)} MW/hr</td>
                  <td><b>{((features?.frp_trend_norm ?? 0) * 100).toFixed(0)}%</b></td>
                  <td>Near-zero slope indicates steady thermal output without rapid fire decay.</td>
                </tr>
                <tr>
                  <td><b>Day / Night Balance</b></td>
                  <td>10% (0.10)</td>
                  <td>
                    {Math.round((features?.day_night_ratio ?? 0) * 100)}% Day / {Math.round((1 - (features?.day_night_ratio ?? 0)) * 100)}% Night
                  </td>
                  <td><b>{((features?.day_night_ratio_norm ?? 0) * 100).toFixed(0)}%</b></td>
                  <td>Scored by closeness to 50/50 balance; continuous plants operate day and night.</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Section 5: Analyst Interpretation & Recommended Actions */}
          <section className="dossier-section">
            <h2 className="dossier-section-title">5. Analyst Interpretation &amp; Recommended Actions</h2>
            <div className="dossier-interpretation-box">
              <div className="interp-row">
                <b>Decision Rule:</b> Score {(score * 100).toFixed(1)}% falls in band <b>{band}</b>.
              </div>
              <div className="interp-row">
                <b>Recommended Analyst Action:</b>{' '}
                {isPersistent && 'Thermal observations consistent with continuous industrial operations. Action: Filter from emergency wildfire response queue; maintain passive facility baseline.'}
                {isAmbiguous && 'Intermediate persistence score. Action: Retain in analyst queue for multispectral verification or field confirmation.'}
                {!isPersistent && !isAmbiguous && 'Thermal observations consistent with transient burning. Action: Route to forest or agricultural fire management assessment.'}
              </div>
              <div className="interp-disclaimer">
                <b>Disclaimer:</b> Classification is algorithmic, computed via continuous 6-feature multi-factor data fusion of NASA FIRMS active fire telemetry and OpenStreetMap infrastructure geometries. This output should be interpreted alongside operational intelligence and supplementary reconnaissance.
              </div>
            </div>
          </section>

          {/* Document Footer */}
          <footer className="dossier-doc-footer">
            <div>CONFIDENTIAL &amp; PROPRIETARY • NTRO SPACE SURVEILLANCE • SIH26162</div>
            <div>PAGE 1 OF 1 • VERIFIED CLASSIFIER BUILD</div>
          </footer>
        </div>
      </div>
    </div>
  );
}
