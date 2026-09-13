import { hmacSha256, requestJson, safeEqual } from './http.js';
export interface GitHubClientOptions { token: string; owner: string; repo: string; webhookSecret?: string; apiBase?: string; fetchFn?: typeof fetch; }
export interface GitHubSource { path: string; ref?: string; content: string; sha?: string; }
export interface GitHubDiff { files: Array<{ filename: string; status?: string; patch?: string; additions?: number; deletions?: number }>; url?: string; }
export interface GitHubPullRequest { number: number; html_url: string; head: { sha: string; ref: string }; state?: string; }
export interface GitHubCheck { name: string; status: string; conclusion?: string; html_url?: string; }
export class GitHubClient {
  private readonly base: string;
  constructor(private readonly options: GitHubClientOptions) { this.base = (options.apiBase ?? 'https://api.github.com').replace(/\/$/, ''); }
  private headers() { return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.options.token}`, 'X-GitHub-Api-Version': '2022-11-28' }; }
  private path(p: string) { return `${this.base}/repos/${encodeURIComponent(this.options.owner)}/${encodeURIComponent(this.options.repo)}${p}`; }
  async getSource(path: string, ref?: string): Promise<GitHubSource> { const q = ref ? `?ref=${encodeURIComponent(ref)}` : ''; const r = await requestJson<{ content: string; encoding: string; sha: string; path: string }>(this.path(`/contents/${path.replace(/^\//, '')}${q}`), { headers: this.headers() }, this.options.fetchFn); return { path: r.path, ref, sha: r.sha, content: r.encoding === 'base64' ? Buffer.from(r.content.replace(/\n/g, ''), 'base64').toString('utf8') : r.content }; }
  async getDiff(base: string, head: string): Promise<GitHubDiff> { return requestJson<GitHubDiff>(this.path(`/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`), { headers: { ...this.headers(), Accept: 'application/vnd.github+json' } }, this.options.fetchFn); }
  async createPullRequest(input: { title: string; body: string; head: string; base: string }): Promise<GitHubPullRequest> { return requestJson<GitHubPullRequest>(this.path('/pulls'), { method: 'POST', headers: this.headers(), body: JSON.stringify(input) }, this.options.fetchFn); }
  async listChecks(ref: string): Promise<GitHubCheck[]> { const r = await requestJson<{ check_runs: GitHubCheck[] }>(this.path(`/commits/${encodeURIComponent(ref)}/check-runs`), { headers: this.headers() }, this.options.fetchFn); return r.check_runs; }
  async verifyWebhook(rawBody: string, signature: string): Promise<boolean> { if (!this.options.webhookSecret || !signature.startsWith('sha256=')) return false; return safeEqual(signature, `sha256=${await hmacSha256(this.options.webhookSecret, rawBody)}`); }
}
