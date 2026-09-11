import React, { useState, useRef, useEffect } from 'react';
import {
  Satellite,
  Target,
  Sliders,
  Activity,
  ListOrdered,
  Download,
  FileSpreadsheet,
  RotateCw,
  Radio,
  X
} from 'lucide-react';


/**
 * Tactical Header Component — Professional GIS / Intelligence Workstation
 * Phase 4B.1: Operational Data Status, Provenance & Data Freshness Observability
 */
export default function TacticalHeader({
  isRefreshing,
  onRefresh,
  onOpenTuner,
  onOpenSimulator,
  onExportCsv,
  onExportGeoJson,
  benchmarkRecall,
  firmsStatus,
  onOpenFirmsModal,
  totalDetections = 407,
  changeCount = 0,
  isChangePanelOpen = false,
  onToggleChangePanel,
  pendingQueueCount = 0,
  isQueueOpen = false,
  onToggleQueue
}) {
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const popoverRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setShowStatusPopover(false);
      }
    }
    if (showStatusPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStatusPopover]);

  // Determine explicit operational state: LIVE | STALE | OFFLINE | ERROR
  const opStatus = firmsStatus?.operational_status || (firmsStatus?.is_live ? 'LIVE' : 'OFFLINE');

  // Format header status indicators
  let badgeLabel = 'OFFLINE DEMONSTRATION';
  let statusSummary = `Dataset verified · ${totalDetections} observations`;
  let badgeClass = 'mode-demo';

  if (opStatus === 'LIVE') {
    badgeLabel = 'LIVE NASA FIRMS';
    badgeClass = 'mode-live';
    const timeStr = firmsStatus?.last_successful_ingestion_ist
      ? (firmsStatus.last_successful_ingestion_ist.includes('·')
          ? firmsStatus.last_successful_ingestion_ist.split('·')[1].trim()
          : firmsStatus.last_successful_ingestion_ist)
      : 'recent';
    const obsStr = firmsStatus?.observation_freshness_label || 'recent';
    statusSummary = `Last ingest ${timeStr} · Latest obs ${obsStr}`;
  } else if (opStatus === 'STALE') {
    badgeLabel = 'NASA FIRMS';
    badgeClass = 'mode-stale';
    const obsStr = firmsStatus?.observation_freshness_label || '24h+ old';
    statusSummary = `STALE · latest observation ${obsStr}`;
  } else if (opStatus === 'ERROR') {
    badgeLabel = 'NASA FIRMS';
    badgeClass = 'mode-error';
    statusSummary = 'INGESTION ERROR · offline dataset retained';
  } else {
    // OFFLINE
    badgeLabel = 'OFFLINE DEMONSTRATION';
    badgeClass = 'mode-demo';
    statusSummary = `Dataset verified · ${totalDetections} observations`;
  }

  return (
    <header className="tactical-header" role="banner">
      <div className="header-branding">
        <div className="ntro-crest">
          <span className="crest-code">NTRO</span>
          <span className="crest-sub">IGNITRA</span>
        </div>
        <div className="branding-text">
          <h1 className="system-title">
            Thermal Source Intelligence
          </h1>
          <div className="system-subline">
            <span className="subline-role">Satellite Thermal Anomaly Monitoring</span>
            <span className="separator">•</span>
            <span className="subline-region">Jamshedpur–Odisha Corridor</span>
            <span className="separator">•</span>
            {/* Interactive Operational Status Badge */}
            <button
              type="button"
              className={`dataset-mode-badge ${badgeClass}`}
              onClick={() => setShowStatusPopover(!showStatusPopover)}
              title="Click to inspect operational data status, telemetry, and observation freshness"
              aria-label={`Operational status: ${badgeLabel} - ${statusSummary}`}
            >
              <span className="mode-status-indicator" />
              <span className="badge-mode-text">{badgeLabel}</span>
              <span className="badge-sub-text">{statusSummary}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="header-actions">
        {/* Data Status Popover Trigger */}
        <div className="status-popover-wrapper" ref={popoverRef}>
          <button
            type="button"
            className={`tactical-btn action-btn status-btn ${showStatusPopover ? 'is-active' : ''}`}
            onClick={() => setShowStatusPopover(!showStatusPopover)}
            title="Inspect satellite data status, freshness, and ingestion telemetry"
            aria-label="Toggle Data Status Panel"
          >
            <Radio size={14} className="btn-icon-svg" />
            <span className="btn-text">Data Status</span>
          </button>

          {/* Compact Data Status Popover */}
          {showStatusPopover && (
            <div className="data-status-popover" role="dialog" aria-label="Operational Data Status Panel">
              <div className="popover-header">
                <div className="popover-header-title">
                  <Activity size={13} className="inline-icon-svg" />
                  <span>DATA STATUS</span>
                </div>
                <button
                  type="button"
                  className="popover-close-btn"
                  onClick={() => setShowStatusPopover(false)}
                  aria-label="Close status panel"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="popover-body">
                <div className="status-entry">
                  <span className="entry-key">NASA FIRMS</span>
                  <span className={`status-tag-pill is-${opStatus.toLowerCase()}`}>
                    {opStatus}
                  </span>
                </div>

                <div className="status-entry">
                  <span className="entry-key">Last Ingestion</span>
                  <span className="entry-val">
                    {firmsStatus?.last_successful_ingestion_ist || 'Offline baseline'}
                  </span>
                </div>

                <div className="status-entry">
                  <span className="entry-key">Latest Observation</span>
                  <span className="entry-val">
                    {firmsStatus?.observation_freshness_label
                      ? `${firmsStatus.observation_freshness_label} (${firmsStatus.latest_observation_ist || firmsStatus.latest_observation_utc || 'NRT'})`
                      : (firmsStatus?.latest_observation_ist || 'Verified Baseline')}
                  </span>
                </div>

                <div className="status-entry">
                  <span className="entry-key">Source</span>
                  <span className="entry-val">
                    {firmsStatus?.product_queried || (opStatus === 'OFFLINE' ? 'VIIRS/MODIS Baseline' : 'VIIRS NOAA-21 NRT')}
                  </span>
                </div>

                <div className="status-entry">
                  <span className="entry-key">Observations</span>
                  <span className="entry-val">
                    {opStatus === 'OFFLINE'
                      ? `${totalDetections} verified records`
                      : `${firmsStatus?.records_received ?? 0} received · ${firmsStatus?.records_valid ?? 0} validated`}
                  </span>
                </div>

                <div className="status-entry">
                  <span className="entry-key">Database</span>
                  <span className="entry-val">{totalDetections} records</span>
                </div>

                <div className="status-entry">
                  <span className="entry-key">Pipeline</span>
                  <span className="entry-val">
                    {firmsStatus?.pipeline_status === 'COMPLETED'
                      ? 'Completed'
                      : (firmsStatus?.pipeline_status === 'FAILED'
                          ? 'Failed (offline retained)'
                          : 'Ready')}
                  </span>
                </div>
              </div>

              <div className="popover-footer">
                <button
                  type="button"
                  className="popover-action-btn"
                  onClick={() => {
                    setShowStatusPopover(false);
                    onOpenFirmsModal();
                  }}
                >
                  <Satellite size={12} className="inline-icon-svg" />
                  <span>Open Ingestion Console</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live NASA FIRMS Ingest Trigger */}
        <button
          type="button"
          className={`tactical-btn action-btn firms-btn ${opStatus === 'LIVE' ? 'is-live' : ''}`}
          onClick={onOpenFirmsModal}
          title="Safe live NASA FIRMS satellite thermal anomaly ingestion console"
          aria-label="NASA FIRMS Ingestion"
        >
          <Satellite size={14} className="btn-icon-svg" />
          <span className="btn-text">FIRMS Ingest</span>
        </button>

        {/* Phase 4C.2: Change Detection Console Trigger */}
        <button
          type="button"
          className={`tactical-btn action-btn change-btn ${isChangePanelOpen ? 'is-active' : ''}`}
          onClick={onToggleChangePanel}
          title="Inspect thermal activity changes across observation periods"
          aria-label={`Change Detection: ${changeCount ?? 0} flagged items`}
        >
          <Activity size={14} className="btn-icon-svg" />
          <span className="btn-text">Change Detection</span>
          <span className="btn-counter-badge">{changeCount ?? 0}</span>
        </button>

        {/* Phase 5.1: Analyst Priority Queue Trigger */}
        <button
          type="button"
          className={`tactical-btn action-btn queue-btn ${isQueueOpen ? 'is-active' : ''}`}
          onClick={onToggleQueue}
          title="Inspect analyst priority review queue and verification workflow"
          aria-label={`Analyst Priority Queue: ${pendingQueueCount ?? 0} pending items`}
        >
          <ListOrdered size={14} className="btn-icon-svg" />
          <span className="btn-text">Analyst Queue</span>
          <span className="btn-counter-badge queue-counter-badge">{pendingQueueCount ?? 0}</span>
        </button>

        {/* Benchmark Recall Badge */}
        {benchmarkRecall !== undefined && (
          <button
            type="button"
            className="tactical-btn benchmark-btn"
            onClick={onOpenTuner}
            title="Ground-truth validation: 100% industrial recall on benchmark dataset. Click to inspect weights."
            aria-label={`Industrial Recall ${benchmarkRecall} percent`}
          >
            <Target size={14} className="btn-icon-svg" />
            <span className="btn-text">
              Recall: <b>{benchmarkRecall}%</b>
            </span>
          </button>
        )}

        {/* Sensitivity Weight Tuner */}
        <button
          type="button"
          className="tactical-btn action-btn tuner-btn"
          onClick={onOpenTuner}
          title="Inspect and adjust 6-feature weighting matrix"
          aria-label="Adjust feature weights"
        >
          <Sliders size={14} className="btn-icon-svg" />
          <span className="btn-text">Feature Weights</span>
        </button>

        {/* Hotspot Anomaly Simulator */}
        <button
          type="button"
          className="tactical-btn action-btn simulator-btn"
          onClick={onOpenSimulator}
          title="Simulate hypothetical thermal anomaly profiles"
          aria-label="Thermal anomaly simulator"
        >
          <Activity size={14} className="btn-icon-svg" />
          <span className="btn-text">Simulation</span>
        </button>

        {/* Export GeoJSON for QGIS / ArcGIS */}
        <button
          type="button"
          className="tactical-btn action-btn geojson-btn"
          onClick={onExportGeoJson}
          title="Export all classified clusters in RFC 7946 GeoJSON format for QGIS / ArcGIS"
          aria-label="Export all clusters to GeoJSON"
        >
          <Download size={14} className="btn-icon-svg" />
          <span className="btn-text">GeoJSON</span>
        </button>

        {/* Export Dossier CSV */}
        <button
          type="button"
          className="tactical-btn action-btn export-btn"
          onClick={onExportCsv}
          title="Export cluster summary as CSV"
          aria-label="Export summary to CSV"
        >
          <FileSpreadsheet size={14} className="btn-icon-svg" />
          <span className="btn-text">CSV</span>
        </button>

        {/* Refresh Local Telemetry */}
        <button
          type="button"
          className={`tactical-btn icon-only-btn ${isRefreshing ? 'is-spinning' : ''}`}
          onClick={onRefresh}
          title="Refresh intelligence telemetry from database"
          aria-label="Refresh telemetry data"
        >
          <RotateCw size={14} className="btn-icon-svg" />
        </button>
      </div>
    </header>
  );
}
