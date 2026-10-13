import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, displayKey } from '../api.js';
import QrCode, { demoPunchUrl, isLocalOnly } from '../components/QrCode.jsx';
import { useLiveSnapshot, useNow } from '../hooks/useLiveSnapshot.js';
import { fmtDay, fmtTime } from '../format.js';
import { Icon, emergencyIcon, roleIcon } from '../components/Icons.jsx';
import { TEAMS, TEAM_KEYS } from '../teams.js';
import './display.css';

const ARRIVED_MS = 8_000; // how long a fresh punch-in stays highlighted
const MAX_PIPS = 8;

/**
 * Wall screen and phone dashboard: whether every team is covered, then all three teams side by side
 * (stacked on phones) with each person one tap from a call. Nothing rotates; everything is on one page.
 */
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
  const arrivals = useArrivals(data?.members);
  useKioskMode();

  if (error?.status === 401) return <KeyPrompt onSubmit={(k) => (displayKey.set(k), setKey(k))} />;
  if (error?.status === 404)
    return <CenterMessage icon="alert" title="Unknown property" body={`No property is set up with the code “${code}”.`} />;
  if (!data) return <CenterMessage spinner title="Connecting" body="Fetching live team status…" />;

  const { property, members, roles, coverage, emergency } = data;
  const roleLabel = Object.fromEntries(roles.map((r) => [r.key, r.label]));
  const teams = TEAM_KEYS.map((k) => buildTeam(k, members, coverage));
  const gaps = teams.flatMap((t) => t.gaps);
  const tone = emergency ? 'emergency' : gaps.length ? 'short' : 'ok';
  const qrUrl = qr ? demoPunchUrl(qr, code) : null;
  const isNew = (m) => arrivals[m.empCode] && now - arrivals[m.empCode] < ARRIVED_MS;
  // Wider columns for bigger teams, so the ERT list doesn't get cramped next to one-role teams.
  const avg = Math.max(1, members.length / teams.length);
  const cols = teams.map((t) => `minmax(0, ${Math.min(1.6, Math.max(1, t.people.length / avg)).toFixed(2)}fr)`).join(' ');

  return (
    <div className={`tv board tone-${tone}${online ? '' : ' is-offline'}`}>
      <header className="top">
        <div className="brand-mark" aria-hidden="true">
          <Icon name="cross" />
        </div>
        <h1>{property.name}</h1>
        <p className="live" role="status">
          <i className={online ? 'on' : ''} />
          <span>{online ? 'Live' : `Offline since ${lastOk ? fmtTime(lastOk) : 'earlier'}`}</span>
        </p>
        <time className="when" dateTime={now.toISOString()}>
          <span className="clock">{fmtTime(now)}</span>
          <span className="date">{fmtDay(now)}</span>
        </time>
      </header>

      <Verdict tone={tone} gaps={gaps} teams={teams} emergency={emergency} assemblyPoint={property.assemblyPoint} />

      <nav className="jump" aria-label="Jump to a team">
        {teams.map((t) => (
          <a key={t.key} href={`#team-${t.key}`} className={t.short ? 'short' : 'ok'} style={{ '--team': t.color }}>
            <span className="jump-name">
              <i className="tdot" />
              {t.label}
            </span>
            <span className="jump-state">
              <Icon name={t.short ? 'alert' : 'check'} strokeWidth={2.5} />
              {t.onSite.length}/{t.people.length}
            </span>
          </a>
        ))}
      </nav>

      <main className="teams" style={{ '--cols': cols }}>
        {teams.map((t) => (
          <Team key={t.key} team={t} roleLabel={roleLabel} isNew={isNew} />
        ))}
      </main>

      <footer className="facts">
        {property.assemblyPoint && (
          <div className="fact">
            <Icon name="pin" />
            <span>
              <small>Assembly point</small>
              {property.assemblyPoint}
            </span>
          </div>
        )}
        {property.emergencyContacts.map((c) => (
          <a key={`${c.label}${c.number}`} className="fact" href={telHref(c.number)}>
            <Icon name="phone" />
            <span>
              <small>{c.label}</small>
              {c.number}
            </span>
          </a>
        ))}
        {!property.assemblyPoint && !property.emergencyContacts.length && (
          <p className="fact-hint">Add the assembly point and emergency numbers in Admin → Properties.</p>
        )}
        {qrUrl && (
          <div className="qr-mini">
            <QrCode value={qrUrl} />
            <span>
              Scan to
              <br />
              punch in
              {isLocalOnly(qrUrl) && <em>Points to localhost, phones can’t open it</em>}
            </span>
          </div>
        )}
      </footer>
    </div>
  );
}

/** The one-line answer to "are we covered?", above everything else. */
function Verdict({ tone, gaps, teams, emergency, assemblyPoint }) {
  if (tone === 'emergency') {
    return (
      <section className="verdict" aria-live="assertive">
        <Icon name={emergencyIcon(emergency.type)} className="v-icon" />
        <div className="v-text">
          <h2>{emergency.type} emergency in progress</h2>
          <p>
            {assemblyPoint ? `Go to the assembly point: ${assemblyPoint}.` : 'Go to the assembly point.'}
            {emergency.note ? ` ${emergency.note}` : ''}
          </p>
        </div>
        <p className="v-tally">
          <b>{emergency.accountedCount}</b>
          <span>of {emergency.toAccount} accounted for</span>
        </p>
      </section>
    );
  }
  if (tone === 'short') {
    const teamsShort = teams.filter((t) => t.short).length;
    return (
      <section className="verdict" aria-live="polite">
        <Icon name="alert" className="v-icon" />
        <div className="v-text">
          <h2>Not ready</h2>
          <p>
            {teamsShort === 1 ? '1 team is' : `${teamsShort} teams are`} below the minimum on site.
          </p>
        </div>
        <ul className="v-gaps">
          {gaps.map((g) => (
            <li key={g.key}>
              <Icon name={roleIcon(g.key, g.label)} />
              {g.label}
              <b>
                {g.available} of {g.required}
              </b>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className="verdict" aria-live="polite">
      <Icon name="check" className="v-icon" strokeWidth={2.5} />
      <div className="v-text">
        <h2>All teams ready</h2>
        <p>Every role has its minimum on site.</p>
      </div>
    </section>
  );
}

function Team({ team, roleLabel, isNew }) {
  const { onSite, unconfirmed, away } = team;
  return (
    <section className={`team ${team.short ? 'is-short' : 'is-ok'}`} id={`team-${team.key}`} style={{ '--team': team.color }} aria-labelledby={`team-${team.key}-h`}>
      <header className="team-hd">
        <h2 id={`team-${team.key}-h`}>
          <i className="tdot" />
          {team.label}
        </h2>
        <p className="team-state">
          <Icon name={team.short ? 'alert' : 'check'} strokeWidth={2.5} />
          {team.short ? `Short ${team.short}` : 'Covered'}
        </p>
        <p className="team-count">
          <b>{onSite.length}</b> of {team.people.length} on site
        </p>
      </header>

      {team.seats.length > 0 && (
        <ul className="roles">
          {team.seats.map((r) => (
            <li key={r.key} className={r.available < r.required ? 'short' : ''} aria-label={`${r.label}: ${r.available} on site, minimum ${r.required}`}>
              <Icon name={roleIcon(r.key, r.label)} />
              <span className="role-name">{r.label}</span>
              <Pips available={r.available} required={r.required} />
              <span className="role-count">
                {r.available}
                <small>/{r.required}</small>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="people" aria-live="polite">
        {!team.people.length && <p className="nobody">No one is assigned to this team yet.</p>}
        {onSite.length + unconfirmed.length > 0 && (
          <>
            <h3>
              On site <span>{onSite.length}</span>
            </h3>
            <ul>
              {[...onSite, ...unconfirmed].map((m) => (
                <Person key={m.empCode} m={m} team={team} roleLabel={roleLabel} fresh={isNew(m)} />
              ))}
            </ul>
          </>
        )}
        {away.length > 0 && (
          <>
            <h3>
              Not on site <span>{away.length}</span>
            </h3>
            <ul>
              {away.map((m) => (
                <Person key={m.empCode} m={m} team={team} roleLabel={roleLabel} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function Person({ m, team, roleLabel, fresh }) {
  const roles = m.ertRoles.filter((r) => team.roles.includes(r)).map((r) => roleLabel[r] || r).join(', ');
  const meta = [roles, m.department].filter(Boolean).join(' · ');
  const since = m.state === 'available' && !m.manual && m.lastPunchAt ? `Since ${fmtTime(m.lastPunchAt)}` : null;
  const status =
    m.state === 'stale' ? 'Punch-out missing' : m.state === 'available' ? null : m.manual && m.reason ? m.reason : null;
  return (
    <li className={`person ${m.state}${fresh ? ' fresh' : ''}`}>
      <i className="state" aria-hidden="true" />
      <span className="who-name">{m.name}</span>
      {meta && <span className="who-meta">{meta}</span>}
      {since && <span className="who-since">{since}</span>}
      {status && <span className="who-status">{status}</span>}
      {m.phone && <span className="who-phone">{m.phone}</span>}
      {m.phone ? (
        <a className="call" href={telHref(m.phone)} aria-label={`Call ${m.name} on ${m.phone}`}>
          <Icon name="phone" />
          <span>{m.phone}</span>
        </a>
      ) : (
        <span className="call none">No number</span>
      )}
    </li>
  );
}

/** One seat per required person: filled when someone is on site, hollow when the seat is empty. */
function Pips({ available, required }) {
  const total = Math.max(available, required);
  const shown = Math.min(total, MAX_PIPS);
  return (
    <span className="pips" aria-hidden="true">
      {Array.from({ length: shown }, (_, i) => (
        <i key={i} className={i < available ? 'on' : ''} />
      ))}
      {total > MAX_PIPS && <em>+{total - MAX_PIPS}</em>}
    </span>
  );
}

function buildTeam(key, members, coverage) {
  const def = TEAMS[key];
  const people = members.filter((m) => m.ertRoles.some((r) => def.roles.includes(r)));
  const seats = def.roles.map((r) => coverage.find((c) => c.key === r)).filter(Boolean);
  const gaps = seats.filter((r) => r.available < r.required);
  const byName = (a, b) => a.name.localeCompare(b.name);
  return {
    key,
    ...def,
    people,
    seats,
    gaps,
    short: gaps.reduce((n, g) => n + g.required - g.available, 0),
    onSite: people.filter((m) => m.state === 'available').sort(byName),
    unconfirmed: people.filter((m) => m.state === 'stale').sort(byName),
    away: people.filter((m) => m.state !== 'available' && m.state !== 'stale').sort(byName),
  };
}

const telHref = (n) => `tel:${String(n).replace(/[^\d+]/g, '')}`;

/** Remembers when each person flipped to on site, so the screen can mark fresh arrivals for a few seconds. */
function useArrivals(members) {
  const prev = useRef(null);
  const [arrivals, setArrivals] = useState({});
  useEffect(() => {
    if (!members) return;
    const inNow = new Set(members.filter((m) => m.state === 'available').map((m) => m.empCode));
    const fresh = prev.current ? [...inNow].filter((c) => !prev.current.has(c)) : [];
    prev.current = inNow;
    if (fresh.length) {
      const at = new Date();
      setArrivals((a) => ({ ...a, ...Object.fromEntries(fresh.map((c) => [c, at])) }));
    }
  }, [members]);
  return arrivals;
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
