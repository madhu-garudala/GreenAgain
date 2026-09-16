export type IncidentStatus = 'DETECTED'|'INVESTIGATING'|'ACTION_PROPOSED'|'AWAITING_APPROVAL'|'REMEDIATING'|'VERIFYING'|'FIX_READY'|'RESOLVED'|'ESCALATED';
export type Incident = { id: string; title?: string; application?: string; environment?: string; status: IncidentStatus; category?: string; createdAt?: string; updatedAt?: string; summary?: string; release?: string; severity?: string; evidenceCount?: number; verification?: { status?: string; checkedAt?: string; detail?: string } };
export type Event = { id: string; type?: string; message?: string; createdAt?: string; actor?: string; status?: string; link?: string; incidentId?: string };
export type Integration = { name: string; status: 'connected'|'stale'|'degraded'|'unconfigured'; checkedAt?: string; detail?: string };
export type IncidentDto = Omit<Incident, 'status'> & { status?: string; state?: string };
export type IncidentListResponse = Incident[] | { incidents?: IncidentDto[] };
export type IncidentDetailResponse = IncidentDto | { incident?: IncidentDto };
export type EventListResponse = Event[] | { events?: Event[] };
export type IntegrationListResponse = Integration[] | { integrations?: Integration[] };
const incidentStatuses = new Set<IncidentStatus>(['DETECTED','INVESTIGATING','ACTION_PROPOSED','AWAITING_APPROVAL','REMEDIATING','VERIFYING','FIX_READY','RESOLVED','ESCALATED']);
export function normalizeIncident(value: IncidentDto): Incident {
  const candidate = String(value.status ?? value.state ?? 'DETECTED').toUpperCase() as IncidentStatus;
  return { ...value, status: incidentStatuses.has(candidate) ? candidate : 'DETECTED' };
}
export function incidentListFromDto(value: IncidentListResponse): Incident[] {
  const list = Array.isArray(value) ? value : value.incidents ?? [];
  return list.map(normalizeIncident);
}
export function incidentFromDto(value: IncidentDetailResponse): Incident | null {
  const incident = 'incident' in value ? value.incident : value as IncidentDto;
  return incident ? normalizeIncident(incident) : null;
}

export const demoIncidents: Incident[] = [{id:'preview-incident',title:'Policy retrieval regression',application:'support-agent',environment:'production',status:'VERIFYING',category:'semantic_regression',createdAt:'2026-09-13T18:32:00Z',updatedAt:'2026-09-13T18:41:00Z',summary:'The deployed release answered return questions without citing the active policy. A verified baseline is ready for comparison.',release:'2026.09.13-rc2',severity:'high',evidenceCount:8,verification:{status:'IN_PROGRESS',detail:'Awaiting three fresh representative invocations.'}}];
export const demoEvents: Event[] = [{id:'e1',type:'INCIDENT_DETECTED',message:'Evaluation threshold crossed for policy citation coverage.',createdAt:'2026-09-13T18:32:00Z',actor:'poller'},{id:'e2',type:'INVESTIGATION',message:'Orchestrator compared current traces with the last verified release.',createdAt:'2026-09-13T18:36:00Z',actor:'orchestrator'},{id:'e3',type:'ACTION_PROPOSED',message:'Release specialist proposed rollback to 2026.09.12-stable.',createdAt:'2026-09-13T18:39:00Z',actor:'release-specialist'},{id:'e4',type:'VERIFICATION_STARTED',message:'Fresh live checks started against the controlled alias.',createdAt:'2026-09-13T18:41:00Z',actor:'verifier'}];
