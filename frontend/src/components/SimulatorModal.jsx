import React, { useState } from 'react';
import { X, Play, Sparkles, MapPin, Factory, Flame, AlertTriangle, ArrowRight } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const PRESETS = [
  {
    name: 'Integrated Steel Blast Furnace',
    icon: '🏭',
    desc: 'High continuous thermal emission inside industrial zone',
    params: {
      scenario_name: 'Steel Blast Furnace',
      latitude: 22.8015,
      longitude: 86.1950,
      frp: 125.0,
      passes_count: 68,
      timespan_days: 42,
      day_ratio: 0.52,
      spread_m: 160.0,
      frp_stability: 'flat'
    }
  },
  {
    name: 'Remote Forest Canopy Fire',
    icon: '🔥',
    desc: 'Single-pass thermal spike in deep deciduous forest',
    params: {
      scenario_name: 'Similipal Canopy Outbreak',
      latitude: 21.8200,
      longitude: 86.3500,
      frp: 70.0,
      passes_count: 1,
      timespan_days: 1,
      day_ratio: 1.0,
      spread_m: 1200.0,
      frp_stability: 'spiking'
    }
  },
  {
    name: 'Intermittent Sponge Iron Kiln',
    icon: '⚠️',
    desc: 'Sporadic rotary kiln flaring on industrial outskirts',
    params: {
      scenario_name: 'Barbil Rotary Kiln',
      latitude: 22.1150,
      longitude: 85.3950,
      frp: 48.0,
      passes_count: 12,
      timespan_days: 28,
      day_ratio: 0.72,
      spread_m: 550.0,
      frp_stability: 'spiking'
    }
  }
];

export default function SimulatorModal({ isOpen, onClose, onFlyTo }) {
  const [formData, setFormData] = useState(PRESETS[0].params);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  if (!isOpen) return null;

  const handleApplyPreset = (preset) => {
    setFormData(preset.params);
    setResult(null);
  };

  const handleSimulate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulate-hotspot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getBandClass = (band) => {
    if (band === 'Persistent industrial source') return 'persistent';
    if (band === 'Ambiguous / flagged for review') return 'ambiguous';
    return 'transient';
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(5, 8, 15, 0.85)',
      backdropFilter: 'blur(14px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      <div style={{
        width: '680px',
        maxHeight: '92vh',
        background: 'rgba(15, 23, 42, 0.98)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
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
              NTRO TACTICAL WHAT-IF SIMULATOR
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} style={{ color: '#38bdf8' }} />
              <span>Simulate Thermal Anomaly Scenario</span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Presets Bar */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
              Select Validation Preset Scenario
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  className="filter-btn"
                  onClick={() => handleApplyPreset(p)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '10px 12px',
                    border: formData.scenario_name === p.params.scenario_name ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                    background: formData.scenario_name === p.params.scenario_name ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255,255,255,0.02)',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ fontSize: '14px', marginBottom: '2px' }}>{p.icon} <b>{p.name}</b></span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.3' }}>{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Form Inputs Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Latitude (°N)
              </label>
              <input
                type="number"
                step="0.0001"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Longitude (°E)
              </label>
              <input
                type="number"
                step="0.0001"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                FRP Thermal Power: <b style={{ color: '#38bdf8' }}>{formData.frp} MW</b>
              </label>
              <input
                type="range"
                min="5"
                max="250"
                step="5"
                value={formData.frp}
                onChange={(e) => setFormData({ ...formData, frp: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#38bdf8' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Temporal Passes: <b style={{ color: '#38bdf8' }}>{formData.passes_count} detections</b>
              </label>
              <input
                type="range"
                min="1"
                max="80"
                value={formData.passes_count}
                onChange={(e) => setFormData({ ...formData, passes_count: parseInt(e.target.value) })}
                style={{ width: '100%', accentColor: '#38bdf8' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Observation Window: <b style={{ color: '#38bdf8' }}>{formData.timespan_days} days</b>
              </label>
              <input
                type="range"
                min="1"
                max="60"
                value={formData.timespan_days}
                onChange={(e) => setFormData({ ...formData, timespan_days: parseInt(e.target.value) })}
                style={{ width: '100%', accentColor: '#38bdf8' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Day/Night Distribution: <b style={{ color: '#38bdf8' }}>{Math.round(formData.day_ratio * 100)}% Day / {Math.round((1 - formData.day_ratio) * 100)}% Night</b>
              </label>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={formData.day_ratio}
                onChange={(e) => setFormData({ ...formData, day_ratio: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#38bdf8' }}
              />
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleSimulate}
            disabled={loading}
            className="filter-btn active"
            style={{
              padding: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '13px',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(2, 132, 199, 0.4)'
            }}
          >
            <Play size={15} />
            {loading ? 'Evaluating Spatial & Temporal Features...' : 'Run Simulation & Classify'}
          </button>

          {/* Live Simulation Results */}
          {result && (
            <div className={`score-hero ${getBandClass(result.band_label)}`} style={{ marginTop: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={`band-pill ${getBandClass(result.band_label)}`}>
                  {result.band_label === 'Persistent industrial source' ? <Factory size={15} /> : (result.band_label === 'Ambiguous / flagged for review' ? <AlertTriangle size={15} /> : <Flame size={15} />)}
                  {result.band_label}
                </span>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  PREDICTED SCORE: <b>{(result.persistence_score * 100).toFixed(1)}%</b>
                </span>
              </div>

              <div style={{ fontSize: '12px', color: '#fff', lineHeight: '1.4' }}>
                {result.tactical_recommendation}
              </div>

              {result.closest_industrial_site && (
                <div style={{
                  padding: '8px 12px',
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Nearest Registered Facility: </span>
                    <b style={{ color: '#fff' }}>{result.closest_industrial_site.name}</b>
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}> ({result.closest_industrial_site.site_type})</span>
                  </div>
                  <b style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    {result.closest_industrial_site.distance_meters < 1000
                      ? `${result.closest_industrial_site.distance_meters.toFixed(0)}m away`
                      : `${(result.closest_industrial_site.distance_meters / 1000).toFixed(1)}km away`}
                  </b>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  className="filter-btn"
                  onClick={() => {
                    onFlyTo({ lat: formData.latitude, lon: formData.longitude });
                    onClose();
                  }}
                  style={{ background: 'rgba(255,255,255,0.1)', fontSize: '11px' }}
                >
                  <MapPin size={13} /> Fly to Location on Map <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
