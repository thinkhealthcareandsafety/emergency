import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, displayKey } from '../api.js';
import QrCode, { demoPunchUrl, isLocalOnly } from '../components/QrCode.jsx';
import { useLiveSnapshot, useNow } from '../hooks/useLiveSnapshot.js';
import { fmtTime } from '../format.js';
import { Icon } from '../components/Icons.jsx';
import { TEAMS, TEAM_KEYS } from '../teams.js';
import './display.css';

const ROTATE_MS = 12_000;
const RESUME_MS = 60_000;
const STATUS = { available: 'Available', stale: 'Punch-out missing' };

/** Wall screen: one tab per team, a table of its members, and a QR per team to punch in. */
export default function Display() {
  const { code = 'MAIN' } = useParams();
  const [params] = useSearchParams();
  const urlKey = params.get('key');
  const [key, setKey] = useState(() => urlKey || displayKey.get() || '');
  useEffect(() => {
    if (urlKey) displayKey.set(urlKey);
  }, [urlKey]);

  const { data, error, online, lastOk } = useLiveSnapshot(code, key);
  const now = useNow(1000);
  const qr = useDemoQr(code, key, params.get('qr') !== '0');
  const [index, setIndex] = useState(() => Math.max(0, TEAM_KEYS.indexOf(params.get('team'))));
  const [paused, setPaused] = useState(false);
  useKioskMode();

  // Tabs rotate for the wall. A tap pauses rotation for a minute, then it resumes.
  useEffect(() => {
    if (paused) {
      const t = setTimeout(() => setPaused(false), RESUME_MS);
      return () => clearTimeout(t);
    }
    const t = setInterval(() => setIndex((i) => (i + 1) % TEAM_KEYS.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused]);

  if (error?.status === 401) return <KeyPrompt onSubmit={(k) => (displayKey.set(k), setKey(k))} />;
  if (error?.status === 404)
    return <CenterMessage icon="alert" title="Unknown property" body={`No property is set up with the code “${code}”.`} />;
  if (!data) return <CenterMessage spinner title="Connecting" body="Fetching live team status…" />;

  const { property, members, roles, emergency } = data;
  const roleLabel = Object.fromEntries(roles.map((r) => [r.key, r.label]));
  const membersOf = (k) => members.filter((m) => m.ertRoles.some((r) => TEAMS[k].roles.includes(r)));
  const current = TEAM_KEYS[index];
  const team = TEAMS[current];
  const rows = membersOf(current).sort(
    (a, b) => (a.state === 'available' ? 0 : 1) - (b.state === 'available' ? 0 : 1) || a.name.localeCompare(b.name)
  );
  const onSite = rows.filter((m) => m.state === 'available').length;
  const qrUrl = qr ? `${demoPunchUrl(qr, code)}&team=${current}` : null;

  return (
    <div className="tv board" style={{ '--team': team.color }}>
      <header className="hd">
        <div>
          <p className="kicker">{property.name} · Emergency Response Teams</p>
          <h1>Team availability</h1>
        </div>
        <div className="clock">{fmtTime(now)}</div>
      </header>

      {!online && (
        <div className="offline">
          <Icon name="alert" /> Connection lost. Showing data from {lastOk ? fmtTime(lastOk) : 'earlier'}.
        </div>
      )}
      {emergency && (
        <div className="alarm">
          <span>{emergency.type} emergency in progress</span>
          <span>
            {emergency.accountedCount} of {emergency.toAccount} accounted for
          </span>
        </div>
      )}

      <nav className="tabs" role="tablist" aria-label="Teams">
        {TEAM_KEYS.map((k, i) => (
          <button
            key={k}
            role="tab"
            aria-selected={i === index}
            className={i === index ? 'on' : ''}
            onClick={() => {
              setIndex(i);
              setPaused(true);
            }}
          >
            <i className="tdot" style={{ background: TEAMS[k].color }} />
            {TEAMS[k].label}
            <span>
              {membersOf(k).filter((m) => m.state === 'available').length}/{membersOf(k).length}
            </span>
          </button>
        ))}
      </nav>

      <main className="grid">
        <section className="card table-card" aria-live="polite">
          <div className="card-head">
            <h2>
              <i className="tdot big" style={{ background: team.color }} />
              {team.label}
            </h2>
            <span className="sub">
              {onSite} of {rows.length} on site
            </span>
          </div>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Mobile number</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.empCode} className={m.state === 'available' ? '' : 'off'}>
                    <td data-label="Name">
                      <span className="who">
                        <i className={`dot ${m.state}`} />
                        <span className="who-text">
                          <span className="who-name">{m.name}</span>
                          <span className={`who-status ${m.state}`}>{STATUS[m.state] || 'Not available'}</span>
                        </span>
                      </span>
                    </td>
                    <td className="muted" data-label="Department">{m.department || '—'}</td>
                    <td className="mono" data-label="Mobile number">{m.phone || '—'}</td>
                    <td data-label="Role">{m.ertRoles.filter((r) => team.roles.includes(r)).map((r) => roleLabel[r] || r).join(', ')}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={4} className="empty">
                      No one is assigned to this team yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="legend">
            <span>
              <i className="dot available" /> On site
            </span>
            <span>
              <i className="dot stale" /> Punch-out missing
            </span>
            <span>
              <i className="dot" /> Not available
            </span>
          </div>
        </section>

        <aside className="card qr-card">
          {qrUrl ? (
            <>
              <QrCode value={qrUrl} className="qr" />
              <h3>Scan to punch in</h3>
              <p>{team.label}</p>
              {isLocalOnly(qrUrl) && <p className="warn">Points to localhost, so phones can’t open it.</p>}
            </>
          ) : (
            <p>QR punching is off on this server.</p>
          )}
        </aside>
      </main>

    </div>
  );
}

function CenterMessage({ title, body, spinner, icon }) {
  return (
    <div className="tv tv-center">
      <div className="center-card">
        {spinner ? <div className="tv-spinner" /> : <Icon name={icon || 'alert'} className="center-icon" />}
        <h1>{title}</h1>
        <p>{body}</p>
        {!spinner && <Link to="/">Back to start</Link>}
      </div>
    </div>
  );
}

function KeyPrompt({ onSubmit }) {
  const [v, setV] = useState('');
  return (
    <div className="tv tv-center">
      <form
        className="center-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) onSubmit(v.trim());
        }}
      >
        <div className="brand-mark">
          <Icon name="cross" />
        </div>
        <h1>Connect this screen</h1>
        <p>Enter the display key. It’s remembered on this device.</p>
        <input className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Display key" />
        <button className="btn primary block">Continue</button>
      </form>
    </div>
  );
}

function useDemoQr(code, key, enabled) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!enabled || !code) return;
    api(`/api/display/${encodeURIComponent(code)}/qr`, { query: key ? { key } : undefined })
      .then((d) => setInfo(d.enabled ? d : null))
      .catch(() => setInfo(null));
  }, [code, key, enabled]);
  return enabled ? info : null;
}

/** Keeps the wall screen awake, hides the cursor when idle, and toggles fullscreen on double-click. */
function useKioskMode() {
  useEffect(() => {
    let lock = null;
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        /* not supported or denied: the screen's own power settings still apply */
      }
    };
    acquire();
    const onVis = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVis);

    let idle;
    const wake = () => {
      document.body.classList.remove('hide-cursor');
      clearTimeout(idle);
      idle = setTimeout(() => document.body.classList.add('hide-cursor'), 4000);
    };
    const fs = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    };
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('dblclick', fs);
    return () => {
      lock?.release?.().catch(() => {});
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('dblclick', fs);
      clearTimeout(idle);
      document.body.classList.remove('hide-cursor');
    };
  }, []);
}
