import { requestJson, IntegrationError } from './http.js';

export interface TraceQuery { project?: string; start?: string; end?: string; tags?: string[]; limit?: number; cursor?: string; }
export interface Trace { id: string; name?: string; run_type?: string; status?: string; start_time?: string; end_time?: string; error?: unknown; inputs?: unknown; outputs?: unknown; extra?: Record<string, unknown>; tags?: string[]; [key: string]: unknown; }
export interface TracePage { runs: Trace[]; cursors?: { next?: string }; }
export interface Feedback { id: string; run_id: string; key: string; score?: number; value?: unknown; comment?: string; created_at?: string; }
export interface Experiment { id: string; name: string; url?: string; dataset_id?: string; metadata?: Record<string, unknown>; }
export interface LangSmithClientOptions { apiKey: string; endpoint?: string; project?: string; fetchFn?: typeof fetch; }

export class LangSmithClient {
  private readonly endpoint: string;
  constructor(private readonly options: LangSmithClientOptions) { this.endpoint = (options.endpoint ?? 'https://api.smith.langchain.com').replace(/\/$/, ''); }
  private headers() { return { 'Content-Type': 'application/json', 'x-api-key': this.options.apiKey }; }
  async queryTraces(query: TraceQuery = {}): Promise<TracePage> { const body: Record<string, unknown> = { limit: query.limit ?? 100 }; if (query.project ?? this.options.project) body['session_name'] = query.project ?? this.options.project; if (query.start) body['start_time'] = query.start; if (query.end) body['run_ids'] = undefined; if (query.tags?.length) body['filter'] = query.tags.map(tag => `eq(tags, "${tag.replaceAll('"', '\\"')}")`).join(' AND '); if (query.cursor) body['page_token'] = query.cursor; return requestJson<TracePage>(`${this.endpoint}/runs/query`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) }, this.options.fetchFn); }
  async getTrace(id: string): Promise<Trace> { return requestJson<Trace>(`${this.endpoint}/runs/${encodeURIComponent(id)}`, { headers: this.headers() }, this.options.fetchFn); }
  async listFeedback(runId?: string): Promise<Feedback[]> { const p = runId ? `?run_id=${encodeURIComponent(runId)}` : ''; const value = await requestJson<{ feedback?: Feedback[] } | Feedback[]>(`${this.endpoint}/feedback${p}`, { headers: this.headers() }, this.options.fetchFn); return Array.isArray(value) ? value : value.feedback ?? []; }
  async createExperiment(input: { name: string; datasetId: string; metadata?: Record<string, unknown> }): Promise<Experiment> { return requestJson<Experiment>(`${this.endpoint}/sessions`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ name: input.name, reference_dataset_id: input.datasetId, metadata: input.metadata }) }, this.options.fetchFn); }
  async createFeedback(input: Omit<Feedback, 'id' | 'created_at'>): Promise<Feedback> { return requestJson<Feedback>(`${this.endpoint}/feedback`, { method: 'POST', headers: this.headers(), body: JSON.stringify(input) }, this.options.fetchFn); }
}
