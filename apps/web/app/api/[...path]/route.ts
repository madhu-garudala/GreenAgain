import { createHmac, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { incidentDto, Store, type Event, type Incident } from '@greenagain/core';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const scrypt = promisify(nodeScrypt);
const SESSION_COOKIE = 'greenagain_session';
const SESSION_TTL = 8 * 60 * 60;
const allowedScenarios = new Set(['prompt_regression', 'tool_contract_regression']);

type Session = { email: string; exp: number };
function json(data: unknown, status = 200) { return NextResponse.json(data, { status }); }
function fail(status: number, message: string) { return json({ error: message }, status); }
function secret() { return process.env.SESSION_SECRET || ''; }
function sign(value: string) { return createHmac('sha256', secret()).update(value).digest('base64url'); }
function encodeSession(session: Session) { const value = Buffer.from(JSON.stringify(session)).toString('base64url'); return `${value}.${sign(value)}`; }
function decodeSession(value?: string): Session | null {
  if (!value || !secret()) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try { const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session; return session.exp > Math.floor(Date.now() / 1000) ? session : null; } catch { return null; }
}
function session(request: Request) { return decodeSession(request.headers.get('cookie')?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1]); }
function operatorEmail() { return process.env.OPERATOR_EMAIL?.trim().toLowerCase() || ''; }
async function passwordMatches(password: string) {
  const encoded = process.env.OPERATOR_PASSWORD_HASH || '';
  const [salt, expectedHex] = encoded.split(':');
  if (!salt || !expectedHex || !/^[0-9a-f]+$/i.test(expectedHex)) return false;
  const derived = await scrypt(password, salt, expectedHex.length / 2) as Buffer;
  const expected = Buffer.from(expectedHex, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return process.env.NODE_ENV !== 'production';
  try { return new URL(origin).host === request.headers.get('host'); } catch { return false; }
}
function clientAddress(request: Request) { return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'; }
function store() { return new Store(); }
async function body(request: Request) { try { return await request.json() as Record<string, unknown>; } catch { return null; } }
function sanitizeEvent(event: Event) { return { id: event.id, type: event.type, message: event.message, createdAt: event.createdAt, actor: event.actor }; }
function publicIncident(incident: Incident) { return incidentDto(incident); }

async function login(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'Origin rejected');
  if (!secret() || !operatorEmail() || !process.env.OPERATOR_PASSWORD_HASH) return fail(503, 'Operator access is unavailable');
  const data = await body(request); const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : ''; const password = typeof data?.password === 'string' ? data.password : '';
  if (!email || !password) return fail(400, 'Email and password are required');
  let db: Store; const address = clientAddress(request); const owner = randomUUID();
  try {
    db = store();
    if (!await db.lease(`auth:${address}`, owner, 3)) return fail(429, 'Try again shortly');
    const key = `AUTHFAIL#${address}`; const prior = await db.get<{ count: number; until: number }>(key); const now = Date.now();
    if (prior?.until && prior.until > now) return fail(429, 'Try again later');
    const valid = email === operatorEmail() && await passwordMatches(password);
    if (!valid) { const count = (prior?.count || 0) + 1; await db.put(key, { count, until: count >= 5 ? now + 60_000 : now }); return fail(401, 'Invalid operator credentials'); }
    await db.put(key, { count: 0, until: 0 });
    const response = json({ authenticated: true, email }); response.cookies.set(SESSION_COOKIE, encodeSession({ email, exp: Math.floor(now / 1000) + SESSION_TTL }), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: SESSION_TTL }); return response;
  } catch { return fail(503, 'Authentication service unavailable'); }
}

async function enqueue(request: Request, kind: 'scenario' | 'reset') {
  if (!sameOrigin(request)) return fail(403, 'Origin rejected');
  const auth = session(request); if (!auth) return fail(401, 'Operator authentication required');
  const data = await body(request); const scenario = typeof data?.scenario === 'string' ? data.scenario : undefined;
  if (kind === 'scenario' && (!scenario || !allowedScenarios.has(scenario))) return fail(400, 'Unsupported scenario');
  const id = randomUUID(); let db: Store | undefined;
  const createdAt = new Date().toISOString(); const item = { pk: `OUTBOX#job-${id}`, sk: 'META', kind: 'outbox', sent: false, data: { id, kind, ...(scenario ? { scenario } : {}), actor: auth.email, createdAt } };
  try { db = store(); if (!await db.lease('scenario', id, 900)) return fail(409, 'Another scenario is already running'); await db.client.send(new PutCommand({ TableName: db.table, Item: item, ConditionExpression: 'attribute_not_exists(pk)' })); return json({ accepted: true, id, kind, scenario }); } catch { if (db) await db.releaseLease('scenario', id).catch(() => {}); return fail(503, 'Unable to queue request'); }
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path || [];
  if (path[0] === 'auth' && path[1] === 'session') { const auth = session(request); return json(auth ? { authenticated: true, email: auth.email } : { authenticated: false }); }
  if (path[0] === 'health') return json({ ok: true });
  try {
    const db = store();
    if (path[0] === 'integrations') { const integrations = await db.get<unknown[]>('INTEGRATIONS') || []; return json({ integrations }); }
    if (path[0] === 'events') { const incidents = await db.list(); const grouped = await Promise.all(incidents.map(async i => (await db.events(i.id)).map(e => ({ ...sanitizeEvent(e), incidentId: i.id })))); return json({ events: grouped.flat().sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))).slice(0, 100) }); }
    if (path[0] === 'incidents' && !path[1]) return json({ incidents: (await db.list()).map(publicIncident) });
    if (path[0] === 'incidents' && path[1]) { const incident = await db.get<Incident>(`INCIDENT#${path[1]}`); if (!incident) return fail(404, 'Incident not found'); if (path[2] === 'events') return json({ events: (await db.events(path[1])).map(sanitizeEvent) }); return json({ incident: publicIncident(incident) }); }
    return fail(404, 'Not found');
  } catch { return fail(503, 'Control API unavailable'); }
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path || [];
  if (path[0] === 'auth' && path[1] === 'login') return login(request);
  if (path[0] === 'auth' && path[1] === 'logout') { if (!sameOrigin(request)) return fail(403, 'Origin rejected'); const response = json({ authenticated: false }); response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 }); return response; }
  if (path[0] === 'demo' && path[1] === 'scenarios') return enqueue(request, 'scenario');
  if (path[0] === 'demo' && path[1] === 'reset') return enqueue(request, 'reset');
  if (path[0] === 'incidents' && (path[2] === 'approve' || path[2] === 'resume')) return fail(409, 'This control is not implemented');
  return fail(404, 'Not found');
}
