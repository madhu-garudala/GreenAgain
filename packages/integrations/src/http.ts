export class IntegrationError extends Error {
  constructor(message: string, readonly kind: 'transient' | 'auth' | 'not_found' | 'inconclusive', readonly status?: number) { super(message); this.name = 'IntegrationError'; }
}

export async function requestJson<T>(url: string, init: RequestInit = {}, fetchFn: typeof fetch = fetch): Promise<T> {
  let response: Response;
  try { response = await fetchFn(url, init); } catch (error) { throw new IntegrationError(error instanceof Error ? error.message : 'Network error', 'transient'); }
  if (!response.ok) {
    const kind = response.status === 401 || response.status === 403 ? 'auth' : response.status === 404 ? 'not_found' : response.status >= 500 || response.status === 429 ? 'transient' : 'inconclusive';
    throw new IntegrationError(`Provider request failed (${response.status})`, kind, response.status);
  }
  return await response.json() as T;
}

export function hmacSha256(secret: string, body: string): Promise<string> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']).then(key => crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))).then(value => Buffer.from(value).toString('hex'));
}

export function safeEqual(a: string, b: string): boolean { const aa = new TextEncoder().encode(a); const bb = new TextEncoder().encode(b); if (aa.length !== bb.length) return false; let diff = 0; for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i]; return diff === 0; }
