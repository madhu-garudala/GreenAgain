import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CASES, DATASET_VERSION, checkCase, verify } from '../src/verifier.js';
import type { SupportOutput } from '../src/aws.js';

const output = (testCase = CASES[0], version = '7', traceId = 'trace-1'): SupportOutput => ({ decision: testCase.expectedDecision, orderId: testCase.orderId, policyId: testCase.expectedPolicyId, explanation: 'protected result', toolCalls: testCase.expectedDecision === 'needs_review' ? [{ name: 'lookup_order', status: 'error', summary: 'order not found' }] : [{ name: 'lookup_order', status: 'ok', summary: 'found' }, { name: 'read_return_policy', status: 'ok', summary: 'policy' }, { name: 'check_replacement_eligibility', status: 'ok', summary: 'checked' }], releaseId: 'release-7', executedVersion: version, traceId });

test('checkCase rejects wrong release, order, and real application errors', () => {
  assert.equal(checkCase(output(), CASES[0], '7').pass, true);
  assert.match(checkCase(output(CASES[0], '6'), CASES[0], '7').reason!, /expected version/);
  assert.match(checkCase({ ...output(), orderId: 'ord-9999' }, CASES[0], '7').reason!, /expected order/);
  assert.match(checkCase({ ...output(), error: 'tool failure' }, CASES[0], '7').reason!, /invocation error/);
  assert.match(checkCase({ ...output(), toolCalls: [] }, CASES[0], '7').reason!, /trusted tool evidence/);
  assert.match(checkCase({ ...output(), traceId: undefined }, CASES[0], '7').reason!, /trace id/);
});

test('verify checks all protected orders, fresh alias calls, and trace feedback', async () => {
  const oldFetch = globalThis.fetch; const oldKey = process.env.LANGSMITH_API_KEY; const oldEndpoint = process.env.LANGSMITH_ENDPOINT;
  let invokes = 0; let feedbacks = 0; const qualifiers: string[] = [];
  const oldSpacing = process.env.GREENAGAIN_FRESH_SPACING_MS; process.env.GREENAGAIN_FRESH_SPACING_MS = '1';
  process.env.LANGSMITH_API_KEY = 'test'; process.env.LANGSMITH_ENDPOINT = 'https://smith.test';
  globalThis.fetch = (async (url, init) => {
    if (String(url).includes('/runs/') || String(url).includes('/feedback')) { if (init?.method === 'POST') feedbacks++; return new Response('{}', { status: 200 }); }
    throw new Error(`unexpected LangSmith URL ${url}`);
  }) as typeof fetch;
  const releases = { alias: 'production', invoke: async (_message: string, orderId: string, qualifier: string) => { invokes++; qualifiers.push(qualifier); const c = CASES.find(x => x.orderId === orderId) ?? { ...CASES[0], ...{ orderId: 'ord-9999', expectedDecision: 'needs_review' as const, expectedPolicyId: '' } }; return output(c, '7', `trace-${invokes}`); } } as any;
  try { const result = await verify(releases, '7'); assert.equal(result.status, 'PASS'); assert.equal(result.total, 12); assert.equal(result.passed, 12); assert.equal(result.freshPassed, 3); assert.equal(result.datasetVersion, DATASET_VERSION); assert.equal(invokes, 16); assert.equal(feedbacks, 16); assert.deepEqual(new Set(qualifiers), new Set(['production'])); } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.LANGSMITH_API_KEY; else process.env.LANGSMITH_API_KEY = oldKey; if (oldEndpoint === undefined) delete process.env.LANGSMITH_ENDPOINT; else process.env.LANGSMITH_ENDPOINT = oldEndpoint; if (oldSpacing === undefined) delete process.env.GREENAGAIN_FRESH_SPACING_MS; else process.env.GREENAGAIN_FRESH_SPACING_MS = oldSpacing; }
});

test('trace/provider outage is inconclusive, while a returned error is a failure', async () => {
  const oldFetch = globalThis.fetch; const oldKey = process.env.LANGSMITH_API_KEY; process.env.LANGSMITH_API_KEY = 'test';
  globalThis.fetch = (async () => new Response('{}', { status: 503 })) as typeof fetch;
  const releases = { alias: 'production', invoke: async (_m: string, orderId: string) => output(CASES.find(x => x.orderId === orderId), '7') } as any;
  try { assert.equal((await verify(releases, '7')).status, 'INCONCLUSIVE'); } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.LANGSMITH_API_KEY; else process.env.LANGSMITH_API_KEY = oldKey; }
  const failed = { ...output(), error: 'tool contract mismatch' }; assert.equal(checkCase(failed, CASES[0], '7').pass, false);
});
