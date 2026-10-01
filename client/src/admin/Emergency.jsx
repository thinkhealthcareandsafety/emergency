import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api.js';
import { fmtDateTime, fmtDuration, fmtTime } from '../format.js';
import { useNow } from '../hooks/useLiveSnapshot.js';

const TYPES = ['Fire', 'Medical', 'Gas leak', 'Bomb threat', 'Earthquake', 'Flood', 'Security incident', 'Drill'];

export default function EmergencyPage({ property, properties }) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [type, setType] = useState('Fire');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const now = useNow(1000);
  const propName = properties.find((p) => p.code === property)?.name || property;

  const load = useCallback(async () => {
    if (!property) return;
    const [m, h] = await Promise.all([api(`/api/admin/emergency/${property}`), api('/api/admin/emergencies')]);
    setData(m);
    setHistory(h.filter((e) => e.propertyCode === property));
  }, [property]);

  useEffect(() => {
    load();
    const s = io();
    s.on('connect', () => s.emit('join', { propertyCode: property }));
    s.on('changed', load);
    return () => s.disconnect();
  }, [load, property]);

  const run = async (fn) => {
    setErr('');
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  if (!data) return <div className="d-muted">Loading…</div>;
  const em = data.emergency;
  const people = data.people.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.empCode.includes(q));
  const done = data.people.filter((p) => p.accounted).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Emergency & muster</h2>
          <p className="d-muted">
            Starting an emergency switches every screen at {propName} into alert mode and opens a live headcount of everyone punched in.
          </p>
        </div>
      </div>
      {err && <div className="alert error">{err}</div>}

      {!em ? (
        <div className="panel em-start">
          <div className="form-grid">
            <label className="field">
              <span>Type</span>
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Location / note (optional)</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Kitchen, ground floor" />
            </label>
          </div>
          <button
            className="btn danger big"
            onClick={() => {
              if (confirm(`Start "${type}" emergency at ${propName}? All screens will switch to alert mode.`))
                run(() => api(`/api/admin/emergency/${property}/start`, { method: 'POST', body: { type, note } }));
            }}
          >
            Start emergency at {propName}
          </button>
          <p className="d-muted small">{data.people.length} people currently on site will appear in the headcount.</p>
        </div>
      ) : (
        <>
          <div className="em-live">
            <div>
              <div className="em-kicker">Active · {em.type}</div>
              <div className="em-meta">
                Started {fmtTime(em.startedAt)} by {em.startedBy} · running {fmtDuration(em.startedAt, now)}
                {em.note ? ` · ${em.note}` : ''}
              </div>
            </div>
            <div className="em-count">
              {done}
              <span> / {data.people.length} accounted</span>
            </div>
            <button
              className="btn"
              onClick={() => confirm('End the emergency and return screens to normal?') && run(() => api(`/api/admin/emergency/${property}/end`, { method: 'POST' }))}
            >
              End emergency
            </button>
          </div>

          <div className="toolbar">
            <input className="input" placeholder="Find a person" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="muster">
            {people.map((p) => (
              <button
                key={p.empCode}
                className={`muster-item ${p.accounted ? 'yes' : ''}`}
                onClick={() => run(() => api(`/api/admin/emergency/${property}/account`, { method: 'POST', body: { empCode: p.empCode, accounted: !p.accounted } }))}
              >
                <span className="check">{p.accounted ? '✓' : ''}</span>
                <span className="muster-text">
                  <strong>{p.name}</strong>
                  <span className="small d-muted">
                    {p.department || p.designation || p.empCode}
                    {p.state === 'stale' ? ' · punch-out missing, may have left' : ''}
                  </span>
                </span>
                {p.phone && <span className="small mono">{p.phone}</span>}
              </button>
            ))}
            {!people.length && <div className="d-muted">Nobody is punched in.</div>}
          </div>
        </>
      )}

      {history.filter((h) => h.endedAt).length > 0 && (
        <div className="panel" style={{ marginTop: 24 }}>
          <div className="panel-title">Past events</div>
          <table className="table">
            <tbody>
              {history
                .filter((h) => h.endedAt)
                .slice(0, 10)
                .map((h) => (
                  <tr key={h._id}>
                    <td>{h.type}</td>
                    <td>{fmtDateTime(h.startedAt)}</td>
                    <td>{fmtDuration(h.startedAt, h.endedAt)}</td>
                    <td>{h.accounted.length} accounted</td>
                    <td className="d-muted">by {h.startedBy}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
