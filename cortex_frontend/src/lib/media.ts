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
      return normalized;
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
    const idx = withForwardSlashes.toUpperCase().indexOf('SSCMEX/');
    if (idx >= 0) {
      const suffix = withForwardSlashes.slice(idx);
      return `/${suffix.replace(/^\/+/, '')}`;
    }
    return value;
  }
  if (value.startsWith('//')) {
    const idx = withForwardSlashes.toUpperCase().indexOf('SSCMEX/');
    if (idx >= 0) {
      const suffix = withForwardSlashes.slice(idx);
      return `/${suffix.replace(/^\/+/, '')}`;
    }
    return `https:${value}`;
  }

  const idx = withForwardSlashes.toUpperCase().indexOf('SSCMEX/');
  if (idx >= 0) {
    const suffix = withForwardSlashes.slice(idx);
    return `/${suffix.replace(/^\/+/, '')}`;
  }
  if (withForwardSlashes.startsWith('/')) {
    return withForwardSlashes;
  }
  if (/\.[a-z0-9]{3,4}$/i.test(withForwardSlashes)) {
    return `/${withForwardSlashes}`;
  }
  return null;
}
