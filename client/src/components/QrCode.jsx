import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Builds the phone URL a QR code points to. Falls back to this page's origin when no PUBLIC_URL is set. */
export function demoPunchUrl({ publicUrl, punchKey }, code) {
  const base = publicUrl || window.location.origin;
  return `${base}/punch/${encodeURIComponent(code)}?k=${encodeURIComponent(punchKey)}`;
}

/** Phones can't open localhost — callers warn when the QR would be useless. */
export function isLocalOnly(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return true;
  }
}

export default function QrCode({ value, className = '' }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(''));
    return () => {
      alive = false;
    };
  }, [value]);
  // The SVG is generated locally by the qrcode library from our own URL.
  return <div className={`qr ${className}`} role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} />;
}
