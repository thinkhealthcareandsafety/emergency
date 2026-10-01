import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, displayKey } from '../api.js';

export default function Home() {
  const [props, setProps] = useState(null);
  const [code, setCode] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    const key = displayKey.get();
    api('/api/display/properties', { query: key ? { key } : undefined })
      .then(setProps)
      .catch(() => setProps([]));
  }, []);

  return (
    <div className="home">
      <div className="home-card">
        <div className="home-logo">
          <svg viewBox="0 0 24 24"><path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" /></svg>
        </div>
        <h1>ERT Live</h1>
        <p className="d-muted">Real-time Emergency Response Team availability, driven by HONO HR attendance.</p>

        {props?.length > 0 && (
          <div className="home-list">
            <div className="label">Open a live display</div>
            {props.map((p) => (
              <Link key={p.code} className="home-prop" to={`/display/${p.code}`}>
                <span>{p.name}</span>
                <code>{p.code}</code>
              </Link>
            ))}
          </div>
        )}

        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) nav(`/display/${code.trim().toUpperCase()}`);
          }}
        >
          <input className="input" placeholder="Property code, e.g. MAIN" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn">Open display</button>
        </form>

        <Link to="/admin" className="btn primary block">
          Admin console
        </Link>
      </div>
    </div>
  );
}
