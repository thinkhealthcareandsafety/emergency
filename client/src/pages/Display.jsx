import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, displayKey } from '../api.js';
import QrCode, { demoPunchUrl, isLocalOnly } from '../components/QrCode.jsx';
import { useLiveSnapshot, useNow } from '../hooks/useLiveSnapshot.js';
import { fmtDateTime, fmtTime, initials } from '../format.js';
import { Icon, emergencyIcon, roleIcon } from '../components/Icons.jsx';
import './display.css';

const PAGE_SECONDS = 10;

/**
 * Wall screen. Answers one question at a glance: which ERT members are here, and which are not.
 * Visual language follows Apple Home: available people are bright tiles, unavailable ones are dim.
 */
export default function Display() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const urlKey = params.get('key');
  const [key, setKey] = useState(() => urlKey || displayKey.get() || '');
  useEffect(() => {
    if (urlKey) displayKey.set(urlKey);
  }, [urlKey]);

  const { data, error, online, lastOk } = useLiveSnapshot(code, key);
  const now = useNow(1000);
  // The QR shows automatically whenever the server has demo punching on; ?qr=0 hides it.
  const qr = useDemoQr(code, key, params.get('qr') !== '0');
  useKioskMode();

  if (error?.status === 401) return <KeyPrompt onSubmit={(k) => (displayKey.set(k), setKey(k))} />;
  if (error?.status === 404)
    return <CenterMessage icon="alert" title="Unknown property" body={`No property is set up with the code “${code}”.`} />;
  if (!data) return <CenterMessage spinner title="Connecting" body="Fetching live team status…" />;

  const { property, coverage, members, stats, recent, emergency, roles } = data;
  const setupNeeded = stats.ertTotal === 0;
  const short = coverage.filter((c) => !c.ok).length;
  const hasAssembly = Boolean(property.assemblyPoint || property.emergencyContacts?.length);
  const roleMap = new Map(roles.map((r) => [r.key, r]));
  const available = members.filter((m) => m.state === 'available');
  const away = members.filter((m) => m.state !== 'available'); // server order: punch-out missing first
  const qrUrl = qr ? demoPunchUrl(qr, code) : null;

  return (
    <div className={`tv ert-board ${emergency ? 'is-emergency' : ''}`}>
      <div className="wallpaper" aria-hidden />

      <div className="home-frame">
        <Header
          property={property}
          summary={
            setupNeeded
              ? 'Waiting for the first punch'
              : `${available.length} of ${stats.ertTotal} available · ${short ? `${short} ${short > 1 ? 'roles need' : 'role needs'} people` : 'all roles covered'}`
          }
          now={now}
          online={online}
          lastOk={lastOk}
        />

        {!online && (
          <div className="offline" role="status">
            <Icon name="alert" />
            Connection lost. Showing data from {lastOk ? fmtTime(lastOk) : 'earlier'}. Reconnecting automatically.
          </div>
        )}

        {emergency && <EmergencyBar emergency={emergency} now={now} />}

        {!setupNeeded && <RoleCapsules coverage={coverage} short={short} />}

        <main className="home-main">
          <div className="home-left">
            {setupNeeded ? (
              <SetupCard qrUrl={qrUrl} />
            ) : (
              <>
                <section className="sec">
                  <h2 className="sec-h">
                    Available <span>{available.length}</span>
                  </h2>
                  <PagedList
                    items={available}
                    empty={<p className="sec-empty warn">No ERT member is on site right now.</p>}
                    render={(m) => <PersonTile key={m.empCode} m={m} roleMap={roleMap} on emergency={Boolean(emergency)} />}
                  />
                </section>

                <section className="sec">
                  <h2 className="sec-h">
                    Not available <span>{away.length}</span>
                  </h2>
                  <PagedList
                    items={away}
                    empty={<p className="sec-empty">Everyone is on site.</p>}
                    render={(m) => <PersonTile key={m.empCode} m={m} roleMap={roleMap} />}
                  />
                </section>
              </>
            )}
          </div>

          <aside className="home-side">
            {qrUrl && !setupNeeded && <QrCard url={qrUrl} />}
            <PunchLog recent={recent} />
            {hasAssembly && <AssemblyCard property={property} />}
          </aside>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Header & roles */

function Header({ property, summary, now, online, lastOk }) {
  return (
    <header className="home-head">
      <div className="home-title">
        <h1>{property.name}</h1>
        <p>
          <span className="eyebrow-red">Emergency Response Team</span>
          <span className="sep">·</span>
          {summary}
        </p>
      </div>
      <div className="home-clock">
        <div className="clock-time">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
        <div className="clock-date">
          {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
          <span className={`live ${online ? '' : 'off'}`}>
            <span className="live-dot" />
            {online ? 'Live' : `Offline · ${lastOk ? fmtTime(lastOk) : '—'}`}
          </span>
        </div>
      </div>
    </header>
  );
}

function RoleCapsules({ coverage, short }) {
  return (
    <nav className="caps" aria-label="Role coverage">
      <span className={`cap cap-sum ${short ? 'warn' : 'ok'}`}>
        <Icon name={short ? 'alert' : 'check'} strokeWidth={2.4} />
        {short ? `${short} ${short > 1 ? 'roles' : 'role'} short` : 'All roles covered'}
      </span>
      {coverage.map((c) => (
        <span key={c.key} className={`cap ${c.ok ? '' : 'is-short'}`} style={{ '--role': c.color }}>
          <span className="cap-ic">
            <Icon name={roleIcon(c.key, c.label)} />
          </span>
          <span className="cap-label">{c.label}</span>
          <span className="cap-val">
            {c.available} of {c.required}
          </span>
        </span>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ People */

/** Fits as many tiles as the section allows and rotates pages when there are more. */
function PagedList({ items, render, empty }) {
  const ref = useRef(null);
  const [perPage, setPerPage] = useState(60);
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      const cols = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
      const h = parseFloat(style.gridAutoRows) || 80;
      const gap = parseFloat(style.rowGap) || 0;
      setPerPage(cols * Math.max(1, Math.floor((el.clientHeight + gap) / (h + gap))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length > 0]);

  const pages = Math.max(1, Math.ceil(items.length / perPage));
  useEffect(() => {
    if (page >= pages) setPage(0);
    if (pages <= 1) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), PAGE_SECONDS * 1000);
    return () => clearInterval(t);
  }, [pages, page]);

  if (!items.length) return empty;
  return (
    <div className="paged">
      <div ref={ref} className="tiles">
        {items.slice(page * perPage, page * perPage + perPage).map(render)}
      </div>
      {pages > 1 && (
        <div className="pager">
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} className={i === page ? 'on' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}

function awayReason(m) {
  if (m.state === 'stale') return { text: 'Punch-out missing', tone: 'warn' };
  if (m.state === 'unavailable') return { text: m.reason, tone: 'bad' };
  if (m.lastPunchType === 'OUT' && m.lastPunchAt) return { text: `Left ${fmtDateTime(m.lastPunchAt)}`, tone: '' };
  return { text: 'Not punched in', tone: '' };
}

function PersonTile({ m, roleMap, on = false, emergency = false }) {
  const reason = on ? null : awayReason(m);
  const status = on ? (m.manual ? m.reason : `Since ${fmtTime(m.lastPunchAt)}`) : reason.text;
  return (
    <article className={`tile ${on ? 'on' : 'off'}`}>
      <span className="t-av">
        {initials(m.name)}
        {on && <span className="t-dot" />}
      </span>
      <span className="t-body">
        <span className="t-name">{m.name}</span>
        <span className="t-roles">
          {m.ertRoles.map((k) => (
            <span key={k} className="t-role" style={{ '--role': roleMap.get(k)?.color || '#8e8e93' }}>
              {roleMap.get(k)?.label || k}
            </span>
          ))}
        </span>
        <span className="t-meta">
          <span className={`t-status ${reason?.tone || ''}`}>{status}</span>
          {m.phone && <span className="t-phone">{m.phone}</span>}
        </span>
      </span>
      {emergency && <span className={`t-safe ${m.accounted ? 'yes' : 'no'}`}>{m.accounted ? 'Safe' : 'Not seen'}</span>}
    </article>
  );
}

/* ------------------------------------------------------------------ Side */

function PunchLog({ recent }) {
  return (
    <section className="glassy log">
      <h2 className="side-h">Activity</h2>
      <ul>
        {recent.map((r) => (
          <li key={r.id} className="log-row">
            <span className={`log-ic ${r.type === 'IN' ? 'in' : 'out'}`}>
              <Icon name={r.type === 'IN' ? 'enter' : 'exit'} />
            </span>
            <span className="log-text">
              <span className="log-name">{r.name}</span>
              <span className="log-what">{r.type === 'IN' ? 'Punched in' : 'Punched out'}</span>
            </span>
            <span className="log-time">{fmtDateTime(r.at)}</span>
          </li>
        ))}
        {!recent.length && <li className="log-empty">No punches yet</li>}
      </ul>
    </section>
  );
}

function AssemblyCard({ property }) {
  return (
    <section className="glassy">
      <h2 className="side-h">{property.assemblyPoint ? 'Assembly point' : 'Emergency numbers'}</h2>
      {property.assemblyPoint && <div className="assembly-text">{property.assemblyPoint}</div>}
      {property.emergencyContacts?.length > 0 && (
        <div className="contacts">
          {property.emergencyContacts.map((c) => (
            <div key={c.label} className="contact">
              <span>{c.label}</span>
              <b>{c.number}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Live-demo card: people in the room scan it and punch in from their phones. */
function QrCard({ url }) {
  return (
    <section className="qr-card">
      <QrCode value={url} className="qr-tile" />
      <div className="qr-text">
        <h2>Scan to punch in</h2>
        <p>Your punch shows on this screen in about a second.</p>
        {isLocalOnly(url) && <p className="qr-warn">Points to localhost, so phones can’t open it.</p>}
      </div>
    </section>
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

/* ------------------------------------------------------------------ Emergency */

function fmtElapsed(from, now) {
  const s = Math.max(0, Math.floor((now - new Date(from)) / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

function EmergencyBar({ emergency, now }) {
  return (
    <section className="em-bar" role="alert">
      <span className="em-bar-icon">
        <Icon name={emergencyIcon(emergency.type)} />
      </span>
      <div className="em-bar-main">
        <strong>{emergency.type} — emergency in progress</strong>
        <span>
          {emergency.note ? `${emergency.note} · ` : ''}Started {fmtTime(emergency.startedAt)} ·{' '}
          <span className="tabular">{fmtElapsed(emergency.startedAt, now)}</span> elapsed
        </span>
      </div>
      <div className="em-bar-count">
        <b>
          {emergency.accountedCount}/{emergency.toAccount}
        </b>
        <span>accounted for</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ States */

function SetupCard({ qrUrl }) {
  return (
    <section className="glassy setup">
      {qrUrl ? (
        <>
          <QrCode value={qrUrl} className="setup-qr" />
          <h2>Scan to punch in</h2>
          <p>Open your phone camera, scan the code, enter your name and pick your ERT role. You’ll appear here in about a second.</p>
          {isLocalOnly(qrUrl) && <p className="qr-warn">This code points to localhost, so phones can’t open it.</p>}
        </>
      ) : (
        <>
          <Icon name="users" className="setup-icon" />
          <h2>No ERT members yet</h2>
          <p>Add your team in Admin → Team, or import the ERT list. This screen updates as soon as they punch in.</p>
        </>
      )}
    </section>
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

/** Keeps a wall screen awake, hides the cursor when idle, and toggles fullscreen on double-click. */
function useKioskMode() {
  useEffect(() => {
    let lock = null;
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        /* not supported or denied — the screen's own power settings still apply */
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
