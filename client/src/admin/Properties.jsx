import { useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

const contactsToText = (c = []) => c.map((x) => `${x.label}: ${x.number}`).join('\n');
const textToContacts = (t) =>
  t
    .split('\n')
    .map((l) => l.split(':'))
    .filter((p) => p.length >= 2 && p[0].trim())
    .map(([label, ...rest]) => ({ label: label.trim(), number: rest.join(':').trim() }));

export default function Properties({ properties, reloadMeta }) {
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  async function save() {
    try {
      const body = { ...editing, emergencyContacts: textToContacts(editing.contactsText || '') };
      if (editing.isNew) await api('/api/admin/properties', { method: 'POST', body });
      else await api(`/api/admin/properties/${editing.code}`, { method: 'PUT', body });
      setEditing(null);
      reloadMeta();
    } catch (e) {
      setErr(e.message);
    }
  }

  const set = (k) => (e) => setEditing({ ...editing, [k]: e.target.value });

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Properties</h2>
          <p className="d-muted">Each hotel gets its own screen URL. Put one smart screen per property (or several, they all stay in sync).</p>
        </div>
        <button className="btn primary" onClick={() => (setErr(''), setEditing({ isNew: true, code: '', name: '', assemblyPoint: '', contactsText: 'Fire: 101\nAmbulance: 108\nPolice: 100' }))}>
          + Add property
        </button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Assembly point</th>
              <th>Screen URL</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => (
              <tr key={p.code}>
                <td>
                  <div className="strong">{p.name}</div>
                  <div className="small d-muted">{p.code}</div>
                </td>
                <td>{p.assemblyPoint || '—'}</td>
                <td>
                  <code className="small">
                    {location.origin}/display/{p.code}?key=&lt;DISPLAY_KEY&gt;
                  </code>
                </td>
                <td className="right">
                  <button className="btn sm ghost" onClick={() => (setErr(''), setEditing({ ...p, contactsText: contactsToText(p.emergencyContacts) }))}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal
          title={editing.isNew ? 'Add property' : `Edit ${editing.name}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setEditing(null)}>
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
              <span>Code (short, used in URLs)</span>
              <input className="input" value={editing.code} onChange={set('code')} disabled={!editing.isNew} placeholder="e.g. GOA" />
            </label>
            <label className="field">
              <span>Name</span>
              <input className="input" value={editing.name} onChange={set('name')} />
            </label>
          </div>
          <label className="field">
            <span>Assembly point</span>
            <input className="input" value={editing.assemblyPoint || ''} onChange={set('assemblyPoint')} />
          </label>
          <label className="field">
            <span>Emergency numbers (one per line, “Label: number”)</span>
            <textarea className="input" rows={5} value={editing.contactsText} onChange={set('contactsText')} />
          </label>
          {err && <div className="alert error">{err}</div>}
        </Modal>
      )}
    </div>
  );
}
