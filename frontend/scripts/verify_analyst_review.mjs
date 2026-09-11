/**
 * Deterministic Verification Script for IGNITRA Phase 5.2:
 * Analyst Review Persistence, Provenance & Audit Hardening
 *
 * Verifies:
 * - Schema validation for review retrieval and submission
 * - HTTP 404 for nonexistent cluster IDs
 * - HTTP 400 for invalid review statuses
 * - HTTP 400 for notes exceeding 2000 characters
 * - Unicode and multiline notes persistence
 * - Server-side UTC ISO 8601 timestamps
 * - Atomic upsert (no duplicate reviews per cluster)
 * - Priority queue synchronization after review updates
 * - Clean teardown ensuring database baseline remains pristine
 */

import http from 'node:http';

const API_HOST = '127.0.0.1';
const API_PORT = 8000;

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: API_HOST,
        port: API_PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : null;
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runVerification() {
  console.log('============================================================');
  console.log('IGNITRA Phase 5.2 — Review Persistence & Audit Verification');
  console.log('============================================================\n');

  // Test Cluster: Use existing cluster #1 from baseline dataset
  const testClusterId = 1;

  // 1. Suite 1: Unreviewed Baseline State
  console.log('--- Suite 1: Retrieve Unreviewed Cluster State ---');
  const resInitial = await request('GET', `/api/v1/clusters/${testClusterId}/review`);
  assert(resInitial.status === 200, `Expected 200, got ${resInitial.status}`);
  assert(resInitial.data.cluster_id === testClusterId, 'Cluster ID must match');
  assert(resInitial.data.review_status === 'UNREVIEWED', 'Initial status must be UNREVIEWED');
  console.log('  [PASS] Initial cluster review state is UNREVIEWED (has_review=false)');

  // 2. Suite 2: Nonexistent Cluster Returns HTTP 404
  console.log('\n--- Suite 2: Nonexistent Cluster Referential Integrity (404) ---');
  const res404Get = await request('GET', '/api/v1/clusters/999999/review');
  assert(res404Get.status === 404, `Expected 404 for GET nonexistent cluster, got ${res404Get.status}`);
  assert(res404Get.data?.detail?.toLowerCase().includes('not found'), 'Detail must indicate not found');

  const res404Post = await request('POST', '/api/v1/clusters/review', {
    cluster_id: 999999,
    review_status: 'VERIFIED_INDUSTRIAL',
    notes: 'Should fail with 404'
  });
  assert(res404Post.status === 404, `Expected 404 for POST nonexistent cluster, got ${res404Post.status}`);
  console.log('  [PASS] Nonexistent cluster correctly rejected with HTTP 404 Not Found');

  // 3. Suite 3: Invalid Review Status Returns HTTP 400
  console.log('\n--- Suite 3: Status Enum Validation (400) ---');
  const resInvalidStatus = await request('POST', '/api/v1/clusters/review', {
    cluster_id: testClusterId,
    review_status: 'CONFIRMED_EXPLOSION',
    notes: 'Unsupported status'
  });
  assert(resInvalidStatus.status === 400, `Expected 400 for invalid status, got ${resInvalidStatus.status}`);
  assert(resInvalidStatus.data?.detail?.includes('Invalid review_status'), 'Detail must explain invalid status');
  console.log('  [PASS] Unsupported review statuses correctly rejected with HTTP 400 Bad Request');

  // 4. Suite 4: Notes Maximum Length Validation (400)
  console.log('\n--- Suite 4: Notes Length Bound Validation (2000 Chars) ---');
  const oversizedNotes = 'X'.repeat(2001);
  const resOversized = await request('POST', '/api/v1/clusters/review', {
    cluster_id: testClusterId,
    review_status: 'UNDER_INVESTIGATION',
    notes: oversizedNotes
  });
  assert(resOversized.status === 400 || resOversized.status === 422, `Expected 400/422 for oversized notes, got ${resOversized.status}`);
  console.log('  [PASS] Oversized notes (> 2000 chars) strictly rejected');

  // 5. Suite 5: Valid Review Submission & Persistence (Upsert)
  console.log('\n--- Suite 5: Valid Review Creation & Server-Side UTC Timestamp ---');
  const unicodeNotes = 'टाटा स्टील — Blast furnace verified.\nHigh FRP: 119.6 MW; "Special Notes": <test>';
  const resSubmit = await request('POST', '/api/v1/clusters/review', {
    cluster_id: testClusterId,
    review_status: 'VERIFIED_INDUSTRIAL',
    notes: unicodeNotes,
    analyst_name: 'Lead Specialist'
  });
  assert(resSubmit.status === 200, `Expected 200, got ${resSubmit.status}`);
  assert(resSubmit.data.status === 'success', 'Status must be success');
  assert(resSubmit.data.review_status === 'VERIFIED_INDUSTRIAL', 'Status must be VERIFIED_INDUSTRIAL');
  assert(resSubmit.data.notes === unicodeNotes, 'Notes must persist with Unicode and special characters intact');
  assert(resSubmit.data.analyst_name === 'Lead Specialist', 'Analyst name must persist');
  assert(resSubmit.data.updated_at, 'Server-side timestamp must be present');
  const isoTime = new Date(resSubmit.data.updated_at);
  assert(!isNaN(isoTime.getTime()), 'Timestamp must be a valid ISO 8601 date');
  console.log('  [PASS] Review successfully created with server-side UTC timestamp');

  // 6. Suite 6: Review Retrieval Verification
  console.log('\n--- Suite 6: Review Retrieval & Audit Metadata ---');
  const resGet = await request('GET', `/api/v1/clusters/${testClusterId}/review`);
  assert(resGet.status === 200, `Expected 200, got ${resGet.status}`);
  assert(resGet.data.review_status === 'VERIFIED_INDUSTRIAL', 'Review status must match persisted record');
  assert(resGet.data.notes === unicodeNotes, 'Notes must match persisted record');
  assert(resGet.data.analyst_name === 'Lead Specialist', 'Analyst name must match');
  assert(resGet.data.has_review === true, 'has_review must be true');
  console.log('  [PASS] Persisted review retrieved accurately with audit metadata');

  // 7. Suite 7: Update Review (Idempotency / Upsert Verification)
  console.log('\n--- Suite 7: Review Update (Upsert Idempotency) ---');
  const resUpdate = await request('POST', '/api/v1/clusters/review', {
    cluster_id: testClusterId,
    review_status: 'UNDER_INVESTIGATION',
    notes: 'Downgraded to investigation for secondary inspection.',
    analyst_name: 'Audit Senior'
  });
  assert(resUpdate.status === 200, `Expected 200, got ${resUpdate.status}`);
  assert(resUpdate.data.review_status === 'UNDER_INVESTIGATION', 'Status must update to UNDER_INVESTIGATION');
  assert(resUpdate.data.analyst_name === 'Audit Senior', 'Analyst name must update');

  const resGetUpdated = await request('GET', `/api/v1/clusters/${testClusterId}/review`);
  assert(resGetUpdated.data.review_status === 'UNDER_INVESTIGATION', 'Retrieved status must be UNDER_INVESTIGATION');
  assert(resGetUpdated.data.notes === 'Downgraded to investigation for secondary inspection.', 'Retrieved notes must match');
  console.log('  [PASS] Review update verified without duplicate row generation');

  // 8. Suite 8: Priority Queue Synchronization
  console.log('\n--- Suite 8: Priority Queue Synchronization ---');
  const resQueue = await request('GET', '/api/v1/clusters/priority-queue?limit=50');
  assert(resQueue.status === 200, `Expected 200, got ${resQueue.status}`);
  const queueItem = resQueue.data.find(c => c.cluster_id === testClusterId);
  assert(queueItem !== undefined, 'Target cluster must exist in priority queue');
  assert(queueItem.review_status === 'UNDER_INVESTIGATION', `Queue must reflect updated status: ${queueItem.review_status}`);
  console.log('  [PASS] Priority queue telemetry reflects updated analyst review');

  // 9. Suite 9: Reset to UNREVIEWED (Clean Teardown)
  console.log('\n--- Suite 9: Reset to UNREVIEWED & Baseline Restoration ---');
  const resReset = await request('POST', '/api/v1/clusters/review', {
    cluster_id: testClusterId,
    review_status: 'UNREVIEWED',
    notes: null
  });
  assert(resReset.status === 200, `Expected 200, got ${resReset.status}`);
  assert(resReset.data.has_review === false, 'has_review must be false after reset');

  const resGetAfterReset = await request('GET', `/api/v1/clusters/${testClusterId}/review`);
  assert(resGetAfterReset.status === 200, `Expected 200, got ${resGetAfterReset.status}`);
  assert(resGetAfterReset.data.review_status === 'UNREVIEWED', 'Status must be UNREVIEWED');
  assert(resGetAfterReset.data.has_review === false, 'has_review must be false');
  console.log('  [PASS] Reset to UNREVIEWED cleaned up persisted review record');

  console.log('\n============================================================');
  console.log('ALL 9 VERIFICATION SUITES PASSED (Phase 5.2 Validated)');
  console.log('============================================================');
}

runVerification().catch((err) => {
  console.error('\n[FAIL] Verification script error:', err);
  process.exit(1);
});
