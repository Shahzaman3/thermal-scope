import React, { useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Flame,
  X,
  RefreshCw,
  TrendingUp,
  ExternalLink,
  Sliders,
  CheckCircle2
} from 'lucide-react';

/**
 * ChangeDetectionPanel Component (Phase 4C.2)
 * Professional GIS / Satellite Intelligence Workstation Change Analysis Console.
 * Visualizes observed thermal activity changes:
 * - Emerging / New Thermal Sources (>2000m outside cluster footprints)
 * - High FRP Variance / Intensified (frp_trend_norm > 0.5)
 * - Borderline Score Transitions (persistence scores 0.35-0.45 or 0.65-0.75)
 */
export default function ChangeDetectionPanel({
  isOpen,
  onClose,
  changeData,
  isLoading,
  error,
  onRetry,
  selectedChange,
  onSelectChange,
  onReviewCluster
}) {
  const [activeFilter, setActiveFilter] = useState('ALL');

  // Normalize and combine change records from API data
  const normalizedRecords = useMemo(() => {
    if (!changeData) return [];
    const records = [];

    // 1. Emerging / New thermal sources
    if (Array.isArray(changeData.emerging_sources)) {
      changeData.emerging_sources.forEach((item, idx) => {
        records.push({
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
        });
      });
    }

    // 2. Flagged transitions (Borderline score and/or High FRP variance)
    if (Array.isArray(changeData.flagged_transitions)) {
      changeData.flagged_transitions.forEach((item) => {
        let category = 'HIGH_VARIANCE';
        let categoryLabel = 'High FRP Variance';
        let badgeColor = '#f97316';

        if (item.is_borderline && item.high_variance) {
          category = 'BORDERLINE_AND_VARIANCE';
          categoryLabel = 'Borderline & High FRP Variance';
          badgeColor = '#c084fc';
        } else if (item.is_borderline) {
          category = 'BORDERLINE';
          categoryLabel = 'Borderline Transition';
          badgeColor = '#f59e0b';
        }

        records.push({
          uid: `transition-${item.cluster_id}`,
          category,
          categoryLabel,
          targetId: `Cluster #${item.cluster_id}`,
          clusterId: item.cluster_id,
          lat: item.centroid_lat,
          lon: item.centroid_lon,
          persistenceScore: item.persistence_score,
          bandLabel: item.band_label,
          isBorderline: item.is_borderline,
          highVariance: item.high_variance,
          reason: item.reason || (item.is_borderline ? 'Borderline persistence score near classification threshold' : 'High FRP trend fluctuation'),
          badgeColor,
          raw: item
        });
      });
    }

    return records;
  }, [changeData]);

  // Derived category counts
  const counts = useMemo(() => {
    let emerging = 0;
    let highVariance = 0;
    let borderline = 0;

    normalizedRecords.forEach((r) => {
      if (r.category === 'EMERGING') emerging++;
      else if (r.category === 'BORDERLINE_AND_VARIANCE') {
        highVariance++;
        borderline++;
      } else if (r.category === 'BORDERLINE') borderline++;
      else if (r.category === 'HIGH_VARIANCE') highVariance++;
    });

    return {
      total: normalizedRecords.length,
      emerging,
      highVariance,
      borderline
    };
  }, [normalizedRecords]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    if (activeFilter === 'ALL') return normalizedRecords;
    if (activeFilter === 'EMERGING') {
      return normalizedRecords.filter((r) => r.category === 'EMERGING');
    }
    if (activeFilter === 'HIGH_VARIANCE') {
      return normalizedRecords.filter((r) => r.highVariance);
    }
    if (activeFilter === 'BORDERLINE') {
      return normalizedRecords.filter((r) => r.isBorderline);
    }
    return normalizedRecords;
  }, [normalizedRecords, activeFilter]);

  if (!isOpen) return null;

  return (
    <aside
      className="change-detection-panel"
      aria-label="Change Detection and Transition Tracking Console"
    >
      {/* Header */}
      <div className="change-panel-header">
        <div className="change-header-left">
          <div className="change-tag-row">
            <span className="change-panel-tag">
              <Activity size={12} className="inline-icon-svg" />
              PHASE 4C.2
            </span>
            <span className="change-status-pill">
              ACTIVE MONITORING
            </span>
          </div>
          <h2 className="change-panel-title">CHANGE DETECTION</h2>
          <p className="change-panel-subtitle">
            Thermal activity changes across observation periods
          </p>
        </div>
        <button
          type="button"
          className="change-close-btn"
          onClick={onClose}
          aria-label="Close Change Detection Panel"
        >
          <X size={15} />
        </button>
      </div>

      {/* Observation Comparison Window Information */}
      <div className="change-window-card">
        <span className="window-label">COMPARISON WINDOW:</span>
        <span className="window-value">
          Current Observations vs Historical Baseline
        </span>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="change-state-box is-loading" role="status" aria-live="polite">
          <RefreshCw size={18} className="btn-icon-svg is-spinning" />
          <span>Analyzing thermal transitions and emerging sources...</span>
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="change-state-box is-error" role="alert">
          <AlertTriangle size={20} className="text-danger inline-icon-svg" />
          <div className="change-error-title">CHANGE DATA UNAVAILABLE</div>
          <p className="change-error-msg">
            Unable to retrieve change analysis: {error}
          </p>
          <button
            type="button"
            className="change-retry-btn"
            onClick={onRetry}
          >
            <RefreshCw size={13} className="btn-icon-svg" />
            <span>Retry Analysis</span>
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {!isLoading && !error && (
        <>
          {/* Summary Strip (4 KPI chips) */}
          <div className="change-summary-grid">
            <button
              type="button"
              className={`change-kpi-chip ${activeFilter === 'ALL' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('ALL')}
              title="View all flagged thermal changes"
            >
              <span className="kpi-chip-label">TOTAL FLAGGED</span>
              <span className="kpi-chip-val text-accent">{counts.total}</span>
            </button>

            <button
              type="button"
              className={`change-kpi-chip ${activeFilter === 'EMERGING' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('EMERGING')}
              title="View newly emerging thermal sources"
            >
              <span className="kpi-chip-label">EMERGING / NEW</span>
              <span className="kpi-chip-val text-info">{counts.emerging}</span>
            </button>

            <button
              type="button"
              className={`change-kpi-chip ${activeFilter === 'HIGH_VARIANCE' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('HIGH_VARIANCE')}
              title="View clusters with high FRP trend variance"
            >
              <span className="kpi-chip-label">HIGH FRP VARIANCE</span>
              <span className="kpi-chip-val text-warning">{counts.highVariance}</span>
            </button>

            <button
              type="button"
              className={`change-kpi-chip ${activeFilter === 'BORDERLINE' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('BORDERLINE')}
              title="View clusters near classification boundary thresholds"
            >
              <span className="kpi-chip-label">BORDERLINE SCORE</span>
              <span className="kpi-chip-val text-amber">{counts.borderline}</span>
            </button>
          </div>

          {/* Filter Bar */}
          <div className="change-filter-bar">
            <span className="filter-bar-label">
              <Sliders size={12} className="inline-icon-svg" />
              FILTER:
            </span>
            <div className="filter-pill-group">
              {[
                { id: 'ALL', label: `All (${counts.total})` },
                { id: 'EMERGING', label: `Emerging (${counts.emerging})` },
                { id: 'HIGH_VARIANCE', label: `High FRP (${counts.highVariance})` },
                { id: 'BORDERLINE', label: `Borderline (${counts.borderline})` }
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`change-filter-btn ${activeFilter === f.id ? 'is-active' : ''}`}
                  onClick={() => setActiveFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Empty State */}
          {filteredRecords.length === 0 ? (
            <div className="change-state-box is-empty">
              <CheckCircle2 size={22} className="text-success inline-icon-svg" />
              <div className="change-empty-title">NO MATERIAL CHANGES DETECTED</div>
              <p className="change-empty-msg">
                No qualifying thermal activity changes were identified for the selected comparison window.
              </p>
            </div>
          ) : (
            /* Scrollable Change Detection List */
            <div className="change-list-container" role="list">
              {filteredRecords.map((item) => {
                const isSelected = selectedChange && selectedChange.uid === item.uid;

                return (
                  <div
                    key={item.uid}
                    role="listitem"
                    tabIndex={0}
                    className={`change-item-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => onSelectChange(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectChange(item);
                      }
                    }}
                  >
                    {/* Top row: Badge and Target */}
                    <div className="change-item-header">
                      <span
                        className="change-category-badge"
                        style={{
                          color: item.badgeColor,
                          borderColor: `${item.badgeColor}40`,
                          backgroundColor: `${item.badgeColor}15`
                        }}
                      >
                        {item.category === 'EMERGING' && <Flame size={11} className="inline-icon-svg" />}
                        {item.category === 'HIGH_VARIANCE' && <TrendingUp size={11} className="inline-icon-svg" />}
                        {item.category === 'BORDERLINE' && <AlertTriangle size={11} className="inline-icon-svg" />}
                        {item.category === 'BORDERLINE_AND_VARIANCE' && <TrendingUp size={11} className="inline-icon-svg" />}
                        <span>{item.categoryLabel}</span>
                      </span>
                      <span className="change-target-id">{item.targetId}</span>
                    </div>

                    {/* Middle: Evidence reason */}
                    <p className="change-item-reason">{item.reason}</p>

                    {/* Bottom metrics row */}
                    <div className="change-item-meta">
                      {item.persistenceScore !== undefined && (
                        <span className="meta-metric">
                          Persistence: <b>{(item.persistenceScore * 100).toFixed(1)}%</b>
                        </span>
                      )}
                      {item.bandLabel && (
                        <span className="meta-metric text-muted">
                          {item.bandLabel}
                        </span>
                      )}
                      {item.frp !== undefined && (
                        <span className="meta-metric">
                          FRP: <b>{item.frp.toFixed(1)} MW</b>
                        </span>
                      )}
                      {item.lat && item.lon && (
                        <span className="meta-coords">
                          {item.lat.toFixed(3)}°N, {item.lon.toFixed(3)}°E
                        </span>
                      )}
                    </div>

                    {/* Selected Item Expanded Detail Inspector */}
                    {isSelected && (
                      <div className="change-expanded-detail">
                        <div className="expanded-title-row">
                          <span className="expanded-title">OBSERVED EVIDENCE</span>
                          <span className="expanded-tag">SELECTED</span>
                        </div>

                        <div className="expanded-grid">
                          <div className="expanded-item">
                            <span className="expanded-k">Classification:</span>
                            <span className="expanded-v">{item.bandLabel || 'N/A (Unclustered Detection)'}</span>
                          </div>

                          {item.persistenceScore !== undefined && (
                            <div className="expanded-item">
                              <span className="expanded-k">Persistence Score:</span>
                              <span className="expanded-v font-mono">
                                {(item.persistenceScore * 100).toFixed(2)}% ({item.persistenceScore.toFixed(4)})
                              </span>
                            </div>
                          )}

                          {item.dist_to_cluster !== undefined && (
                            <div className="expanded-item">
                              <span className="expanded-k">Distance to Nearest Cluster:</span>
                              <span className="expanded-v font-mono">
                                {(item.dist_to_cluster / 1000).toFixed(2)} km
                              </span>
                            </div>
                          )}

                          {item.acq_datetime && (
                            <div className="expanded-item">
                              <span className="expanded-k">Observed Time:</span>
                              <span className="expanded-v font-mono">{item.acq_datetime}</span>
                            </div>
                          )}

                          {item.satellite && (
                            <div className="expanded-item">
                              <span className="expanded-k">Satellite Instrument:</span>
                              <span className="expanded-v">{item.satellite} ({item.confidence || 'verified'})</span>
                            </div>
                          )}
                        </div>

                        {/* Cluster Inspector Handoff */}
                        {item.clusterId && (
                          <div className="expanded-actions">
                            <button
                              type="button"
                              className="change-review-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onReviewCluster) onReviewCluster(item.clusterId);
                              }}
                            >
                              <ExternalLink size={13} className="btn-icon-svg" />
                              <span>Review in Cluster Inspector</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
