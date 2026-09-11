import assert from 'node:assert';
import {
  filterDetectionsByWindow,
  calculateTemporalMetrics,
  deriveTrend,
  deriveHistoricalActivityPattern,
  deriveAnalystInterpretation
} from '../src/utils/temporalAnalytics.js';

console.log("Running temporal analytics unit tests...");

// Test Case 1: Empty and malformed data handling
{
  const emptyFiltered = filterDetectionsByWindow([], '7D');
  assert.deepStrictEqual(emptyFiltered, []);

  const nullFiltered = filterDetectionsByWindow(null, 'ALL');
  assert.deepStrictEqual(nullFiltered, []);

  const emptyMetrics = calculateTemporalMetrics([]);
  assert.strictEqual(emptyMetrics.observationCount, 0);
  assert.strictEqual(emptyMetrics.avgFrp, 0);
  assert.strictEqual(emptyMetrics.activeDays, 0);

  const emptyTrend = deriveTrend([]);
  assert.strictEqual(emptyTrend.state, 'INSUFFICIENT DATA');
}

// Test Case 2: Sparse data (1 and 2 observations)
{
  const singleDetection = [
    { id: 1, acq_date: '2026-08-01', acq_datetime: '2026-08-01T08:00:00', frp: 25.4, daynight: 'D' }
  ];
  const metrics1 = calculateTemporalMetrics(singleDetection, 'ALL');
  assert.strictEqual(metrics1.observationCount, 1);
  assert.strictEqual(metrics1.avgFrp, 25.4);
  assert.strictEqual(metrics1.maxFrp, 25.4);
  assert.strictEqual(metrics1.minFrp, 25.4);
  assert.strictEqual(metrics1.activeDays, 1);
  assert.strictEqual(metrics1.dayCount, 1);
  assert.strictEqual(metrics1.nightCount, 0);

  const trend1 = deriveTrend(singleDetection);
  assert.strictEqual(trend1.state, 'INSUFFICIENT DATA');

  const pattern1 = deriveHistoricalActivityPattern(singleDetection, metrics1);
  assert.strictEqual(pattern1.label, 'ISOLATED / TRANSIENT EVENT');

  const twoDetections = [
    { id: 1, acq_date: '2026-08-01', acq_datetime: '2026-08-01T08:00:00', frp: 20.0, daynight: 'D' },
    { id: 2, acq_date: '2026-08-01', acq_datetime: '2026-08-01T14:00:00', frp: 30.0, daynight: 'D' }
  ];
  const trend2 = deriveTrend(twoDetections);
  assert.strictEqual(trend2.state, 'INSUFFICIENT DATA');
}

// Test Case 3: Window filtering (7D, 14D, 30D, ALL)
{
  const detections = [
    { id: 1, acq_date: '2026-08-01', acq_datetime: '2026-08-01T10:00:00', frp: 50.0, daynight: 'D' }, // 34 days before latest
    { id: 2, acq_date: '2026-08-15', acq_datetime: '2026-08-15T10:00:00', frp: 52.0, daynight: 'D' }, // 20 days before latest
    { id: 3, acq_date: '2026-08-25', acq_datetime: '2026-08-25T10:00:00', frp: 48.0, daynight: 'N' }, // 10 days before latest
    { id: 4, acq_date: '2026-09-01', acq_datetime: '2026-09-01T10:00:00', frp: 55.0, daynight: 'D' }, // 3 days before latest
    { id: 5, acq_date: '2026-09-04', acq_datetime: '2026-09-04T10:00:00', frp: 51.0, daynight: 'N' }  // Latest
  ];

  const filtered7D = filterDetectionsByWindow(detections, '7D');
  assert.strictEqual(filtered7D.length, 2); // 2026-09-01 and 2026-09-04
  assert.strictEqual(filtered7D[0].id, 4);
  assert.strictEqual(filtered7D[1].id, 5);

  const filtered14D = filterDetectionsByWindow(detections, '14D');
  assert.strictEqual(filtered14D.length, 3); // 2026-08-25, 2026-09-01, 2026-09-04

  const filtered30D = filterDetectionsByWindow(detections, '30D');
  assert.strictEqual(filtered30D.length, 4); // excludes 2026-08-01

  const filteredAll = filterDetectionsByWindow(detections, 'ALL');
  assert.strictEqual(filteredAll.length, 5);
}

// Test Case 4: Trend derivation (STABLE, INCREASING, DECREASING, INTERMITTENT)
{
  // Stable cluster
  const stableDets = [
    { frp: 100, acq_datetime: '2026-09-01T00:00:00' },
    { frp: 105, acq_datetime: '2026-09-02T00:00:00' },
    { frp: 98, acq_datetime: '2026-09-03T00:00:00' },
    { frp: 102, acq_datetime: '2026-09-04T00:00:00' }
  ];
  const stableTrend = deriveTrend(stableDets);
  assert.strictEqual(stableTrend.state, 'STABLE');

  // Increasing cluster
  const increasingDets = [
    { frp: 30, acq_datetime: '2026-09-01T00:00:00' },
    { frp: 35, acq_datetime: '2026-09-02T00:00:00' },
    { frp: 80, acq_datetime: '2026-09-03T00:00:00' },
    { frp: 95, acq_datetime: '2026-09-04T00:00:00' }
  ];
  const increasingTrend = deriveTrend(increasingDets);
  assert.strictEqual(increasingTrend.state, 'INCREASING');

  // Decreasing cluster
  const decreasingDets = [
    { frp: 120, acq_datetime: '2026-09-01T00:00:00' },
    { frp: 110, acq_datetime: '2026-09-02T00:00:00' },
    { frp: 40, acq_datetime: '2026-09-03T00:00:00' },
    { frp: 35, acq_datetime: '2026-09-04T00:00:00' }
  ];
  const decreasingTrend = deriveTrend(decreasingDets);
  assert.strictEqual(decreasingTrend.state, 'DECREASING');

  // Intermittent cluster (very high CV)
  const intermittentDets = [
    { frp: 10, acq_datetime: '2026-09-01T00:00:00' },
    { frp: 300, acq_datetime: '2026-09-02T00:00:00' },
    { frp: 12, acq_datetime: '2026-09-03T00:00:00' },
    { frp: 280, acq_datetime: '2026-09-04T00:00:00' }
  ];
  const intermittentTrend = deriveTrend(intermittentDets);
  assert.strictEqual(intermittentTrend.state, 'INTERMITTENT');
}

// Test Case 5: Interpretation narrative
{
  const metrics = { activeDays: 14, observationCount: 45, avgFrp: 124.5, dateSpanDays: 30 };
  const trend = { label: 'Stable' };
  const interpPersistent = deriveAnalystInterpretation({ band_label: 'Persistent industrial source' }, metrics, trend);
  assert(interpPersistent.includes('Persistent industrial source') || interpPersistent.includes('persistent industrial'));
  assert(interpPersistent.includes('14 active day(s)'));

  const interpTransient = deriveAnalystInterpretation({ band_label: 'Transient fire event' }, { ...metrics, activeDays: 1, observationCount: 1, dateSpanDays: 1 }, trend);
  assert(interpTransient.includes('transient fire event'));
}

console.log("All temporal analytics unit tests PASSED successfully!");
