import fs from 'node:fs';
import {
  filterDetectionsByWindow,
  calculateTemporalMetrics,
  deriveTrend,
  deriveHistoricalActivityPattern,
  deriveAnalystInterpretation
} from '../src/utils/temporalAnalytics.js';

const data = JSON.parse(fs.readFileSync('./scripts/sample_clusters.json', 'utf-8'));
const cluster7Dets = data.c7;
const cluster12Dets = data.c12;

console.log(`\n=== CLUSTER #7 (Tata Steel - Persistent) ===`);
console.log(`Raw observations: ${cluster7Dets.length}`);

for (const win of ['7D', '14D', '30D', 'ALL']) {
  const filtered = filterDetectionsByWindow(cluster7Dets, win);
  const m = calculateTemporalMetrics(filtered, win);
  const t = deriveTrend(filtered);
  const p = deriveHistoricalActivityPattern(filtered, m);
  console.log(`[Window ${win}]: count=${m.observationCount}, activeDays=${m.activeDays}, avgFrp=${m.avgFrp}MW, trend=${t.label}, pattern="${p.label}"`);
}

const allFiltered = filterDetectionsByWindow(cluster7Dets, 'ALL');
const allM = calculateTemporalMetrics(allFiltered, 'ALL');
const allT = deriveTrend(allFiltered);
const narrative = deriveAnalystInterpretation({ band_label: 'Persistent industrial source' }, allM, allT);
console.log(`Analyst narrative:\n"${narrative}"`);

console.log(`\n=== CLUSTER #12 (Similipal - Transient) ===`);
console.log(`Raw observations: ${cluster12Dets.length}`);

const filtered12 = filterDetectionsByWindow(cluster12Dets, 'ALL');
const m12 = calculateTemporalMetrics(filtered12, 'ALL');
const t12 = deriveTrend(filtered12);
const p12 = deriveHistoricalActivityPattern(filtered12, m12);
const narrative12 = deriveAnalystInterpretation({ band_label: 'Transient fire event' }, m12, t12);

console.log(`[Window ALL]: count=${m12.observationCount}, activeDays=${m12.activeDays}, avgFrp=${m12.avgFrp}MW, trend=${t12.label}, pattern="${p12.label}"`);
console.log(`Analyst narrative:\n"${narrative12}"`);

// Clean up sample_clusters.json
fs.unlinkSync('./scripts/sample_clusters.json');
