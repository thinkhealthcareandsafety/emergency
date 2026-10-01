import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api.js';

const REFRESH_MS = 30_000; // safety net + lets "stale" states roll over without a punch

/**
 * Live snapshot for one property. Socket.IO only signals "something changed"; data is always
 * re-fetched over HTTP, so a missed socket message can never leave the screen wrong for long.
 * On network loss the last good data stays on screen, clearly marked as offline.
 */
export function useLiveSnapshot(code, key) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [online, setOnline] = useState(true);
  const [lastOk, setLastOk] = useState(null);
  const inflight = useRef(false);
  const again = useRef(false);

  const load = useCallback(async () => {
    if (!code) return;
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    try {
      const snap = await api(`/api/display/${encodeURIComponent(code)}`, { query: key ? { key } : undefined });
      setData(snap);
      setError(null);
      setLastOk(new Date());
      setOnline(true);
    } catch (e) {
      setError(e);
      if (!e.status) setOnline(false);
    } finally {
      inflight.current = false;
      if (again.current) {
        again.current = false;
        load();
      }
    }
  }, [code, key]);

  useEffect(() => {
    if (!code) return;
    load();
    const socket = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 10_000 });
    socket.on('connect', () => {
      socket.emit('join', { propertyCode: code });
      setOnline(true);
      load();
    });
    socket.on('disconnect', () => setOnline(false));
    socket.on('changed', load);
    const t = setInterval(load, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      socket.disconnect();
    };
  }, [code, load]);

  return { data, error, online, lastOk, reload: load };
}

/** Eases a number towards its new value so counters glide instead of jumping. */
export function useTween(value, ms = 900) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      current.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - start) / ms);
      const v = from + (value - from) * (1 - Math.pow(1 - p, 3));
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return Math.round(shown);
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
