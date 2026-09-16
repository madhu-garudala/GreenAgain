import { useCallback, useEffect, useState } from 'react';
import type { Integration, IntegrationListResponse } from './types';

export const CONNECTION_LINKS: Record<string, string> = {
  LangSmith: 'https://smith.langchain.com/o/c93d30d6-81f2-49f7-bab7-4e2f3a03d58c/projects/p/99ab3bd3-082c-46a1-a007-75627bd91079?timeModel=%7B%22duration%22%3A%221d%22%7D',
  AWS: 'https://us-east-1.console.aws.amazon.com/lambda/home?region=us-east-1#/functions',
  GitHub: 'https://github.com/madhu-garudala/GreenAgain',
  Slack: 'https://app.slack.com/client/T0C1MER44DA/C0C2C5U74RE',
};

export const CONNECTION_NAMES = ['LangSmith', 'AWS', 'GitHub', 'Slack'];

export function useTheme(): [boolean, () => void] {
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(document.documentElement.classList.contains('light-mode')); }, []);
  const toggle = useCallback(() => {
    const root = document.documentElement;
    root.classList.add('theme-transition');
    const next = !root.classList.contains('light-mode');
    root.classList.toggle('light-mode', next);
    try { localStorage.setItem('theme', next ? 'light' : 'dark'); } catch {}
    setLight(next);
    window.setTimeout(() => root.classList.remove('theme-transition'), 500);
  }, []);
  return [light, toggle];
}

export function useIntegrations(preview?: boolean): Integration[] {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  useEffect(() => {
    if (preview) { setIntegrations(CONNECTION_NAMES.map(name => ({ name, status: 'connected' as const, detail: 'Preview fixture' }))); return; }
    let disposed = false;
    const load = () => fetch('/api/integrations').then(async r => { if (!r.ok) throw new Error(`Integrations API returned ${r.status}`); return r.json(); }).then(g => { if (disposed) return; const data = g as IntegrationListResponse; setIntegrations(Array.isArray(data) ? data : data.integrations ?? []); }).catch(() => {});
    load();
    const timer = window.setInterval(load, 15000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [preview]);
  return integrations;
}

export function useOperator(): { operator: boolean; email: string; signedIn: (email: string) => void; signOut: () => void } {
  const [operator, setOperator] = useState(false);
  const [email, setEmail] = useState('');
  useEffect(() => {
    fetch('/api/auth/session').then(async r => r.ok ? r.json() : null).then(s => { if (s?.authenticated) { setOperator(true); setEmail(s.email ?? ''); } }).catch(() => {});
  }, []);
  return {
    operator, email,
    signedIn: value => { setOperator(true); setEmail(value); },
    signOut: () => { void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); setOperator(false); setEmail(''); },
  };
}
