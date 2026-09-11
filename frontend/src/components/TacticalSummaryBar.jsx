import React from 'react';
import {
  Flame,
  Layers,
  Building2,
  AlertTriangle,
  Radio,
  MapPin
} from 'lucide-react';

/**
 * Compact Analytical Summary Strip
 * Provides high-density analytical metrics across the corridor.
 * Information-dense, low-profile layout prioritizing the geospatial map canvas.
 */
export default function TacticalSummaryBar({
  totalDetections,
  totalClusters,
  persistentCount,
  ambiguousCount,
  transientCount,
  osmSitesCount,
  activeFilter,
  onSelectFilter
}) {
  const metrics = [
    {
      id: 'observations',
      label: 'Thermal Observations',
      value: totalDetections || 407,
      unit: 'passes',
      icon: Flame,
      color: '#f97316',
      isClickable: false,
      title: 'Total satellite thermal detections ingested across the corridor'
    },
    {
      id: 'clusters',
      label: 'Clusters',
      value: totalClusters,
      filterKey: 'ALL',
      icon: Layers,
      color: '#38bdf8',
      isClickable: true,
      title: 'DBSCAN spatial clusters formed (eps=1km, min_samples=3). Click to view all.'
    },
    {
      id: 'persistent',
      label: 'Persistent Sources',
      value: persistentCount,
      filterKey: 'Persistent industrial source',
      icon: Building2,
      color: '#10b981',
      isClickable: true,
      badge: 'Score ≥ 0.70',
      title: 'Continuous high-persistence industrial thermal sources. Click to isolate.'
    },
    {
      id: 'review',
      label: 'Review Required',
      value: ambiguousCount,
      filterKey: 'Ambiguous / flagged for review',
      icon: AlertTriangle,
      color: '#f59e0b',
      isClickable: true,
      badge: '0.40–0.69',
      title: 'Intermediate thermal persistence requiring analyst review. Click to isolate.'
    },
    {
      id: 'transient',
      label: 'Transient Events',
      value: transientCount,
      filterKey: 'Transient fire event',
      icon: Radio,
      color: '#ef4444',
      isClickable: true,
      badge: 'Score < 0.40',
      title: 'Short-duration vegetative or agricultural thermal events. Click to isolate.'
    },
    {
      id: 'infrastructure',
      label: 'Infrastructure Sites',
      value: osmSitesCount || 162,
      unit: 'OSM',
      icon: MapPin,
      color: '#0284c7',
      isClickable: false,
      title: 'Registered OpenStreetMap industrial facilities (steelworks, power plants, mines)'
    }
  ];

  return (
    <section className="summary-kpi-bar" aria-label="Thermal Intelligence Summary Strip">
      <div className="kpi-strip-container">
        {metrics.map((m) => {
          const Icon = m.icon;
          const isFilterable = m.isClickable;
          const isSelected = isFilterable && activeFilter === m.filterKey;

          if (isFilterable) {
            return (
              <button
                key={m.id}
                type="button"
                className={`kpi-metric-item is-interactive ${isSelected ? 'is-selected' : ''}`}
                onClick={() => onSelectFilter(m.filterKey)}
                title={m.title}
                aria-pressed={isSelected}
                style={{ '--metric-accent': m.color }}
              >
                <div className="kpi-metric-icon" style={{ color: m.color }}>
                  <Icon size={14} />
                </div>
                <div className="kpi-metric-content">
                  <span className="kpi-metric-label">{m.label}</span>
                  <div className="kpi-metric-value-row">
                    <span className="kpi-metric-value" style={{ color: m.color }}>
                      {m.value}
                    </span>
                    {m.badge && <span className="kpi-metric-badge">{m.badge}</span>}
                  </div>
                </div>
              </button>
            );
          }

          return (
            <div
              key={m.id}
              className="kpi-metric-item is-static"
              title={m.title}
              style={{ '--metric-accent': m.color }}
            >
              <div className="kpi-metric-icon" style={{ color: m.color }}>
                <Icon size={14} />
              </div>
              <div className="kpi-metric-content">
                <span className="kpi-metric-label">{m.label}</span>
                <div className="kpi-metric-value-row">
                  <span className="kpi-metric-value" style={{ color: m.color }}>
                    {m.value}
                  </span>
                  {m.unit && <span className="kpi-metric-unit">{m.unit}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
