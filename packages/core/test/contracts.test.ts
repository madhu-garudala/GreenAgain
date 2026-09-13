import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRollback, transition, type Incident, type Proposal, type Release, type Verification } from '../src/contracts.js';

const verification = (status: Verification['status'] = 'PASS'): Verification => ({
  status, datasetVersion: 'dataset-v1', executedVersion: '7', total: status === 'PASS' ? 12 : 12,
  passed: status === 'PASS' ? 12 : 0, freshPassed: status === 'PASS' ? 3 : 0,
  checkedAt: '2026-09-13T00:00:00.000Z', detail: 'protected checks', traceIds: ['trace-1'],
});
const incident = (state: Incident['state'] = 'DETECTED'): Incident => ({
  id: 'inc-1', fingerprint: 'fp', app: 'support-agent', environment: 'production', releaseId: 'release-7',
  state, revision: 1, createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-13T00:00:00.000Z',
  summary: 'regression', evidence: [],
});
const baseline = (status: Verification['status'] = 'PASS'): Release => ({
  version: '6', releaseId: 'release-6', commitSha: 'abc', artifactHash: 'sha256:abc', verifiedAt: '2026-09-12T00:00:00.000Z', verification: verification(status),
});
const proposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  kind: 'rollback_release', functionName: 'support-agent', alias: 'production', fromVersion: '7', targetVersion: '6',
  aliasRevision: 'rev-7', evidenceIds: ['trace-1'], expectedEffect: 'restore verified behavior', ...overrides,
});

test('refuses rollback from a stale alias revision', () => {
  assert.throws(() => checkRollback(proposal(), baseline(), { version: '7', revision: 'rev-new' }, { functionName: 'support-agent', alias: 'production' }), /Stale deployment/);
});

test('refuses an unverified or failed baseline', () => {
  assert.throws(() => checkRollback(proposal(), baseline('FAIL'), { version: '7', revision: 'rev-7' }, { functionName: 'support-agent', alias: 'production' }), /verified baseline/);
  assert.throws(() => checkRollback(proposal(), { ...baseline(), verifiedAt: undefined, verification: undefined }, { version: '7', revision: 'rev-7' }, { functionName: 'support-agent', alias: 'production' }), /verified baseline/);
});

test('refuses rollback targets outside the allowed function and alias', () => {
  assert.throws(() => checkRollback(proposal({ functionName: 'other-function' }), baseline(), { version: '7', revision: 'rev-7' }, { functionName: 'support-agent', alias: 'production' }), /allowlist/);
  assert.throws(() => checkRollback(proposal({ alias: 'staging' }), baseline(), { version: '7', revision: 'rev-7' }, { functionName: 'support-agent', alias: 'production' }), /allowlist/);
});

test('does not resolve on failed or inconclusive verification', () => {
  for (const result of ['FAIL', 'INCONCLUSIVE'] as const) {
    assert.throws(() => transition(incident('VERIFYING'), 'RESOLVED', verification(result)), /independent protected verification/);
  }
});

test('enforces legal incident transitions', () => {
  assert.equal(transition(incident(), 'INVESTIGATING').state, 'INVESTIGATING');
  assert.throws(() => transition(incident(), 'RESOLVED'), /Illegal transition/);
  assert.throws(() => transition(incident('RESOLVED'), 'INVESTIGATING'), /Illegal transition/);
});
