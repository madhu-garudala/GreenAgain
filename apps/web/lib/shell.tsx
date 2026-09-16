'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Integration } from './types';
import { CONNECTION_LINKS, CONNECTION_NAMES } from './ui';

export function Sidebar({ active, integrations, operator, activeCount }: { active: 'overview' | 'incidents' | 'activity'; integrations: Integration[]; operator: boolean; activeCount?: number }) {
  return <aside className="sidebar"><nav><p className="nav-label">Workspace</p>
    <Link href="/" className={`nav-item ${active === 'overview' ? 'active' : ''}`}><span>▦</span>Overview</Link>
    <Link href="/incidents" className={`nav-item ${active === 'incidents' ? 'active' : ''}`}><span>◎</span>Incidents <b>{activeCount || ''}</b></Link>
    <Link href="/activity" className={`nav-item ${active === 'activity' ? 'active' : ''}`}><span>⌁</span>Activity</Link>
    <p className="nav-label integrations-label">Connections</p>
    {CONNECTION_NAMES.map(name => {
      const item = integrations.find(i => i.name.toLowerCase() === name.toLowerCase());
      const link = CONNECTION_LINKS[name];
      const inner = <><span className={`connection-dot ${item?.status ?? 'unconfigured'}`}/><span>{name}</span><small>{item?.status === 'connected' ? 'Live' : item?.status ?? 'Not set'}</small></>;
      return operator && link
        ? <a className="connection clickable" key={name} href={link} target="_blank" rel="noreferrer">{inner}</a>
        : <div className="connection" key={name}>{inner}</div>;
    })}
  </nav><div className="sidebar-bottom"><div className="help">?<span>Need a hand?</span></div><small>GreenAgain v0.1 · Operator console</small></div></aside>;
}

export function Topbar({ preview, apiDown, light, onToggleTheme, operator, operatorEmail, onSignIn, onSignOut }: { preview?: boolean; apiDown?: boolean; light: boolean; onToggleTheme: () => void; operator: boolean; operatorEmail: string; onSignIn: () => void; onSignOut: () => void }) {
  return <header className="topbar">
    <div className="brand"><span className="brand-mark">↻</span><div><strong>GreenAgain</strong><span>recovery control center</span></div></div>
    <div className="top-actions">
      {preview && <span className="preview-pill">Preview mode</span>}
      <span className="env-pill"><i/>{preview ? ' Preview fixture' : apiDown ? ' Control API unavailable' : ' Production'}</span>
      <button className="icon-button" onClick={onToggleTheme} aria-label="Toggle theme">{light ? '☾' : '☀'}</button>
      <button className="icon-button" aria-label="Notifications">◌</button>
      {operator
        ? <button className="operator" onClick={onSignOut}><span className="avatar">OP</span>{operatorEmail || 'Operator'} · Sign out</button>
        : <button className="operator" onClick={onSignIn}><span className="avatar">—</span>Sign in</button>}
    </div>
  </header>;
}

export function LoginModal({ open, onClose, onSubmit, email, setEmail, password, setPassword, error }: { open: boolean; onClose: () => void; onSubmit: (e: React.FormEvent) => void; email: string; setEmail: (v: string) => void; password: string; setPassword: (v: string) => void; error: string | null }) {
  if (!open) return null;
  return <div className="modal-backdrop" onClick={onClose}>
    <form className="login-modal" onClick={e => e.stopPropagation()} onSubmit={onSubmit}>
      <button type="button" className="modal-close" onClick={onClose}>×</button>
      <span className="modal-mark">↻</span><h2>Operator access</h2>
      <p>Sign in to operate demo scenarios and remediation controls.</p>
      <label>Email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="operator@example.com"/></label>
      <label>Access key<input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••"/></label>
      {error && <div className="login-error">{error}</div>}
      <button type="submit" className="primary-button full">Continue securely</button>
      <small>Access is deployment configured. Credentials never enter the browser logs.</small>
    </form>
  </div>;
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: ReactNode }) {
  return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{body}</p></div>;
}
