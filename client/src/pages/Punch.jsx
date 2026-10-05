import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, store } from '../api.js';
import { fmtTime } from '../format.js';
import { Icon, roleIcon } from '../components/Icons.jsx';
import { TEAMS } from '../teams.js';
import './display.css';
import './punch.css';

/** Phone page opened from the QR code on the wall screen during a live demo. */
export default function Punch() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const k = params.get('k') || '';
  const storeKey = `ert_demo_visitor_${code}`;
  const team = TEAMS[params.get('team')]; // QR from a team tab only offers that team's roles

  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [visitorId, setVisitorId] = useState(() => store.get(storeKey));
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [state, setState] = useState('off');
  const [lastAt, setLastAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    const v = store.get(storeKey);
    api(`/api/demo/${encodeURIComponent(code)}`, { query: v ? { k, v } : { k } })
      .then((d) => {
        setInfo(d);
        if (d.me) {
          setName(d.me.name);
          setRole(d.me.role);
          setState(d.me.state === 'available' ? 'available' : 'off');
          setLastAt(d.me.lastPunchAt);
        } else if (v) {
          store.set(storeKey, null);
          setVisitorId(null);
        }
      })
      .catch((e) => setLoadError(e.message));
  }, [code, k, storeKey]);

  async function punch(type) {
    setBusy(true);
    setError('');
    try {
      const r = await api(`/api/demo/${encodeURIComponent(code)}/punch`, {
        method: 'POST',
        query: { k },
        body: { visitorId, name, role, type },
      });
      setVisitorId(r.visitorId);
      store.set(storeKey, r.visitorId);
      setState(type === 'IN' ? 'available' : 'off');
      setLastAt(r.at || new Date());
      setFlash({ type, key: Date.now() });
      navigator.vibrate?.(35);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <Shell>
        <div className="glass p-card p-center">
          <Icon name="alert" className="p-big-icon warn" />
          <h1>Can’t open the demo</h1>
          <p>{loadError}</p>
        </div>
      </Shell>
    );
  }
  if (!info) {
    return (
      <Shell>
        <div className="p-center">
          <div className="tv-spinner" />
        </div>
      </Shell>
    );
  }

  const onDuty = state === 'available';
  const canPunch = name.trim().length >= 2 && !busy;

  return (
    <Shell>
      <header className="p-head">
        <div className="brand-mark">
          <Icon name="cross" />
        </div>
        <div>
          <div className="p-hotel">{info.property.name}</div>
          <div className="p-sub">{team ? team.label : 'ERT Live'} · demo punch</div>
        </div>
      </header>

      <section className={`glass p-card p-status ${onDuty ? 'on' : ''}`}>
        <div className="p-status-icon">
          <Icon name={onDuty ? 'check' : 'person'} strokeWidth={onDuty ? 3 : 2} />
        </div>
        <div>
          <div className="p-status-title">{onDuty ? 'You’re on duty' : 'You’re off duty'}</div>
          <div className="p-status-sub">
            {lastAt ? `${onDuty ? 'Punched in' : 'Punched out'} at ${fmtTime(lastAt)}` : 'Punch in to appear on the screen'}
          </div>
        </div>
      </section>

      {flash && (
        <div key={flash.key} className="p-flash">
          <Icon name="check" strokeWidth={3} />
          {flash.type === 'IN' ? 'Look at the screen — you’re live.' : 'Punched out — watch the screen update.'}
        </div>
      )}

      <section className="glass p-card">
        <label className="p-field">
          <span>Your name</span>
          <input
            className="p-input"
            value={name}
            maxLength={40}
            autoComplete="name"
            placeholder="e.g. Priya Sharma"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="p-field">
          <span>Your ERT role</span>
          <div className="p-roles">
            {(team ? info.roles.filter((r) => team.roles.includes(r.key)) : info.roles).map((r) => (
              <button
                key={r.key}
                type="button"
                className={`p-role ${role === r.key ? 'on' : ''}`}
                style={{ '--role': r.color }}
                onClick={() => setRole(role === r.key ? '' : r.key)}
                aria-pressed={role === r.key}
              >
                <Icon name={roleIcon(r.key, r.label)} />
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <div className="p-error">{error}</div>}

      <div className="p-actions">
        <button className="p-btn in" disabled={!canPunch || onDuty} onClick={() => punch('IN')}>
          <Icon name="enter" /> Punch in
        </button>
        <button className="p-btn out" disabled={!canPunch || !onDuty} onClick={() => punch('OUT')}>
          <Icon name="exit" /> Punch out
        </button>
      </div>

      <p className="p-foot">
        Demo only. In production, punches arrive automatically from HONO HR — staff don’t need this page.
      </p>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="tv punch">
      <div className="tv-ambient" aria-hidden>
        <div className="orb a" />
        <div className="orb b" />
      </div>
      <main className="p-wrap">{children}</main>
    </div>
  );
}
