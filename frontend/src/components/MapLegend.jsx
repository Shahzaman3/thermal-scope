import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Compact Scientific Map Legend Component
 * Minimalist, visually restrained reference for thermal observation classifications,
 * infrastructure layers, and basemap tile controls.
 */
export default function MapLegend({
  showOsmSites,
  onToggleOsmSites,
  osmSitesCount,
  selectedBasemap,
  onSelectBasemap,
  basemapOptions
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <aside className={`tactical-map-legend ${isOpen ? 'is-open' : 'is-collapsed'}`} aria-label="Map Layer Legend">
      <div
        className="legend-header"
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen); } }}
      >
        <div className="legend-title">
          <Layers size={13} className="legend-icon-svg" />
          <span>Map Layers</span>
        </div>
        <button
          type="button"
          className="legend-toggle-btn"
          aria-label={isOpen ? 'Collapse legend' : 'Expand legend'}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {isOpen && (
        <div className="legend-content">
          {/* Thermal Observations Band */}
          <div className="legend-group">
            <div className="legend-group-title">THERMAL OBSERVATIONS</div>

            {/* Persistent */}
            <div className="legend-item" title="Persistence Score ≥ 0.70: continuous thermal emissions consistent with industrial operations">
              <span className="legend-dot-symbol dot-persistent" />
              <div className="legend-item-info">
                <div className="legend-item-name">Persistent source</div>
                <div className="legend-item-sub">Score ≥ 0.70</div>
              </div>
            </div>

            {/* Review / Ambiguous */}
            <div className="legend-item" title="Persistence Score 0.40–0.69: intermediate persistence requiring analyst review">
              <span className="legend-dot-symbol dot-ambiguous" />
              <div className="legend-item-info">
                <div className="legend-item-name">Review / ambiguous</div>
                <div className="legend-item-sub">Score 0.40 – 0.69</div>
              </div>
            </div>

            {/* Transient */}
            <div className="legend-item" title="Persistence Score < 0.40: short-duration wildfire or agricultural crop residue burn">
              <span className="legend-dot-symbol dot-transient" />
              <div className="legend-item-info">
                <div className="legend-item-name">Transient event</div>
                <div className="legend-item-sub">Score &lt; 0.40</div>
              </div>
            </div>
          </div>

          <div className="legend-divider" />

          {/* Infrastructure */}
          <div className="legend-group">
            <div className="legend-group-title">INFRASTRUCTURE</div>

            <div
              className={`legend-item legend-clickable ${showOsmSites ? 'active' : 'inactive'}`}
              onClick={onToggleOsmSites}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleOsmSites(); } }}
              title="Toggle OpenStreetMap industrial facility overlay"
            >
              <span className="legend-square-symbol symbol-osm" />
              <div className="legend-item-info">
                <div className="legend-item-name" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Industrial site</span>
                  <span className={`legend-toggle-pill ${showOsmSites ? 'is-on' : 'is-off'}`}>
                    {showOsmSites ? 'ON' : 'OFF'}
                  </span>
                </div>
                <div className="legend-item-sub">OSM • {osmSitesCount || 162} sites</div>
              </div>
            </div>

            {/* Raw Satellite Detections */}
            <div className="legend-item" title="Individual satellite thermal detections (gold = daytime, purple = nighttime)">
              <span className="symbol-pass-pair">
                <span className="symbol-pass-day" />
                <span className="symbol-pass-night" />
              </span>
              <div className="legend-item-info">
                <div className="legend-item-name">Satellite detections</div>
                <div className="legend-item-sub">Day / Night passes</div>
              </div>
            </div>
          </div>

          {/* Basemap Selection */}
          {basemapOptions && onSelectBasemap && (
            <>
              <div className="legend-divider" />
              <div className="legend-group">
                <div className="legend-group-title">BASEMAP SOURCE</div>
                <div className="legend-basemap-select-wrap">
                  <select
                    className="tactical-select legend-basemap-select"
                    value={selectedBasemap || 'esri_dark'}
                    onChange={(e) => onSelectBasemap(e.target.value)}
                    title="Select background map tile provider"
                    aria-label="Basemap Layer"
                  >
                    {Object.values(basemapOptions).map((bm) => (
                      <option key={bm.id} value={bm.id}>
                        {bm.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
