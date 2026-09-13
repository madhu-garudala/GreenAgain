import { requestJson, IntegrationError } from './http.js';

export interface TraceQuery { project?: string; /** A project/session UUID. Avoids a name lookup. */ projectId?: string; start?: string; end?: string; tags?: string[]; limit?: number; cursor?: string; }
export interface Trace { id: string; name?: string; run_type?: string; status?: string; start_time?: string; end_time?: string; error?: unknown; inputs?: unknown; outputs?: unknown; extra?: Record<string, unknown>; tags?: string[]; [key: string]: unknown; }
export interface TracePage { runs: Trace[]; cursors?: { next?: string }; }
export interface Feedback { id: string; run_id: string; key: string; score?: number; value?: unknown; comment?: string; created_at?: string; }
export interface Experiment { id: string; name: string; url?: string; dataset_id?: string; metadata?: Record<string, unknown>; }
export interface LangSmithClientOptions { apiKey: string; endpoint?: string; project?: string; fetchFn?: typeof fetch; }

export class LangSmithClient {
  private readonly endpoint: string;
  constructor(private readonly options: LangSmithClientOptions) { this.endpoint = (options.endpoint ?? 'https://api.smith.langchain.com').replace(/\/$/, ''); }
  private headers() { return { 'Content-Type': 'application/json', 'x-api-key': this.options.apiKey }; }
  private isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
  private async resolveProjectId(name: string): Promise<string> {
    if (this.isUuid(name)) return name;
    const params = new URLSearchParams({ name, limit: '1' });
    const response = await requestJson<unknown>(`${this.endpoint}/sessions?${params}`, { headers: this.headers() }, this.options.fetchFn);
    const projects = Array.isArray(response) ? response : (response && typeof response === 'object' && Array.isArray((response as { sessions?: unknown }).sessions) ? (response as { sessions: unknown[] }).sessions : []);
    const id = projects[0] && typeof projects[0] === 'object' ? (projects[0] as { id?: unknown }).id : undefined;
    if (typeof id !== 'string' || !this.isUuid(id)) throw new IntegrationError(`LangSmith project not found: ${name}`, 'not_found', 404);
    return id;
  }
  async queryTraces(query: TraceQuery = {}): Promise<TracePage> {
    const project = query.projectId ?? query.project ?? this.options.project;
    const body: Record<string, unknown> = { limit: Math.min(Math.max(query.limit ?? 100, 1), 1000) };
    if (project) body.session = [await this.resolveProjectId(project)];
    if (query.start) body.start_time = query.start;
    if (query.end) body.end_time = query.end;
    if (query.tags?.length) body.filter = query.tags.length === 1 ? `has(tags, ${JSON.stringify(query.tags[0])})` : `and(${query.tags.map(tag => `has(tags, ${JSON.stringify(tag)})`).join(', ')})`;
    if (query.cursor) body.cursor = query.cursor;
    return requestJson<TracePage>(`${this.endpoint}/runs/query`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) }, this.options.fetchFn);
  }
  async getTrace(id: string): Promise<Trace> { return requestJson<Trace>(`${this.endpoint}/runs/${encodeURIComponent(id)}`, { headers: this.headers() }, this.options.fetchFn); }
  async listFeedback(runId?: string): Promise<Feedback[]> { const p = runId ? `?run_id=${encodeURIComponent(runId)}` : ''; const value = await requestJson<{ feedback?: Feedback[] } | Feedback[]>(`${this.endpoint}/feedback${p}`, { headers: this.headers() }, this.options.fetchFn); return Array.isArray(value) ? value : value.feedback ?? []; }
  async createExperiment(input: { name: string; datasetId: string; metadata?: Record<string, unknown> }): Promise<Experiment> { const body: Record<string, unknown> = { name: input.name, reference_dataset_id: input.datasetId, extra: {} }; if (input.metadata !== undefined) (body.extra as Record<string, unknown>).metadata = input.metadata; return requestJson<Experiment>(`${this.endpoint}/sessions`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) }, this.options.fetchFn); }
  async createFeedback(input: Omit<Feedback, 'id' | 'created_at'>): Promise<Feedback> { return requestJson<Feedback>(`${this.endpoint}/feedback`, { method: 'POST', headers: this.headers(), body: JSON.stringify(input) }, this.options.fetchFn); }
}
