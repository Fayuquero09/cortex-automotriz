const USE_SSCMEX_PROXY = process.env.NEXT_PUBLIC_USE_SSCMEX_PROXY === '1';
const SSCMEX_REMOTE_BASE = (process.env.NEXT_PUBLIC_SSCMEX_REMOTE_BASE || 'https://sslphotos.jato.com/PHOTO400').replace(/\/$/, '');

const SSCMEX_FALLBACKS: Array<{ missing: string; fallback: string }> = [
  {
    missing: 'SSCMEX/FORD/TERRITORY/2026/5OD.JPG',
    fallback: 'SSCMEX/FORD/TERRITORY/2025/5OD.JPG',
  },
];

function applyFallback(value: string): string {
  for (const entry of SSCMEX_FALLBACKS) {
    if (value.toUpperCase().includes(entry.missing.toUpperCase())) {
      return value.replace(entry.missing, entry.fallback);
    }
  }
  return value;
}

export function vehicleImageSrc(row: Record<string, any> | null | undefined): string | null {
  if (!row || typeof row !== 'object') return null;
  const candidates: Array<unknown> = [
    (row as any).images_default_href,
    (row as any).images_default,
    (row as any).image_url,
    (row as any).photo_path,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);
    if (normalized) {
      return applyFallback(normalized);
    }
  }

  return null;
}

function normalizeCandidate(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const withForwardSlashes = value.replace(/\\+/g, '/');

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(withForwardSlashes);
      const hostname = url.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        const idx = url.pathname.toUpperCase().indexOf('SSCMEX/');
        if (idx >= 0) {
          const suffix = url.pathname.slice(idx).replace(/^\/+/, '');
          if (USE_SSCMEX_PROXY) {
            return applyFallback(`/${suffix}`);
          }
          return applyFallback(`${SSCMEX_REMOTE_BASE}/${suffix}`);
        }
      }
    } catch {}
    if (USE_SSCMEX_PROXY) {
      const idx = withForwardSlashes.toUpperCase().indexOf('SSCMEX/');
      if (idx >= 0) {
        const suffix = withForwardSlashes.slice(idx);
        return applyFallback(`/${suffix.replace(/^\/+/, '')}`);
      }
    }
    return applyFallback(withForwardSlashes);
  }
  if (value.startsWith('//')) {
    if (USE_SSCMEX_PROXY) {
      const idx = withForwardSlashes.toUpperCase().indexOf('SSCMEX/');
      if (idx >= 0) {
        const suffix = withForwardSlashes.slice(idx);
        return applyFallback(`/${suffix.replace(/^\/+/, '')}`);
      }
    }
    const normalized = withForwardSlashes.startsWith('//')
      ? withForwardSlashes
      : `//${withForwardSlashes.replace(/^\/+/, '')}`;
    return applyFallback(`https:${normalized}`);
  }

  const idx = withForwardSlashes.toUpperCase().indexOf('SSCMEX/');
  if (idx >= 0) {
    const suffix = withForwardSlashes.slice(idx).replace(/^\/+/, '');
    if (USE_SSCMEX_PROXY) {
      return applyFallback(`/${suffix}`);
    }
    return applyFallback(`${SSCMEX_REMOTE_BASE}/${suffix}`);
  }
  if (withForwardSlashes.startsWith('/')) {
    return applyFallback(withForwardSlashes);
  }
  if (/\.[a-z0-9]{3,4}$/i.test(withForwardSlashes)) {
    return applyFallback(`/${withForwardSlashes}`);
  }
  return null;
}
