import React, { useState, useMemo } from 'react';
import {
  ListOrdered,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  X,
  ShieldAlert,
  ArrowRight,
  MapPin,
  FileText
} from 'lucide-react';

/**
 * AnalystPriorityQueue Component (Phase 5.1)
 * Dedicated GIS / Satellite Intelligence Decision-Support Priority Queue.
 *
 * Exposes real backend cluster prioritization from GET /api/v1/clusters/priority-queue:
 * - Preserves backend priority ranking order.
 * - Displays cluster ID, classification band, persistence score, industrial context.
 * - Displays review verification status: UNREVIEWED, UNDER_INVESTIGATION, VERIFIED_INDUSTRIAL, VERIFIED_WILDFIRE, DISMISSED.
 * - Provides deterministic filtering (Pending, High Priority, Reviewed, Classification bands).
 * - Connects to the existing ClusterDetailsPanel review workflow.
 */
export default function AnalystPriorityQueue({
  isOpen,
  onClose,
  queue = [],
  isLoading = false,
  error = null,
  onRetry,
  selectedClusterId = null,
  onSelectCluster,
  onOpenClusterReview
}) {
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'HIGH_PRIORITY' | 'REVIEWED'
  const [bandFilter, setBandFilter] = useState('ALL');     // 'ALL' | 'PERSISTENT' | 'AMBIGUOUS' | 'TRANSIENT'
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate dynamic summary counts from actual backend queue data
  const summaryCounts = useMemo(() => {
    let pending = 0;
    let highPriority = 0;
    let reviewed = 0;

    for (const item of queue) {
      const isPending = !item.review_status || item.review_status === 'UNREVIEWED';
      const isUnderInvestigation = item.review_status === 'UNDER_INVESTIGATION';
      const isAmbiguous = item.band_label && item.band_label.toLowerCase().includes('ambiguous');
      const isReviewed = item.review_status && item.review_status !== 'UNREVIEWED';

      if (isPending) pending++;
      if (isReviewed) reviewed++;
      if (isAmbiguous || isUnderInvestigation || (isPending && (item.persistence_score >= 0.4 && item.persistence_score <= 0.7))) {
        highPriority++;
      }
    }

    return {
      total: queue.length,
      pending,
      highPriority,
      reviewed
    };
  }, [queue]);

  // Filter items deterministically while preserving backend priority order
  const filteredQueue = useMemo(() => {
    return queue.filter((item) => {
      // 1. Status Filter
      const isPending = !item.review_status || item.review_status === 'UNREVIEWED';
      const isUnderInvestigation = item.review_status === 'UNDER_INVESTIGATION';
      const isAmbiguous = item.band_label && item.band_label.toLowerCase().includes('ambiguous');
      const isReviewed = item.review_status && item.review_status !== 'UNREVIEWED';

      if (activeFilter === 'PENDING' && !isPending) return false;
      if (activeFilter === 'HIGH_PRIORITY' && !(isAmbiguous || isUnderInvestigation || (isPending && (item.persistence_score >= 0.4 && item.persistence_score <= 0.7)))) {
        return false;
      }
      if (activeFilter === 'REVIEWED' && !isReviewed) return false;

      // 2. Band Filter
      if (bandFilter !== 'ALL') {
        const band = (item.band_label || '').toLowerCase();
        if (bandFilter === 'PERSISTENT' && !band.includes('persistent')) return false;
        if (bandFilter === 'AMBIGUOUS' && !band.includes('ambiguous')) return false;
        if (bandFilter === 'TRANSIENT' && !band.includes('transient')) return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const clusterMatch = `cluster #${item.cluster_id}`.toLowerCase().includes(query) ||
                             `${item.cluster_id}`.includes(query);
        const bandMatch = (item.band_label || '').toLowerCase().includes(query);
        const statusMatch = (item.review_status || '').toLowerCase().includes(query);
        const notesMatch = (item.notes || '').toLowerCase().includes(query);
        if (!clusterMatch && !bandMatch && !statusMatch && !notesMatch) {
          return false;
        }
      }

      return true;
    });
  }, [queue, activeFilter, bandFilter, searchQuery]);

  if (!isOpen) return null;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'VERIFIED_INDUSTRIAL':
        return <span className="review-status-badge status-industrial">VERIFIED INDUSTRIAL</span>;
      case 'VERIFIED_WILDFIRE':
        return <span className="review-status-badge status-wildfire">VERIFIED WILDFIRE</span>;
      case 'UNDER_INVESTIGATION':
        return <span className="review-status-badge status-investigating">UNDER INVESTIGATION</span>;
      case 'DISMISSED':
        return <span className="review-status-badge status-dismissed">DISMISSED</span>;
      case 'UNREVIEWED':
      default:
        return <span className="review-status-badge status-unreviewed">UNREVIEWED</span>;
    }
  };

  const getBandBadge = (bandLabel) => {
    const band = (bandLabel || '').toLowerCase();
    if (band.includes('persistent')) {
      return <span className="queue-band-pill band-persistent">Persistent</span>;
    }
    if (band.includes('ambiguous')) {
      return <span className="queue-band-pill band-ambiguous">Ambiguous / Review</span>;
    }
    return <span className="queue-band-pill band-transient">Transient</span>;
  };

  const getPriorityTier = (item, rank) => {
    const isAmbiguous = item.band_label && item.band_label.toLowerCase().includes('ambiguous');
    const isUnderInvestigation = item.review_status === 'UNDER_INVESTIGATION';
    if (isAmbiguous || isUnderInvestigation || rank <= 3) {
      return { label: 'HIGH PRIORITY', class: 'priority-high' };
    }
    if (rank <= 10) {
      return { label: 'EVALUATION QUEUE', class: 'priority-medium' };
    }
    return { label: 'ROUTINE VERIFICATION', class: 'priority-routine' };
  };

  return (
    <aside
      className="inspector-panel analyst-queue-panel"
      id="analyst-priority-queue"
      role="region"
      aria-label="Analyst Priority Queue and Review Console"
    >
      {/* Top Header */}
      <div className="queue-panel-header">
        <div className="queue-panel-header-titles">
          <div className="queue-header-icon-wrapper" aria-hidden="true">
            <ListOrdered size={16} />
          </div>
          <div>
            <span className="queue-panel-pretitle">ANALYST DECISION SUPPORT</span>
            <h2 className="queue-panel-main-title">Analyst Priority Queue</h2>
          </div>
        </div>

        <div className="queue-panel-actions">
          {onRetry && (
            <button
              type="button"
              className="panel-tool-btn"
              onClick={onRetry}
              disabled={isLoading}
              title="Refresh queue from server"
              aria-label="Refresh Queue"
            >
              <RefreshCw size={13} className={isLoading ? 'is-spinning' : ''} />
            </button>
          )}
          <button
            type="button"
            className="panel-tool-btn close-btn"
            onClick={onClose}
            title="Close analyst queue"
            aria-label="Close Queue"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Panel Content */}
      <div className="queue-panel-content">
        {/* Context Card */}
        <div className="queue-context-card">
          <div className="context-header">
            <ShieldAlert size={13} className="inline-icon-svg" />
            <span>OPERATIONAL REVIEW PRIORITIZATION</span>
          </div>
          <p className="context-desc">
            Clusters ranked deterministically by analytical urgency. Evaluates ambiguous boundary transitions, high-recurrence heavy industrial candidates, and pending ground-truth verification requests.
          </p>
        </div>

        {/* Dynamic Summary KPI Grid */}
        <div className="queue-summary-grid" role="group" aria-label="Queue Summary Metrics">
          <button
            type="button"
            className={`queue-kpi-chip kpi-total ${activeFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveFilter('ALL')}
            aria-pressed={activeFilter === 'ALL'}
          >
            <span className="kpi-chip-label">TOTAL QUEUED</span>
            <span className="kpi-chip-value">{summaryCounts.total}</span>
          </button>

          <button
            type="button"
            className={`queue-kpi-chip kpi-pending ${activeFilter === 'PENDING' ? 'active' : ''}`}
            onClick={() => setActiveFilter('PENDING')}
            aria-pressed={activeFilter === 'PENDING'}
          >
            <span className="kpi-chip-label">PENDING REVIEW</span>
            <span className="kpi-chip-value">{summaryCounts.pending}</span>
          </button>

          <button
            type="button"
            className={`queue-kpi-chip kpi-high ${activeFilter === 'HIGH_PRIORITY' ? 'active' : ''}`}
            onClick={() => setActiveFilter('HIGH_PRIORITY')}
            aria-pressed={activeFilter === 'HIGH_PRIORITY'}
          >
            <span className="kpi-chip-label">HIGH PRIORITY</span>
            <span className="kpi-chip-value">{summaryCounts.highPriority}</span>
          </button>

          <button
            type="button"
            className={`queue-kpi-chip kpi-reviewed ${activeFilter === 'REVIEWED' ? 'active' : ''}`}
            onClick={() => setActiveFilter('REVIEWED')}
            aria-pressed={activeFilter === 'REVIEWED'}
          >
            <span className="kpi-chip-label">REVIEWED</span>
            <span className="kpi-chip-value">{summaryCounts.reviewed}</span>
          </button>
        </div>

        {/* Search & Band Filter Bar */}
        <div className="queue-controls-bar">
          <div className="queue-search-box">
            <Search size={13} className="search-icon-svg" aria-hidden="true" />
            <input
              type="text"
              className="queue-search-input"
              placeholder="Search cluster ID, band, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search priority queue"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={11} />
              </button>
            )}
          </div>

          <div className="queue-band-filter">
            <select
              className="tactical-select queue-band-select"
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value)}
              aria-label="Filter by classification band"
            >
              <option value="ALL">All Bands</option>
              <option value="PERSISTENT">Persistent Industrial</option>
              <option value="AMBIGUOUS">Ambiguous / Review</option>
              <option value="TRANSIENT">Transient Wildfire</option>
            </select>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && queue.length === 0 && (
          <div className="panel-loading-state" role="status" aria-live="polite">
            <div className="loading-spinner-ring" />
            <div className="loading-label">Retrieving analyst priority queue...</div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="queue-error-state" role="alert">
            <AlertTriangle size={20} className="error-icon-svg" />
            <div className="queue-error-title">ANALYST QUEUE UNAVAILABLE</div>
            <p className="queue-error-desc">
              Unable to retrieve cluster prioritization queue from server. Please verify backend service availability.
            </p>
            {onRetry && (
              <button type="button" className="queue-retry-btn" onClick={onRetry}>
                Retry Analysis
              </button>
            )}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredQueue.length === 0 && (
          <div className="queue-empty-state" role="status">
            <CheckCircle2 size={24} className="queue-empty-icon" />
            <div className="queue-empty-title">NO PENDING ANALYST ITEMS</div>
            <p className="queue-empty-desc">
              {searchQuery || bandFilter !== 'ALL' || activeFilter !== 'ALL'
                ? 'No queue items match the currently applied filters or search query.'
                : 'No new analyst-priority items are currently awaiting review.'}
            </p>
            {(searchQuery || bandFilter !== 'ALL' || activeFilter !== 'ALL') && (
              <button
                type="button"
                className="queue-reset-filters-btn"
                onClick={() => {
                  setActiveFilter('ALL');
                  setBandFilter('ALL');
                  setSearchQuery('');
                }}
              >
                Reset All Filters
              </button>
            )}
          </div>
        )}

        {/* Queue List */}
        {!isLoading && !error && filteredQueue.length > 0 && (
          <div className="queue-list-section">
            <div className="queue-list-header">
              <span>PRIORITY-ORDERED CLUSTERS ({filteredQueue.length})</span>
              <span className="sort-hint">Backend Ranked</span>
            </div>

            <div className="queue-list-container" role="list">
              {filteredQueue.map((item) => {
                const originalIndex = queue.findIndex(q => q.cluster_id === item.cluster_id);
                const rank = (originalIndex >= 0 ? originalIndex : 0) + 1;
                const tier = getPriorityTier(item, rank);
                const isSelected = selectedClusterId === item.cluster_id;

                return (
                  <div
                    key={`queue-item-${item.cluster_id}`}
                    className={`queue-item-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      if (onSelectCluster) {
                        onSelectCluster(item.cluster_id, { lat: item.centroid_lat, lon: item.centroid_lon });
                      }
                    }}
                    role="listitem"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (onSelectCluster) {
                          onSelectCluster(item.cluster_id, { lat: item.centroid_lat, lon: item.centroid_lon });
                        }
                      }
                    }}
                    aria-label={`Queue Rank ${rank}: Cluster #${item.cluster_id}, ${item.band_label}, persistence score ${(item.persistence_score * 100).toFixed(1)} percent`}
                  >
                    {/* Top Row: Rank, Priority Tier, Status */}
                    <div className="queue-item-top">
                      <div className="queue-rank-wrap">
                        <span className="queue-rank-badge">#{rank}</span>
                        <span className={`queue-tier-badge ${tier.class}`}>{tier.label}</span>
                      </div>
                      {getStatusBadge(item.review_status)}
                    </div>

                    {/* Middle Row: Cluster Title, Persistence Score, Band */}
                    <div className="queue-item-body">
                      <div className="queue-item-title-row">
                        <span className="queue-cluster-id">Cluster #{item.cluster_id}</span>
                        <span className="queue-persistence-score">
                          Score: <b>{(item.persistence_score * 100).toFixed(1)}%</b>
                        </span>
                      </div>
                      <div className="queue-band-row">
                        {getBandBadge(item.band_label)}
                        <span className="queue-coordinates">
                          <MapPin size={10} className="inline-icon-svg" />
                          {item.centroid_lat.toFixed(4)}, {item.centroid_lon.toFixed(4)}
                        </span>
                      </div>
                    </div>

                    {/* Metrics Strip */}
                    <div className="queue-item-metrics">
                      <span className="queue-metric-chip">
                        Detections: <b>{item.detection_count}</b>
                      </span>
                      {item.dist_to_nearest_industrial !== undefined && item.dist_to_nearest_industrial !== null && (
                        <span className="queue-metric-chip">
                          Industrial Proximity: <b>{(item.dist_to_nearest_industrial / 1000).toFixed(2)} km</b>
                        </span>
                      )}
                    </div>

                    {/* Analyst Notes Preview if present */}
                    {item.notes && (
                      <div className="queue-notes-preview">
                        <FileText size={10} className="inline-icon-svg" />
                        <span className="queue-notes-text">"{item.notes}"</span>
                      </div>
                    )}

                    {/* Card Actions */}
                    <div className="queue-item-actions">
                      <button
                        type="button"
                        className="queue-review-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenClusterReview) {
                            onOpenClusterReview(item.cluster_id, { lat: item.centroid_lat, lon: item.centroid_lon });
                          } else if (onSelectCluster) {
                            onSelectCluster(item.cluster_id, { lat: item.centroid_lat, lon: item.centroid_lon });
                          }
                        }}
                        title={`Open Cluster #${item.cluster_id} in Cluster Assessment Panel`}
                      >
                        <span>Review in Cluster Inspector</span>
                        <ArrowRight size={12} className="inline-icon-svg" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
