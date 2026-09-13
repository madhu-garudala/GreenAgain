import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { GitHubClient, LangSmithClient, SlackClient } from '../src/index.js';

function server(handler: (body: string, url: string, headers: Record<string, string | undefined>) => unknown) {
  const s = createServer(async (req, res) => { let body = ''; for await (const chunk of req) body += chunk; const value = handler(body, req.url ?? '/', req.headers as Record<string, string | undefined>); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); });
  return new Promise<{ base: string; close: () => Promise<void> }>(resolve => s.listen(0, '127.0.0.1', () => { const address = s.address(); const port = typeof address === 'object' && address ? address.port : 0; resolve({ base: `http://127.0.0.1:${port}`, close: () => new Promise(r => s.close(() => r())) }); }));
}

test('LangSmith queries traces, feedback, experiments and posts feedback', async () => {
  const seen: string[] = []; const srv = await server((body, url) => { seen.push(`${url}:${body}`); if (url.startsWith('/runs/query')) return { runs: [{ id: 'r1' }], cursors: { next: 'n' } }; if (url === '/feedback') return { feedback: [{ id: 'f1', run_id: 'r1', key: 'correctness' }] }; if (url.includes('/experiments')) return { id: 'e1', name: 'exp' }; return { id: 'f2', run_id: 'r1', key: 'quality' }; });
  const client = new LangSmithClient({ apiKey: 'secret', endpoint: srv.base, project: 'prod' });
  assert.equal((await client.queryTraces({ limit: 3 })).runs[0].id, 'r1'); assert.equal((await client.listFeedback()).length, 1); assert.equal((await client.createExperiment({ name: 'exp', datasetId: 'd1' })).id, 'e1'); assert.equal((await client.createFeedback({ run_id: 'r1', key: 'quality' })).id, 'f2'); assert.equal(seen.length, 4); await srv.close();
});

test('Slack verifies fresh signatures and rejects stale or altered requests', async () => {
  const client = new SlackClient({ botToken: 'token', signingSecret: 'secret' }); const body = 'payload'; const ts = String(Math.floor(Date.now() / 1000)); const { hmacSha256 } = await import('../src/http.js'); const signature = `v0=${await hmacSha256('secret', `v0:${ts}:${body}`)}`;
  assert.equal(await client.verifySignature(body, ts, signature), true); assert.equal(await client.verifySignature('altered', ts, signature), false); assert.equal(await client.verifySignature(body, String(Number(ts) - 601), signature), false);
});

test('GitHub decodes source and validates webhook signatures', async () => {
  const srv = await server((_body, url) => { if (url.startsWith('/repos/acme/app/contents/')) return { path: 'src/a.ts', sha: 'abc', encoding: 'base64', content: Buffer.from('export const a = 1;').toString('base64') }; if (url.startsWith('/repos/acme/app/commits/')) return { check_runs: [{ name: 'test', status: 'completed', conclusion: 'success' }] }; return { files: [] }; });
  const client = new GitHubClient({ token: 'token', owner: 'acme', repo: 'app', webhookSecret: 'secret', apiBase: srv.base }); assert.equal((await client.getSource('src/a.ts')).content, 'export const a = 1;'); assert.equal((await client.listChecks('abc'))[0].conclusion, 'success'); const { hmacSha256 } = await import('../src/http.js'); const sig = `sha256=${await hmacSha256('secret', '{}')}`; assert.equal(await client.verifyWebhook('{}', sig), true); await srv.close();
});
