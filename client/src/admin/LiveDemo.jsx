import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import QrCode, { demoPunchUrl, isLocalOnly } from '../components/QrCode.jsx';

export default function LiveDemo({ property, properties }) {
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState(null);
  const propName = properties.find((p) => p.code === property)?.name || property;

  const load = useCallback(
    () =>
      api('/api/admin/demo')
        .then(setInfo)
        .catch((e) => setMsg({ type: 'error', text: e.message })),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  if (!info) return <div className="d-muted">Loading…</div>;

  if (!info.enabled) {
    return (
      <div>
        <div className="page-head">
          <div>
            <h2>Live demo</h2>
            <p className="d-muted">QR punching is turned off on this server.</p>
          </div>
        </div>
        <div className="panel">
          Set <code>DEMO_PUNCH=true</code> and a strong <code>DEMO_PUNCH_KEY</code> in the server environment, then restart.
          Keep it off once real HONO data is connected.
        </div>
      </div>
    );
  }

  const url = demoPunchUrl(info, property);
  const local = isLocalOnly(url);
  const displayUrl = `/display/${property}?qr=1`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMsg({ type: 'ok', text: 'Link copied' });
    } catch {
      setMsg({ type: 'error', text: 'Copy failed. Select the link and copy it manually.' });
    }
  }

  async function reset() {
    if (!confirm('Remove all demo visitors and their punches from every property?')) return;
    try {
      const r = await api('/api/admin/demo/visitors', { method: 'DELETE' });
      setMsg({ type: 'ok', text: `Removed ${r.removed} demo visitor${r.removed === 1 ? '' : 's'}` });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Live demo</h2>
          <p className="d-muted">
            People in the meeting scan the QR code, type their name and punch in from their phone. The wall screen at {propName}{' '}
            updates in about a second, using the same punch pipeline that HONO data goes through.
          </p>
        </div>
      </div>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      {local && (
        <div className="alert warn">
          This link points to <code>localhost</code>, so phones can’t open it. Start the demo with <code>npm run demo:public</code> to get a public
          https address, or use your laptop’s Wi-Fi IP address if the phones are on the same network.
        </div>
      )}

      <div className="two-col">
        <div className="panel demo-qr-panel">
          <div className="demo-qr">
            <QrCode value={url} />
          </div>
          <code className="demo-url">{url}</code>
          <div className="row">
            <button className="btn" onClick={copy}>
              Copy link
            </button>
            <a className="btn ghost" href={url} target="_blank" rel="noreferrer">
              Open on this device ↗
            </a>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Running the demo</div>
          <ol className="steps">
            <li>
              Open the wall screen with the QR card:{' '}
              <a href={displayUrl} target="_blank" rel="noreferrer">
                {displayUrl}
              </a>
            </li>
            <li>Ask everyone in the room to scan, enter their name, pick an ERT role and tap Punch in.</li>
            <li>Watch the roster, the role rings and the activity feed update live. Try Punch out, then start a Fire emergency from the Emergency tab.</li>
            <li>Close with: “In production these punches come straight from HONO. We only need your HONO admin to switch on the connection.”</li>
          </ol>
          <hr />
          <div className="row">
            <span className="d-muted small">
              {info.visitors} demo visitor{info.visitors === 1 ? '' : 's'} recorded
            </span>
            <button className="btn danger ghost" onClick={reset} disabled={!info.visitors}>
              Remove demo visitors
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
