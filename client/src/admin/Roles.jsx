import { useState } from 'react';
import { api } from '../api.js';

export default function Roles({ settings, reloadMeta }) {
  const [roles, setRoles] = useState(settings.roles.map((r) => ({ ...r })));
  const [stale, setStale] = useState(settings.staleAfterHours);
  const [msg, setMsg] = useState(null);

  const update = (i, k, v) => setRoles(roles.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i, d) => {
    const next = [...roles];
    const [r] = next.splice(i, 1);
    next.splice(i + d, 0, r);
    setRoles(next);
  };

  async function save() {
    try {
      await api('/api/admin/settings', { method: 'PUT', body: { roles, staleAfterHours: Number(stale) } });
      await reloadMeta();
      setMsg({ type: 'ok', text: 'Saved — screens updated' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Roles & coverage rules</h2>
          <p className="d-muted">
            Set the minimum number of each ERT role that must be on duty at every property. Screens turn red when coverage drops below.
          </p>
        </div>
        <button className="btn primary" onClick={save}>
          Save changes
        </button>
      </div>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 60 }}>Color</th>
              <th>Role name</th>
              <th style={{ width: 160 }}>Minimum on duty</th>
              <th className="right">Order</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r, i) => (
              <tr key={r.key || i}>
                <td>
                  <input type="color" value={r.color} onChange={(e) => update(i, 'color', e.target.value)} className="color" />
                </td>
                <td>
                  <input className="input" value={r.label} onChange={(e) => update(i, 'label', e.target.value)} />
                </td>
                <td>
                  <input className="input" type="number" min={0} max={50} value={r.minOnDuty} onChange={(e) => update(i, 'minOnDuty', e.target.value)} />
                </td>
                <td className="right nowrap">
                  <button className="btn sm ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button className="btn sm ghost" disabled={i === roles.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                    ↓
                  </button>
                  <button className="btn sm ghost danger" onClick={() => confirm(`Remove role "${r.label}"?`) && setRoles(roles.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn" onClick={() => setRoles([...roles, { key: '', label: 'New role', color: '#94a3b8', minOnDuty: 1 }])}>
        + Add role
      </button>

      <div className="panel" style={{ marginTop: 24, maxWidth: 560 }}>
        <div className="panel-title">Missing punch-out detection</div>
        <p className="d-muted small">
          If someone punched in more than this many hours ago and never punched out, they are shown as “Unconfirmed” and do not count towards
          coverage. Set it just above your longest shift.
        </p>
        <label className="field" style={{ maxWidth: 200 }}>
          <span>Hours</span>
          <input className="input" type="number" min={1} max={72} value={stale} onChange={(e) => setStale(e.target.value)} />
        </label>
      </div>
    </div>
  );
}
