'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Incident, IncidentListResponse } from '../../lib/types';
import { demoIncidents, incidentListFromDto } from '../../lib/types';
import { useIntegrations, useOperator, useTheme } from '../../lib/ui';
import { EmptyState, LoginModal, Sidebar, Topbar } from '../../lib/shell';

const statusMeta: Record<string,{label:string; tone:string}> = { DETECTED:{label:'Detected',tone:'amber'}, INVESTIGATING:{label:'Investigating',tone:'blue'}, ACTION_PROPOSED:{label:'Action proposed',tone:'purple'}, AWAITING_APPROVAL:{label:'Awaiting approval',tone:'amber'}, REMEDIATING:{label:'Remediating',tone:'blue'}, VERIFYING:{label:'Verifying',tone:'blue'}, FIX_READY:{label:'Fix ready',tone:'purple'}, RESOLVED:{label:'Resolved',tone:'green'}, ESCALATED:{label:'Escalated',tone:'red'} };

function formatDate(value?: string) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
function apiErrorMessage(error: unknown) { return error instanceof Error ? error.message : 'The dashboard could not reach the control API.'; }

export default function IncidentsPage() {
  const preview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1';
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false); const [loginError, setLoginError] = useState<string | null>(null); const [loginEmail, setLoginEmail] = useState(''); const [loginPassword, setLoginPassword] = useState('');
  const [light, toggleTheme] = useTheme();
  const integrations = useIntegrations(preview);
  const { operator, email: operatorEmail, signedIn, signOut } = useOperator();

  const load = useCallback(() => {
    if (preview) return Promise.resolve();
    return fetch('/api/incidents').then(async r => { if (!r.ok) throw new Error(`Incidents API returned ${r.status}`); return r.json(); }).then(i => { setIncidents(incidentListFromDto(i as IncidentListResponse)); setError(null); }).catch(e => setError(apiErrorMessage(e)));
  }, [preview]);

  useEffect(() => { if (preview) { setIncidents(demoIncidents); setLoading(false); return; }
    let disposed = false;
    const poll = () => { void load().finally(() => { if (!disposed) setLoading(false); }); };
    poll(); const timer = window.setInterval(poll, 5000); return () => { disposed = true; window.clearInterval(timer); };
  }, [preview, load]);

  async function login(event: React.FormEvent) { event.preventDefault(); setLoginError(null); try { const res = await fetch('/api/auth/login', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:loginEmail,password:loginPassword})}); if (!res.ok) throw new Error(res.status === 401 ? 'Invalid operator credentials.' : `Login API returned ${res.status}`); const session = await res.json().catch(() => ({})); signedIn(session.email ?? loginEmail); setLoginOpen(false); setLoginPassword(''); } catch (e) { setLoginError(apiErrorMessage(e)); } }
  function refresh() { setLoading(true); void load().finally(() => setLoading(false)); }

  const activeCount = incidents.filter(i => !['RESOLVED','ESCALATED'].includes(i.status)).length;

  return <main className="shell">
    <Topbar preview={preview} apiDown={!!error} light={light} onToggleTheme={toggleTheme} operator={operator} operatorEmail={operatorEmail} onSignIn={() => {setLoginError(null);setLoginOpen(true)}} onSignOut={signOut}/>
    <div className="workspace"><Sidebar active="incidents" integrations={integrations} operator={operator} activeCount={activeCount}/>
      <section className="content"><div className="page-heading"><div><div className="eyebrow">Operations / Incidents</div><h1>Incident queue.</h1><p>All detected regressions and their recovery status.</p></div><button className="secondary-button" onClick={refresh}>↻ <span>Refresh data</span></button></div>
        {error && <div className="notice error"><span>!</span><div><strong>Control API unavailable</strong><p>{error} Check your deployment connection or use <a href="?preview=1">preview mode</a> for the UI fixture.</p></div></div>}
        <div className="incident-list-full">{loading ? <EmptyState icon="◌" title="Loading incidents" body="Reading the incident store…"/> : error ? <EmptyState icon="!" title="No live data" body="The API did not return an incident list."/> : incidents.length === 0 ? <EmptyState icon="✓" title="No incidents yet" body="When GreenAgain detects a regression, it will appear here."/> : incidents.map(i => <Link className="incident-row" key={i.id} href={`/?incident=${i.id}`}><div className="row-top"><span className={`status-dot ${statusMeta[i.status]?.tone ?? 'gray'}`}/><span className="incident-name">{i.title ?? i.id}</span><span className={`status-badge ${statusMeta[i.status]?.tone ?? 'gray'}`}>{statusMeta[i.status]?.label ?? i.status}</span></div><div className="row-sub"><span>{i.application ?? 'Unknown application'} · {i.environment ?? 'Unknown environment'}</span><time>{formatDate(i.updatedAt ?? i.createdAt)}</time></div><div className="row-detail">{i.summary ?? 'No summary available'}</div></Link>)}</div>
        <div className="footer-note"><span className="shield">♢</span><span><strong>Recovery is measured, not assumed.</strong> GreenAgain only marks an incident resolved after independent verification passes.</span></div>
      </section></div>
    <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onSubmit={login} email={loginEmail} setEmail={setLoginEmail} password={loginPassword} setPassword={setLoginPassword} error={loginError}/>
  </main>;
}
