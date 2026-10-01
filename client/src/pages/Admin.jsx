import { useCallback, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, auth } from '../api.js';
import Team from '../admin/Team.jsx';
import EmergencyPage from '../admin/Emergency.jsx';
import Roles from '../admin/Roles.jsx';
import ImportData from '../admin/ImportData.jsx';
import Integration from '../admin/Integration.jsx';
import Properties from '../admin/Properties.jsx';
import LiveDemo from '../admin/LiveDemo.jsx';
import Logs from '../admin/Logs.jsx';

const PROP_KEY = 'ert_admin_property';

export default function Admin() {
  const nav = useNavigate();
  const [properties, setProperties] = useState([]);
  const [settings, setSettings] = useState(null);
  const [property, setPropertyState] = useState(() => {
    try {
      return localStorage.getItem(PROP_KEY) || '';
    } catch {
      return '';
    }
  });

  const setProperty = (p) => {
    setPropertyState(p);
    try {
      localStorage.setItem(PROP_KEY, p);
    } catch {
      /* ignore */
    }
  };

  const loadMeta = useCallback(async () => {
    const [props, s] = await Promise.all([api('/api/admin/properties'), api('/api/admin/settings')]);
    setProperties(props);
    setSettings(s);
    if (props.length && !props.some((p) => p.code === property)) setProperty(props[0].code);
  }, [property]);

  useEffect(() => {
    if (auth.token()) loadMeta().catch(() => {});
  }, [loadMeta]);

  if (!auth.token()) return <Navigate to="/login" replace />;

  const ctx = { property, properties, settings, reloadMeta: loadMeta };

  return (
    <div className="admin">
      <header className="a-header">
        <div className="a-brand">
          <div className="d-logo small">
            <svg viewBox="0 0 24 24"><path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" /></svg>
          </div>
          <strong>ERT Live</strong>
          <span className="d-muted">Admin</span>
        </div>
        <nav className="a-nav">
          <NavLink to="/admin" end>Team</NavLink>
          <NavLink to="/admin/logs">Punch log</NavLink>
          <NavLink to="/admin/emergency">Emergency</NavLink>
          <NavLink to="/admin/roles">Roles & rules</NavLink>
          <NavLink to="/admin/import">Import</NavLink>
          <NavLink to="/admin/integration">HONO integration</NavLink>
          <NavLink to="/admin/properties">Properties</NavLink>
          <NavLink to="/admin/demo">Live demo</NavLink>
        </nav>
        <div className="a-actions">
          <select className="input" value={property} onChange={(e) => setProperty(e.target.value)} aria-label="Property">
            {properties.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
          {property && (
            <a className="btn" href={`/display/${property}`} target="_blank" rel="noreferrer">
              Open display ↗
            </a>
          )}
          <button
            className="btn ghost"
            onClick={() => {
              auth.clear();
              nav('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="a-main">
        {!settings ? (
          <div className="d-muted">Loading…</div>
        ) : (
          <Routes>
            <Route index element={<Team {...ctx} />} />
            <Route path="logs" element={<Logs {...ctx} />} />
            <Route path="emergency" element={<EmergencyPage {...ctx} />} />
            <Route path="roles" element={<Roles {...ctx} />} />
            <Route path="import" element={<ImportData {...ctx} />} />
            <Route path="integration" element={<Integration {...ctx} />} />
            <Route path="properties" element={<Properties {...ctx} />} />
            <Route path="demo" element={<LiveDemo {...ctx} />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
