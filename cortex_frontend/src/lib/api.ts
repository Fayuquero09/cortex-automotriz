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
    try {
      const membershipSession = window.localStorage.getItem('CORTEX_MEMBERSHIP_SESSION');
      if (membershipSession) headers.set('x-membership-session', membershipSession);
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
  compare: async (body: Record<string, any>) => {
    const payload = injectDealerContext(body || {});
    const res = await fetch(buildUrl('/compare'), withAuth({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
    let data: any = null;
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }
    if (!res.ok) {
      const message = data?.message || data?.detail || data?.error || `Error ${res.status}`;
      const error = new Error(String(message));
      (error as any).status = res.status;
      (error as any).data = data;
      throw error;
    }
    return data;
  },
  autoCompetitors: async (body: Record<string, any>) => {
    const payload = injectDealerContext(body || {});
    const res = await fetch(buildUrl('/auto_competitors'), withAuth({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
    let data: any = null;
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }
    if (!res.ok) {
      const message = data?.message || data?.detail || data?.error || `Error ${res.status}`;
      const error = new Error(String(message));
      (error as any).status = res.status;
      (error as any).data = data;
      throw error;
    }
    return data;
  },
  insights: async (body: Record<string, any>) => {
    const payload = injectDealerContext(body || {});
    const res = await fetch(buildUrl('/insights'), withAuth({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
    let data: any = null;
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }
    if (!res.ok) {
      const message = data?.message || data?.detail || data?.error || `Error ${res.status}`;
      const error = new Error(String(message));
      (error as any).status = res.status;
      (error as any).data = data;
      throw error;
    }
    return data;
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
  adminCreateOrgUser: (orgId: string, body: Record<string, any>) =>
    fetch(buildUrl(`/admin/organizations/${orgId}/users`), withAuth({
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
  adminUpdateUser: (userId: string, body: Record<string, any>) =>
    fetch(buildUrl(`/admin/users/${userId}`), withAuth({
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
  dealerTemplates: () => apiGet('/dealer/templates'),
  dealerSaveTemplate: (body: Record<string, any>) =>
    fetch(buildUrl('/dealer/templates'), withAuth({
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
  dealerDeleteTemplate: (templateId: string) =>
    fetch(buildUrl(`/dealer/templates/${templateId}`), withAuth({ method: 'DELETE' })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return true;
    }),
  dealerStatus: (dealerId: string) => apiGet(`/dealers/${dealerId}/status`),
  membershipSendCode: (phone: string) =>
    fetch(buildUrl('/membership/send_code'), withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return res.json();
    }),
  membershipVerifyCode: (payload: { phone: string; code: string }) =>
    fetch(buildUrl('/membership/verify_code'), withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })).then(async (res) => {
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      return res.json();
    }),
  membershipBrands: (session: string) => apiGet('/membership/brands', { session }),
  membershipSaveProfile: (body: { session: string; brand: string; pdf_display_name: string; pdf_footer_note?: string | null }) =>
    fetch(buildUrl('/membership/profile'), withAuth({
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
  membershipCheckout: async () => {
    if (typeof window === 'undefined') throw new Error('Disponible solo en el navegador');
    const session = window.localStorage.getItem('CORTEX_MEMBERSHIP_SESSION');
    if (!session) throw new Error('No hay una sesión de membresía activa.');
    const res = await fetch(buildUrl('/membership/checkout'), withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session }),
    }));
    let data: any = null;
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }
    if (!res.ok) {
      const message = data?.message || data?.detail || data?.error || `Error ${res.status}`;
      const error = new Error(String(message));
      (error as any).status = res.status;
      (error as any).data = data;
      throw error;
    }
    return data;
  },
  membershipConfirmCheckout: async (payload: { session: string; checkout_session_id: string }) => {
    const res = await fetch(buildUrl('/membership/checkout/confirm'), withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }));
    let data: any = null;
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }
    if (!res.ok) {
      const message = data?.message || data?.detail || data?.error || `Error ${res.status}`;
      const error = new Error(String(message));
      (error as any).status = res.status;
      (error as any).data = data;
      throw error;
    }
    return data;
  },
};
