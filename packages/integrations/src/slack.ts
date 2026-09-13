import { hmacSha256, requestJson, safeEqual, IntegrationError } from './http.js';
export interface SlackMessage { channel: string; ts: string; text?: string; thread_ts?: string; permalink?: string; }
export interface SlackClientOptions { botToken: string; signingSecret: string; apiBase?: string; fetchFn?: typeof fetch; }
export class SlackClient {
  private readonly base: string;
  constructor(private readonly options: SlackClientOptions) { this.base = options.apiBase ?? 'https://slack.com/api'; }
  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> { const result = await requestJson<T & { ok?: boolean; error?: string }>(`${this.base}/${method}`, { method: 'POST', headers: { Authorization: `Bearer ${this.options.botToken}`, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }, this.options.fetchFn); if (result.ok === false) throw new IntegrationError(`Slack API error: ${result.error ?? 'unknown_error'}`, 'inconclusive'); return result; }
  async createThread(channel: string, text: string): Promise<SlackMessage> { const r = await this.call<{ ok: true; channel: string; ts: string; message?: { text?: string } }>('chat.postMessage', { channel, text }); return { channel: r.channel, ts: r.ts, text: r.message?.text }; }
  async updateThread(channel: string, ts: string, text: string): Promise<SlackMessage> { const r = await this.call<{ ok: true; channel: string; ts: string }>('chat.update', { channel, ts, text }); return { channel: r.channel, ts: r.ts, text }; }
  async threadPermalink(channel: string, ts: string): Promise<string | undefined> { const r = await this.call<{ ok: true; permalink?: string }>('chat.getPermalink', { channel, message_ts: ts }); return r.permalink; }
  async verifySignature(rawBody: string, timestamp: string, signature: string, now = Date.now()): Promise<boolean> { const ts = Number(timestamp) * 1000; if (!Number.isFinite(ts) || Math.abs(now - ts) > 5 * 60_000 || !signature.startsWith('v0=')) return false; return safeEqual(signature, `v0=${await hmacSha256(this.options.signingSecret, `v0:${timestamp}:${rawBody}`)}`); }
}
