import React, { useState, useMemo } from 'react';
import {
  filterDetectionsByWindow,
  calculateTemporalMetrics,
  deriveTrend,
  deriveHistoricalActivityPattern,
  deriveAnalystInterpretation
} from '../utils/temporalAnalytics';

/**
 * Historical Thermal Analysis & Multi-Temporal FRP Analytics Component
 * Provides mission-critical chronological insights for selected thermal clusters.
 */
export default function HistoricalThermalAnalysis({ cluster, classification, detections }) {
  const [selectedWindow, setSelectedWindow] = useState('ALL'); // '7D' | '14D' | '30D' | 'ALL'
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [showAllChronology, setShowAllChronology] = useState(false);

  // Filter detections by active window
  const windowDetections = useMemo(() => {
    return filterDetectionsByWindow(detections, selectedWindow);
  }, [detections, selectedWindow]);

  // Derived metrics
  const metrics = useMemo(() => {
    return calculateTemporalMetrics(windowDetections, selectedWindow);
  }, [windowDetections, selectedWindow]);

  // Derived trend & pattern
  const trend = useMemo(() => {
    return deriveTrend(windowDetections);
  }, [windowDetections]);

  const activityPattern = useMemo(() => {
    return deriveHistoricalActivityPattern(windowDetections, metrics);
  }, [windowDetections, metrics]);

  const analystInterpretation = useMemo(() => {
    return deriveAnalystInterpretation(classification, metrics, trend);
  }, [classification, metrics, trend]);

  // Official persistence score from classification
  const score = classification?.persistence_score ?? 0;
  const band = classification?.band_label || 'Unknown';

  // Sort chronologically descending for chronological event log
  const chronologyEvents = useMemo(() => {
    return [...windowDetections].sort((a, b) => b._dt - a._dt);
  }, [windowDetections]);

  const displayedEvents = showAllChronology ? chronologyEvents : chronologyEvents.slice(0, 6);

  // SVG dimensions for temporal chart
  const svgWidth = 440;
  const svgHeight = 150;
  const padLeft = 32;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 26;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const maxFrpY = Math.max(metrics.maxFrp * 1.15, 25);
  const minFrpY = 0;

  const chartPoints = useMemo(() => {
    if (windowDetections.length === 0) return [];
    if (windowDetections.length === 1) {
      const d = windowDetections[0];
      const y = padTop + chartH - ((d.frp - minFrpY) / (maxFrpY - minFrpY || 1)) * chartH;
      return [{ x: padLeft + chartW / 2, y, d, idx: 0 }];
    }

    const firstTime = windowDetections[0]._dt.getTime();
    const lastTime = windowDetections[windowDetections.length - 1]._dt.getTime();
    const timeSpan = Math.max(1, lastTime - firstTime);

    return windowDetections.map((d, i) => {
      const timeRatio = (d._dt.getTime() - firstTime) / timeSpan;
      const x = padLeft + timeRatio * chartW;
      const y = padTop + chartH - ((d.frp - minFrpY) / (maxFrpY - minFrpY || 1)) * chartH;
      return { x, y, d, idx: i };
    });
  }, [windowDetections, chartW, chartH, maxFrpY, minFrpY]);

  const lineD = useMemo(() => {
    if (chartPoints.length < 2) return '';
    return chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }, [chartPoints]);

  const areaD = useMemo(() => {
    if (chartPoints.length < 2) return '';
    return `${lineD} L ${chartPoints[chartPoints.length - 1].x.toFixed(1)} ${svgHeight - padBottom} L ${chartPoints[0].x.toFixed(1)} ${svgHeight - padBottom} Z`;
  }, [lineD, chartPoints, svgHeight, padBottom]);

  const avgLineY = padTop + chartH - ((metrics.avgFrp - minFrpY) / (maxFrpY - minFrpY || 1)) * chartH;

  return (
    <div className="historical-analysis-root" aria-label="Historical Thermal Analysis">
      {/* 1. Window Controls Header */}
      <div className="temporal-window-toolbar">
        <div className="window-label-group">
          <span className="temporal-header-title">TIME WINDOW SELECTION</span>
          <span className="window-obs-tag">
            {metrics.observationCount} pass{metrics.observationCount === 1 ? '' : 'es'} ({metrics.activeDays} active day{metrics.activeDays === 1 ? '' : 's'})
          </span>
        </div>
        <div className="window-btn-group" role="group" aria-label="Observation Time Window">
          {['7D', '14D', '30D', 'ALL'].map((w) => (
            <button
              key={w}
              type="button"
              className={`window-btn ${selectedWindow === w ? 'is-active' : ''}`}
              onClick={() => setSelectedWindow(w)}
              aria-pressed={selectedWindow === w}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Interactive FRP Timeline Chart */}
      <div className="temporal-chart-card">
        <div className="temporal-chart-header">
          <div>
            <div className="temporal-card-title">FRP Multi-Temporal Progression</div>
            <div className="temporal-card-subtitle">
              {metrics.observationCount > 0
                ? `Radiative emission across ${metrics.activeDays} distinct day(s) (${metrics.dateSpanDays}-day observation span)`
                : 'No detections available in this window'}
            </div>
          </div>
          <div className="trend-badge-pill" style={{ borderColor: trend.color }}>
            <span className="trend-dot" style={{ background: trend.color }}></span>
            <span className="trend-text" style={{ color: trend.color }}>{trend.label.toUpperCase()}</span>
          </div>
        </div>

        {windowDetections.length === 0 ? (
          <div className="temporal-empty-state">
            <span className="empty-icon">⏱️</span>
            <span>NO HISTORICAL OBSERVATIONS IN SELECTED WINDOW</span>
          </div>
        ) : (
          <div className="timeline-svg-container">
            <svg
              width="100%"
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="timeline-svg"
              role="img"
              aria-label="Multi-temporal FRP time series chart"
            >
              <defs>
                <linearGradient id="temporalAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1={padLeft} y1={padTop} x2={svgWidth - padRight} y2={padTop} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <line x1={padLeft} y1={padTop + chartH / 2} x2={svgWidth - padRight} y2={padTop + chartH / 2} stroke="rgba(255,255,255,0.04)" strokeDasharray="2 2" />
              <line x1={padLeft} y1={svgHeight - padBottom} x2={svgWidth - padRight} y2={svgHeight - padBottom} stroke="rgba(255,255,255,0.12)" />

              {/* Y-Axis Label ticks */}
              <text x={padLeft - 6} y={padTop + 4} fill="rgba(255,255,255,0.4)" fontSize="8" textAnchor="end" fontFamily="var(--font-mono)">
                {maxFrpY.toFixed(0)}M
              </text>
              <text x={padLeft - 6} y={padTop + chartH / 2 + 3} fill="rgba(255,255,255,0.3)" fontSize="8" textAnchor="end" fontFamily="var(--font-mono)">
                {(maxFrpY / 2).toFixed(0)}M
              </text>
              <text x={padLeft - 6} y={svgHeight - padBottom + 2} fill="rgba(255,255,255,0.4)" fontSize="8" textAnchor="end" fontFamily="var(--font-mono)">
                0
              </text>

              {/* Average Reference Line */}
              {metrics.observationCount > 1 && (
                <>
                  <line
                    x1={padLeft}
                    y1={avgLineY}
                    x2={svgWidth - padRight}
                    y2={avgLineY}
                    stroke="#38bdf8"
                    strokeDasharray="4 4"
                    strokeOpacity="0.5"
                  />
                  <text
                    x={svgWidth - padRight - 2}
                    y={Math.max(padTop + 8, avgLineY - 3)}
                    fill="#38bdf8"
                    fontSize="8"
                    fontFamily="var(--font-mono)"
                    textAnchor="end"
                  >
                    AVG {metrics.avgFrp} MW
                  </text>
                </>
              )}

              {/* Area & Line */}
              {areaD && <path d={areaD} fill="url(#temporalAreaGrad)" />}
              {lineD && <path d={lineD} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

              {/* Points */}
              {chartPoints.map((p, i) => {
                const isHovered = hoveredIndex === i;
                const isDay = p.d.daynight === 'D';
                return (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={isHovered ? 5.5 : 3.5}
                    fill={isDay ? '#fbbf24' : '#818cf8'}
                    stroke="#090d16"
                    strokeWidth={isHovered ? 2 : 1}
                    className="timeline-point"
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                );
              })}
            </svg>

            {/* Hover Tooltip */}
            {hoveredIndex !== null && chartPoints[hoveredIndex] && (
              <div
                className="timeline-tooltip"
                style={{
                  left: `${Math.min(svgWidth - 140, Math.max(10, chartPoints[hoveredIndex].x - 60))}px`,
                  top: `${Math.max(4, chartPoints[hoveredIndex].y - 50)}px`
                }}
              >
                <div className="tip-frp">FRP: <b>{chartPoints[hoveredIndex].d.frp} MW</b></div>
                <div className="tip-date">
                  {chartPoints[hoveredIndex].d.acq_date} {chartPoints[hoveredIndex].d.acq_time || ''} UTC
                </div>
                <div className="tip-pass">
                  <span className={`tip-tag ${chartPoints[hoveredIndex].d.daynight === 'D' ? 'is-day' : 'is-night'}`}>
                    {chartPoints[hoveredIndex].d.daynight === 'D' ? 'DAY' : 'NIGHT'}
                  </span>
                  <span>Sat: {chartPoints[hoveredIndex].d.satellite || 'VIIRS'}</span>
                </div>
              </div>
            )}

            {/* X-Axis Date Markers */}
            <div className="timeline-xaxis-labels">
              <span>{metrics.firstSeen ? metrics.firstSeen.split('T')[0] : ''}</span>
              <div className="timeline-legend-pills">
                <span className="dot-pill"><i style={{ background: '#fbbf24' }}></i> Day</span>
                <span className="dot-pill"><i style={{ background: '#818cf8' }}></i> Night</span>
              </div>
              <span>{metrics.lastSeen ? metrics.lastSeen.split('T')[0] : ''}</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Temporal Summary Metrics Grid */}
      <div className="temporal-metrics-grid">
        <div className="t-metric-card">
          <span className="t-metric-label">OBSERVATIONS</span>
          <span className="t-metric-val">{metrics.observationCount}</span>
          <span className="t-metric-sub">{selectedWindow} window</span>
        </div>
        <div className="t-metric-card">
          <span className="t-metric-label">ACTIVE DAYS</span>
          <span className="t-metric-val">{metrics.activeDays}</span>
          <span className="t-metric-sub">Distinct dates</span>
        </div>
        <div className="t-metric-card">
          <span className="t-metric-label">AVERAGE FRP</span>
          <span className="t-metric-val">{metrics.avgFrp} <small>MW</small></span>
          <span className="t-metric-sub">Mean power</span>
        </div>
        <div className="t-metric-card">
          <span className="t-metric-label">PEAK / MIN FRP</span>
          <span className="t-metric-val">{metrics.maxFrp} / {metrics.minFrp}</span>
          <span className="t-metric-sub">Peak / Min (MW)</span>
        </div>
        <div className="t-metric-card">
          <span className="t-metric-label">FRP VARIABILITY</span>
          <span className="t-metric-val">±{metrics.stdDevFrp} <small>MW</small></span>
          <span className="t-metric-sub">Std Dev (σ)</span>
        </div>
        <div className="t-metric-card">
          <span className="t-metric-label">OBS DENSITY</span>
          <span className="t-metric-val">{metrics.observationDensity}</span>
          <span className="t-metric-sub">Passes / day</span>
        </div>
      </div>

      {/* 4. Historical Activity Pattern & Trend Analysis */}
      <div className="temporal-pattern-card">
        <div className="pattern-header-row">
          <span className="pattern-badge-label">HISTORICAL ACTIVITY PATTERN</span>
          <span className={`activity-pattern-tag ${activityPattern.badgeClass}`}>
            {activityPattern.label}
          </span>
        </div>
        <p className="pattern-summary-text">{activityPattern.summary}</p>

        <div className="trend-detail-row">
          <div className="trend-kv">
            <span className="kv-t-label">DESCRIPTIVE TREND:</span>
            <span className="kv-t-val" style={{ color: trend.color }}>{trend.label}</span>
          </div>
          <div className="trend-rationale">{trend.description}</div>
        </div>
        <div className="activity-disclaimer-note">
          * Descriptive historical indicator derived from satellite passes. Does not replace the authoritative 6-feature classifier persistence score.
        </div>
      </div>

      {/* 5. Classification Context & Threshold Comparison */}
      <div className="classification-context-card">
        <div className="context-header">
          <span className="context-title">CLASSIFIER THRESHOLD RELATIONSHIP</span>
          <span className="context-score">
            {cluster?.cluster_id ? `Cluster #${cluster.cluster_id} • ` : ''}<b>{(score * 100).toFixed(1)}%</b> ({score.toFixed(4)})
          </span>
        </div>
        <div className="context-band-label">
          Current Classification: <b>{band.toUpperCase()}</b>
        </div>

        {/* Visual Threshold Bar */}
        <div className="threshold-track-container">
          <div className="threshold-bar-track">
            <div className="zone-transient" title="Transient Fire: < 0.40">
              <span>Transient (&lt;0.40)</span>
            </div>
            <div className="zone-ambiguous" title="Ambiguous / Review: 0.40 - 0.69">
              <span>Review (0.40–0.69)</span>
            </div>
            <div className="zone-persistent" title="Persistent Industrial: ≥ 0.70">
              <span>Persistent (≥0.70)</span>
            </div>
            {/* Score Marker Pin */}
            <div
              className="score-marker-pin"
              style={{ left: `${Math.min(98, Math.max(2, score * 100))}%` }}
              title={`Score: ${(score * 100).toFixed(1)}%`}
            >
              <div className="pin-triangle"></div>
              <div className="pin-label">{(score * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>

        {/* Analyst Interpretation Narrative */}
        <div className="analyst-interpretation-block">
          <div className="interp-heading">ANALYST INTERPRETATION</div>
          <p className="interp-body">{analystInterpretation}</p>
        </div>
      </div>

      {/* 6. Observation Chronology List */}
      <div className="chronology-card">
        <div className="chronology-header">
          <span className="chronology-title">OBSERVATION CHRONOLOGY</span>
          <span className="chronology-count">Showing {displayedEvents.length} of {chronologyEvents.length} passes</span>
        </div>

        {chronologyEvents.length === 0 ? (
          <div className="chronology-empty">No pass telemetry recorded in this window.</div>
        ) : (
          <div className="chronology-list">
            {displayedEvents.map((e, idx) => (
              <div key={e.id || idx} className="chronology-row">
                <div className="chrono-col-date">
                  <span className="chrono-date">{e.acq_date}</span>
                  <span className="chrono-time">{e.acq_time || '00:00'} UTC</span>
                </div>
                <div className="chrono-col-badge">
                  <span className={`pass-badge ${e.daynight === 'D' ? 'is-day' : 'is-night'}`}>
                    {e.daynight === 'D' ? 'DAY' : 'NIGHT'}
                  </span>
                </div>
                <div className="chrono-col-frp">
                  <b>{typeof e.frp === 'number' ? e.frp.toFixed(1) : e.frp}</b> <small>MW</small>
                </div>
                <div className="chrono-col-meta">
                  <span>Sat: {e.satellite || 'VIIRS'}</span>
                  <span className="chrono-conf">Conf: {e.confidence || 'nominal'}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {chronologyEvents.length > 6 && (
          <button
            type="button"
            className="chrono-toggle-btn"
            onClick={() => setShowAllChronology(!showAllChronology)}
          >
            {showAllChronology ? 'Show Fewer Events' : `Show All ${chronologyEvents.length} Observations`}
          </button>
        )}
      </div>

      {/* 7. Methodology Footnote */}
      <footer className="temporal-methodology-footer">
        <div className="methodology-text">
          <b>TEMPORAL ANALYSIS METHODOLOGY:</b> Derived from available satellite thermal anomaly observations associated with this cluster. Satellite observations are intermittent and do not represent continuous ground monitoring.
        </div>
      </footer>
    </div>
  );
}
