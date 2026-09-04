import React, { useState, useEffect, useMemo } from 'react';
import MapView from './components/MapView';
import ClusterDetailsPanel from './components/ClusterDetailsPanel';
import WeightTunerModal from './components/WeightTunerModal';
import SimulatorModal from './components/SimulatorModal';
import { Factory, AlertTriangle, Flame, Download, Eye, RefreshCw, Sliders, Award, Sparkles } from 'lucide-react';

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
  { name: 'Barbil Sponge Iron & Mining Hub', lat: 22.1150, lon: 85.3950, band: 'Ambiguous' },
  { name: 'Similipal Forest Wildfire Area', lat: 21.8200, lon: 86.3500, band: 'Transient' },
  { name: 'Saranda Forest Seasonal Burn', lat: 22.3100, lon: 85.2800, band: 'Transient' }
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
  const [flyToTarget, setFlyToTarget] = useState(null);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [isTunerOpen, setIsTunerOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  // Fetch initial telemetry and ground-truth validation metrics
  const loadInitialData = async () => {
    setIsRefreshing(true);
    try {
      const [sumRes, osmRes, evalRes] = await Promise.all([
        fetch(`${API_BASE}/api/summary`).then((r) => r.json()),
        fetch(`${API_BASE}/api/osm-sites?limit=250`).then((r) => r.json()),
        fetch(`${API_BASE}/api/evaluation`).then((r) => r.json()).catch(() => null)
      ]);
      setSummary(sumRes);
      setOsmSites(osmRes || []);
      setEvaluationMetrics(evalRes);
    } catch (err) {
      console.error('Error fetching initial data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadClusters = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/clusters`);
      const data = await res.json();
      setRawClusters(data || []);
    } catch (err) {
      console.error('Error fetching clusters:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
    loadClusters();
  }, []);

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
      const data = await res.json();
      // Apply dynamic score if present
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
      return (dLat + dLon) < 0.03;
    });
    if (match) {
      handleSelectCluster(match);
    }
  };

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
    link.setAttribute("download", `NTRO_Regional_Thermal_Clusters_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClosePanel = () => {
    setSelectedCluster(null);
    setClusterDetail(null);
  };

  return (
    <div className="app-container">
      {/* Top Tactical Navbar */}
      <header className="navbar">
        <div className="brand-section">
          <span className="ntro-badge">NTRO SIH26162</span>
          <div>
            <div className="brand-title">
              Industrial Fire & Persistent Thermal Classifier
            </div>
            <div className="brand-subtitle">
              Jamshedpur–Odisha Belt • NASA FIRMS + OSM Fusion
            </div>
          </div>
        </div>

        {/* Global Summary KPIs */}
        <div className="stats-bar">
          <div className="stat-pill" title="Total Raw FIRMS Detections Ingested">
            <span className="stat-label">Raw Hotspots</span>
            <span className="stat-val">{summary?.total_detections || 407}</span>
          </div>

          <div className="stat-pill" title="Formed ~1km Spatial Clusters">
            <span className="stat-label">Clusters</span>
            <span className="stat-val">{processedClusters.length}</span>
          </div>

          <div className="stat-pill" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
            <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Factory size={12} /> Persistent
            </span>
            <span className="stat-val" style={{ color: '#34d399' }}>
              {dynamicCounts.persistent}
            </span>
          </div>

          <div className="stat-pill" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
            <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={12} /> Ambiguous
            </span>
            <span className="stat-val" style={{ color: '#fbbf24' }}>
              {dynamicCounts.ambiguous}
            </span>
          </div>

          <div className="stat-pill" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            <span style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Flame size={12} /> Transient
            </span>
            <span className="stat-val" style={{ color: '#f87171' }}>
              {dynamicCounts.transient}
            </span>
          </div>

          {/* Benchmark Accuracy Badge */}
          {evaluationMetrics && (
            <div
              className="stat-pill"
              onClick={() => setIsTunerOpen(true)}
              style={{ cursor: 'pointer', borderColor: 'rgba(56, 189, 248, 0.4)', background: 'rgba(56, 189, 248, 0.08)' }}
              title="Click to view full benchmark validation and tune weights"
            >
              <Award size={13} style={{ color: '#38bdf8' }} />
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>Recall: {evaluationMetrics.industrial_recall_pct}%</span>
            </div>
          )}

          {/* Quick Target Fly-To Selector */}
          <div style={{ position: 'relative' }}>
            <select
              className="filter-btn"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border-subtle)',
                color: '#fff',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 600
              }}
              defaultValue=""
              onChange={(e) => {
                const target = BENCHMARK_TARGETS.find(t => t.name === e.target.value);
                if (target) handleQuickJump(target);
              }}
            >
              <option value="" disabled>🎯 Jump to Target Facility...</option>
              {BENCHMARK_TARGETS.map(t => (
                <option key={t.name} value={t.name} style={{ background: '#0f172a', color: '#fff' }}>
                  {t.band === 'Persistent' ? '🟢' : (t.band === 'Ambiguous' ? '🟡' : '🔴')} {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Interactive Weight Sensitivity Tuner Button */}
          <button
            className="filter-btn"
            onClick={() => setIsTunerOpen(true)}
            title="Open Interactive Feature Weight Tuner Modal"
            style={{ border: '1px solid var(--border-subtle)', background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}
          >
            <Sliders size={13} />
            <span>Tune Weights</span>
          </button>

          {/* Interactive What-If Hotspot Simulator Button */}
          <button
            className="filter-btn"
            onClick={() => setIsSimulatorOpen(true)}
            title="Simulate a hypothetical thermal anomaly scenario"
            style={{ border: '1px solid rgba(168, 85, 247, 0.4)', background: 'rgba(168, 85, 247, 0.12)', color: '#c084fc' }}
          >
            <Sparkles size={13} />
            <span>Simulate Anomaly</span>
          </button>

          {/* Global CSV Export Button */}
          <button
            className="filter-btn"
            onClick={handleExportAllCsv}
            title="Export Classified Clusters (CSV Report for NTRO)"
            style={{ border: '1px solid var(--border-subtle)' }}
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>

          {/* Offline Database Guarantee Indicator */}
          <div className="offline-ready-badge" title="Running 100% offline from local SQLite database">
            <span className="pulse-dot"></span>
            <span>SQLITE OFFLINE</span>
          </div>

          <button
            className="filter-btn"
            onClick={() => { loadInitialData(); loadClusters(); }}
            title="Refresh Data from Local DB"
          >
            <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="workspace">
        {/* Floating Filter Tabs above Map */}
        <div className="map-floating-controls">
          <button
            className={`filter-btn ${bandFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setBandFilter('ALL')}
          >
            All Clusters
            <span className="btn-pill-count">{processedClusters.length}</span>
          </button>

          <button
            className={`filter-btn persistent ${bandFilter === 'Persistent industrial source' ? 'active' : ''}`}
            onClick={() => setBandFilter('Persistent industrial source')}
          >
            <Factory size={13} />
            Persistent
            <span className="btn-pill-count">{dynamicCounts.persistent}</span>
          </button>

          <button
            className={`filter-btn ambiguous ${bandFilter === 'Ambiguous / flagged for review' ? 'active' : ''}`}
            onClick={() => setBandFilter('Ambiguous / flagged for review')}
          >
            <AlertTriangle size={13} />
            Ambiguous
            <span className="btn-pill-count">{dynamicCounts.ambiguous}</span>
          </button>

          <button
            className={`filter-btn transient ${bandFilter === 'Transient fire event' ? 'active' : ''}`}
            onClick={() => setBandFilter('Transient fire event')}
          >
            <Flame size={13} />
            Transient
            <span className="btn-pill-count">{dynamicCounts.transient}</span>
          </button>

          <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)', margin: '0 4px' }} />

          <button
            className={`filter-btn ${showOsmSites ? 'active' : ''}`}
            onClick={() => setShowOsmSites(!showOsmSites)}
            title="Toggle OSM Industrial site reference pins"
          >
            <Eye size={13} />
            <span>OSM Industry ({osmSites.length})</span>
          </button>
        </div>

        {/* Leaflet Geospatial Map */}
        <MapView
          clusters={visibleClusters}
          selectedCluster={selectedCluster}
          clusterDetail={clusterDetail}
          onSelectCluster={handleSelectCluster}
          osmSites={osmSites}
          showOsmSites={showOsmSites}
          flyToTarget={flyToTarget}
        />

        {/* Feature Inspector Side Panel */}
        {selectedCluster && (
          <ClusterDetailsPanel
            detail={clusterDetail}
            onClose={handleClosePanel}
            loading={loadingDetail}
          />
        )}
      </main>

      {/* Interactive Sensitivity Weight Tuner Modal */}
      <WeightTunerModal
        isOpen={isTunerOpen}
        onClose={() => setIsTunerOpen(false)}
        weights={weights}
        onWeightsChange={setWeights}
        evaluationMetrics={evaluationMetrics}
      />

      {/* Interactive What-If Hotspot Simulator Modal */}
      <SimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onFlyTo={(coords) => setFlyToTarget(coords)}
      />
    </div>
  );
}
