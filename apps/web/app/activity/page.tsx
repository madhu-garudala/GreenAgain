'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Event, EventListResponse } from '../../lib/types';
import { demoEvents } from '../../lib/types';
import { useIntegrations, useOperator, useTheme } from '../../lib/ui';
import { EmptyState, LoginModal, Sidebar, Topbar } from '../../lib/shell';

function formatDate(value?: string) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
function apiErrorMessage(error: unknown) { return error instanceof Error ? error.message : 'The dashboard could not reach the control API.'; }

export default function ActivityPage() {
  const preview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1';
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false); const [loginError, setLoginError] = useState<string | null>(null); const [loginEmail, setLoginEmail] = useState(''); const [loginPassword, setLoginPassword] = useState('');
  const [light, toggleTheme] = useTheme();
  const integrations = useIntegrations(preview);
  const { operator, email: operatorEmail, signedIn, signOut } = useOperator();

  const load = useCallback(() => {
    if (preview) return Promise.resolve();
    return fetch('/api/events').then(async r => { if (!r.ok) throw new Error(`Events API returned ${r.status}`); return r.json(); }).then(ev => { const data = ev as EventListResponse; setEvents(Array.isArray(data) ? data : data.events ?? []); setError(null); }).catch(e => setError(apiErrorMessage(e)));
  }, [preview]);

  useEffect(() => { if (preview) { setEvents(demoEvents); setLoading(false); return; }
    let disposed = false;
    const poll = () => { void load().finally(() => { if (!disposed) setLoading(false); }); };
    poll(); const timer = window.setInterval(poll, 5000); return () => { disposed = true; window.clearInterval(timer); };
  }, [preview, load]);

  async function login(event: React.FormEvent) { event.preventDefault(); setLoginError(null); try { const res = await fetch('/api/auth/login', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:loginEmail,password:loginPassword})}); if (!res.ok) throw new Error(res.status === 401 ? 'Invalid operator credentials.' : `Login API returned ${res.status}`); const session = await res.json().catch(() => ({})); signedIn(session.email ?? loginEmail); setLoginOpen(false); setLoginPassword(''); } catch (e) { setLoginError(apiErrorMessage(e)); } }
  function refresh() { setLoading(true); void load().finally(() => setLoading(false)); }

  return <main className="shell">
    <Topbar preview={preview} apiDown={!!error} light={light} onToggleTheme={toggleTheme} operator={operator} operatorEmail={operatorEmail} onSignIn={() => {setLoginError(null);setLoginOpen(true)}} onSignOut={signOut}/>
    <div className="workspace"><Sidebar active="activity" integrations={integrations} operator={operator}/>
      <section className="content"><div className="page-heading"><div><div className="eyebrow">Operations / Activity</div><h1>Activity timeline.</h1><p>Recovery events recorded by the control plane.</p></div><button className="secondary-button" onClick={refresh}>↻ <span>Refresh data</span></button></div>
        {error && <div className="notice error"><span>!</span><div><strong>Control API unavailable</strong><p>{error} Check your deployment connection or use <a href="?preview=1">preview mode</a> for the UI fixture.</p></div></div>}
        <div className="activity-list">{loading ? <EmptyState icon="◌" title="Loading activity" body="Reading the event store…"/> : error ? <EmptyState icon="!" title="No live data" body="The API did not return an event list."/> : events.length === 0 ? <EmptyState icon="✓" title="No activity yet" body="When GreenAgain works on an incident, events will appear here."/> : events.map(e => <div className="event-row" key={e.id}><div className="event-meta"><span className="event-type">{e.type ?? 'EVENT'}</span><time>{formatDate(e.createdAt)}</time></div><div className="event-message">{e.message ?? ''}</div><div className="event-meta"><span className="event-incident">{e.incidentId ? <>incident <Link href={`/?incident=${e.incidentId}`}>{e.incidentId}</Link></> : ''}</span><span>{e.actor ?? ''}</span></div></div>)}</div>
        <div className="footer-note"><span className="shield">♢</span><span><strong>Recovery is measured, not assumed.</strong> GreenAgain only marks an incident resolved after independent verification passes.</span></div>
      </section></div>
    <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onSubmit={login} email={loginEmail} setEmail={setLoginEmail} password={loginPassword} setPassword={setLoginPassword} error={loginError}/>
  </main>;
}
