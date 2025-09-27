// Default backend points to FastAPI dev port 8000; can be overridden via NEXT_PUBLIC_BACKEND_URL
const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
const SUPERADMIN_TOKEN = process.env.NEXT_PUBLIC_SUPERADMIN_TOKEN || '';

function injectDealerContext<T extends Record<string, any>>(body: T): T {
  if (typeof window === 'undefined') return body;
  try {
    const dealerId = window.localStorage.getItem('CORTEX_DEALER_ID');
    if (!dealerId) return body;
    const next: Record<string, any> = { ...body };
    const context = { ...(next.context || {}) };
    context.dealer_id = dealerId;
    next.context = context;
    if (!next.dealer_id) next.dealer_id = dealerId;
    return next as T;
  } catch {
    return body;
  }
}

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
  const res = await fetch(url, withAuth({ cache: 'no-store' }));
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

function withAuth(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers || {});
  if (SUPERADMIN_TOKEN) headers.set('x-superadmin-token', SUPERADMIN_TOKEN);
  if (typeof window !== 'undefined') {
    try {
      const dealerId = window.localStorage.getItem('CORTEX_DEALER_ID');
      if (dealerId) headers.set('x-dealer-id', dealerId);
    } catch {}
    try {
      const adminUserId = window.localStorage.getItem('CORTEX_SUPERADMIN_USER_ID');
      if (adminUserId) headers.set('x-admin-user-id', adminUserId);
    } catch {}
  }
  return { ...init, headers };
}

export const endpoints = {
  config: () => apiGet('/config'),
  health: () => apiGet('/health'),
  dashboard: (params?: Record<string, any>) => apiGet('/dashboard', params),
  seasonality: (params?: { segment?: string; year?: number }) => apiGet('/seasonality', params),
  options: (params?: Record<string, any>) => apiGet('/options', params),
  catalog: (params?: Record<string, any>) => apiGet('/catalog', params),
  compare: (body: Record<string, any>) => {
    const payload = injectDealerContext(body || {});
    return fetch(buildUrl('/compare'), withAuth({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).then(r=>r.json());
  },
  autoCompetitors: (body: Record<string, any>) => {
    const payload = injectDealerContext(body || {});
    return fetch(buildUrl('/auto_competitors'), withAuth({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).then(r=>r.json());
  },
  insights: (body: Record<string, any>) => {
    const payload = injectDealerContext(body || {});
    return fetch(buildUrl('/insights'), withAuth({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).then(r=>r.json());
  },
  versionDiffs: (params?: Record<string, any>) => apiGet('/version_diffs', params),
  adminOverview: () => apiGet('/admin/overview'),
  adminOrganization: (orgId: string) => apiGet(`/admin/organizations/${orgId}`),
  adminUpdateOrganization: (orgId: string, body: Record<string, any>) =>
    fetch(buildUrl(`/admin/organizations/${orgId}`), withAuth({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return res.json();
    }),
  adminUpdateDealerStatus: (dealerId: string, body: Record<string, any>) =>
    fetch(buildUrl(`/admin/dealers/${dealerId}/status`), withAuth({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return res.json();
    }),
  adminCreateDealer: (orgId: string, body: Record<string, any>) =>
    fetch(buildUrl(`/admin/organizations/${orgId}/dealers`), withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return res.json();
    }),
  adminCreateBrand: (orgId: string, body: Record<string, any>) =>
    fetch(buildUrl(`/admin/organizations/${orgId}/brands`), withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return res.json();
    }),
  adminBrands: () => apiGet('/admin/brands'),
  adminUpdateBrand: (brandId: string, body: Record<string, any>) =>
    fetch(buildUrl(`/admin/brands/${brandId}`), withAuth({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return res.json();
    }),
  adminCreateOrganization: (body: Record<string, any>) =>
    fetch(buildUrl('/admin/organizations'), withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return res.json();
    }),
  adminDealerBillingEvents: (dealerId: string, params?: Record<string, any>) =>
    apiGet(`/admin/dealers/${dealerId}/billing-events`, params),
  adminCreateDealerBillingEvent: (dealerId: string, body: Record<string, any>) =>
    fetch(buildUrl(`/admin/dealers/${dealerId}/billing-events`), withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return res.json();
    }),
  adminUpdateDealer: (dealerId: string, body: Record<string, any>) =>
    fetch(buildUrl(`/admin/dealers/${dealerId}`), withAuth({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return res.json();
    }),
  adminUpdateUserFeatures: (userId: string, body: Record<string, any>) =>
    fetch(buildUrl(`/admin/users/${userId}/features`), withAuth({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return res.json();
    }),
  adminUpdateOrganizationStatus: (orgId: string, body: Record<string, any>) =>
    fetch(buildUrl(`/admin/organizations/${orgId}/status`), withAuth({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return res.json();
    }),
  adminDeleteOrganization: (orgId: string) =>
    fetch(buildUrl(`/admin/organizations/${orgId}`), withAuth({ method: 'DELETE' })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return true;
    }),
  dealerStatus: (dealerId: string) => apiGet(`/dealers/${dealerId}/status`),
};
