import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, store } from '../api.js';
import { fmtTime } from '../format.js';
import { Icon, roleIcon } from '../components/Icons.jsx';
import { TEAMS, TEAM_KEYS } from '../teams.js';
import './display.css';
import './punch.css';

/** Phone page opened from the QR code on the wall screen during a live demo. */
export default function Punch() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const k = params.get('k') || '';
  const storeKey = `ert_demo_visitor_${code}`;

  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [visitorId, setVisitorId] = useState(() => store.get(storeKey));
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [teamKey, setTeamKey] = useState(() => (TEAMS[params.get('team')] ? params.get('team') : ''));
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
          if (teamOf(d.me.role)) setTeamKey(teamOf(d.me.role));
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
  const named = name.trim().length >= 2;
  // Only teams whose roles exist in Admin → Roles; a punch-in needs a role or the person never shows on the board.
  const teams = TEAM_KEYS.map((key) => ({ key, ...TEAMS[key], roles: info.roles.filter((r) => TEAMS[key].roles.includes(r.key)) })).filter(
    (t) => t.roles.length
  );
  const team = teams.find((t) => t.key === teamKey);
  const missing = !named ? 'Enter your name to punch in.' : !team ? 'Pick your team to punch in.' : !role ? 'Pick your role to punch in.' : '';

  function pickTeam(t) {
    setTeamKey(t.key);
    setRole(t.roles.length === 1 ? t.roles[0].key : t.roles.some((r) => r.key === role) ? role : '');
  }

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
          <span id="p-team-label">Which team are you joining?</span>
          <div className="p-teams" role="radiogroup" aria-labelledby="p-team-label">
            {teams.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={teamKey === t.key}
                className={`p-team ${teamKey === t.key ? 'on' : ''}`}
                style={{ '--team': t.color }}
                disabled={onDuty}
                onClick={() => pickTeam(t)}
              >
                <i className="tdot" />
                <span className="p-team-text">
                  <b>{t.label}</b>
                  <small>{t.roles.map((r) => r.label).join(' · ')}</small>
                </span>
                <span className="p-radio">
                  <Icon name="check" strokeWidth={3} />
                </span>
              </button>
            ))}
          </div>
        </div>

        {team && team.roles.length > 1 && (
          <div className="p-field">
            <span id="p-role-label">Your role in {team.label}</span>
            <div className="p-roles" role="radiogroup" aria-labelledby="p-role-label">
              {team.roles.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  role="radio"
                  aria-checked={role === r.key}
                  className={`p-role ${role === r.key ? 'on' : ''}`}
                  style={{ '--role': team.color }}
                  disabled={onDuty}
                  onClick={() => setRole(r.key)}
                >
                  <Icon name={roleIcon(r.key, r.label)} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {onDuty && <p className="p-note">Punch out first to change your team or role.</p>}
      </section>

      {error && <div className="p-error">{error}</div>}

      <div className="p-actions">
        <button className="p-btn in" disabled={busy || onDuty || !!missing} onClick={() => punch('IN')}>
          <Icon name="enter" /> Punch in
        </button>
        <button className="p-btn out" disabled={busy || !onDuty || !named} onClick={() => punch('OUT')}>
          <Icon name="exit" /> Punch out
        </button>
      </div>
      {!onDuty && missing && <p className="p-hint">{missing}</p>}

      <p className="p-foot">
        Demo only. In production, punches arrive automatically from HONO HR — staff don’t need this page.
      </p>
    </Shell>
  );
}

const teamOf = (roleKey) => TEAM_KEYS.find((k) => TEAMS[k].roles.includes(roleKey));

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
