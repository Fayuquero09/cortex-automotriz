// Default backend points to FastAPI dev port 8000; can be overridden via NEXT_PUBLIC_BACKEND_URL
const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

function buildUrl(path: string, params?: Record<string, any>) {
  const url = new URL(path, BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function apiGet<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  const url = buildUrl(path, params);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const endpoints = {
  config: () => apiGet('/config'),
  health: () => apiGet('/health'),
  dashboard: (params?: Record<string, any>) => apiGet('/dashboard', params),
  seasonality: (params?: { segment?: string; year?: number }) => apiGet('/seasonality', params),
  options: (params?: Record<string, any>) => apiGet('/options', params),
  catalog: (params?: Record<string, any>) => apiGet('/catalog', params),
  compare: (body: Record<string, any>) => fetch(buildUrl('/compare'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r=>r.json()),
  autoCompetitors: (body: Record<string, any>) => fetch(buildUrl('/auto_competitors'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r=>r.json()),
  insights: (body: Record<string, any>) => fetch(buildUrl('/insights'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r=>r.json()),
  versionDiffs: (params?: Record<string, any>) => apiGet('/version_diffs', params),
};
