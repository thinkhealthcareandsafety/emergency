import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import { fmtDateTime, STATE_LABEL } from '../format.js';

const EMPTY = { empCode: '', name: '', designation: '', department: '', phone: '', ertRoles: [] };

export default function Team({ property, settings }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('ert');
  const [editing, setEditing] = useState(null);
  const [overriding, setOverriding] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    if (property) setRows(await api('/api/admin/employees', { query: { property } }));
  }, [property]);

  useEffect(() => {
    load();
    const s = io();
    s.on('connect', () => s.emit('join', { propertyCode: property }));
    s.on('changed', load);
    return () => s.disconnect();
  }, [load, property]);

  const roleMap = useMemo(() => new Map(settings.roles.map((r) => [r.key, r])), [settings]);

  const shown = rows.filter((r) => {
    if (filter === 'ert' && !r.ertRoles.length) return false;
    if (filter === 'on' && r.availability.state !== 'available') return false;
    if (filter === 'new' && !r.autoCreated) return false;
    const s = q.trim().toLowerCase();
    return !s || r.name.toLowerCase().includes(s) || r.empCode.toLowerCase().includes(s) || (r.department || '').toLowerCase().includes(s);
  });

  const act = async (fn, ok) => {
    try {
      await fn();
      setMsg({ type: 'ok', text: ok });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const autoCount = rows.filter((r) => r.autoCreated).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Team</h2>
          <p className="d-muted">
            Assign ERT roles to staff. Their status updates automatically from HONO punches; use “Set status” for exceptions.
          </p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ ...EMPTY, isNew: true })}>
          + Add employee
        </button>
      </div>

      {autoCount > 0 && (
        <div className="alert warn">
          {autoCount} employee{autoCount > 1 ? 's were' : ' was'} created automatically from punches with unknown codes. Add their names and
          roles (filter: “Auto-added”).
        </div>
      )}
      {msg && (
        <div className={`alert ${msg.type}`} onClick={() => setMsg(null)}>
          {msg.text}
        </div>
      )}

      <div className="toolbar">
        <input className="input" placeholder="Search name, code, department" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {[
            ['ert', 'ERT members'],
            ['on', 'On duty'],
            ['all', 'All staff'],
            ['new', 'Auto-added'],
          ].map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>ERT roles</th>
              <th>Status</th>
              <th>Last punch</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.empCode}>
                <td>
                  <div className="strong">{r.name}</div>
                  <div className="d-muted small">
                    {r.empCode} · {r.designation || '—'} {r.department ? `· ${r.department}` : ''}
                  </div>
                </td>
                <td>
                  <div className="chips">
                    {r.ertRoles.map((k) => (
                      <span key={k} className="chip" style={{ '--role': roleMap.get(k)?.color || '#94a3b8' }}>
                        {roleMap.get(k)?.label || k}
                      </span>
                    ))}
                    {!r.ertRoles.length && <span className="d-muted small">—</span>}
                  </div>
                </td>
                <td>
                  <span className={`badge state-${r.availability.state}`}>{STATE_LABEL[r.availability.state]}</span>
                  {r.availability.manual && <div className="small d-muted">{r.availability.reason}</div>}
                </td>
                <td className="small">
                  {r.lastPunchType ? (
                    <>
                      <span className={`tag ${r.lastPunchType === 'IN' ? 'in' : 'out'}`}>{r.lastPunchType}</span> {fmtDateTime(r.lastPunchAt)}
                      <div className="d-muted">{r.lastPunchSource}</div>
                    </>
                  ) : (
                    <span className="d-muted">No punches</span>
                  )}
                </td>
                <td className="right nowrap">
                  <button className="btn sm" onClick={() => setOverriding(r)}>
                    Set status
                  </button>
                  <button className="btn sm ghost" onClick={() => setEditing({ ...r })}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="d-muted center">
                  Nobody matches this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EmployeeForm
          initial={editing}
          roles={settings.roles}
          property={property}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMsg({ type: 'ok', text });
            load();
          }}
          onDelete={() =>
            act(async () => {
              if (!confirm(`Delete ${editing.name}? Their punch history is kept.`)) throw new Error('Cancelled');
              await api(`/api/admin/employees/${encodeURIComponent(editing.empCode)}`, { method: 'DELETE' });
              setEditing(null);
            }, 'Employee deleted')
          }
        />
      )}

      {overriding && (
        <OverrideForm
          emp={overriding}
          onClose={() => setOverriding(null)}
          onDone={(text) => {
            setOverriding(null);
            setMsg({ type: 'ok', text });
            load();
          }}
        />
      )}
    </div>
  );
}

function EmployeeForm({ initial, roles, property, onClose, onSaved, onDelete }) {
  const [f, setF] = useState({ propertyCode: property, ...initial });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleRole = (key) =>
    setF({ ...f, ertRoles: f.ertRoles.includes(key) ? f.ertRoles.filter((k) => k !== key) : [...f.ertRoles, key] });

  async function save() {
    try {
      const body = {
        empCode: f.empCode.trim(),
        name: f.name.trim(),
        designation: f.designation,
        department: f.department,
        phone: f.phone,
        ertRoles: f.ertRoles,
        propertyCode: f.propertyCode,
      };
      if (initial.isNew) await api('/api/admin/employees', { method: 'POST', body });
      else await api(`/api/admin/employees/${encodeURIComponent(initial.empCode)}`, { method: 'PUT', body });
      onSaved(`${body.name} saved`);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Modal
      title={initial.isNew ? 'Add employee' : `Edit ${initial.name}`}
      onClose={onClose}
      footer={
        <>
          {!initial.isNew && (
            <button className="btn danger ghost" onClick={onDelete} style={{ marginRight: 'auto' }}>
              Delete
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>HONO employee code *</span>
          <input className="input" value={f.empCode} onChange={set('empCode')} disabled={!initial.isNew} placeholder="Must match HONO exactly" />
        </label>
        <label className="field">
          <span>Full name *</span>
          <input className="input" value={f.name} onChange={set('name')} />
        </label>
        <label className="field">
          <span>Designation</span>
          <input className="input" value={f.designation || ''} onChange={set('designation')} />
        </label>
        <label className="field">
          <span>Department</span>
          <input className="input" value={f.department || ''} onChange={set('department')} />
        </label>
        <label className="field">
          <span>Mobile</span>
          <input className="input" value={f.phone || ''} onChange={set('phone')} />
        </label>
        <label className="field">
          <span>Property code</span>
          <input className="input" value={f.propertyCode || ''} onChange={set('propertyCode')} />
        </label>
      </div>
      <div className="field">
        <span>ERT roles</span>
        <div className="role-picks">
          {roles.map((r) => (
            <label key={r.key} className={`role-pick ${f.ertRoles.includes(r.key) ? 'on' : ''}`} style={{ '--role': r.color }}>
              <input type="checkbox" checked={f.ertRoles.includes(r.key)} onChange={() => toggleRole(r.key)} />
              {r.label}
            </label>
          ))}
        </div>
      </div>
      {err && <div className="alert error">{err}</div>}
    </Modal>
  );
}

const DURATIONS = [
  [30, '30 minutes'],
  [60, '1 hour'],
  [120, '2 hours'],
  [240, '4 hours'],
  [480, '8 hours'],
  [0, 'Until next punch'],
];

function OverrideForm({ emp, onClose, onDone }) {
  const [status, setStatus] = useState('UNAVAILABLE');
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [err, setErr] = useState('');
  const path = `/api/admin/employees/${encodeURIComponent(emp.empCode)}`;

  const run = async (fn, text) => {
    try {
      await fn();
      onDone(text);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <Modal title={`Status for ${emp.name}`} onClose={onClose}>
      <p className="d-muted small">
        Attendance from HONO drives status automatically. Use this when reality differs — e.g. on a hospital run, in a training
        session, or covering on site without a punch. The next real punch clears it.
      </p>
      <div className="seg wide">
        <button className={status === 'UNAVAILABLE' ? 'on' : ''} onClick={() => setStatus('UNAVAILABLE')}>
          Unavailable
        </button>
        <button className={status === 'AVAILABLE' ? 'on' : ''} onClick={() => setStatus('AVAILABLE')}>
          Available
        </button>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Reason (shown on screen)</span>
          <input className="input" value={reason} maxLength={80} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Escorting guest to hospital" />
        </label>
        <label className="field">
          <span>For how long</span>
          <select className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {DURATIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <button className="btn primary" onClick={() => run(() => api(`${path}/override`, { method: 'POST', body: { status, reason, minutes } }), 'Status updated')}>
          Apply status
        </button>
        {emp.override && (
          <button className="btn ghost" onClick={() => run(() => api(`${path}/override`, { method: 'DELETE' }), 'Manual status cleared')}>
            Clear manual status
          </button>
        )}
      </div>
      <hr />
      <div className="field">
        <span>Missed punch? Record a manual punch (logged with your name)</span>
        <div className="row">
          <button className="btn sm" onClick={() => run(() => api('/api/admin/punch', { method: 'POST', body: { empCode: emp.empCode, type: 'IN' } }), 'Punch IN recorded')}>
            Punch IN now
          </button>
          <button className="btn sm" onClick={() => run(() => api('/api/admin/punch', { method: 'POST', body: { empCode: emp.empCode, type: 'OUT' } }), 'Punch OUT recorded')}>
            Punch OUT now
          </button>
        </div>
      </div>
      {err && <div className="alert error">{err}</div>}
    </Modal>
  );
}
