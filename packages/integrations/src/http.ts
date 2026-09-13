export class IntegrationError extends Error {
  constructor(message: string, readonly kind: 'transient' | 'auth' | 'not_found' | 'inconclusive', readonly status?: number) { super(message); this.name = 'IntegrationError'; }
}

export async function requestJson<T>(url: string, init: RequestInit = {}, fetchFn: typeof fetch = fetch): Promise<T> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetchFn(url, { ...init, signal: controller.signal });
      if (response.ok) return await response.json() as T;
      const retryable = response.status === 429 || response.status >= 500;
      const kind = response.status === 401 || response.status === 403 ? 'auth' : response.status === 404 ? 'not_found' : retryable ? 'transient' : 'inconclusive';
      if (!retryable || attempt === maxAttempts) throw new IntegrationError(`Provider request failed (${response.status})`, kind, response.status);
      const retryAfter = Number(response.headers.get('retry-after'));
      await new Promise(resolve => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter * 1000, 1000) : 25 * attempt));
    } catch (error) {
      lastError = error;
      if (error instanceof IntegrationError && (error.kind !== 'transient' || attempt === maxAttempts)) throw error;
      if (attempt === maxAttempts) throw new IntegrationError(error instanceof Error ? error.message : 'Network error', 'transient');
      await new Promise(resolve => setTimeout(resolve, 25 * attempt));
    } finally { clearTimeout(timeout); }
  }
  throw new IntegrationError(lastError instanceof Error ? lastError.message : 'Network error', 'transient');
}

export function hmacSha256(secret: string, body: string): Promise<string> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']).then(key => crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))).then(value => Buffer.from(value).toString('hex'));
}

export function safeEqual(a: string, b: string): boolean { const aa = new TextEncoder().encode(a); const bb = new TextEncoder().encode(b); if (aa.length !== bb.length) return false; let diff = 0; for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i]; return diff === 0; }
