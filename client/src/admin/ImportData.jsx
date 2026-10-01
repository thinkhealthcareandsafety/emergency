import { useState } from 'react';
import { api } from '../api.js';

function Uploader({ title, help, endpoint, sample, sampleName }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      setResult(await api(endpoint, { method: 'POST', body: fd }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([sample], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: sampleName });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <p className="d-muted small">{help}</p>
      <pre className="sample">{sample}</pre>
      <div className="row">
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className="btn primary" disabled={!file || busy} onClick={upload}>
          {busy ? 'Importing…' : 'Import'}
        </button>
        <button className="btn ghost" onClick={download}>
          Download template
        </button>
      </div>
      {err && <div className="alert error">{err}</div>}
      {result && (
        <div className="alert ok">
          {Object.entries(result)
            .filter(([k]) => k !== 'errors')
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · ')}
          {result.errors?.length > 0 && (
            <ul className="errors">
              {result.errors.slice(0, 8).map((e) => (
                <li key={e.row}>
                  Row {e.row}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function ImportData() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Import</h2>
          <p className="d-muted">
            Bulk-load staff, or upload an attendance export from HONO when the live API isn’t connected yet. Column names are matched
            loosely and dates like 01-10-2026 09:05 AM are understood. Re-uploading the same file is safe.
          </p>
        </div>
      </div>
      <div className="two-col">
        <Uploader
          title="1 · Staff & ERT roles"
          help="One row per employee. Employee code must match the code in HONO. Separate multiple roles with semicolons."
          endpoint="/api/admin/employees/import"
          sampleName="ert-staff-template.csv"
          sample={`Employee Code,Name,Designation,Department,Property,ERT Roles,Mobile
E1001,Rajesh Menon,Duty Manager,Front Office,MAIN,incident_controller,+91 9800000001
E1007,Vikram Singh,Chief Engineer,Engineering,MAIN,engineering;fire_warden,+91 9800000007`}
        />
        <Uploader
          title="2 · Attendance punches (HONO export)"
          help="Export the attendance / punch log from HONO and upload it here. Each row is one punch."
          endpoint="/api/admin/punches/import"
          sampleName="ert-punches-template.csv"
          sample={`Employee Code,Punch Time,Punch Type
E1001,01-10-2026 08:58,IN
E1007,01-10-2026 09:04 AM,IN
E1001,01-10-2026 17:31,OUT`}
        />
      </div>
    </div>
  );
}
