import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api.js';
import { fmtTime } from '../format.js';

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function sourceLabel(s = '') {
  if (s === 'hono-api') return 'HONO';
  if (s === 'webhook') return 'HONO webhook';
  if (s === 'csv-import') return 'CSV import';
  if (s === 'qr-demo') return 'QR demo';
  if (s.startsWith('manual:')) return `Manual (${s.slice(7)})`;
  return s || '—';
}

/** Full punch history for one day: who punched in or out, when, and where the punch came from. */
export default function Logs({ property }) {
  const [date, setDate] = useState(today);
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!property) return;
    try {
      setRows(await api('/api/admin/punches', { query: { property, date, limit: 2000 } }));
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, [property, date]);

  useEffect(() => {
    load();
    const s = io();
    s.on('connect', () => s.emit('join', { propertyCode: property }));
    s.on('changed', load);
    return () => s.disconnect();
  }, [load, property]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows || []).filter(
      (r) => (type === 'all' || r.type === type) && (!s || r.name.toLowerCase().includes(s) || r.empCode.toLowerCase().includes(s))
    );
  }, [rows, type, q]);

  const ins = (rows || []).filter((r) => r.type === 'IN').length;

  function downloadCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Date', 'Time', 'Employee code', 'Name', 'Department', 'Punch', 'Source'].map(esc).join(',')];
    for (const r of shown) {
      const d = new Date(r.at);
      lines.push([d.toLocaleDateString(), d.toLocaleTimeString(), r.empCode, r.name, r.department, r.type, sourceLabel(r.source)].map(esc).join(','));
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `punch-log-${property}-${date}.csv` }).click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Punch log</h2>
          <p className="d-muted">Every punch in and out for the selected day, newest first. Updates live.</p>
        </div>
        <button className="btn" onClick={downloadCsv} disabled={!shown.length}>
          Download CSV
        </button>
      </div>
      {err && <div className="alert error">{err}</div>}

      <div className="toolbar">
        <input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} style={{ maxWidth: 180, flex: 'none' }} />
        <input className="input" placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {[
            ['all', 'All'],
            ['IN', 'In'],
            ['OUT', 'Out'],
          ].map(([k, l]) => (
            <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>
              {l}
            </button>
          ))}
        </div>
        {rows && (
          <span className="d-muted small" style={{ alignSelf: 'center' }}>
            {rows.length} punches · {ins} in · {rows.length - ins} out
          </span>
        )}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>Time</th>
              <th style={{ width: 90 }}>Punch</th>
              <th>Employee</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{fmtTime(r.at)}</td>
                <td>
                  <span className={`tag ${r.type === 'IN' ? 'in' : 'out'}`}>{r.type}</span>
                </td>
                <td>
                  <div className="strong">{r.name}</div>
                  <div className="d-muted small">
                    {r.empCode}
                    {r.department ? ` · ${r.department}` : ''}
                  </div>
                </td>
                <td className="d-muted small">{sourceLabel(r.source)}</td>
              </tr>
            ))}
            {rows && !shown.length && (
              <tr>
                <td colSpan={4} className="d-muted center">
                  No punches for this day.
                </td>
              </tr>
            )}
            {!rows && (
              <tr>
                <td colSpan={4} className="d-muted center">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
