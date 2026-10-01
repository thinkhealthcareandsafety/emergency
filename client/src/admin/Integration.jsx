import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDateTime } from '../format.js';

export default function Integration() {
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => api('/api/admin/integration').then(setInfo), []);
  useEffect(() => {
    load();
  }, [load]);

  if (!info) return <div className="d-muted">Loading…</div>;
  const { hono, webhook } = info;

  const sample = `curl -X POST ${webhook.url} \\
  -H "x-api-key: <INGEST_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"employeeCode":"E1001","punchTime":"2026-10-01T09:02:00+05:30","punchType":"IN"}'`;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>HONO HR integration</h2>
          <p className="d-muted">Three ways to get punches in — use whichever HONO enables for your account. They can run side by side.</p>
        </div>
      </div>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <div className="two-col">
        <div className="panel">
          <div className="panel-title">A · Pull from HONO API (recommended)</div>
          <div className="kv">
            <span>Status</span>
            <strong className={hono.enabled ? (hono.lastOk === false ? 'txt-bad' : 'txt-good') : 'd-muted'}>
              {!hono.enabled ? 'Not enabled' : hono.lastOk === false ? 'Failing' : hono.lastRunAt ? 'Connected' : 'Starting'}
            </strong>
            <span>Endpoint</span>
            <code>{hono.baseUrl ? `${hono.baseUrl}${hono.punchPath}` : '—'}</code>
            <span>Polling</span>
            <span>every {hono.pollSeconds}s</span>
            <span>Last sync</span>
            <span>
              {fmtDateTime(hono.lastRunAt)} {hono.lastCount != null ? `· ${hono.lastCount} records` : ''}
            </span>
            {hono.lastError && (
              <>
                <span>Last error</span>
                <span className="txt-bad">{hono.lastError}</span>
              </>
            )}
          </div>
          <p className="d-muted small">
            Configured with <code>HONO_*</code> environment variables on the server. Ask HONO for API access to the attendance/punch log
            for your tenant (base URL, API key, field names) — see README.
          </p>
          <button
            className="btn"
            disabled={!hono.enabled}
            onClick={async () => {
              try {
                const r = await api('/api/admin/integration/hono/sync', { method: 'POST' });
                setMsg(r.error ? { type: 'error', text: r.error } : { type: 'ok', text: `Synced: ${r.total ?? 0} records, ${r.applied ?? 0} applied` });
                load();
              } catch (e) {
                setMsg({ type: 'error', text: e.message });
              }
            }}
          >
            Sync now
          </button>
        </div>

        <div className="panel">
          <div className="panel-title">B · Push / webhook</div>
          <p className="d-muted small">
            If HONO (or an integration middleware, or the biometric device software) can send punches as they happen, point it here.
            Updates appear on screens within a second.
          </p>
          <div className="kv">
            <span>URL</span>
            <code>{webhook.url}</code>
            <span>Header</span>
            <code>
              {webhook.header}: {webhook.keyHint}
            </code>
          </div>
          <pre className="sample">{sample}</pre>
        </div>

        <div className="panel">
          <div className="panel-title">C · CSV upload</div>
          <p className="d-muted small">
            Fallback when no API is available: export attendance from HONO and upload under <a href="/admin/import">Import</a>. Not real-time.
          </p>
        </div>

        <div className="panel">
          <div className="panel-title">System</div>
          <div className="kv">
            <span>Timezone</span>
            <span>{info.timezone}</span>
            <span>Missing punch-out after</span>
            <span>{info.staleAfterHours} hours</span>
            <span>Display key</span>
            <code>{info.displayKeyHint}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
