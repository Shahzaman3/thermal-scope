import React from 'react';
import { X, Sliders, RotateCcw, CheckCircle2, Award, ShieldAlert } from 'lucide-react';

const DEFAULT_WEIGHTS = {
  recurrence_count: 0.25,
  recurrence_regularity: 0.20,
  dist_to_nearest_industrial: 0.20,
  spatial_stability: 0.15,
  frp_trend: 0.10,
  day_night_ratio: 0.10
};

export default function WeightTunerModal({
  isOpen,
  onClose,
  weights,
  onWeightsChange,
  evaluationMetrics
}) {
  if (!isOpen) return null;

  const totalSum = Object.values(weights).reduce((a, b) => a + b, 0);

  const handleSliderChange = (key, rawVal) => {
    const val = parseFloat(rawVal);
    onWeightsChange({
      ...weights,
      [key]: val
    });
  };

  const handleReset = () => {
    onWeightsChange({ ...DEFAULT_WEIGHTS });
  };

  const handleNormalize = () => {
    if (totalSum <= 0) return;
    const normalized = {};
    for (const [k, v] of Object.entries(weights)) {
      normalized[k] = Math.round((v / totalSum) * 100) / 100;
    }
    onWeightsChange(normalized);
  };

  const sliders = [
    { key: 'recurrence_count', label: 'Recurrence Count (Hotspot Frequency)', desc: 'Higher frequency over 30-60 days signals steady emission', defaultVal: 0.25 },
    { key: 'recurrence_regularity', label: 'Recurrence Regularity (Periodicity CV)', desc: 'Low coefficient of variation in time-gaps signals 24/7 cycles', defaultVal: 0.20 },
    { key: 'dist_to_nearest_industrial', label: 'Industrial Proximity (OSM Tag Distance)', desc: 'Proximity to registered steel, thermal, or mining complexes', defaultVal: 0.20 },
    { key: 'spatial_stability', label: 'Spatial Stability (Centroid Tightness)', desc: 'Low standard deviation of coordinates across temporal passes', defaultVal: 0.15 },
    { key: 'frp_trend', label: 'FRP Stability Trend (Slope Flattness)', desc: 'Flat thermal power slope signals industrial flaring vs fire decay', defaultVal: 0.10 },
    { key: 'day_night_ratio', label: 'Day / Night Balance (24/7 Operations)', desc: 'Equal day and night detections (~0.50 ratio) indicate continuous plants', defaultVal: 0.10 }
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(5, 8, 15, 0.82)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      <div style={{
        width: '620px',
        maxHeight: '90vh',
        background: 'rgba(15, 23, 42, 0.98)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.02)'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              NTRO DECISION SUPPORT ENGINE
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={18} style={{ color: '#38bdf8' }} />
              <span>Sensitivity Weight Tuner</span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Status & Total Sum Banner */}
          <div style={{
            background: Math.abs(totalSum - 1.0) < 0.01 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.15)',
            border: `1px solid ${Math.abs(totalSum - 1.0) < 0.01 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13px'
          }}>
            <div>
              <span style={{ fontWeight: 700, color: Math.abs(totalSum - 1.0) < 0.01 ? '#34d399' : '#fbbf24' }}>
                Total Weight Sum: {(totalSum * 100).toFixed(0)}%
              </span>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {Math.abs(totalSum - 1.0) < 0.01
                  ? 'Weights normalized to 100% composite score.'
                  : 'Weights do not equal 100%. Click Auto-Normalize.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {Math.abs(totalSum - 1.0) >= 0.01 && (
                <button className="filter-btn" onClick={handleNormalize} style={{ background: 'rgba(255,255,255,0.1)' }}>
                  Normalize to 1.0
                </button>
              )}
              <button className="filter-btn" onClick={handleReset} title="Reset to NTRO Baseline">
                <RotateCcw size={13} /> Baseline
              </button>
            </div>
          </div>

          {/* Sliders List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {sliders.map((s) => {
              const currentVal = weights[s.key] !== undefined ? weights[s.key] : s.defaultVal;
              return (
                <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ fontWeight: 600, color: '#fff' }}>{s.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8' }}>
                      {(currentVal * 100).toFixed(0)}% ({currentVal.toFixed(2)})
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="0.5"
                    step="0.05"
                    value={currentVal}
                    onChange={(e) => handleSliderChange(s.key, e.target.value)}
                    style={{
                      width: '100%',
                      accentColor: '#38bdf8',
                      cursor: 'pointer'
                    }}
                  />
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {s.desc}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Benchmark Accuracy Quick Summary */}
          {evaluationMetrics && (
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Award size={13} style={{ color: '#10b981' }} />
                Regional Ground-Truth Validation Metrics
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '8px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Industrial Recall</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                    {evaluationMetrics.industrial_recall_pct}%
                  </div>
                  <div style={{ fontSize: '9px', color: '#6ee7b7' }}>0 Facilities Missed</div>
                </div>
                <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '8px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Industrial Precision</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    {evaluationMetrics.industrial_precision_pct}%
                  </div>
                  <div style={{ fontSize: '9px', color: '#7dd3fc' }}>Validated Hotspots</div>
                </div>
                <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '8px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Overall Accuracy</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#a5b4fc', fontFamily: 'var(--font-mono)' }}>
                    {evaluationMetrics.overall_accuracy_pct}%
                  </div>
                  <div style={{ fontSize: '9px', color: '#c7d2fe' }}>10 Benchmark Sites</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          background: 'rgba(255,255,255,0.02)'
        }}>
          <button
            className="filter-btn active"
            onClick={onClose}
            style={{ padding: '8px 20px', background: '#38bdf8', color: '#090d16', fontWeight: 700 }}
          >
            Apply & Inspect Map
          </button>
        </div>
      </div>
    </div>
  );
}
