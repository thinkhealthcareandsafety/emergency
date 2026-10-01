export const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtClock = (d) =>
  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const fmtDate = (d) =>
  new Date(d).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function fmtDateTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return fmtTime(date);
  if (date.toDateString() === yest.toDateString()) return `Yesterday ${fmtTime(date)}`;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${fmtTime(date)}`;
}

export function fmtDuration(from, to = new Date()) {
  const mins = Math.max(0, Math.floor((new Date(to) - new Date(from)) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

export const STATE_LABEL = {
  available: 'On duty',
  stale: 'Unconfirmed',
  unavailable: 'Unavailable',
  off: 'Off duty',
};
