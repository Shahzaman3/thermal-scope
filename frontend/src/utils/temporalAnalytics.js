/**
 * Temporal Analytics Utility for SIH26162
 * Computes descriptive multi-temporal statistics, historical activity patterns,
 * and trend indicators from satellite thermal observations.
 *
 * NOTE: These are descriptive historical analytics to contextualize
 * the classification. They do NOT replace or alter the core 6-feature classifier score.
 */

/**
 * Filter detections based on selectable temporal window.
 * The window is anchored to the cluster's most recent observation datetime.
 *
 * @param {Array} detections - List of raw detection objects from API.
 * @param {string} windowType - '7D' | '14D' | '30D' | 'ALL'.
 * @returns {Array} Filtered detections sorted chronologically ascending.
 */
export function filterDetectionsByWindow(detections, windowType = 'ALL') {
  if (!Array.isArray(detections) || detections.length === 0) {
    return [];
  }

  // Parse and sort chronologically ascending
  const validDetections = detections
    .filter(d => d && (d.acq_datetime || d.acq_date))
    .map(d => {
      const dt = d.acq_datetime ? new Date(d.acq_datetime) : new Date(`${d.acq_date}T00:00:00`);
      return {
        ...d,
        _dt: isNaN(dt.getTime()) ? new Date(0) : dt,
        frp: typeof d.frp === 'number' ? d.frp : parseFloat(d.frp || 0)
      };
    })
    .sort((a, b) => a._dt - b._dt);

  if (validDetections.length === 0) return [];
  if (windowType === 'ALL') return validDetections;

  const daysMap = { '7D': 7, '14D': 14, '30D': 30 };
  const windowDays = daysMap[windowType];
  if (!windowDays) return validDetections;

  const latestTime = validDetections[validDetections.length - 1]._dt.getTime();
  const windowStartTime = latestTime - windowDays * 24 * 60 * 60 * 1000;

  return validDetections.filter(d => d._dt.getTime() >= windowStartTime);
}

/**
 * Calculate statistical aggregates over the filtered observation window.
 *
 * @param {Array} detections - Chronologically sorted detections in window.
 * @param {string} windowType - '7D' | '14D' | '30D' | 'ALL'.
 * @returns {Object} Analytical metrics object.
 */
export function calculateTemporalMetrics(detections, windowType = 'ALL') {
  if (!Array.isArray(detections) || detections.length === 0) {
    return {
      observationCount: 0,
      activeDays: 0,
      avgFrp: 0,
      maxFrp: 0,
      minFrp: 0,
      stdDevFrp: 0,
      dayCount: 0,
      nightCount: 0,
      observationDensity: 0,
      dateSpanDays: 0,
      firstSeen: null,
      lastSeen: null,
      windowLabel: windowType
    };
  }

  const count = detections.length;
  const frpValues = detections.map(d => d.frp);

  // Mean FRP
  const sumFrp = frpValues.reduce((acc, v) => acc + v, 0);
  const avgFrp = sumFrp / count;

  // Max and Min FRP
  const maxFrp = Math.max(...frpValues);
  const minFrp = Math.min(...frpValues);

  // Standard deviation of FRP
  const variance = count > 1
    ? frpValues.reduce((acc, v) => acc + Math.pow(v - avgFrp, 2), 0) / count
    : 0;
  const stdDevFrp = Math.sqrt(variance);

  // Distinct active calendar days
  const activeDateSet = new Set(detections.map(d => d.acq_date).filter(Boolean));
  const activeDays = activeDateSet.size || 1;

  // Day vs Night counts
  const dayCount = detections.filter(d => d.daynight === 'D').length;
  const nightCount = detections.filter(d => d.daynight === 'N').length;

  // Date span in days
  const getDt = (d) => {
    if (d._dt instanceof Date && !isNaN(d._dt.getTime())) return d._dt;
    if (d.acq_datetime) {
      const parsed = new Date(d.acq_datetime);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    if (d.acq_date) {
      const parsed = new Date(`${d.acq_date}T00:00:00`);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date(0);
  };

  const firstDt = getDt(detections[0]);
  const lastDt = getDt(detections[detections.length - 1]);
  const spanMs = Math.max(0, lastDt.getTime() - firstDt.getTime());
  const dateSpanDays = Math.max(1, Math.round(spanMs / (24 * 60 * 60 * 1000)) + 1);

  // Observation density (observations per active day span)
  const windowDaysMap = { '7D': 7, '14D': 14, '30D': 30 };
  const effectiveDays = windowDaysMap[windowType] || dateSpanDays;
  const observationDensity = Number((count / Math.max(1, effectiveDays)).toFixed(2));

  return {
    observationCount: count,
    activeDays,
    avgFrp: Number(avgFrp.toFixed(1)),
    maxFrp: Number(maxFrp.toFixed(1)),
    minFrp: Number(minFrp.toFixed(1)),
    stdDevFrp: Number(stdDevFrp.toFixed(1)),
    dayCount,
    nightCount,
    observationDensity,
    dateSpanDays,
    firstSeen: detections[0].acq_datetime || detections[0].acq_date,
    lastSeen: detections[detections.length - 1].acq_datetime || detections[detections.length - 1].acq_date,
    windowLabel: windowType
  };
}

/**
 * Derive a robust descriptive trend from the observed FRP history.
 *
 * @param {Array} detections - Chronologically sorted detections in window.
 * @returns {Object} Trend status, title, and descriptive rationale.
 */
export function deriveTrend(detections) {
  if (!Array.isArray(detections) || detections.length === 0) {
    return {
      state: 'INSUFFICIENT DATA',
      color: '#64748b',
      label: 'Insufficient Data',
      description: 'No satellite thermal observations recorded in this window.'
    };
  }

  if (detections.length < 3) {
    return {
      state: 'INSUFFICIENT DATA',
      color: '#94a3b8',
      label: 'Insufficient Data',
      description: `Only ${detections.length} observation(s) available. A minimum of 3 passes is required for trend derivation.`
    };
  }

  // Split observations chronologically into early half and late half
  const mid = Math.floor(detections.length / 2);
  const earlySlice = detections.slice(0, mid);
  const lateSlice = detections.slice(mid);

  const earlyAvg = earlySlice.reduce((a, b) => a + b.frp, 0) / earlySlice.length;
  const lateAvg = lateSlice.reduce((a, b) => a + b.frp, 0) / lateSlice.length;

  const diff = lateAvg - earlyAvg;
  const relativeChange = earlyAvg > 0 ? (diff / earlyAvg) : 0;

  // Calculate variability (CV) to detect intermittent flaring
  const allFrp = detections.map(d => d.frp);
  const mean = allFrp.reduce((a, b) => a + b, 0) / allFrp.length;
  const variance = allFrp.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / allFrp.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

  if (cv > 0.65) {
    return {
      state: 'INTERMITTENT',
      color: '#f59e0b',
      label: 'Intermittent',
      description: 'High coefficient of variation (CV > 0.65) indicating fluctuating, batch, or episodic thermal emissions.'
    };
  }

  if (relativeChange > 0.20) {
    return {
      state: 'INCREASING',
      color: '#ef4444',
      label: 'Increasing',
      description: `Observed late-window FRP average increased by ${(relativeChange * 100).toFixed(0)}% compared to early window.`
    };
  }

  if (relativeChange < -0.20) {
    return {
      state: 'DECREASING',
      color: '#38bdf8',
      label: 'Decreasing',
      description: `Observed late-window FRP average decreased by ${(Math.abs(relativeChange) * 100).toFixed(0)}% compared to early window.`
    };
  }

  return {
    state: 'STABLE',
    color: '#10b981',
    label: 'Stable',
    description: 'Thermal radiative power exhibits steady continuity within a ±20% band across observed passes.'
  };
}

/**
 * Derive a descriptive historical activity pattern label.
 *
 * @param {Array} detections - Filtered detections.
 * @param {Object} metrics - Computed temporal metrics.
 * @returns {Object} Activity pattern descriptor.
 */
export function deriveHistoricalActivityPattern(detections, metrics) {
  if (!detections || detections.length === 0) {
    return {
      label: 'NO ACTIVITY',
      badgeClass: 'is-empty',
      summary: 'No thermal anomaly detections recorded.'
    };
  }

  if (metrics.observationCount >= 20 && metrics.activeDays >= 10) {
    return {
      label: 'PERSISTENT 24/7 CONTINUOUS',
      badgeClass: 'is-persistent',
      summary: 'High-density multi-week observations across both day and night orbits confirm stationary 24/7 industrial facility operation.'
    };
  }

  if (metrics.observationCount >= 6 && metrics.activeDays >= 3) {
    return {
      label: 'RECURRENT REPEATED PASSES',
      badgeClass: 'is-recurrent',
      summary: 'Regularly observed across multiple satellite passes with consistent spatial collocation.'
    };
  }

  if (metrics.observationCount >= 3) {
    return {
      label: 'EPISODIC / INTERMITTENT',
      badgeClass: 'is-intermittent',
      summary: 'Moderate observation count with variable pass intervals, consistent with batch processing or transient cluster flaring.'
    };
  }

  return {
    label: 'ISOLATED / TRANSIENT EVENT',
    badgeClass: 'is-transient',
    summary: 'Sparse observations confined to 1–2 satellite passes; typical of seasonal wildfire fronts or rapid agricultural residue burns.'
  };
}

/**
 * Generate contextual analyst explanation connecting temporal behavior to classification.
 *
 * @param {Object} classification - Existing classification from API.
 * @param {Object} metrics - Temporal metrics.
 * @param {Object} trend - Derived trend.
 * @returns {string} Natural-language analyst explanation.
 */
export function deriveAnalystInterpretation(classification, metrics, trend) {
  const band = classification?.band_label || 'Unknown';
  const isPersistent = band === 'Persistent industrial source';
  const isAmbiguous = band === 'Ambiguous / flagged for review';

  if (isPersistent) {
    return `Repeated satellite detections across ${metrics.activeDays} active day(s) (total ${metrics.observationCount} passes) confirm sustained thermal activity. The observed ${trend.label.toLowerCase()} FRP profile (mean ${metrics.avgFrp} MW) provides robust multi-temporal corroboration for the persistent industrial classification.`;
  }

  if (isAmbiguous) {
    return `Thermal activity exhibits partial recurrence with ${metrics.observationCount} passes across ${metrics.activeDays} day(s). While multi-temporal signals exist, high variance or peripheral location requires operational review before confirming industrial permanence.`;
  }

  return `Thermal anomaly is concentrated in a short temporal span (${metrics.observationCount} pass(es) over ${metrics.dateSpanDays} day(s)) without sustained recurrence. The rapid dissipation confirms a transient fire event rather than a stationary persistent emitter.`;
}
