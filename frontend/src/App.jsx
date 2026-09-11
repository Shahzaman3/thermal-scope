import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Target, AlertTriangle, Info } from 'lucide-react';
import TacticalHeader from './components/TacticalHeader';
import TacticalSummaryBar from './components/TacticalSummaryBar';
import MapView from './components/MapView';
import ClusterDetailsPanel from './components/ClusterDetailsPanel';
import ChangeDetectionPanel from './components/ChangeDetectionPanel';
import AnalystPriorityQueue from './components/AnalystPriorityQueue';
import WeightTunerModal from './components/WeightTunerModal';
import SimulatorModal from './components/SimulatorModal';
import PrintableDossierModal from './components/PrintableDossierModal';
import FirmsIngestionModal from './components/FirmsIngestionModal';
import { clustersToGeoJSON, downloadGeoJSON } from './utils/geojsonExport';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const DEFAULT_WEIGHTS = {
  recurrence_count: 0.25,
  recurrence_regularity: 0.20,
  dist_to_nearest_industrial: 0.20,
  spatial_stability: 0.15,
  frp_trend: 0.10,
  day_night_ratio: 0.10
};

const BENCHMARK_TARGETS = [
  { name: 'Tata Steel Works (Jamshedpur)', lat: 22.8015, lon: 86.1950, band: 'Persistent' },
  { name: 'Rourkela Steel Plant (SAIL)', lat: 22.2285, lon: 84.8690, band: 'Persistent' },
  { name: 'Tata Steel Kalinganagar Complex', lat: 20.9650, lon: 86.0120, band: 'Persistent' },
  { name: 'Talcher Super Thermal (NTPC)', lat: 20.9150, lon: 85.2200, band: 'Persistent' },
  { name: 'Neelachal Ispat Nigam (NINL)', lat: 20.9420, lon: 85.9800, band: 'Persistent' },
  { name: 'Barbil Sponge Iron & Mining Hub', lat: 22.1150, lon: 85.3950, band: 'Ambiguous' },
  { name: 'Keonjhar Pellet Plant Area', lat: 21.6300, lon: 85.5800, band: 'Ambiguous' },
  { name: 'Similipal Forest Perimeter Wildfire', lat: 21.8200, lon: 86.3500, band: 'Transient' },
  { name: 'Saranda Forest Seasonal Burn', lat: 22.3100, lon: 85.2800, band: 'Transient' },
  { name: 'Mayurbhanj Scrubland Fire Area', lat: 22.0500, lon: 86.7200, band: 'Transient' }
];

export default function App() {
  const [rawClusters, setRawClusters] = useState([]);
  const [osmSites, setOsmSites] = useState([]);
  const [summary, setSummary] = useState(null);
  const [evaluationMetrics, setEvaluationMetrics] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [clusterDetail, setClusterDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [bandFilter, setBandFilter] = useState('ALL');
  const [showOsmSites, setShowOsmSites] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [flyToTarget, setFlyToTarget] = useState(null);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [isTunerOpen, setIsTunerOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [isFirmsModalOpen, setIsFirmsModalOpen] = useState(false);
  const [firmsStatus, setFirmsStatus] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Phase 4C.2: Change Detection & Transition Tracking State
  const [changeData, setChangeData] = useState(null);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [changeError, setChangeError] = useState(null);
  const [selectedChange, setSelectedChange] = useState(null);
  const [isChangePanelOpen, setIsChangePanelOpen] = useState(false);
  const [showChangeLayer, setShowChangeLayer] = useState(true);

  // Phase 5.1: Analyst Priority Queue State
  const [priorityQueue, setPriorityQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [queueError, setQueueError] = useState(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch initial telemetry, ground-truth validation metrics, and live FIRMS status
  const loadInitialData = useCallback(async () => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const [sumRes, osmRes, evalRes, firmsRes] = await Promise.all([
        fetch(`${API_BASE}/api/summary`).then((r) => {
          if (!r.ok) throw new Error(`Summary HTTP ${r.status}`);
          return r.json();
        }),
        fetch(`${API_BASE}/api/osm-sites?limit=250`).then((r) => {
          if (!r.ok) throw new Error(`OSM HTTP ${r.status}`);
          return r.json();
        }),
        fetch(`${API_BASE}/api/evaluation`).then((r) => r.json()).catch(() => null),
        fetch(`${API_BASE}/api/firms/status`).then((r) => r.json()).catch(() => null)
      ]);
      setSummary(sumRes);
      setOsmSites(osmRes || []);
      setEvaluationMetrics(evalRes);
      if (firmsRes) setFirmsStatus(firmsRes);
    } catch (err) {
      console.error('Error fetching initial telemetry:', err);
      setLoadError(err.message || 'Unable to communicate with local SQLite backend API.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const loadClusters = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/clusters`);
      if (!res.ok) throw new Error(`Clusters HTTP ${res.status}`);
      const data = await res.json();
      setRawClusters(data || []);
    } catch (err) {
      console.error('Error fetching clusters:', err);
      setLoadError(err.message || 'Failed to retrieve cluster list from API.');
    }
  }, []);

  const loadChangeData = useCallback(async () => {
    setLoadingChanges(true);
    setChangeError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/analytics/changes`);
      if (!res.ok) throw new Error(`Change detection HTTP ${res.status}`);
      const data = await res.json();
      setChangeData(data);
    } catch (err) {
      console.error('Error loading change detection data:', err);
      setChangeError(err.message || 'Unable to retrieve change analysis.');
    } finally {
      setLoadingChanges(false);
    }
  }, []);

  const loadPriorityQueue = useCallback(async () => {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/clusters/priority-queue?limit=50`);
      if (!res.ok) throw new Error(`Priority queue HTTP ${res.status}`);
      const data = await res.json();
      setPriorityQueue(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading priority queue:', err);
      setQueueError(err.message || 'Unable to retrieve analyst priority queue.');
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
    loadClusters();
    loadChangeData();
    loadPriorityQueue();
  }, [loadInitialData, loadClusters, loadChangeData, loadPriorityQueue]);

  const totalChangesCount = useMemo(() => {
    if (!changeData) return 0;
    return (changeData.emerging_sources_count || 0) + (changeData.flagged_transitions_count || 0);
  }, [changeData]);

  const pendingQueueCount = useMemo(() => {
    return priorityQueue.filter(
      item => !item.review_status || item.review_status === 'UNREVIEWED'
    ).length;
  }, [priorityQueue]);

  const handleSelectClusterFromQueue = (clusterId, coords) => {
    const match = rawClusters.find(c => c.cluster_id === clusterId);
    if (match) {
      handleSelectCluster(match);
    }
    if (coords) {
      setFlyToTarget(coords);
    }
  };

  const handleOpenClusterReviewFromQueue = (clusterId, coords) => {
    const match = rawClusters.find(c => c.cluster_id === clusterId);
    if (match) {
      handleSelectCluster(match);
      setIsQueueOpen(false);
    }
    if (coords) {
      setFlyToTarget(coords);
    }
  };

  const handleReviewSaved = (clusterId) => {
    loadPriorityQueue();
    loadClusters();
    showToast(`Analyst verification recorded for Cluster #${clusterId}`);
  };

  const handleSelectChange = (item) => {
    setSelectedChange(item);
    if (item.lat && item.lon) {
      setFlyToTarget({ lat: item.lat, lon: item.lon });
    }
  };

  const handleReviewClusterFromChange = (clusterId) => {
    const match = processedClusters.find(c => c.cluster_id === clusterId);
    if (match) {
      handleSelectCluster(match);
      setIsChangePanelOpen(false);
    }
  };

  // Recalculate clusters dynamically using client-tuned weights
  const processedClusters = useMemo(() => {
    return rawClusters.map((c) => {
      const rc = c.recurrence_count_norm ?? 0;
      const reg = c.regularity_norm ?? 0;
      const dist = c.dist_to_industrial_norm ?? 0;
      const stab = c.spatial_stability_norm ?? 0;
      const frp = c.frp_trend_norm ?? 0;
      const dn = c.day_night_ratio_norm ?? 0;

      const dynamicScore = Number((
        weights.recurrence_count * rc +
        weights.recurrence_regularity * reg +
        weights.dist_to_nearest_industrial * dist +
        weights.spatial_stability * stab +
        weights.frp_trend * frp +
        weights.day_night_ratio * dn
      ).toFixed(4));

      let band = "Transient fire event";
      if (dynamicScore >= 0.70) band = "Persistent industrial source";
      else if (dynamicScore >= 0.40) band = "Ambiguous / flagged for review";

      return {
        ...c,
        persistence_score: dynamicScore,
        band_label: band
      };
    });
  }, [rawClusters, weights]);

  // Dynamic band counts based on current weights
  const dynamicCounts = useMemo(() => {
    const counts = { persistent: 0, ambiguous: 0, transient: 0 };
    processedClusters.forEach((c) => {
      if (c.band_label === 'Persistent industrial source') counts.persistent++;
      else if (c.band_label === 'Ambiguous / flagged for review') counts.ambiguous++;
      else counts.transient++;
    });
    return counts;
  }, [processedClusters]);

  // Filtered clusters for map view
  const visibleClusters = useMemo(() => {
    if (bandFilter === 'ALL') return processedClusters;
    return processedClusters.filter((c) => c.band_label === bandFilter);
  }, [processedClusters, bandFilter]);

  // When a cluster marker is clicked
  const handleSelectCluster = async (cluster) => {
    setSelectedCluster(cluster);
    setFlyToTarget({ lat: cluster.centroid_lat, lon: cluster.centroid_lon });
    setLoadingDetail(true);
    try {
      const res = await fetch(`${API_BASE}/api/clusters/${cluster.cluster_id}`);
      if (!res.ok) throw new Error(`Cluster detail HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.classification) {
        data.classification.persistence_score = cluster.persistence_score;
        data.classification.band_label = cluster.band_label;
      }
      setClusterDetail(data);
    } catch (err) {
      console.error('Failed to load cluster detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleQuickJump = (target) => {
    setFlyToTarget({ lat: target.lat, lon: target.lon });
    const match = processedClusters.find(c => {
      const dLat = Math.abs(c.centroid_lat - target.lat);
      const dLon = Math.abs(c.centroid_lon - target.lon);
      return (dLat + dLon) < 0.035;
    });
    if (match) {
      handleSelectCluster(match);
    }
  };

  // CSV Export for all clusters
  const handleExportAllCsv = () => {
    if (!processedClusters || processedClusters.length === 0) return;
    const headers = [
      "cluster_id", "centroid_lat", "centroid_lon", "detection_count",
      "persistence_score", "band_label", "dist_to_nearest_industrial_m",
      "day_night_ratio", "first_seen", "last_seen"
    ];
    const rows = processedClusters.map(c => [
      c.cluster_id,
      c.centroid_lat,
      c.centroid_lon,
      c.detection_count,
      c.persistence_score,
      `"${c.band_label}"`,
      c.dist_to_nearest_industrial || "",
      c.day_night_ratio || "",
      c.first_seen || "",
      c.last_seen || ""
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `IGNITRA_thermal_clusters_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV intelligence export created successfully.");
  };

  // GeoJSON Export for all clusters (RFC 7946)
  const handleExportAllGeoJson = () => {
    if (!processedClusters || processedClusters.length === 0) return;
    try {
      const geojson = clustersToGeoJSON(processedClusters);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadGeoJSON(geojson, `IGNITRA_thermal_clusters_${dateStr}.geojson`);
      showToast(`GeoJSON FeatureCollection (${processedClusters.length} clusters) exported.`);
    } catch (err) {
      console.error("GeoJSON export error:", err);
      showToast("Error generating GeoJSON export.");
    }
  };

  // Single Cluster GeoJSON Export
  const handleExportSingleGeoJson = () => {
    if (!selectedCluster) return;
    try {
      const geojson = clustersToGeoJSON([selectedCluster]);
      downloadGeoJSON(geojson, `IGNITRA_cluster_${selectedCluster.cluster_id}.geojson`);
      showToast(`GeoJSON Feature exported for Cluster #${selectedCluster.cluster_id}.`);
    } catch (err) {
      console.error("Single GeoJSON export error:", err);
      showToast("Error generating single cluster GeoJSON.");
    }
  };

  const handleClosePanel = () => {
    setSelectedCluster(null);
    setClusterDetail(null);
    setIsDossierOpen(false);
  };

  return (
    <div className="app-container">
      {/* Top Tactical Header */}
      <TacticalHeader
        isRefreshing={isRefreshing}
        onRefresh={() => { loadInitialData(); loadClusters(); loadChangeData(); loadPriorityQueue(); }}
        onOpenTuner={() => setIsTunerOpen(true)}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        onExportCsv={handleExportAllCsv}
        onExportGeoJson={handleExportAllGeoJson}
        benchmarkRecall={evaluationMetrics?.industrial_recall_pct}
        firmsStatus={firmsStatus}
        onOpenFirmsModal={() => setIsFirmsModalOpen(true)}
        totalDetections={summary?.total_detections || 407}
        changeCount={totalChangesCount}
        isChangePanelOpen={isChangePanelOpen}
        onToggleChangePanel={() => {
          setIsChangePanelOpen(prev => !prev);
          if (!isChangePanelOpen && isQueueOpen) setIsQueueOpen(false);
        }}
        pendingQueueCount={pendingQueueCount}
        isQueueOpen={isQueueOpen}
        onToggleQueue={() => {
          setIsQueueOpen(prev => !prev);
          if (!isQueueOpen && isChangePanelOpen) setIsChangePanelOpen(false);
        }}
      />


      {/* Global Error Alert Banner if backend unreachable */}
      {loadError && (
        <div className="system-error-banner" role="alert">
          <AlertTriangle size={14} className="error-icon-svg" />
          <div className="error-message">
            <b>Backend Connection Notice:</b> {loadError} Ensure the FastAPI backend is running at <code>{API_BASE}</code>.
          </div>
          <button
            type="button"
            className="retry-btn"
            onClick={() => { loadInitialData(); loadClusters(); loadChangeData(); loadPriorityQueue(); }}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Summary KPI Area (Level 1: What is happening?) */}
      <TacticalSummaryBar
        totalDetections={summary?.total_detections || 407}
        totalClusters={processedClusters.length}
        persistentCount={dynamicCounts.persistent}
        ambiguousCount={dynamicCounts.ambiguous}
        transientCount={dynamicCounts.transient}
        osmSitesCount={osmSites.length}
        activeFilter={bandFilter}
        onSelectFilter={setBandFilter}
      />

      {/* Main Geospatial Workspace */}
      <main className="workspace" role="main">
        {/* Floating Target Jump Selector (Level 4: Fast Navigation) */}
        <div className="floating-target-selector" aria-label="Facility Quick Navigation">
          <label htmlFor="target-jump-select" className="selector-label">
            <Target size={13} className="selector-icon-svg" />
            <span className="selector-text">TARGET JUMP:</span>
          </label>
          <select
            id="target-jump-select"
            className="tactical-select"
            defaultValue=""
            onChange={(e) => {
              const target = BENCHMARK_TARGETS.find(t => t.name === e.target.value);
              if (target) handleQuickJump(target);
            }}
          >
            <option value="" disabled>Select industrial or reference site...</option>
            {BENCHMARK_TARGETS.map((t) => (
              <option key={t.name} value={t.name}>
                [{t.band}] {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Geospatial Map Canvas */}
        <MapView
          clusters={visibleClusters}
          selectedCluster={selectedCluster}
          clusterDetail={clusterDetail}
          onSelectCluster={handleSelectCluster}
          osmSites={osmSites}
          showOsmSites={showOsmSites}
          onToggleOsmSites={() => setShowOsmSites(!showOsmSites)}
          flyToTarget={flyToTarget}
          changeData={changeData}
          showChangeLayer={showChangeLayer}
          onToggleChangeLayer={() => setShowChangeLayer(prev => !prev)}
          selectedChange={selectedChange}
          onSelectChange={handleSelectChange}
        />

        {/* Selected Cluster Intelligence Inspector (Level 3: Why?) */}
        {selectedCluster && (
          <ClusterDetailsPanel
            detail={clusterDetail}
            onClose={handleClosePanel}
            loading={loadingDetail}
            onFlyTo={(coords) => setFlyToTarget(coords)}
            onOpenPrintDossier={() => setIsDossierOpen(true)}
            onExportSingleGeoJson={handleExportSingleGeoJson}
            onReviewSaved={handleReviewSaved}
          />
        )}

        {/* Phase 4C.2: Change Detection & Transition Tracking Console */}
        <ChangeDetectionPanel
          isOpen={isChangePanelOpen}
          onClose={() => setIsChangePanelOpen(false)}
          changeData={changeData}
          isLoading={loadingChanges}
          error={changeError}
          onRetry={loadChangeData}
          selectedChange={selectedChange}
          onSelectChange={handleSelectChange}
          onReviewCluster={handleReviewClusterFromChange}
        />

        {/* Phase 5.1: Analyst Priority Queue Console */}
        <AnalystPriorityQueue
          isOpen={isQueueOpen}
          onClose={() => setIsQueueOpen(false)}
          queue={priorityQueue}
          isLoading={loadingQueue}
          error={queueError}
          onRetry={loadPriorityQueue}
          selectedClusterId={selectedCluster?.cluster_id}
          onSelectCluster={handleSelectClusterFromQueue}
          onOpenClusterReview={handleOpenClusterReviewFromQueue}
        />
      </main>

      {/* Printable Analytical Intelligence Dossier Modal */}
      <PrintableDossierModal
        isOpen={isDossierOpen}
        onClose={() => setIsDossierOpen(false)}
        detail={clusterDetail}
        onPrint={() => showToast("Sending dossier to print...")}
      />

      {/* Sensitivity Weight Tuner Modal */}
      <WeightTunerModal
        isOpen={isTunerOpen}
        onClose={() => setIsTunerOpen(false)}
        weights={weights}
        onWeightsChange={setWeights}
        evaluationMetrics={evaluationMetrics}
      />

      {/* What-If Anomaly Simulator Modal */}
      <SimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onFlyTo={(coords) => setFlyToTarget(coords)}
      />

      {/* NASA FIRMS Live Ingestion Modal */}
      <FirmsIngestionModal
        isOpen={isFirmsModalOpen}
        onClose={() => setIsFirmsModalOpen(false)}
        onIngestionSuccess={(data) => {
          loadInitialData();
          loadClusters();
          loadChangeData();
          loadPriorityQueue();
          if (data.records_inserted > 0) {
            showToast(`Live FIRMS Ingestion Complete: +${data.records_inserted} observations, ${data.pipeline?.clusters_processed || data.records_valid} clusters updated`);
          } else {
            showToast(`Live FIRMS Request Successful: all ${data.records_valid} observations already present in local dataset.`);
          }
        }}

        firmsStatus={firmsStatus}
        refreshFirmsStatus={loadInitialData}
      />

      {/* Lightweight Operational Toast Feedback */}
      {toastMessage && (
        <div className="tactical-toast" role="status" aria-live="polite">
          <Info size={14} className="toast-icon-svg" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
