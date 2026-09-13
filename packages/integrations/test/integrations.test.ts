import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { GitHubClient, LangSmithClient, SlackClient, requestJson } from '../src/index.js';

function server(handler: (body: string, url: string, headers: Record<string, string | undefined>) => unknown) {
  const s = createServer(async (req, res) => { let body = ''; for await (const chunk of req) body += chunk; const value = handler(body, req.url ?? '/', req.headers as Record<string, string | undefined>); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); });
  return new Promise<{ base: string; close: () => Promise<void> }>(resolve => s.listen(0, '127.0.0.1', () => { const address = s.address(); const port = typeof address === 'object' && address ? address.port : 0; resolve({ base: `http://127.0.0.1:${port}`, close: () => new Promise(r => s.close(() => r())) }); }));
}

test('LangSmith queries traces, feedback, experiments and posts feedback', async () => {
  const seen: string[] = []; const srv = await server((body, url) => { seen.push(`${url}:${body}`); if (url.startsWith('/sessions?')) return [{ id: '00000000-0000-4000-8000-000000000001', name: 'prod' }]; if (url.startsWith('/runs/query')) return { runs: [{ id: 'r1' }], cursors: { next: 'n' } }; if (url === '/feedback' && body.includes('quality')) return { id: 'f2', run_id: 'r1', key: 'quality' }; if (url === '/feedback') return { feedback: [{ id: 'f1', run_id: 'r1', key: 'correctness' }] }; if (url === '/sessions') return { id: 'e1', name: 'exp' }; return { id: 'f2', run_id: 'r1', key: 'quality' }; });
  try {
    const client = new LangSmithClient({ apiKey: 'secret', endpoint: srv.base, project: 'prod' });
    assert.equal((await client.queryTraces({ limit: 3, start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z', tags: ['green', 'production'] })).runs[0].id, 'r1'); assert.equal((await client.listFeedback()).length, 1); assert.equal((await client.createExperiment({ name: 'exp', datasetId: 'd1', metadata: { scenario: 'baseline' } })).id, 'e1'); assert.equal((await client.createFeedback({ run_id: 'r1', key: 'quality' })).id, 'f2'); assert.equal(seen.length, 5);
    const query = JSON.parse(seen.find(value => value.startsWith('/runs/query:'))!.slice('/runs/query:'.length)); assert.deepEqual(query.session, ['00000000-0000-4000-8000-000000000001']); assert.equal(query.end_time, '2026-01-02T00:00:00Z'); assert.equal(query.filter, 'and(has(tags, "green"), has(tags, "production"))');
    const experiment = JSON.parse(seen.find(value => value === '/sessions:{"name":"exp","reference_dataset_id":"d1","extra":{"metadata":{"scenario":"baseline"}}}')!.slice('/sessions:'.length)); assert.deepEqual(experiment.extra.metadata, { scenario: 'baseline' });
  } finally { await srv.close(); }
});

test('HTTP adapter retries transient failures and supplies an abort timeout signal', async () => {
  let attempts = 0; let gotSignal = false;
  const value = await requestJson<{ ok: boolean }>('https://provider.test/retry', {}, (async (_url, init) => {
    attempts++; gotSignal = init?.signal instanceof AbortSignal;
    if (attempts < 3) return new Response('busy', { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch);
  assert.deepEqual(value, { ok: true }); assert.equal(attempts, 3); assert.equal(gotSignal, true);
});

test('Slack verifies fresh signatures and rejects stale or altered requests', async () => {
  const client = new SlackClient({ botToken: 'token', signingSecret: 'secret' }); const body = 'payload'; const ts = String(Math.floor(Date.now() / 1000)); const { hmacSha256 } = await import('../src/http.js'); const signature = `v0=${await hmacSha256('secret', `v0:${ts}:${body}`)}`;
  assert.equal(await client.verifySignature(body, ts, signature), true); assert.equal(await client.verifySignature('altered', ts, signature), false); assert.equal(await client.verifySignature(body, String(Number(ts) - 601), signature), false);
});

test('GitHub decodes source and validates webhook signatures', async () => {
  const srv = await server((_body, url) => { if (url.startsWith('/repos/acme/app/contents/')) return { path: 'src/a.ts', sha: 'abc', encoding: 'base64', content: Buffer.from('export const a = 1;').toString('base64') }; if (url.startsWith('/repos/acme/app/commits/')) return { check_runs: [{ name: 'test', status: 'completed', conclusion: 'success' }] }; return { files: [] }; });
  try { const client = new GitHubClient({ token: 'token', owner: 'acme', repo: 'app', webhookSecret: 'secret', apiBase: srv.base }); assert.equal((await client.getSource('src/a.ts')).content, 'export const a = 1;'); assert.equal((await client.listChecks('abc'))[0].conclusion, 'success'); const { hmacSha256 } = await import('../src/http.js'); const sig = `sha256=${await hmacSha256('secret', '{}')}`; assert.equal(await client.verifyWebhook('{}', sig), true); } finally { await srv.close(); }
});
