"use client";

import React from 'react';
import useSWR from 'swr';
import { endpoints } from '@/lib/api';

interface OrganizationSummary {
  id: string;
  name: string;
  package: string;
  status?: string | null;
  metadata?: Record<string, any> | null;
  brand_count: number;
  dealer_count: number;
  user_count: number;
  created_at: string;
}

interface AdminOverviewResponse {
  organizations: OrganizationSummary[];
}

interface OrganizationDetail {
  organization: {
    id: string;
    name: string;
    display_name?: string | null;
    package: string;
    status?: string | null;
    metadata?: Record<string, any> | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  brands: Array<{ id: string; name: string; slug?: string; metadata?: Record<string, any> | null; dealer_count?: number }>;
  dealers: Array<{
    id: string;
    name?: string | null;
    address?: string | null;
    brand_id?: string | null;
    metadata?: Record<string, any> | null;
  }>;
  users: Array<{
    id: string;
    email?: string | null;
    role?: string | null;
    brand_id?: string | null;
    dealer_location_id?: string | null;
  }>;
}

function orgType(meta: Record<string, any> | null | undefined): string {
  if (!meta) return 'oem';
  const raw = String(meta.org_type || '').toLowerCase();
  if (raw.includes('grupo')) return 'grupo';
  if (raw.includes('dealer')) return 'grupo';
  return 'oem';
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export default function PanelDealerPage(): React.JSX.Element {
  const { data, error, isLoading, mutate: mutateOverview } = useSWR<AdminOverviewResponse>('panel_dealer_overview', endpoints.adminOverview);
  const organizations = React.useMemo(() => {
    const list = data?.organizations ?? [];
    return list.filter((org) => orgType(org.metadata) === 'grupo').sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [data?.organizations]);

  const [selectedOrgId, setSelectedOrgId] = React.useState<string>('');
  const selectedOrg = React.useMemo(() => organizations.find((org) => org.id === selectedOrgId) || null, [organizations, selectedOrgId]);

  const {
    data: orgDetail,
    error: orgDetailError,
    isLoading: orgDetailLoading,
    mutate: mutateOrgDetail,
  } = useSWR<OrganizationDetail>(selectedOrgId ? ['panel_dealer_org', selectedOrgId] : null, () => endpoints.adminOrganization(selectedOrgId));
  const { data: brandCatalog } = useSWR<{ brands: Array<{ id: string; name: string }> }>(selectedOrgId ? ['panel_dealer_brand_catalog', selectedOrgId] : null, endpoints.adminBrands);

  const [editMode, setEditMode] = React.useState(false);
  const [editName, setEditName] = React.useState('');
  const [editDisplayName, setEditDisplayName] = React.useState('');
  const [editAllowDealers, setEditAllowDealers] = React.useState(false);
  const [editDealerLimit, setEditDealerLimit] = React.useState('');
  const [editStatus, setEditStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [savingEdit, setSavingEdit] = React.useState(false);

  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [impersonationNotice, setImpersonationNotice] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [brandLimitDrafts, setBrandLimitDrafts] = React.useState<Record<string, string>>({});
  const [brandLimitFeedback, setBrandLimitFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [brandLimitSaving, setBrandLimitSaving] = React.useState('');
  const [brandForm, setBrandForm] = React.useState({ brandId: '', dealerLimit: '' });
  const [brandFormStatus, setBrandFormStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [brandFormLoading, setBrandFormLoading] = React.useState(false);
  const [userForm, setUserForm] = React.useState({ email: '', role: 'superadmin_oem', dealerAdmin: true });
  const [userFormStatus, setUserFormStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [userFormLoading, setUserFormLoading] = React.useState(false);
  const [deleteUserStatus, setDeleteUserStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deletingUserId, setDeletingUserId] = React.useState('');

  React.useEffect(() => {
    if (!selectedOrg || !orgDetail?.organization) {
      setEditMode(false);
      setEditStatus(null);
      setSelectedUserId('');
      setDeleteUserStatus(null);
      setDeletingUserId('');
      return;
    }
    const org = orgDetail.organization;
    setEditName(org.name || '');
    setEditDisplayName(org.display_name || '');
    const meta = (org.metadata || {}) as Record<string, any>;
    setEditAllowDealers(Boolean(meta.allow_dealer_creation));
    const limit = meta.dealer_creation_limit;
    if (typeof limit === 'number' && Number.isFinite(limit)) {
      setEditDealerLimit(String(limit));
    } else if (typeof limit === 'string' && limit.trim()) {
      setEditDealerLimit(limit.trim());
    } else {
      setEditDealerLimit('');
    }
    const defaultUser = orgDetail.users?.[0]?.id ?? '';
    setSelectedUserId(defaultUser);
    setEditStatus(null);
    setImpersonationNotice(null);
    setBrandLimitDrafts({});
    setBrandLimitFeedback(null);
    setDeleteUserStatus(null);
    setDeletingUserId('');
  }, [orgDetail?.organization, orgDetail?.users, selectedOrg]);

  React.useEffect(() => {
    setBrandLimitDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const brand of orgDetail?.brands || []) {
        if (!brand?.id) continue;
        if (Object.prototype.hasOwnProperty.call(prev, brand.id)) {
          next[brand.id] = prev[brand.id];
        }
      }
      return next;
    });
  }, [orgDetail?.brands]);

  const organizationBrands = React.useMemo(
    () => (orgDetail?.brands || []).map((brand) => String(brand?.name || '').trim()).filter(Boolean),
    [orgDetail?.brands]
  );

  const dealerMap = React.useMemo(() => {
    const map = new Map<string, OrganizationDetail['dealers'][number]>();
    for (const dealer of orgDetail?.dealers || []) {
      if (dealer?.id) map.set(dealer.id, dealer);
    }
    return map;
  }, [orgDetail?.dealers]);

  const brandMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const brand of orgDetail?.brands || []) {
      if (brand?.id && brand?.name) map.set(brand.id, brand.name.trim());
    }
    return map;
  }, [orgDetail?.brands]);

  const clearMembershipContext = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const keys = [
      'CORTEX_MEMBERSHIP_SESSION',
      'CORTEX_MEMBERSHIP_STATUS',
      'CORTEX_MEMBERSHIP_BRAND',
      'CORTEX_MEMBERSHIP_PHONE',
    ];
    keys.forEach((key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {}
    });
  }, []);

  const availableBrandOptions = React.useMemo(() => {
    const catalog = brandCatalog?.brands || [];
    const assigned = new Set<string>();
    for (const brand of orgDetail?.brands || []) {
      const key = String(brand.name || '').trim().toLowerCase();
      if (key) assigned.add(key);
    }
    const seen = new Set<string>();
    return catalog
      .map((item) => String(item?.name || '').trim())
      .filter((label) => {
        if (!label) return false;
        const key = label.toLowerCase();
        if (assigned.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((label) => ({ value: label, label }));
  }, [brandCatalog?.brands, orgDetail?.brands]);

  const getBrandLimit = React.useCallback((brand: OrganizationDetail['brands'][number]): number | null => {
    const meta = (brand?.metadata || {}) as Record<string, any>;
    const raw = meta.dealer_limit;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, []);

  const selectedUser = React.useMemo(() => orgDetail?.users?.find((user) => user.id === selectedUserId) || null, [orgDetail?.users, selectedUserId]);

  const applyAllowedBrands = React.useCallback((brands: string[]) => {
    if (typeof window === 'undefined') return;
    const unique = Array.from(
      new Set(
        (brands || [])
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > 0)
      )
    );
    try {
      if (unique.length) {
        window.localStorage.setItem('CORTEX_ALLOWED_BRANDS', JSON.stringify(unique));
      } else {
        window.localStorage.removeItem('CORTEX_ALLOWED_BRANDS');
      }
      window.dispatchEvent(new CustomEvent('cortex:allowed_brands', { detail: unique }));
    } catch {}
  }, []);

  const handleSaveOrganization = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOrgId || !orgDetail?.organization) return;
    setSavingEdit(true);
    setEditStatus(null);
    try {
      const payload: Record<string, any> = {};
      const trimmedName = editName.trim();
      if (trimmedName && trimmedName !== orgDetail.organization.name) {
        payload.name = trimmedName;
      }
      const trimmedDisplay = editDisplayName.trim();
      if (trimmedDisplay !== (orgDetail.organization.display_name || '').trim()) {
        payload.display_name = trimmedDisplay || null;
      }
      const metadata = { ...(orgDetail.organization.metadata || {}) } as Record<string, any>;
      metadata.allow_dealer_creation = editAllowDealers;
      const limitTrim = editDealerLimit.trim();
      if (limitTrim) {
        const limitNum = Number(limitTrim);
        if (!Number.isFinite(limitNum) || limitNum <= 0) {
          throw new Error('El límite de dealers debe ser un número mayor a cero.');
        }
        metadata.dealer_creation_limit = limitNum;
      } else {
        delete metadata.dealer_creation_limit;
      }
      payload.metadata = metadata;

      if (Object.keys(payload).length === 0) {
        setEditStatus({ type: 'error', message: 'No hay cambios para guardar.' });
        setSavingEdit(false);
        return;
      }

      await endpoints.adminUpdateOrganization(selectedOrgId, payload);
      await Promise.all([mutateOrgDetail(), mutateOverview()]);
      setEditStatus({ type: 'success', message: 'Organización actualizada correctamente.' });
      setEditMode(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar la organización';
      setEditStatus({ type: 'error', message });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleImpersonateOrganization = React.useCallback(() => {
    if (!orgDetail?.organization) {
      setImpersonationNotice({ type: 'error', message: 'Selecciona una organización primero.' });
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      clearMembershipContext();
      applyAllowedBrands(organizationBrands);
      window.localStorage.setItem('CORTEX_SUPERADMIN_ORG_ID', orgDetail.organization.id);
      const url = new URL('/ui', window.location.origin);
      url.searchParams.set('org', orgDetail.organization.id);
      window.open(url.toString(), '_blank', 'noopener');
      setImpersonationNotice({ type: 'success', message: `Se abrió una pestaña como ${orgDetail.organization.name}.` });
    } catch {
      setImpersonationNotice({ type: 'error', message: 'No se pudo impersonar la organización en este navegador.' });
    }
  }, [applyAllowedBrands, clearMembershipContext, orgDetail?.organization, organizationBrands]);

  const handleImpersonateUser = React.useCallback(() => {
    if (!selectedUser || typeof window === 'undefined') {
      setImpersonationNotice({ type: 'error', message: 'Selecciona un usuario para impersonar.' });
      return;
    }
    try {
      clearMembershipContext();
      const trimmedEmail = selectedUser.email?.trim() ?? '';
      window.localStorage.setItem('CORTEX_SUPERADMIN_USER_ID', selectedUser.id);
      if (trimmedEmail) {
        window.localStorage.setItem('CORTEX_SUPERADMIN_EMAIL', trimmedEmail);
      } else {
        window.localStorage.removeItem('CORTEX_SUPERADMIN_EMAIL');
      }

      const isDealerUser = Boolean(selectedUser.dealer_location_id);
      const dealerRecord = selectedUser.dealer_location_id ? dealerMap.get(selectedUser.dealer_location_id) : undefined;
      const dealerMeta = (dealerRecord?.metadata || {}) as Record<string, any>;
      const dealerLocation = (dealerMeta?.location || {}) as Record<string, any>;
      const dealerContact = (dealerMeta?.contact || {}) as Record<string, any>;
      const brandName = dealerRecord?.brand_id ? brandMap.get(dealerRecord.brand_id || '') || '' : '';

      if (isDealerUser && selectedUser.dealer_location_id) {
        const contextPayload = {
          id: selectedUser.dealer_location_id,
          name: dealerRecord?.name || '',
          location:
            (dealerLocation?.city && dealerLocation?.state
              ? `${dealerLocation.city}, ${dealerLocation.state}`
              : dealerLocation?.normalized
            )
            || dealerRecord?.address
            || '',
          contactName: dealerContact?.name || '',
          contactPhone: dealerContact?.phone || '',
        };

        window.localStorage.setItem('CORTEX_DEALER_ADMIN_USER_ID', selectedUser.id);
        if (trimmedEmail) {
          window.localStorage.setItem('CORTEX_DEALER_ADMIN_EMAIL', trimmedEmail);
        } else {
          window.localStorage.removeItem('CORTEX_DEALER_ADMIN_EMAIL');
        }
        window.localStorage.setItem('CORTEX_DEALER_ID', selectedUser.dealer_location_id);
        window.localStorage.setItem('CORTEX_DEALER_CONTEXT', JSON.stringify(contextPayload));
        if (brandName) {
          window.localStorage.setItem('CORTEX_DEALER_ALLOWED_BRAND', brandName);
          window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: brandName }));
        } else {
          window.localStorage.removeItem('CORTEX_DEALER_ALLOWED_BRAND');
          window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: '' }));
        }
        applyAllowedBrands(brandName ? [brandName] : []);
      } else {
        window.localStorage.removeItem('CORTEX_DEALER_ADMIN_USER_ID');
        window.localStorage.removeItem('CORTEX_DEALER_ADMIN_EMAIL');
        window.localStorage.removeItem('CORTEX_DEALER_ID');
        window.localStorage.removeItem('CORTEX_DEALER_CONTEXT');
        window.localStorage.removeItem('CORTEX_DEALER_ALLOWED_BRAND');
        applyAllowedBrands(organizationBrands);
        window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: '' }));
      }

      const target = new URL('/ui', window.location.origin);
      target.searchParams.set('user', selectedUser.id);
      if (isDealerUser && selectedUser.dealer_location_id) {
        target.searchParams.set('dealer', selectedUser.dealer_location_id);
        if (dealerRecord?.name) target.searchParams.set('name', dealerRecord.name);
        if (dealerRecord?.address) target.searchParams.set('address', dealerRecord.address);
        if (dealerLocation?.city) target.searchParams.set('city', String(dealerLocation.city));
        if (dealerLocation?.state) target.searchParams.set('state', String(dealerLocation.state));
        if (dealerLocation?.normalized) target.searchParams.set('normalizedAddress', String(dealerLocation.normalized));
        if (brandName) target.searchParams.set('brand', brandName);
      }
      window.open(target.toString(), '_blank', 'noopener');
      setImpersonationNotice({
        type: 'success',
        message: `Identidad actualizada como ${trimmedEmail || selectedUser.id}. Se abrió una pestaña nueva.`,
      });
    } catch {
      setImpersonationNotice({ type: 'error', message: 'No se pudo impersonar al usuario en este navegador.' });
    }
  }, [applyAllowedBrands, brandMap, clearMembershipContext, dealerMap, organizationBrands, selectedUser]);

  const handleBrandLimitInput = React.useCallback(
    (brandId: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setBrandLimitDrafts((prev) => ({ ...prev, [brandId]: value }));
      if (brandLimitFeedback) setBrandLimitFeedback(null);
    },
    [brandLimitFeedback],
  );

  const resetBrandLimitDraft = React.useCallback((brandId: string) => {
    setBrandLimitDrafts((prev) => {
      const next = { ...prev };
      delete next[brandId];
      return next;
    });
    if (brandLimitFeedback) setBrandLimitFeedback(null);
  }, [brandLimitFeedback]);

  const saveBrandLimit = React.useCallback(
    async (brand: OrganizationDetail['brands'][number]) => {
      if (!brand?.id) return;
      const draftRaw = brandLimitDrafts[brand.id] ?? '';
      const trimmed = draftRaw.trim();
      const limit = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        setBrandLimitFeedback({ type: 'error', message: 'Define un número válido de dealers para la marca.' });
        return;
      }
      setBrandLimitSaving(brand.id);
      setBrandLimitFeedback(null);
      try {
        await endpoints.adminUpdateBrand(brand.id, { dealer_limit: limit });
        setBrandLimitFeedback({ type: 'success', message: `Límite actualizado para ${brand.name}.` });
        setBrandLimitDrafts((prev) => {
          const next = { ...prev };
          delete next[brand.id];
          return next;
        });
        await mutateOrgDetail();
      } catch (err) {
        setBrandLimitFeedback({ type: 'error', message: err instanceof Error ? err.message : 'No se pudo actualizar el límite de la marca.' });
      } finally {
        setBrandLimitSaving('');
      }
    },
    [brandLimitDrafts, mutateOrgDetail],
  );

  const handleAddBrand = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedOrgId) return;
      const name = brandForm.brandId.trim();
      const limitRaw = brandForm.dealerLimit.trim();
      if (!name) {
        setBrandFormStatus({ type: 'error', message: 'Selecciona una marca del catálogo.' });
        return;
      }
      const limit = Number.parseInt(limitRaw, 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        setBrandFormStatus({ type: 'error', message: 'Define un número válido de dealers permitidos.' });
        return;
      }
      setBrandFormLoading(true);
      setBrandFormStatus(null);
      try {
        await endpoints.adminCreateBrand(selectedOrgId, {
          name,
          slug: name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48) || undefined,
          dealer_limit: limit,
        });
        setBrandForm({ brandId: '', dealerLimit: '' });
        setBrandFormStatus({ type: 'success', message: `Marca ${name} agregada al grupo.` });
        await Promise.all([mutateOrgDetail(), mutateOverview()]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo agregar la marca.';
        setBrandFormStatus({ type: 'error', message });
      } finally {
        setBrandFormLoading(false);
      }
    },
    [brandForm, mutateOrgDetail, mutateOverview, selectedOrgId],
  );

  const handleOpenDealerPreview = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      applyAllowedBrands([]);
      window.localStorage.removeItem('CORTEX_DEALER_ALLOWED_BRAND');
      window.localStorage.removeItem('CORTEX_DEALER_ADMIN_USER_ID');
      window.localStorage.removeItem('CORTEX_DEALER_ADMIN_EMAIL');
      window.localStorage.removeItem('CORTEX_DEALER_ID');
      window.localStorage.removeItem('CORTEX_DEALER_CONTEXT');
      window.localStorage.setItem('CORTEX_DEALER_PREVIEW', '1');
    } catch {}
    try {
      const url = new URL('/dealers', window.location.origin);
      url.searchParams.set('preview', '1');
      window.open(url.toString(), '_blank', 'noopener');
    } catch {}
  }, [applyAllowedBrands]);

  const handleCreateUser = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedOrgId) return;
      const email = userForm.email.trim();
      if (!email) {
        setUserFormStatus({ type: 'error', message: 'Ingresa el correo del usuario.' });
        return;
      }
      setUserFormLoading(true);
      setUserFormStatus(null);
      try {
        await endpoints.adminCreateOrgUser(selectedOrgId, {
          email,
          role: userForm.role,
          dealer_admin: userForm.dealerAdmin,
        });
        setUserForm({ email: '', role: userForm.role, dealerAdmin: true });
        setUserFormStatus({ type: 'success', message: 'Usuario creado correctamente.' });
        await Promise.all([mutateOrgDetail(), mutateOverview()]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo crear el usuario.';
        setUserFormStatus({ type: 'error', message });
      } finally {
        setUserFormLoading(false);
      }
    },
    [mutateOrgDetail, mutateOverview, selectedOrgId, userForm],
  );

  const handleDeleteUser = React.useCallback(
    async (userId: string, email?: string | null) => {
      if (!userId) return;
      if (typeof window !== 'undefined') {
        const label = email ? ` ${email}` : '';
        const confirmed = window.confirm(`¿Eliminar al usuario${label}?`);
        if (!confirmed) return;
      }
      setDeletingUserId(userId);
      setDeleteUserStatus(null);
      try {
        await endpoints.adminDeleteUser(userId);
        if (selectedUserId === userId) {
          const fallback = orgDetail?.users?.find((user) => user.id !== userId)?.id ?? '';
          setSelectedUserId(fallback);
        }
        setDeleteUserStatus({ type: 'success', message: 'Usuario eliminado correctamente.' });
        await Promise.all([mutateOrgDetail(), mutateOverview()]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo eliminar el usuario.';
        setDeleteUserStatus({ type: 'error', message });
      } finally {
        setDeletingUserId('');
      }
    },
    [mutateOrgDetail, mutateOverview, orgDetail?.users, selectedUserId],
  );

  return (
    <main style={{ display: 'grid', gap: 24, padding: 24 }}>
      <section style={{ display: 'grid', gap: 12 }}>
        <header>
          <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>Panel Dealer (vista operativa)</h1>
          <p style={{ margin: '4px 0 0', color: '#475569', maxWidth: 720 }}>
            Selecciona un grupo dealer para abrir su panel operativo, editar sus datos o impersonar usuarios clave.
          </p>
        </header>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleOpenDealerPreview}
            style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #2563eb', background: '#fff', color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}
          >
            Abrir vista Dealer (sin filtro)
          </button>
          <a
            href="/admin"
            style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #334155', color: '#334155', textDecoration: 'none', fontWeight: 600 }}
          >
            Abrir panel Superadmin
          </a>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Grupo dealer</label>
          <select
            value={selectedOrgId}
            onChange={(event) => setSelectedOrgId(event.target.value)}
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', maxWidth: 320 }}
          >
            <option value="">Selecciona un grupo…</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Cargando grupos…</p>
        ) : error ? (
          <p style={{ color: '#dc2626', fontSize: 13 }}>No se pudieron cargar las organizaciones.</p>
        ) : organizations.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Aún no has creado grupos dealer.</p>
        ) : null}

        {selectedOrg ? (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff', display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{selectedOrg.name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Paquete {selectedOrg.package === 'black_ops' ? 'Black Ops' : 'Marca'} · Alta {formatDate(selectedOrg.created_at)}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#475569' }}>
              <span><strong>Marcas:</strong> {selectedOrg.brand_count}</span>
              <span><strong>Dealers:</strong> {selectedOrg.dealer_count}</span>
              <span><strong>Usuarios:</strong> {selectedOrg.user_count}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <button
                onClick={() => setEditMode((prev) => !prev)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: editMode ? '1px solid #1d4ed8' : '1px solid #2563eb',
                  background: editMode ? '#dbeafe' : '#fff',
                  color: '#1d4ed8',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {editMode ? 'Cancelar edición' : 'Editar organización'}
              </button>
              <button
                onClick={handleImpersonateOrganization}
                disabled={orgDetailLoading}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: '1px solid #047857',
                  background: '#d1fae5',
                  color: '#047857',
                  fontWeight: 600,
                  cursor: orgDetailLoading ? 'default' : 'pointer',
                }}
              >
                {orgDetailLoading ? 'Cargando…' : 'Impersonar organización'}
              </button>
            </div>
            {orgDetailError ? (
              <p style={{ fontSize: 12, color: '#dc2626' }}>No se pudo cargar el detalle de la organización.</p>
            ) : null}
            {editMode ? (
              <form onSubmit={handleSaveOrganization} style={{ display: 'grid', gap: 10, fontSize: 12 }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <label style={{ fontWeight: 600 }}>Nombre interno *</label>
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                    placeholder="Nombre interno"
                  />
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <label style={{ fontWeight: 600 }}>Nombre comercial</label>
                  <input
                    value={editDisplayName}
                    onChange={(event) => setEditDisplayName(event.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                    placeholder="Nombre visible"
                  />
                </div>
                <div style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>Creación de dealers:</span>
                  <span>{editAllowDealers ? 'Activada (configurable desde Control)' : 'Deshabilitada (ajusta desde Control)'}</span>
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <label style={{ fontWeight: 600 }}>Límite de dealers permitidos</label>
                  <input
                    value={editDealerLimit}
                    onChange={(event) => setEditDealerLimit(event.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                    placeholder="Ej. 10"
                  />
                  <span style={{ fontSize: 11, color: '#64748b' }}>Deja en blanco para eliminar el límite.</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #2563eb',
                      background: savingEdit ? '#cbd5f5' : '#2563eb',
                      color: savingEdit ? '#475569' : '#fff',
                      fontWeight: 600,
                      cursor: savingEdit ? 'default' : 'pointer',
                    }}
                  >
                    {savingEdit ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditMode(false);
                      setEditStatus(null);
                    }}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                </div>
                {editStatus ? (
                  <p style={{ fontSize: 12, color: editStatus.type === 'success' ? '#047857' : '#dc2626' }}>{editStatus.message}</p>
                ) : null}
              </form>
            ) : editStatus ? (
              <p style={{ fontSize: 12, color: editStatus.type === 'success' ? '#047857' : '#dc2626' }}>{editStatus.message}</p>
            ) : null}

            {orgDetailLoading ? (
              <p style={{ fontSize: 12, color: '#64748b' }}>Cargando detalle de la organización…</p>
            ) : null}

            {orgDetail?.brands?.length ? (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Marcas autorizadas</div>
                {availableBrandOptions.length ? (
                  <form onSubmit={handleAddBrand} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <select
                      value={brandForm.brandId}
                      onChange={(event) => {
                        setBrandForm((prev) => ({ ...prev, brandId: event.target.value }));
                        setBrandFormStatus(null);
                      }}
                      style={{ minWidth: 220, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                    >
                      <option value="">Marca del catálogo…</option>
                      {availableBrandOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={brandForm.dealerLimit}
                      onChange={(event) => {
                        setBrandForm((prev) => ({ ...prev, dealerLimit: event.target.value }));
                        setBrandFormStatus(null);
                      }}
                      placeholder="Límite"
                      style={{ width: 100, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                    />
                    <button
                      type="submit"
                      disabled={brandFormLoading}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #047857',
                        background: brandFormLoading ? '#bbf7d0' : '#047857',
                        color: '#fff',
                        fontWeight: 600,
                        cursor: brandFormLoading ? 'default' : 'pointer',
                      }}
                    >
                      {brandFormLoading ? 'Agregando…' : 'Agregar marca'}
                    </button>
                    {brandFormStatus ? (
                      <span style={{ fontSize: 12, color: brandFormStatus.type === 'success' ? '#047857' : '#dc2626' }}>
                        {brandFormStatus.message}
                      </span>
                    ) : null}
                  </form>
                ) : null}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ background: '#f8fafc' }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Marca</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Slug</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Dealers</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Límite</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgDetail.brands.map((brand) => {
                        if (!brand?.id) return null;
                        const limit = getBrandLimit(brand);
                        const draft = Object.prototype.hasOwnProperty.call(brandLimitDrafts, brand.id)
                          ? brandLimitDrafts[brand.id]
                          : limit != null ? String(limit) : '';
                        const saving = brandLimitSaving === brand.id;
                        const hasDraft = Object.prototype.hasOwnProperty.call(brandLimitDrafts, brand.id);
                        const hasChanges = hasDraft && draft.trim() !== (limit != null ? String(limit) : '');
                        return (
                          <tr key={brand.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{brand.name}</td>
                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#64748b' }}>{brand.slug || '—'}</td>
                            <td style={{ padding: '6px 10px' }}>{brand.dealer_count ?? 0}</td>
                            <td style={{ padding: '6px 10px' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                <input
                                  type="number"
                                  min={1}
                                  value={draft}
                                  onChange={handleBrandLimitInput(brand.id)}
                                  style={{ width: 100, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => saveBrandLimit(brand)}
                                  disabled={saving || !hasChanges}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #2563eb',
                                    background: saving || !hasChanges ? '#e2e8f0' : '#2563eb',
                                    color: saving || !hasChanges ? '#475569' : '#fff',
                                    fontWeight: 600,
                                    cursor: saving || !hasChanges ? 'default' : 'pointer',
                                  }}
                                >
                                  {saving ? 'Guardando…' : 'Guardar'}
                                </button>
                                {hasDraft ? (
                                  <button
                                    type="button"
                                    onClick={() => resetBrandLimitDraft(brand.id)}
                                    disabled={saving}
                                    style={{
                                      padding: '6px 10px',
                                      borderRadius: 6,
                                      border: '1px solid transparent',
                                      background: '#f1f5f9',
                                      color: '#475569',
                                      fontWeight: 600,
                                      cursor: saving ? 'default' : 'pointer',
                                    }}
                                  >
                                    Cancelar
                                  </button>
                                ) : null}
                              </div>
                              <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>
                                {limit != null ? `Definido: ${limit}` : 'Sin límite establecido'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {brandLimitFeedback ? (
                  <p style={{ fontSize: 12, color: brandLimitFeedback.type === 'success' ? '#047857' : '#dc2626' }}>{brandLimitFeedback.message}</p>
                ) : null}
              </div>
            ) : null}

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Usuarios registrados</div>
              {orgDetail?.users?.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ background: '#f8fafc' }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Correo</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Rol</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Dealer admin</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgDetail.users.map((user) => {
                        const flags = (user.feature_flags || {}) as Record<string, any>;
                        const dealerAdmin = Boolean(flags?.dealer_admin);
                        const isDeleting = deletingUserId === user.id;
                        const roleLabel = user.role === 'superadmin_oem'
                          ? 'Superadmin OEM'
                          : user.role === 'oem_user'
                            ? 'Usuario OEM'
                            : user.role || '—';
                        return (
                          <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{user.email || '—'}</td>
                            <td style={{ padding: '6px 10px' }}>{roleLabel}</td>
                            <td style={{ padding: '6px 10px' }}>{dealerAdmin ? 'Sí' : 'No'}</td>
                            <td style={{ padding: '6px 10px' }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(user.id, user.email)}
                                disabled={isDeleting}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  border: '1px solid #dc2626',
                                  background: isDeleting ? '#fecaca' : '#fff1f2',
                                  color: '#b91c1c',
                                  fontWeight: 600,
                                  cursor: isDeleting ? 'default' : 'pointer',
                                }}
                              >
                                {isDeleting ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Aún no se registran usuarios para esta organización.</p>
              )}
              {deleteUserStatus ? (
                <span style={{ fontSize: 12, color: deleteUserStatus.type === 'success' ? '#047857' : '#dc2626' }}>
                  {deleteUserStatus.message}
                </span>
              ) : null}
            </div>

            {orgDetail?.users?.length ? (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Impersonar usuario</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                  <select
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', minWidth: 220 }}
                  >
                    {orgDetail.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.email || user.id}
                        {user.role ? ` · ${user.role}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleImpersonateUser}
                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Impersonar usuario
                  </button>
                </div>
              </div>
            ) : null}

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Crear usuario</div>
              <form onSubmit={handleCreateUser} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <input
                  value={userForm.email}
                  onChange={(event) => {
                    setUserForm((prev) => ({ ...prev, email: event.target.value }));
                    setUserFormStatus(null);
                  }}
                  placeholder="correo@dominio.com"
                  style={{ minWidth: 220, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', fontFamily: 'monospace' }}
                />
                <select
                  value={userForm.role}
                  onChange={(event) => {
                    setUserForm((prev) => ({ ...prev, role: event.target.value }));
                    setUserFormStatus(null);
                  }}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                >
                  <option value="superadmin_oem">Superadmin OEM</option>
                  <option value="oem_user">Usuario OEM</option>
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={userForm.dealerAdmin}
                    onChange={(event) => {
                      setUserForm((prev) => ({ ...prev, dealerAdmin: event.target.checked }));
                      setUserFormStatus(null);
                    }}
                  />
                  Dealer admin
                </label>
                <button
                  type="submit"
                  disabled={userFormLoading}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #2563eb',
                    background: userFormLoading ? '#cbd5f5' : '#2563eb',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: userFormLoading ? 'default' : 'pointer',
                  }}
                >
                  {userFormLoading ? 'Creando…' : 'Crear usuario'}
                </button>
                {userFormStatus ? (
                  <span style={{ fontSize: 12, color: userFormStatus.type === 'success' ? '#047857' : '#dc2626' }}>
                    {userFormStatus.message}
                  </span>
                ) : null}
              </form>
            </div>

            {impersonationNotice ? (
              <p style={{ fontSize: 12, color: impersonationNotice.type === 'success' ? '#047857' : '#dc2626' }}>
                {impersonationNotice.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
