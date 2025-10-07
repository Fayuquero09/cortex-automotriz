"use client";

import React from 'react';
import useSWR from 'swr';
import { endpoints } from '@/lib/api';

type OrgType = 'oem' | 'grupo';
type OrgPackage = 'marca' | 'black_ops';

type OrganizationSummary = {
  id: string;
  name: string;
  package: OrgPackage;
  metadata?: Record<string, any> | null;
  created_at: string;
};

type AdminOverviewResponse = {
  organizations: OrganizationSummary[];
};

type AdminOrganizationDetail = {
  organization: {
    id: string;
    name: string;
    display_name?: string | null;
    package: OrgPackage;
    metadata?: Record<string, any> | null;
  };
  brands: Array<{
    id: string;
    name: string;
    slug?: string | null;
    metadata?: Record<string, any> | null;
    dealer_count?: number;
  }>;
  users: Array<{
    id: string;
    email?: string | null;
    role?: string | null;
    feature_flags?: Record<string, any> | null;
  }>;
};

type OrgBrandDetail = NonNullable<AdminOrganizationDetail['brands']>[number];

type FormState = {
  name: string;
  package: OrgPackage;
  orgType: OrgType;
  superEmail: string;
  superPhone: string;
  brands: string[];
  brandLimits: Record<string, string>;
  allowDealerCreation: boolean;
  dealerLimit: string;
  promptProfile: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  package: 'marca',
  orgType: 'oem',
  superEmail: '',
  superPhone: '',
  brands: [],
  brandLimits: {},
  allowDealerCreation: false,
  dealerLimit: '',
  promptProfile: '',
};

type EditFormState = {
  name: string;
  displayName: string;
  package: OrgPackage;
  orgType: OrgType;
  allowDealerCreation: boolean;
  dealerLimit: string;
  promptProfile: string;
};

const EMPTY_EDIT_FORM: EditFormState = {
  name: '',
  displayName: '',
  package: 'marca',
  orgType: 'oem',
  allowDealerCreation: false,
  dealerLimit: '',
  promptProfile: '',
};

type OemUserRole = 'superadmin_oem' | 'oem_admin' | 'oem_viewer';

const PRESETS: Array<{ label: string; description: string; package: OrgPackage; orgType: OrgType }> = [
  {
    label: 'OEM / Marca',
    description: 'Acceso al panel OEM y administración de dealers propios.',
    package: 'marca',
    orgType: 'oem',
  },
  {
    label: 'Grupo Dealer',
    description: 'Solo panel Dealer. No ve la suite OEM.',
    package: 'marca',
    orgType: 'grupo',
  },
  {
    label: 'Black Ops',
    description: 'OEM con acceso ampliado (Black Ops).',
    package: 'black_ops',
    orgType: 'oem',
  },
];

const isCatalogBrand = (name: string): boolean => {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('grupo ')) return false;
  if (normalized.includes(' grupo ')) return false;
  if (normalized.includes('grupo empresarial')) return false;
  return true;
};

const humanizeSlug = (slug: string): string => {
  if (typeof slug !== 'string') return '';
  const normalized = slug.replace(/_/g, '-').trim();
  if (!normalized) return '';
  const words = normalized
    .split('-')
    .filter(Boolean)
    .map((part) => part.length ? part[0].toUpperCase() + part.slice(1) : '')
    .join(' ')
    .trim();
  if (!words) return '';
  if (words.length <= 4) return words.toUpperCase();
  return words;
};

const catalogBrandLabel = (item: any): string => {
  const direct = String(item?.name || '').trim();
  if (direct) return direct;
  const metadata = (item?.metadata || {}) as Record<string, any>;
  const metaLabelCandidates = [
    metadata.brand_label,
    metadata.display_name,
    metadata.label,
    metadata.name,
  ];
  for (const candidate of metaLabelCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  const slugLabel = String(item?.slug || '').trim();
  if (slugLabel) return humanizeSlug(slugLabel);
  return '';
};

function persistAllowedBrands(brands: string[]): void {
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
    window.localStorage.removeItem('CORTEX_ALLOWED_BRAND_META');
    window.dispatchEvent(new CustomEvent('cortex:allowed_brand_meta', { detail: [] }));
    window.dispatchEvent(new CustomEvent('cortex:allowed_brands', { detail: unique }));
  } catch {
    /* ignore */
  }
}

function organizationType(meta?: Record<string, any> | null): OrgType {
  if (!meta) return 'oem';
  const token = String(meta.org_type || '').toLowerCase();
  return token.includes('grupo') || token.includes('dealer') ? 'grupo' : 'oem';
}

function formatDate(value?: string): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return value;
  }
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export default function AdminControlPage(): JSX.Element {
  const { data, error, isLoading, mutate } = useSWR<AdminOverviewResponse>('admin_control_overview', endpoints.adminOverview);
  const { data: brandCatalog } = useSWR<{ brands: Array<{ id: string; name: string }> }>('admin_control_brand_catalog', endpoints.adminBrands);
  const [form, setForm] = React.useState<FormState>({ ...EMPTY_FORM });
  const [loading, setLoading] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editingOrgId, setEditingOrgId] = React.useState('');
  const [editForm, setEditForm] = React.useState<EditFormState>({ ...EMPTY_EDIT_FORM });
  const [editFeedback, setEditFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editSaving, setEditSaving] = React.useState(false);
  const [panelNotice, setPanelNotice] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [brandLimitDrafts, setBrandLimitDrafts] = React.useState<Record<string, string>>({});
  const [brandLimitFeedback, setBrandLimitFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [brandLimitSaving, setBrandLimitSaving] = React.useState('');
  const [brandForm, setBrandForm] = React.useState({ brandId: '', dealerLimit: '' });
  const [brandFormStatus, setBrandFormStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [brandFormLoading, setBrandFormLoading] = React.useState(false);
  const [userForm, setUserForm] = React.useState<{ email: string; name: string; phone: string; uiRole: OemUserRole }>({
    email: '',
    name: '',
    phone: '',
    uiRole: 'oem_admin',
  });
  const [userFormStatus, setUserFormStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [userFormLoading, setUserFormLoading] = React.useState(false);
  const [deleteUserStatus, setDeleteUserStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deletingUserId, setDeletingUserId] = React.useState('');
  const [deletingOrg, setDeletingOrg] = React.useState(false);
  const [dealerForm, setDealerForm] = React.useState({
    brandId: '',
    name: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    contactName: '',
    contactPhone: '',
    serviceStartedAt: '',
  });
  const [dealerFormStatus, setDealerFormStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dealerFormLoading, setDealerFormLoading] = React.useState(false);
  const [dealerStatusNotice, setDealerStatusNotice] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dealerStatusUpdating, setDealerStatusUpdating] = React.useState('');
  const [orgStatusNotice, setOrgStatusNotice] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [orgStatusUpdating, setOrgStatusUpdating] = React.useState(false);

  const organizations = React.useMemo(() => data?.organizations ?? [], [data?.organizations]);
  const oemCount = React.useMemo(() => organizations.filter((org) => organizationType(org.metadata) === 'oem').length, [organizations]);
  const dealerCount = organizations.length - oemCount;
  const brandOptions = React.useMemo(() => {
    const catalog = brandCatalog?.brands || [];
    const seen = new Set<string>();
    const options: Array<{ id: string; name: string }> = [];
    for (const item of catalog) {
      const label = catalogBrandLabel(item);
      if (!label || !isCatalogBrand(label)) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const rawId = item?.id ? String(item.id) : key;
      options.push({ id: rawId, name: label });
    }
    return options.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [brandCatalog?.brands]);
  const brandMap = React.useMemo(() => new Map(brandOptions.map((item) => [item.id, item.name] as const)), [brandOptions]);
  const {
    data: editingDetail,
    error: editingError,
    isLoading: editingLoading,
    mutate: mutateEditingDetail,
  } = useSWR<AdminOrganizationDetail>(editingOrgId ? ['admin_control_org_detail', editingOrgId] : null, () => endpoints.adminOrganization(editingOrgId));
  const dealerMap = React.useMemo(() => {
    const map = new Map<string, AdminOrganizationDetail['dealers'][number]>();
    for (const dealer of editingDetail?.dealers || []) {
      if (dealer?.id) map.set(dealer.id, dealer);
    }
    return map;
  }, [editingDetail?.dealers]);
  const availableBrandOptionsEdit = React.useMemo(() => {
    const assigned = new Set<string>();
    for (const brand of editingDetail?.brands || []) {
      const key = String(brand?.name || '').trim().toLowerCase();
      if (key) assigned.add(key);
    }
    const seen = new Set<string>();
    return brandOptions
      .map((option) => ({ label: option.name }))
      .filter((option) => {
        const key = option.label.trim().toLowerCase();
        if (!key || assigned.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [brandOptions, editingDetail?.brands]);

  const updateField = React.useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFeedback(null);
  }, []);

  const hydrateEditForm = React.useCallback(() => {
    if (!editingDetail?.organization) return;
    const org = editingDetail.organization;
    const metadata = (org.metadata || {}) as Record<string, any>;
    const limitRaw = metadata.dealer_creation_limit;
    let dealerLimit = '';
    if (typeof limitRaw === 'number' && Number.isFinite(limitRaw)) {
      dealerLimit = String(limitRaw);
    } else if (typeof limitRaw === 'string' && limitRaw.trim()) {
      dealerLimit = limitRaw.trim();
    }
    setEditForm({
      name: org.name || '',
      displayName: (org.display_name || '').trim(),
      package: org.package,
      orgType: organizationType(metadata),
      allowDealerCreation: Boolean(metadata.allow_dealer_creation),
      dealerLimit,
      promptProfile: typeof metadata.prompt_profile === 'string' ? metadata.prompt_profile : '',
    });
    setEditFeedback(null);
  }, [editingDetail?.organization]);

  React.useEffect(() => {
    if (!editingOrgId) {
      setEditForm({ ...EMPTY_EDIT_FORM });
      setEditFeedback(null);
      setBrandLimitDrafts({});
      setBrandFormStatus(null);
      setUserFormStatus(null);
      setBrandForm({ brandId: '', dealerLimit: '' });
      setUserForm({ email: '', name: '', phone: '', uiRole: 'oem_admin' });
      setDeleteUserStatus(null);
      setDeletingUserId('');
      setDealerForm({
        brandId: '',
        name: '',
        address: '',
        city: '',
        state: '',
        postalCode: '',
        contactName: '',
        contactPhone: '',
        serviceStartedAt: '',
      });
      setDealerFormStatus(null);
      setDealerFormLoading(false);
      setDealerStatusNotice(null);
      setDealerStatusUpdating('');
      setOrgStatusNotice(null);
      setOrgStatusUpdating(false);
      return;
    }
    hydrateEditForm();
    setBrandLimitDrafts({});
    setBrandLimitFeedback(null);
    setBrandFormStatus(null);
    setUserFormStatus(null);
    setDeletingOrg(false);
    setDeleteUserStatus(null);
    setDeletingUserId('');
    const firstBrandId = editingDetail?.brands?.[0]?.id ?? '';
    setDealerForm({
      brandId: firstBrandId,
      name: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      contactName: '',
      contactPhone: '',
      serviceStartedAt: '',
    });
    setDealerFormStatus(null);
    setDealerFormLoading(false);
    setDealerStatusNotice(null);
    setDealerStatusUpdating('');
    setOrgStatusNotice(null);
    setOrgStatusUpdating(false);
  }, [editingDetail?.brands, editingOrgId, hydrateEditForm]);

  const applyPreset = React.useCallback((preset: typeof PRESETS[number]) => {
    setForm((prev) => ({
      ...prev,
      package: preset.package,
      orgType: preset.orgType,
      allowDealerCreation: preset.orgType === 'grupo' ? true : prev.allowDealerCreation,
      promptProfile: preset.orgType === 'grupo' ? 'dealer_vendor' : prev.promptProfile,
    }));
    setFeedback({ type: 'success', message: `Plantilla “${preset.label}” aplicada. Completa el nombre y guarda.` });
  }, []);

  const updateEditField = React.useCallback(<K extends keyof EditFormState>(field: K, value: EditFormState[K]) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
    setEditFeedback(null);
  }, []);

  const getBrandLimit = React.useCallback((brand: OrgBrandDetail): number | null => {
    if (!brand) return null;
    const meta = (brand.metadata || {}) as Record<string, any>;
    const raw = meta.dealer_limit;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, []);

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
    async (brand: OrgBrandDetail) => {
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
        await mutateEditingDetail();
      } catch (err) {
        setBrandLimitFeedback({ type: 'error', message: err instanceof Error ? err.message : 'No se pudo actualizar el límite de la marca.' });
      } finally {
        setBrandLimitSaving('');
      }
    },
    [brandLimitDrafts, mutateEditingDetail],
  );

  const handleCreateDealer = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editingOrgId) return;
      const { brandId, name, address, city, state, postalCode, contactName, contactPhone, serviceStartedAt } = dealerForm;
      if (!brandId.trim()) {
        setDealerFormStatus({ type: 'error', message: 'Selecciona la marca del dealer.' });
        return;
      }
      if (!name.trim()) {
        setDealerFormStatus({ type: 'error', message: 'El nombre del dealer es obligatorio.' });
        return;
      }
      if (!address.trim()) {
        setDealerFormStatus({ type: 'error', message: 'Captura la dirección completa del dealer.' });
        return;
      }
      if (!serviceStartedAt.trim()) {
        setDealerFormStatus({ type: 'error', message: 'Indica la fecha de arranque del servicio.' });
        return;
      }
      const started = new Date(serviceStartedAt);
      if (Number.isNaN(started.getTime())) {
        setDealerFormStatus({ type: 'error', message: 'La fecha de servicio no es válida (formato AAAA-MM-DD).' });
        return;
      }
      setDealerFormLoading(true);
      setDealerFormStatus(null);
      try {
        await endpoints.adminCreateDealer(editingOrgId, {
          brand_id: brandId,
          name: name.trim(),
          address: address.trim(),
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          postal_code: postalCode.trim() || undefined,
          contact_name: contactName.trim() || undefined,
          contact_phone: contactPhone.trim() || undefined,
          service_started_at: started.toISOString(),
        });
        setDealerFormStatus({ type: 'success', message: 'Dealer creado correctamente.' });
        setDealerForm({
          brandId,
          name: '',
          address: '',
          city: '',
          state: '',
          postalCode: '',
          contactName: '',
          contactPhone: '',
          serviceStartedAt: '',
        });
        await Promise.all([mutateEditingDetail(), mutate()]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo crear el dealer.';
        setDealerFormStatus({ type: 'error', message });
      } finally {
        setDealerFormLoading(false);
      }
    },
    [dealerForm, editingOrgId, mutate, mutateEditingDetail],
  );

  const handleToggleDealerStatus = React.useCallback(
    async (dealerId: string, currentStatus?: string | null) => {
      if (!dealerId) return;
      setDealerStatusUpdating(dealerId);
      setDealerStatusNotice(null);
      try {
        const nextAction = currentStatus === 'paused' ? 'resume' : 'pause';
        await endpoints.adminUpdateDealerStatus(dealerId, { action: nextAction });
        await Promise.all([mutateEditingDetail(), mutate()]);
        setDealerStatusNotice({
          type: 'success',
          message: nextAction === 'pause' ? 'Servicio del dealer pausado.' : 'Servicio del dealer reactivado.',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo actualizar el estado del dealer.';
        setDealerStatusNotice({ type: 'error', message });
      } finally {
        setDealerStatusUpdating('');
      }
    },
    [mutate, mutateEditingDetail],
  );

  const handleToggleOrgStatus = React.useCallback(async () => {
    if (!editingOrgId || !editingDetail?.organization) return;
    setOrgStatusUpdating(true);
    setOrgStatusNotice(null);
    try {
      const current = (editingDetail.organization.status || 'active').toLowerCase();
      const action = current === 'paused' ? 'resume' : 'pause';
      await endpoints.adminUpdateOrganizationStatus(editingOrgId, { action });
      await Promise.all([mutate(), mutateEditingDetail()]);
      setOrgStatusNotice({
        type: 'success',
        message: action === 'pause' ? 'Organización pausada.' : 'Organización reactivada.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el estado de la organización.';
      setOrgStatusNotice({ type: 'error', message });
    } finally {
      setOrgStatusUpdating(false);
    }
  }, [editingDetail?.organization, editingOrgId, mutate, mutateEditingDetail]);

  const orgDomain = React.useMemo(() => {
    const meta = editingDetail?.organization?.metadata;
    if (meta && typeof meta === 'object' && meta) {
      const domain = String((meta as Record<string, any>).superadmin_domain || '').trim().toLowerCase();
      if (domain) return domain;
    }
    const superUser = (editingDetail?.users || []).find((user) => {
      const email = String(user?.email || '');
      return user?.role === 'superadmin_oem' && email.includes('@');
    });
    const inferred = superUser?.email?.split('@')[1]?.trim().toLowerCase();
    return inferred || '';
  }, [editingDetail?.organization?.metadata, editingDetail?.users]);

  const handleCreateUser = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editingOrgId) return;

      const emailRaw = userForm.email.trim();
      if (!emailRaw) {
        setUserFormStatus({ type: 'error', message: 'Ingresa el correo del usuario.' });
        return;
      }
      if (!emailRaw.includes('@')) {
        setUserFormStatus({ type: 'error', message: 'El correo debe incluir “@”.' });
        return;
      }
      const email = emailRaw.toLowerCase();
      const domainPart = email.split('@')[1]?.trim().toLowerCase();
      if (orgDomain && domainPart !== orgDomain) {
        setUserFormStatus({ type: 'error', message: `El correo debe terminar en @${orgDomain}.` });
        return;
      }

      const roleMap = (uiRole: typeof userForm.uiRole) => {
        switch (uiRole) {
          case 'superadmin_oem':
            return { role: 'superadmin_oem', dealerAdmin: true };
          case 'oem_admin':
            return { role: 'oem_user', dealerAdmin: true };
          default:
            return { role: 'oem_user', dealerAdmin: false };
        }
      };

      const { role, dealerAdmin } = roleMap(userForm.uiRole);
      const name = userForm.name.trim();
      const phone = userForm.phone.trim();

      setUserFormLoading(true);
      setUserFormStatus(null);
      try {
        await endpoints.adminCreateOrgUser(editingOrgId, {
          email,
          role,
          dealer_admin: dealerAdmin,
          name: name || undefined,
          phone: phone || undefined,
        });
        setUserForm({ email: '', name: '', phone: '', uiRole: userForm.uiRole });
        setUserFormStatus({ type: 'success', message: 'Usuario creado correctamente.' });
        await Promise.all([mutateEditingDetail(), mutate()]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo crear el usuario.';
        setUserFormStatus({ type: 'error', message });
      } finally {
        setUserFormLoading(false);
      }
    },
    [editingOrgId, mutate, mutateEditingDetail, orgDomain, userForm],
  );

  const handleDeleteUser = React.useCallback(
    async (userId: string, email?: string | null) => {
      if (!userId) return;
      if (typeof window !== 'undefined') {
        const confirmed = window.confirm(`¿Eliminar al usuario ${email || userId}?`);
        if (!confirmed) return;
      }
      setDeletingUserId(userId);
      setDeleteUserStatus(null);
      try {
        await endpoints.adminDeleteUser(userId);
        setDeleteUserStatus({ type: 'success', message: 'Usuario eliminado correctamente.' });
        await Promise.all([mutateEditingDetail(), mutate()]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo eliminar el usuario.';
        setDeleteUserStatus({ type: 'error', message });
      } finally {
        setDeletingUserId('');
      }
    },
    [mutate, mutateEditingDetail],
  );

  const handleOpenDealerPanel = React.useCallback(
    (dealerId: string) => {
      if (!editingOrgId || typeof window === 'undefined') return;
      const dealer = dealerMap.get(dealerId);
      if (!dealer) {
        setDealerStatusNotice({ type: 'error', message: 'No se encontró la ficha del dealer seleccionado.' });
        return;
      }

      const dealerMeta = (dealer.metadata || {}) as Record<string, any>;
      const brandFromMap = dealer.brand_id ? (brandMap.get(dealer.brand_id) || '') : '';
      const brandRecord = editingDetail?.brands?.find((brand) => brand.id === dealer.brand_id);
      const brandFromDetail = brandRecord?.name || '';
      const metaBrandCandidates = [
        dealerMeta.brand_label,
        dealerMeta.brand_name,
        dealerMeta.brand,
        dealerMeta.brand_display_name,
      ];
      const brandFromMeta = metaBrandCandidates
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .find((value) => value.length > 0) || '';
      const brandSlugCandidates = [
        brandRecord?.slug,
        typeof dealerMeta.brand_slug === 'string' ? dealerMeta.brand_slug : '',
        typeof dealerMeta.brandCode === 'string' ? dealerMeta.brandCode : '',
      ];
      const brandFromSlug = brandSlugCandidates
        .map((value) => (typeof value === 'string' ? humanizeSlug(value) : ''))
        .find((value) => value.length > 0) || '';
      const brandName = [brandFromDetail, brandFromMeta, brandFromMap, brandFromSlug]
        .map((value) => String(value || '').trim())
        .find((value) => value.length > 0) || '';
      const shouldLockBrand = brandName.length > 0;
      const locationMeta = (dealerMeta.location || {}) as Record<string, any>;
      const salesContactMeta = (dealerMeta.sales_contact || dealerMeta.contact || {}) as Record<string, any>;
      const normalizedAddress = String(dealerMeta.normalized_address || '').trim();
      const locationLabel =
        (locationMeta?.city && locationMeta?.state
          ? `${locationMeta.city}, ${locationMeta.state}`
          : locationMeta?.normalized) ||
        normalizedAddress ||
        dealer.address ||
        '';

      const contextPayload = {
        id: dealer.id,
        name: dealer.name || '',
        brandId: dealer.brand_id || '',
        brandName,
        address: dealer.address || '',
        normalizedAddress,
        location: locationLabel,
        city: locationMeta?.city ? String(locationMeta.city) : '',
        state: locationMeta?.state ? String(locationMeta.state) : '',
        postalCode: locationMeta?.postal_code ? String(locationMeta.postal_code) : '',
        contactName: salesContactMeta?.name ? String(salesContactMeta.name) : '',
        contactPhone: salesContactMeta?.phone ? String(salesContactMeta.phone) : '',
        serviceStartedAt: dealer.service_started_at || '',
        locked: shouldLockBrand,
      };

      const dealerUsers = (editingDetail?.users || []).filter((user) => {
        const assignedDealer = String(user?.dealer_location_id || '').trim();
        return assignedDealer && assignedDealer === dealer.id;
      });
      const dealerUsersPayload = dealerUsers.map((user) => {
        const meta = (user?.metadata || {}) as Record<string, any>;
        const contact = (meta?.contact || {}) as Record<string, any>;
        const phone =
          (typeof meta?.phone === 'string' && meta.phone.trim())
            ? meta.phone.trim()
            : (typeof contact?.phone === 'string' ? contact.phone.trim() : '');
        return {
          id: user?.id || '',
          email: user?.email || '',
          role: user?.role || '',
          phone,
          name: typeof meta?.name === 'string' ? meta.name.trim() : '',
          createdAt: user?.created_at || '',
          dealerAdmin: Boolean((user?.feature_flags || ({} as Record<string, any>)).dealer_admin),
        };
      });

      try {
        const storage = window.localStorage;
        storage.setItem('CORTEX_DEALER_ID', dealer.id);
        storage.setItem('CORTEX_DEALER_CONTEXT', JSON.stringify(contextPayload));
        storage.setItem('CORTEX_DEALER_USERS', JSON.stringify(dealerUsersPayload));
        storage.removeItem('CORTEX_DEALER_ADMIN_USER_ID');
        storage.removeItem('CORTEX_DEALER_ADMIN_EMAIL');
        storage.removeItem('CORTEX_SUPERADMIN_USER_ID');
        storage.removeItem('CORTEX_SUPERADMIN_EMAIL');
        if (shouldLockBrand) {
          storage.setItem('CORTEX_DEALER_CONTEXT_LOCKED', '1');
          storage.setItem('CORTEX_DEALER_ALLOWED_BRAND', brandName);
          window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: brandName }));
          persistAllowedBrands([brandName]);
          window.dispatchEvent(new CustomEvent('cortex:dealer_context_lock', { detail: true }));
        } else {
          storage.removeItem('CORTEX_DEALER_CONTEXT_LOCKED');
          storage.removeItem('CORTEX_DEALER_ALLOWED_BRAND');
          window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: '' }));
          persistAllowedBrands([]);
          window.dispatchEvent(new CustomEvent('cortex:dealer_context_lock', { detail: false }));
        }
        window.dispatchEvent(new CustomEvent('cortex:dealer_context', { detail: contextPayload }));
        window.dispatchEvent(new CustomEvent('cortex:dealer_users', { detail: dealerUsersPayload }));

        const target = new URL('/dealers', window.location.origin);
        target.searchParams.set('dealer', dealer.id);
        if (brandName) target.searchParams.set('brand', brandName);
        window.open(target.toString(), '_blank', 'noopener');
        setDealerStatusNotice({
          type: 'success',
          message: `Se abrió el panel del dealer ${dealer.name || dealer.id} en una pestaña nueva.`,
        });
      } catch {
        setDealerStatusNotice({ type: 'error', message: 'No se pudo abrir el panel del dealer en este navegador.' });
      }
    },
    [brandMap, dealerMap, editingDetail?.users, editingOrgId],
  );

  const handleDeleteOrganization = React.useCallback(async () => {
    if (!editingOrgId || !editingDetail?.organization) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`¿Eliminar la organización "${editingDetail.organization.name}" y todos sus dealers y usuarios asociados?`);
      if (!confirmed) return;
    }
    setDeletingOrg(true);
    setEditFeedback(null);
    try {
      await endpoints.adminDeleteOrganization(editingOrgId);
      setEditingOrgId('');
      await mutate();
      setPanelNotice({ type: 'success', message: 'Organización eliminada correctamente.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar la organización.';
      setEditFeedback({ type: 'error', message });
    } finally {
      setDeletingOrg(false);
    }
  }, [editingDetail?.organization, editingOrgId, mutate]);


  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedName = form.name.trim();
      if (!trimmedName) {
        setFeedback({ type: 'error', message: 'El nombre de la organización es obligatorio.' });
        return;
      }
      const trimmedEmail = form.superEmail.trim();
      const domain = trimmedEmail.includes('@') ? trimmedEmail.split('@')[1]?.toLowerCase() ?? '' : '';

      const metadata: Record<string, any> = { org_type: form.orgType };
      if (domain) metadata.superadmin_domain = domain;
      metadata.allow_dealer_creation = form.allowDealerCreation;
      const limitTrim = form.dealerLimit.trim();
      if (limitTrim) {
        const limitNum = Number(limitTrim);
        if (!Number.isFinite(limitNum) || limitNum <= 0) {
          setFeedback({ type: 'error', message: 'Define un límite de dealers válido mayor a cero o deja el campo en blanco.' });
          setLoading(false);
          return;
        }
        metadata.dealer_creation_limit = limitNum;
      } else {
        delete metadata.dealer_creation_limit;
      }
      const promptKey = form.promptProfile.trim();
      if (promptKey) {
        metadata.prompt_profile = toSlug(promptKey);
      } else {
        delete metadata.prompt_profile;
      }

      const payload: Record<string, any> = {
        name: trimmedName,
        package: form.package,
        metadata,
      };
      if (trimmedEmail) {
        payload.superadmin = {
          email: trimmedEmail,
          phone: form.superPhone.trim() || undefined,
        };
      }

      setLoading(true);
      setFeedback(null);
      try {
        if (form.orgType === 'grupo') {
          for (const brandId of form.brands) {
            const limitRaw = (form.brandLimits[brandId] || '').trim();
            if (!limitRaw) {
              setLoading(false);
              setFeedback({ type: 'error', message: 'Define el límite de dealers para cada marca seleccionada.' });
              return;
            }
            const limitNum = Number(limitRaw);
            if (!Number.isFinite(limitNum) || limitNum <= 0) {
              setLoading(false);
              setFeedback({ type: 'error', message: `El límite de dealers para la marca seleccionada debe ser mayor a cero.` });
              return;
            }
          }
        }
        const response = await endpoints.adminCreateOrganization(payload);
        let newOrgId: string | null = null;
        if (response && typeof response === 'object') {
          if ((response as any)?.organization?.id) newOrgId = String((response as any).organization.id);
          else if ((response as any)?.id) newOrgId = String((response as any).id);
        }
        if (!newOrgId) {
          const refreshed = await mutate();
          const latest = (refreshed?.organizations || []).find((org) => org.name === trimmedName);
          if (latest) newOrgId = latest.id;
        }

        if (newOrgId && form.brands.length) {
          for (const brandId of form.brands) {
            const label = brandMap.get(brandId);
            const brandName = label || brandId;
            const slug = toSlug(brandName);
            const brandLimitRaw = (form.brandLimits[brandId] || '').trim();
            const brandLimit = brandLimitRaw ? Number(brandLimitRaw) : null;
            if (brandLimitRaw && (!Number.isFinite(brandLimit) || (brandLimit as number) <= 0)) {
              setLoading(false);
              setFeedback({ type: 'error', message: `El límite definido para ${brandName} no es válido.` });
              return;
            }
            try {
              await endpoints.adminCreateBrand(newOrgId, {
                name: brandName,
                slug: slug || undefined,
                metadata: label ? { source_brand_id: brandId } : undefined,
                dealer_limit: brandLimit ?? undefined,
              });
            } catch (brandErr) {
              console.warn('No se pudo asignar la marca', brandName, brandErr);
            }
          }
          await mutate();
        } else {
          await mutate();
        }
        setForm({ ...EMPTY_FORM });
        setFeedback({ type: 'success', message: 'Organización creada. Revisa tu bandeja para ver credenciales.' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo crear la organización.';
        setFeedback({ type: 'error', message });
      } finally {
        setLoading(false);
      }
    },
    [form, mutate, brandMap],
  );

  const handleEditSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editingOrgId || !editingDetail?.organization) {
        setEditFeedback({ type: 'error', message: 'Selecciona una organización para editar.' });
        return;
      }
      const org = editingDetail.organization;
      const trimmedName = editForm.name.trim();
      if (!trimmedName) {
        setEditFeedback({ type: 'error', message: 'El nombre interno es obligatorio.' });
        return;
      }
      const trimmedDisplay = editForm.displayName.trim();
      const payload: Record<string, any> = {};
      let hasChanges = false;
      if (trimmedName !== org.name) {
        payload.name = trimmedName;
        hasChanges = true;
      }
      const currentDisplay = (org.display_name || '').trim();
      if (trimmedDisplay !== currentDisplay) {
        payload.display_name = trimmedDisplay || null;
        hasChanges = true;
      }
      if (editForm.package !== org.package) {
        payload.package = editForm.package;
        hasChanges = true;
      }

      const originalMetadata = (org.metadata || {}) as Record<string, any>;
      const metadata = { ...originalMetadata } as Record<string, any>;
      metadata.org_type = editForm.orgType;
      metadata.allow_dealer_creation = editForm.allowDealerCreation;
      const limitTrim = editForm.dealerLimit.trim();
      if (limitTrim) {
        const limitNum = Number(limitTrim);
        if (!Number.isFinite(limitNum) || limitNum <= 0) {
          setEditFeedback({ type: 'error', message: 'Define un límite de dealers válido mayor a cero o deja el campo en blanco.' });
          return;
        }
        metadata.dealer_creation_limit = limitNum;
      } else {
        delete metadata.dealer_creation_limit;
      }
      const promptKey = editForm.promptProfile.trim();
      if (promptKey) {
        metadata.prompt_profile = toSlug(promptKey);
      } else {
        delete metadata.prompt_profile;
      }

      const metadataChanged = JSON.stringify(metadata) !== JSON.stringify(originalMetadata || {});
      if (metadataChanged) {
        payload.metadata = metadata;
        hasChanges = true;
      }

      if (!hasChanges) {
        setEditFeedback({ type: 'error', message: 'No hay cambios para guardar.' });
        return;
      }

      setEditSaving(true);
      setEditFeedback(null);
      try {
        await endpoints.adminUpdateOrganization(editingOrgId, payload);
        await Promise.all([mutate(), mutateEditingDetail()]);
        setEditFeedback({ type: 'success', message: 'Organización actualizada correctamente.' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo actualizar la organización.';
        setEditFeedback({ type: 'error', message });
      } finally {
        setEditSaving(false);
      }
    },
    [editForm, editingDetail?.organization, editingOrgId, mutate, mutateEditingDetail],
  );

  React.useEffect(() => {
    setBrandLimitDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const brand of editingDetail?.organization ? editingDetail.brands ?? [] : []) {
        if (!brand?.id) continue;
        if (Object.prototype.hasOwnProperty.call(prev, brand.id)) {
          next[brand.id] = prev[brand.id];
        }
      }
      return next;
    });
  }, [editingDetail?.brands, editingDetail?.organization]);

  const editSection = editingOrgId ? (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff', display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Editar organización</h2>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
            Ajusta los datos básicos y la configuración de creación de dealers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditingOrgId('')}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontWeight: 600, cursor: 'pointer' }}
        >
          Cerrar
        </button>
      </header>
      {editingLoading ? (
        <p style={{ fontSize: 12, color: '#64748b' }}>Cargando información de la organización…</p>
      ) : editingError ? (
        <p style={{ fontSize: 12, color: '#dc2626' }}>No se pudo cargar el detalle de la organización.</p>
          ) : editingDetail?.organization ? (
            <form onSubmit={handleEditSubmit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Nombre interno *
              <input
                value={editForm.name}
                onChange={(event) => updateEditField('name', event.target.value)}
                placeholder="Nombre de la organización"
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Nombre comercial
              <input
                value={editForm.displayName}
                onChange={(event) => updateEditField('displayName', event.target.value)}
                placeholder="Nombre visible"
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Paquete
              <select
                value={editForm.package}
                onChange={(event) => updateEditField('package', event.target.value as OrgPackage)}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
              >
                <option value="marca">Marca</option>
                <option value="black_ops">Black Ops</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Tipo de organización
              <select
                value={editForm.orgType}
                onChange={(event) => updateEditField('orgType', event.target.value as OrgType)}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
              >
                <option value="oem">OEM / Marca</option>
                <option value="grupo">Grupo dealer</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Perfil de prompt
              <input
                value={editForm.promptProfile}
                onChange={(event) => updateEditField('promptProfile', event.target.value)}
                placeholder="ej. nissan"
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5', fontFamily: 'monospace' }}
              />
              <span style={{ fontSize: 11, color: '#64748b' }}>
                Ajusta la clave que determinará qué archivos de prompt personalizados se cargan para esta organización.
              </span>
            </label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={editForm.allowDealerCreation}
              onChange={(event) => updateEditField('allowDealerCreation', event.target.checked)}
            />
            Permitir que la organización cree dealers
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, maxWidth: 240 }}>
            Límite de dealers permitidos
            <input
              value={editForm.dealerLimit}
              onChange={(event) => updateEditField('dealerLimit', event.target.value)}
              placeholder="Ej. 10"
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
            />
            <span style={{ fontSize: 11, color: '#64748b' }}>Deja en blanco para eliminar el límite.</span>
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="submit"
              disabled={editSaving}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #2563eb',
                background: editSaving ? '#cbd5f5' : '#2563eb',
                color: editSaving ? '#475569' : '#fff',
                fontWeight: 600,
                cursor: editSaving ? 'default' : 'pointer',
              }}
            >
              {editSaving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={() => {
                hydrateEditForm();
                setEditFeedback(null);
              }}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >
              Restablecer valores
            </button>
          </div>
              {editFeedback ? (
                <p style={{ fontSize: 12, color: editFeedback.type === 'success' ? '#047857' : '#dc2626' }}>{editFeedback.message}</p>
              ) : null}
            </form>
          ) : null}

          {editingDetail ? (
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Marcas autorizadas ({editingDetail?.brands?.length ?? 0})</div>
              {availableBrandOptionsEdit.length ? (
                <form onSubmit={async (event) => {
                  event.preventDefault();
                  if (!editingOrgId) return;
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
                    await endpoints.adminCreateBrand(editingOrgId, {
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
                    await mutateEditingDetail();
                    await mutate();
                  } catch (err) {
                    const message = err instanceof Error ? err.message : 'No se pudo agregar la marca.';
                    setBrandFormStatus({ type: 'error', message });
                  } finally {
                    setBrandFormLoading(false);
                  }
                }}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
                >
                  <select
                    value={brandForm.brandId}
                    onChange={(event) => {
                      setBrandForm((prev) => ({ ...prev, brandId: event.target.value }));
                      setBrandFormStatus(null);
                    }}
                    style={{ minWidth: 220, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                  >
                    <option value="">Marca del catálogo…</option>
                    {availableBrandOptionsEdit.map((option) => (
                      <option key={option.label} value={option.label}>
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
                    {editingDetail.brands.map((brand) => {
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

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Dealers ({editingDetail.dealers?.length ?? 0})</div>
                {editingDetail.brands?.length ? (
                  <form onSubmit={handleCreateDealer} style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                      <select
                        value={dealerForm.brandId}
                        onChange={(event) => {
                          setDealerForm((prev) => ({ ...prev, brandId: event.target.value }));
                          setDealerFormStatus(null);
                        }}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      >
                        <option value="">Marca…</option>
                        {editingDetail.brands.map((brand) => (
                          <option key={brand.id} value={brand.id}>
                            {brand.name}
                          </option>
                        ))}
                      </select>
                      <input
                        value={dealerForm.name}
                        onChange={(event) => {
                          setDealerForm((prev) => ({ ...prev, name: event.target.value }));
                          setDealerFormStatus(null);
                        }}
                        placeholder="Nombre del dealer"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                      <input
                        value={dealerForm.address}
                        onChange={(event) => {
                          setDealerForm((prev) => ({ ...prev, address: event.target.value }));
                          setDealerFormStatus(null);
                        }}
                        placeholder="Dirección completa"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                      <input
                        value={dealerForm.city}
                        onChange={(event) => setDealerForm((prev) => ({ ...prev, city: event.target.value }))}
                        placeholder="Ciudad"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                      <input
                        value={dealerForm.state}
                        onChange={(event) => setDealerForm((prev) => ({ ...prev, state: event.target.value }))}
                        placeholder="Estado"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                      <input
                        value={dealerForm.postalCode}
                        onChange={(event) => setDealerForm((prev) => ({ ...prev, postalCode: event.target.value }))}
                        placeholder="Código postal"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                      <input
                        value={dealerForm.contactName}
                        onChange={(event) => setDealerForm((prev) => ({ ...prev, contactName: event.target.value }))}
                        placeholder="Asesor responsable"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                      <input
                        value={dealerForm.contactPhone}
                        onChange={(event) => setDealerForm((prev) => ({ ...prev, contactPhone: event.target.value }))}
                        placeholder="Teléfono asesor"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                      <input
                        type="date"
                        value={dealerForm.serviceStartedAt}
                        onChange={(event) => setDealerForm((prev) => ({ ...prev, serviceStartedAt: event.target.value }))}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="submit"
                        disabled={dealerFormLoading}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid #047857',
                          background: dealerFormLoading ? '#bbf7d0' : '#047857',
                          color: '#fff',
                          fontWeight: 600,
                          cursor: dealerFormLoading ? 'default' : 'pointer',
                        }}
                      >
                        {dealerFormLoading ? 'Creando…' : 'Agregar dealer'}
                      </button>
                      {dealerFormStatus ? (
                        <span style={{ fontSize: 12, color: dealerFormStatus.type === 'success' ? '#047857' : '#dc2626' }}>
                          {dealerFormStatus.message}
                        </span>
                      ) : null}
                    </div>
                  </form>
                ) : (
                  <p style={{ fontSize: 12, color: '#64748b' }}>Agrega al menos una marca para habilitar el alta de dealers.</p>
                )}

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ background: '#f8fafc' }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Dealer</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Marca</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Servicio desde</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Estado</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingDetail.dealers?.length ? (
                        editingDetail.dealers.map((dealer) => {
                          const brandName = dealer.brand_id ? brandMap.get(dealer.brand_id) || dealer.brand_id : '—';
                          const isPaused = (dealer.status || '').toLowerCase() === 'paused';
                          const isUpdating = dealerStatusUpdating === dealer.id;
                          return (
                            <tr key={dealer.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 10px', fontWeight: 600 }}>{dealer.name || '—'}</td>
                              <td style={{ padding: '6px 10px' }}>{brandName}</td>
                              <td style={{ padding: '6px 10px' }}>{formatDate(dealer.service_started_at)}</td>
                              <td style={{ padding: '6px 10px' }}>{isPaused ? 'Pausado' : 'Activo'}</td>
                              <td style={{ padding: '6px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleDealerStatus(dealer.id, dealer.status)}
                                  disabled={isUpdating}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #0f172a',
                                    background: isPaused ? '#0f172a' : '#f87171',
                                    color: '#fff',
                                    fontWeight: 600,
                                    cursor: isUpdating ? 'default' : 'pointer',
                                  }}
                                >
                                  {isUpdating ? 'Actualizando…' : isPaused ? 'Reactivar' : 'Pausar'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDealerPanel(dealer.id)}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #2563eb',
                                    background: '#fff',
                                    color: '#2563eb',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Abrir panel
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} style={{ padding: '8px 10px', color: '#64748b' }}>
                            Aún no hay dealers registrados para esta organización.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {dealerStatusNotice ? (
                  <p style={{ fontSize: 12, color: dealerStatusNotice.type === 'success' ? '#047857' : '#dc2626' }}>{dealerStatusNotice.message}</p>
                ) : null}
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Usuarios ({editingDetail.users?.length ?? 0})</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ background: '#f8fafc' }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Usuario</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Rol</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Asignación</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingDetail.users?.length ? (
                        editingDetail.users.map((user) => {
                          const dealer = user.dealer_location_id ? dealerMap.get(user.dealer_location_id) : null;
                          const featureFlags = (user.feature_flags || {}) as Record<string, any>;
                          const dealerAdminFlag = featureFlags?.dealer_admin;
                          const isDealerAdmin = dealerAdminFlag === true
                            || dealerAdminFlag === 'all'
                            || dealerAdminFlag === 'full'
                            || dealerAdminFlag === 'admin';
                          const roleLabel = user.role === 'superadmin_oem'
                            ? 'Superadmin OEM'
                            : isDealerAdmin
                              ? 'Administrador OEM'
                              : 'Usuario OEM';
                          const assignment = dealer
                            ? `Dealer: ${dealer.name || dealer.id}`
                            : user.brand_id
                              ? `Marca: ${brandMap.get(user.brand_id) || user.brand_id}`
                              : 'OEM';
                          const isDeleting = deletingUserId === user.id;
                          return (
                            <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{user.email || user.id}</td>
                              <td style={{ padding: '6px 10px' }}>{roleLabel}</td>
                              <td style={{ padding: '6px 10px' }}>{assignment}</td>
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
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} style={{ padding: '8px 10px', color: '#64748b' }}>
                            Aún no se registran usuarios para esta organización.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {deleteUserStatus ? (
                  <p style={{ fontSize: 12, color: deleteUserStatus.type === 'success' ? '#047857' : '#dc2626' }}>{deleteUserStatus.message}</p>
                ) : null}
                <form onSubmit={handleCreateUser} style={{ display: 'grid', gap: 10 }} suppressHydrationWarning>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Correo corporativo
                      <input
                        value={userForm.email}
                        onChange={(event) => {
                          setUserForm((prev) => ({ ...prev, email: event.target.value }));
                          setUserFormStatus(null);
                        }}
                        placeholder={orgDomain ? `usuario@${orgDomain}` : 'usuario@empresa.com'}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', fontFamily: 'monospace' }}
                      />
                      {orgDomain ? (
                        <span style={{ fontSize: 11, color: '#64748b' }}>Debe terminar en @{orgDomain}</span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#64748b' }}>Usa el dominio corporativo de la OEM.</span>
                      )}
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Nombre completo (opcional)
                      <input
                        value={userForm.name}
                        onChange={(event) => {
                          setUserForm((prev) => ({ ...prev, name: event.target.value }));
                          setUserFormStatus(null);
                        }}
                        placeholder="Nombre y apellidos"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Teléfono de contacto (opcional)
                      <input
                        value={userForm.phone}
                        onChange={(event) => {
                          setUserForm((prev) => ({ ...prev, phone: event.target.value }));
                          setUserFormStatus(null);
                        }}
                        placeholder="+52 ..."
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Rol
                      <select
                        value={userForm.uiRole}
                        onChange={(event) => {
                          const value = event.target.value as typeof userForm.uiRole;
                          setUserForm((prev) => ({ ...prev, uiRole: value }));
                          setUserFormStatus(null);
                        }}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      >
                        <option value="superadmin_oem">Superadmin OEM · control total</option>
                        <option value="oem_admin">Administrador OEM · gestiona dealers</option>
                        <option value="oem_viewer">Usuario OEM · solo consulta</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
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
                  </div>
                </form>
              </div>

              <div style={{ borderTop: '1px solid #fee2e2', paddingTop: 16 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#b91c1c' }}>
                  Esta acción eliminará permanentemente la organización, marcas, dealers y usuarios asociados.
                </p>
                <button
                  type="button"
                  onClick={handleDeleteOrganization}
                  disabled={deletingOrg}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #dc2626',
                    background: deletingOrg ? '#fecaca' : '#fee2e2',
                    color: '#b91c1c',
                    fontWeight: 600,
                    cursor: deletingOrg ? 'default' : 'pointer',
                  }}
                >
                  {deletingOrg ? 'Eliminando…' : 'Eliminar organización'}
                </button>
              </div>
            </div>
          ) : null}
    </section>
  ) : null;

  return (
    <main style={{ display: 'grid', gap: 24, padding: 24 }}>
      <section style={{ display: 'grid', gap: 8 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>Control de organizaciones</h1>
        <p style={{ margin: 0, color: '#475569', maxWidth: 720 }}>
          Crea organizaciones OEM y grupos dealer. Cada OEM puede asignar superadmins y dar de alta dealers dentro del
          límite definido.
        </p>
      </section>

      {panelNotice ? (
        <p style={{ margin: 0, fontSize: 12, color: panelNotice.type === 'success' ? '#047857' : '#dc2626' }}>{panelNotice.message}</p>
      ) : null}

      <section style={{ display: 'grid', gap: 12, border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Alta de organización</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              Selecciona un preset y captura los datos básicos del superadmin OEM.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #2563eb',
                  background: form.package === preset.package && form.orgType === preset.orgType ? '#dbeafe' : '#fff',
                  color: '#1d4ed8',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </header>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Nombre interno *
              <input
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Nombre de la organización"
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Paquete
              <select
                value={form.package}
                onChange={(event) => updateField('package', event.target.value as OrgPackage)}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
              >
                <option value="marca">Marca</option>
                <option value="black_ops">Black Ops</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Tipo de organización
              <select
                value={form.orgType}
                onChange={(event) => updateField('orgType', event.target.value as OrgType)}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
              >
                <option value="oem">OEM / Marca</option>
                <option value="grupo">Grupo dealer</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Correo superadmin
              <input
                value={form.superEmail}
                onChange={(event) => updateField('superEmail', event.target.value)}
                placeholder="superadmin@compania.com"
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5', fontFamily: 'monospace' }}
              />
              <span style={{ fontSize: 11, color: '#64748b' }}>Todos los usuarios OEM deberán usar este dominio.</span>
            </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Teléfono superadmin
            <input
              value={form.superPhone}
              onChange={(event) => updateField('superPhone', event.target.value)}
              placeholder="+52 ..."
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Perfil de prompt
            <input
              value={form.promptProfile}
              onChange={(event) => updateField('promptProfile', event.target.value)}
              placeholder="ej. nissan"
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5', fontFamily: 'monospace' }}
            />
            <span style={{ fontSize: 11, color: '#64748b' }}>
              Define la clave que buscará los archivos <code>prompt_*</code> personalizados. Usa minúsculas sin espacios.
            </span>
          </label>
        </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Marcas disponibles</span>
            <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', maxHeight: 220, overflowY: 'auto', padding: 8, border: '1px solid #e2e8f0', borderRadius: 8 }}>
              {brandOptions.map((brand) => {
                const checked = form.brands.includes(brand.id);
                return (
                  <label key={`${brand.id}_${brand.name}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const isChecked = event.target.checked;
                        setForm((prev) => {
                          const nextBrands = isChecked
                            ? [...prev.brands, brand.id]
                            : prev.brands.filter((value) => value !== brand.id);
                          const nextLimits = { ...prev.brandLimits };
                          if (!isChecked) {
                            delete nextLimits[brand.id];
                          }
                          return { ...prev, brands: nextBrands, brandLimits: nextLimits };
                        });
                        setFeedback(null);
                      }}
                    />
                    {brand.name}
                  </label>
                );
              })}
              {!brandOptions.length ? (
                <span style={{ fontSize: 12, color: '#64748b' }}>No hay marcas en catálogo. Agrega marcas globales desde el backend.</span>
              ) : null}
            </div>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              Selecciona las marcas que esta organización puede gestionar. Puedes ajustarlas después desde la ficha de detalle.
            </span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={form.allowDealerCreation}
              onChange={(event) => updateField('allowDealerCreation', event.target.checked)}
            />
            Permitir que la organización cree dealers
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, maxWidth: 240 }}>
            Límite de dealers permitidos
            <input
              value={form.dealerLimit}
              onChange={(event) => updateField('dealerLimit', event.target.value)}
              placeholder="Ej. 10"
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
            />
            <span style={{ fontSize: 11, color: '#64748b' }}>Deja en blanco para eliminar el límite.</span>
          </label>
          {form.orgType === 'grupo' && form.brands.length ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Límites por marca seleccionada</span>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {form.brands.map((brandId) => {
                  const label = brandMap.get(brandId) || brandId;
                  const value = form.brandLimits[brandId] || '';
                  return (
                    <label key={`brand-limit-${brandId}`} style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      {label}
                      <input
                        value={value}
                        onChange={(event) => {
                          const raw = event.target.value;
                          setForm((prev) => ({
                            ...prev,
                            brandLimits: { ...prev.brandLimits, [brandId]: raw },
                          }));
                          setFeedback(null);
                        }}
                        placeholder="Ej. 3"
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                  );
                })}
              </div>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                Define la cantidad máxima de dealers disponibles por marca en este grupo.
              </span>
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #2563eb',
                background: loading ? '#cbd5f5' : '#2563eb',
                color: loading ? '#475569' : '#fff',
                fontWeight: 600,
                cursor: loading ? 'default' : 'pointer',
              }}
            >
              {loading ? 'Creando…' : 'Crear organización'}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm({ ...EMPTY_FORM });
                setFeedback(null);
              }}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >
              Limpiar
            </button>
          </div>
          {feedback ? (
            <p style={{ fontSize: 12, color: feedback.type === 'success' ? '#047857' : '#dc2626' }}>{feedback.message}</p>
          ) : null}
        </form>
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff', display: 'grid', gap: 12 }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Organizaciones registradas</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>OEM: {oemCount} · Grupos dealer: {dealerCount}</p>
          </div>
        </header>
        {isLoading ? (
          <p style={{ fontSize: 12, color: '#64748b' }}>Cargando organizaciones…</p>
        ) : error ? (
          <p style={{ fontSize: 12, color: '#dc2626' }}>No se pudo cargar el listado.</p>
        ) : organizations.length === 0 ? (
          <p style={{ fontSize: 12, color: '#64748b' }}>Aún no has creado organizaciones.</p>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {['oem', 'grupo'].map((group) => {
              const items = organizations.filter((org) => organizationType(org.metadata) === group);
              if (!items.length) return null;
              return (
                <div key={`group-${group}`} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  <header style={{ background: '#f8fafc', padding: '10px 12px', fontWeight: 600, fontSize: 13 }}>
                    {group === 'oem' ? 'OEM / Marca' : 'Grupos dealer'} ({items.length})
                  </header>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Nombre</th>
                          <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Paquete</th>
                          <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Creación</th>
                          <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((org) => (
                          <tr key={org.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{org.name}</td>
                            <td style={{ padding: '8px 10px' }}>{org.package === 'black_ops' ? 'Black Ops' : 'Marca'}</td>
                            <td style={{ padding: '8px 10px' }}>{formatDate(org.created_at)}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <button
                                type="button"
                                onClick={() => setEditingOrgId((prev) => (prev === org.id ? '' : org.id))}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  border: editingOrgId === org.id ? '1px solid #1d4ed8' : '1px solid #2563eb',
                                  background: editingOrgId === org.id ? '#dbeafe' : '#fff',
                                  color: '#1d4ed8',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                {editingOrgId === org.id ? 'Editar (abierto)' : 'Editar'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editSection}
    </main>
  );
}
