import React, { useState, useEffect, useCallback } from 'react';
import {
  Satellite,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ShieldCheck,
  X,
  RotateCw,
  Info
} from 'lucide-react';


const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

/**
 * NASA FIRMS Live Ingestion Modal (Phase 4B.1)
 * Professional GIS modal for operator-controlled satellite telemetry ingestion.
 * Supports VIIRS NOAA-21, NOAA-20, Suomi-NPP, and MODIS products with full operational observability.
 */
export default function FirmsIngestionModal({ isOpen, onClose, onIngestionSuccess }) {
  const [statusInfo, setStatusInfo] = useState(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [selectedDays, setSelectedDays] = useState(2);
  const [selectedSource, setSelectedSource] = useState('ALL');
  const [runPipeline, setRunPipeline] = useState(true);
  const [ingestionResult, setIngestionResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [errorCategory, setErrorCategory] = useState(null);

  const [historyLogs, setHistoryLogs] = useState([]);

  // Fetch backend status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/firms/status`);
      if (res.ok) {
        const data = await res.json();
        setStatusInfo(data);
      }
    } catch (e) {
      console.warn('Unable to retrieve FIRMS ingestion status:', e);
    }
  }, []);

  // Fetch ingestion history audit log
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/firms/ingest/history?limit=15`);
      if (res.ok) {
        const data = await res.json();
        setHistoryLogs(data.history || []);
      }
    } catch (e) {
      console.warn('Unable to retrieve ingestion history:', e);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIngestionResult(null);
      setErrorMsg(null);
      setErrorCategory(null);
      fetchStatus();
      fetchHistory();
    }
  }, [isOpen, fetchStatus, fetchHistory]);

  if (!isOpen) return null;

  const handleTriggerIngest = async () => {
    setIsIngesting(true);
    setErrorMsg(null);
    setErrorCategory(null);
    setIngestionResult(null);

    const payload = {
      days: Number(selectedDays),
      source: selectedSource === 'ALL' ? null : selectedSource,
      run_pipeline: runPipeline
    };

    try {
      const res = await fetch(`${API_BASE}/api/firms/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.status === 'success') {
        setIngestionResult(data);
        fetchStatus();
        if (onIngestionSuccess) {
          onIngestionSuccess(data);
        }
      } else {
        setErrorMsg(data.message || 'Ingestion encountered an error.');
        setErrorCategory(data.error_category || 'INGESTION_ERROR');
      }
    } catch (err) {
      setErrorMsg(`Network failure: ${err.message || 'Could not communicate with backend API'}`);
      setErrorCategory('NETWORK_ERROR');
    } finally {
      setIsIngesting(false);
    }
  };

  const opStatus = statusInfo?.operational_status || (statusInfo?.is_live ? 'LIVE' : 'OFFLINE');
  const isKeyConfigured = statusInfo?.configured;


  return (
    <div className="dossier-modal-overlay" role="dialog" aria-modal="true" aria-label="NASA FIRMS Ingestion Console">
      <div className="dossier-modal-container firms-modal-container">
        {/* Toolbar Header */}
        <div className="dossier-toolbar">
          <div className="toolbar-left">
            <span className="toolbar-tag">
              <Satellite size={13} className="inline-icon-svg" />
              NASA FIRMS
            </span>
            <span className="toolbar-title">Near-Real-Time Satellite Thermal Ingestion Console</span>
          </div>
          <div className="toolbar-right">
            <button type="button" className="dossier-close-btn" onClick={onClose} aria-label="Close modal">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="firms-modal-sheet">
          {/* Status & Provenance Hero */}
          <div className="firms-status-hero">
            <div className="status-hero-left">
              <div className="status-hero-provenance">
                <span className="provenance-label">Operational Status:</span>
                <span className={`provenance-pill is-${opStatus.toLowerCase()}`}>
                  <span className="provenance-dot" />
                  {opStatus === 'LIVE' && 'LIVE NASA FIRMS'}
                  {opStatus === 'STALE' && 'NASA FIRMS · STALE'}
                  {opStatus === 'OFFLINE' && 'DEMO DATASET · OFFLINE ANALYSIS'}
                  {opStatus === 'ERROR' && 'NASA FIRMS · INGESTION ERROR'}
                </span>
              </div>
              <div className="status-hero-corridor">
                Corridor: <b>Jamshedpur–Odisha Belt (84.5°–86.8°E, 20.5°–23.2°N)</b>
              </div>
              {statusInfo?.latest_observation_ist && (
                <div className="status-hero-timestamps">
                  <span>Latest observation: <b>{statusInfo.latest_observation_ist}</b> ({statusInfo.observation_freshness_label || 'current'})</span>
                  {statusInfo.last_successful_ingestion_ist && (
                    <span> • Last ingest: <b>{statusInfo.last_successful_ingestion_ist}</b></span>
                  )}
                </div>
              )}
            </div>
            <div className="status-hero-right">
              <div className={`config-pill ${isKeyConfigured ? 'is-configured' : 'is-unconfigured'}`}>
                {isKeyConfigured ? (
                  <>
                    <CheckCircle2 size={12} className="inline-icon-svg" />
                    <span>MAP_KEY configured</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={12} className="inline-icon-svg" />
                    <span>No MAP_KEY in .env</span>
                  </>
                )}
              </div>
              <div className="status-latency-text">VIIRS 375m &amp; MODIS 1km NRT</div>
            </div>
          </div>

          {/* Configuration & Controls */}
          <div className="firms-controls-card">
            <div className="firms-card-title">Observation Parameters</div>
            <div className="firms-params-grid">
              <div className="param-field">
                <label className="param-label" htmlFor="firms-days-select">OBSERVATION WINDOW</label>
                <select
                  id="firms-days-select"
                  className="tactical-select firms-select"
                  value={selectedDays}
                  onChange={(e) => setSelectedDays(Number(e.target.value))}
                  disabled={isIngesting}
                >
                  <option value={1}>1 Day (Most recent 24h)</option>
                  <option value={2}>2 Days (Recommended NRT window)</option>
                  <option value={3}>3 Days (Expanded buffer)</option>
                  <option value={5}>5 Days (Maximum NRT window)</option>
                </select>
                <span className="param-hint">Restricted to corridor extent to conserve API quota</span>
              </div>

              <div className="param-field">
                <label className="param-label" htmlFor="firms-sensor-select">SENSOR / PRODUCT</label>
                <select
                  id="firms-sensor-select"
                  className="tactical-select firms-select"
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  disabled={isIngesting}
                >
                  <option value="ALL">All Primary Sensors (NOAA-21, NOAA-20, Suomi-NPP, MODIS)</option>
                  <option value="VIIRS_NOAA21_NRT">VIIRS NOAA-21 NRT (375m forward-compatible)</option>
                  <option value="VIIRS_NOAA20_NRT">VIIRS NOAA-20 NRT (375m forward-compatible)</option>
                  <option value="VIIRS_SNPP_NRT">VIIRS Suomi-NPP NRT (375m transition)</option>
                  <option value="MODIS_NRT">MODIS Terra/Aqua NRT (1km baseline)</option>
                </select>
                <span className="param-hint">
                  NOAA-21 and NOAA-20 are preferred forward-compatible products. NASA notes Suomi-NPP delivery ceases November 1, 2026.
                </span>
              </div>
            </div>

            <div className="firms-pipeline-toggle-row">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={runPipeline}
                  onChange={(e) => setRunPipeline(e.target.checked)}
                  disabled={isIngesting}
                />
                <span>Automatically run DBSCAN clustering &amp; 6-feature classification on newly committed records</span>
              </label>
            </div>
          </div>

          {/* Ingestion Action Button */}
          <div className="firms-action-row">
            <button
              type="button"
              className={`firms-submit-btn ${isIngesting ? 'is-loading' : ''}`}
              onClick={handleTriggerIngest}
              disabled={isIngesting}
            >
              {isIngesting ? (
                <>
                  <RotateCw size={14} className="btn-icon-svg is-spinning" />
                  <span>Connecting to NASA FIRMS &amp; processing observations...</span>
                </>
              ) : (
                <>
                  <Satellite size={14} className="btn-icon-svg" />
                  <span>Retrieve observations</span>
                </>
              )}
            </button>
          </div>

          {/* Detailed Ingestion Result Card */}
          {ingestionResult && (
            <div className="firms-result-card is-success">
              <div className="result-header">
                <CheckCircle2 size={15} className="result-icon-svg" />
                <span className="result-title">LIVE INGESTION COMPLETED</span>
                <span className="result-badge-pill">RESULT: SUCCESS</span>
              </div>

              {/* Zero-new-records vs new records message */}
              {ingestionResult.records_inserted === 0 ? (
                <div className="firms-info-notice">
                  <Info size={13} className="inline-icon-svg" />
                  <span><b>Zero New Records:</b> Live request successful. All returned observations were already present in the local dataset.</span>
                </div>
              ) : (
                <p className="result-message">{ingestionResult.message}</p>
              )}

              {/* Operational Metadata Grid */}
              <div className="operational-meta-grid">
                <div className="meta-item">
                  <span className="meta-key">Request</span>
                  <span className="meta-val">{ingestionResult.requested_window_days || selectedDays}-day observation window</span>
                </div>
                <div className="meta-item">
                  <span className="meta-key">Source</span>
                  <span className="meta-val">{ingestionResult.product_queried || selectedSource}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-key">Result</span>
                  <span className="meta-val text-success">SUCCESS</span>
                </div>
                <div className="meta-item">
                  <span className="meta-key">Latest observation</span>
                  <span className="meta-val">{ingestionResult.latest_observation_ist || ingestionResult.latest_observation_utc || 'N/A'}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-key">Last successful ingestion</span>
                  <span className="meta-val">{ingestionResult.last_successful_ingestion_ist || ingestionResult.last_successful_ingestion_utc || 'N/A'}</span>
                </div>
              </div>

              {/* Exact Count Boxes */}
              <div className="result-stats-grid">
                <div className="res-stat-box">
                  <span className="res-stat-label">RECEIVED</span>
                  <span className="res-stat-val">{ingestionResult.records_received}</span>
                </div>
                <div className="res-stat-box">
                  <span className="res-stat-label">VALIDATED</span>
                  <span className="res-stat-val">{ingestionResult.records_valid}</span>
                </div>
                <div className="res-stat-box">
                  <span className="res-stat-label">NEW COMMITTED</span>
                  <span className="res-stat-val highlight">{ingestionResult.records_inserted}</span>
                </div>
                <div className="res-stat-box">
                  <span className="res-stat-label">DUPLICATES</span>
                  <span className="res-stat-val">{ingestionResult.records_skipped_duplicate}</span>
                </div>
                <div className="res-stat-box">
                  <span className="res-stat-label">REJECTED</span>
                  <span className="res-stat-val">{ingestionResult.records_rejected}</span>
                </div>
              </div>

              {/* Downstream Pipeline Execution Status */}
              <div className="pipeline-status-box">
                <div className="pipeline-status-header">
                  <Layers size={13} className="inline-icon-svg" />
                  <span className="pipeline-title">Downstream Pipeline Execution:</span>
                  <span className={`pipeline-tag is-${(ingestionResult.pipeline_status || 'NOT_RUN').toLowerCase()}`}>
                    {ingestionResult.pipeline_status || 'NOT RUN'}
                  </span>
                </div>
                <div className="pipeline-status-desc">
                  {ingestionResult.pipeline_status === 'COMPLETED' && ingestionResult.pipeline && (
                    <span>
                      DBSCAN clustering &amp; 6-feature classification executed. Clusters Analyzed: <b>{ingestionResult.pipeline.clusters_processed || ingestionResult.pipeline.classifications_updated}</b> •{' '}
                      Persistent Industrial: <b>{ingestionResult.pipeline.classification_summary?.persistent_industrial ?? '-'}</b> •{' '}
                      Transient Fires: <b>{ingestionResult.pipeline.classification_summary?.transient_fire ?? '-'}</b>
                    </span>
                  )}
                  {ingestionResult.pipeline_status === 'NOT_RUN' && (
                    <span>
                      {ingestionResult.records_inserted === 0
                        ? 'Pipeline execution skipped: all incoming observations were deduplicated; existing verified cluster models remain active and valid.'
                        : 'Pipeline execution not requested.'}
                    </span>
                  )}
                  {ingestionResult.pipeline_status === 'FAILED' && (
                    <span className="text-danger">
                      Pipeline execution encountered an issue. Existing analytical dataset retained.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Safe Error Fallback Card */}
          {errorMsg && (
            <div className="firms-result-card is-error">
              <div className="result-header">
                <AlertTriangle size={15} className="result-icon-svg" />
                <span className="result-title">INGESTION HALTED — SAFE OFFLINE FALLBACK ACTIVE</span>
              </div>
              <p className="result-message">{errorMsg}</p>
              <div className="offline-fallback-assurance">
                <CheckCircle2 size={13} className="inline-icon-svg" />
                <span><b>Offline Data Preserved:</b> NASA FIRMS could not be reached. The verified offline dataset (407 observations) remains fully intact and available for analysis.</span>
              </div>
              <div className="error-resolution-guide">
                <b>Operational Guidance:</b>
                {errorCategory === 'CONFIGURATION_ERROR' && (
                  <span> To enable live satellite pulls, obtain a free NASA FIRMS MAP_KEY from <a href="https://firms.modaps.eosdis.nasa.gov/api/" target="_blank" rel="noreferrer">NASA EOSDIS</a> and configure it in <code>backend/.env</code> as <code>FIRMS_MAP_KEY=your_key</code>. The verified offline demonstration dataset remains fully active.</span>
                )}
                {errorCategory === 'AUTHENTICATION_ERROR' && (
                  <span> NASA rejected the configured MAP_KEY (HTTP 401/403). Please verify that your 32-character key is correctly copied into <code>backend/.env</code> without extra spaces.</span>
                )}
                {errorCategory === 'RATE_LIMIT' && (
                  <span> NASA FIRMS has temporarily rate-limited requests (HTTP 429). The system preserves all existing SQLite detections. Please retry in a few minutes.</span>
                )}
                {(errorCategory === 'NETWORK_ERROR' || errorCategory === 'TIMEOUT') && (
                  <span> Could not establish a connection to NASA FIRMS modaps servers. Verify internet connectivity. The offline dataset remains intact.</span>
                )}
              </div>
            </div>
          )}

          {/* Ingestion Audit Trail Section */}
          {historyLogs.length > 0 && (
            <div className="firms-controls-card history-card" style={{ marginTop: '1rem' }}>
              <div className="firms-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Ingestion Run Audit History &amp; Source Provenance</span>
                <span className="param-hint" style={{ fontSize: '0.75rem' }}>{historyLogs.length} total logged run{historyLogs.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted, #888)' }}>
                      <th style={{ padding: '6px' }}>Run ID</th>
                      <th style={{ padding: '6px' }}>Started At</th>
                      <th style={{ padding: '6px' }}>Source Product</th>
                      <th style={{ padding: '6px' }}>Recv / Valid / New</th>
                      <th style={{ padding: '6px' }}>Status</th>
                      <th style={{ padding: '6px' }}>Pipeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '6px', fontWeight: 'bold' }}>#{log.id}</td>
                        <td style={{ padding: '6px' }}>{log.started_at ? log.started_at.replace('T', ' ').substring(0, 19) : 'N/A'}</td>
                        <td style={{ padding: '6px' }}>{log.source || 'ALL'}</td>
                        <td style={{ padding: '6px' }}>{log.records_received} / {log.records_validated} / <b style={{ color: log.records_inserted > 0 ? '#4caf50' : 'inherit' }}>{log.records_inserted}</b></td>
                        <td style={{ padding: '6px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            backgroundColor: log.status === 'SUCCESS' ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)',
                            color: log.status === 'SUCCESS' ? '#81c784' : '#e57373'
                          }}>
                            {log.status}
                          </span>
                        </td>
                        <td style={{ padding: '6px', fontSize: '0.75rem', color: 'var(--text-muted, #aaa)' }}>
                          {log.pipeline_status || 'NOT_RUN'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Security & Transition Notice */}
          <div className="firms-security-footnote">
            <div className="footnote-item">
              <ShieldCheck size={13} className="inline-icon-svg" />
              <span><b>Security:</b> NASA credentials reside strictly on the backend and are never transmitted to client bundles or browser endpoints.</span>
            </div>
            <div className="footnote-item">
              <Info size={13} className="inline-icon-svg" />
              <span><b>Data Integrity:</b> Live ingestion is strictly additive. The 407-record verified baseline demonstration dataset is never overwritten or deleted.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
