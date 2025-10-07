"use client";

import React from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR, { mutate as globalMutate } from 'swr';
import { endpoints } from '@/lib/api';

const SUPERADMIN_TOKEN_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPERADMIN_TOKEN);

type OrganizationSummary = {
  id: string;
  name: string;
  package: string;
  status?: string;
  paused_at?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  brand_count: number;
  dealer_count: number;
  user_count: number;
  oem_superadmins: number;
  dealer_users: number;
};

type AdminOverviewResponse = {
  organizations: OrganizationSummary[];
};

type BrandInfo = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  dealer_count: number;
};

type DealerInfo = {
  id: string;
  brand_id: string;
  name: string;
  address?: string | null;
  metadata?: Record<string, any> | null;
  status: 'active' | 'paused';
  paused_at?: string | null;
  service_started_at: string;
  billing_notes?: string | null;
  last_payment_at?: string | null;
  last_event_type?: string | null;
  last_event_at?: string | null;
  last_event_amount?: number | null;
  last_event_currency?: string | null;
  last_event_notes?: string | null;
  created_at: string;
  updated_at: string;
};

type DealerBillingEventType = 'payment' | 'charge' | 'pause' | 'resume' | 'note' | 'activation';

type DealerBillingEvent = {
  id: string;
  dealer_id: string;
  event_type: DealerBillingEventType;
  amount?: number | null;
  currency?: string | null;
  notes?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  recorded_by?: string | null;
  recorded_by_email?: string | null;
};

type DealerBillingDetail = {
  dealer_id: string;
  events: DealerBillingEvent[];
};

type DealerSummaryRow = {
  id: string;
  name: string;
  status: 'active' | 'paused';
  paused_at?: string | null;
  service_started_at?: string | null;
  last_payment_at?: string | null;
  last_event_type?: string | null;
  last_event_at?: string | null;
  last_event_amount?: number | null;
  last_event_currency?: string | null;
  days_since_payment?: number | null;
  days_since_event?: number | null;
  days_paused?: number | null;
  billing_notes?: string | null;
};

type DealerSummary = {
  totals: {
    dealers: number;
    active: number;
    paused: number;
  };
  rows: DealerSummaryRow[];
};

type AdminBrand = {
  id: string | null;
  name: string;
  slug: string;
  logo_url?: string | null;
  metadata?: Record<string, any> | null;
  organization_id: string | null;
  organization_name: string | null;
  dealer_count: number;
  created_at: string | null;
  updated_at: string | null;
};

type AdminBrandListResponse = {
  brands: AdminBrand[];
};

type BrandAssignSelectionState = {
  brandId: string;
  limit: string;
  source: 'existing' | 'catalog';
  name: string;
  slug: string;
  orgName: string | null;
  optionValue: string;
};

const EMPTY_BRAND_ASSIGN_SELECTION: BrandAssignSelectionState = {
  brandId: '',
  limit: '',
  source: 'existing',
  name: '',
  slug: '',
  orgName: null,
  optionValue: '',
};

type BrandOption = {
  value: string;
  brand: AdminBrand;
  slug: string;
  assignedOrgId: string | null;
  assignedOrgName: string | null;
};

type FeatureLevel = 'none' | 'view' | 'edit';

const FEATURE_LEVEL_OPTIONS: { value: FeatureLevel; label: string }[] = [
  { value: 'edit', label: 'Edición' },
  { value: 'view', label: 'Lectura' },
  { value: 'none', label: 'Bloqueado' },
];

const FEATURE_KEY_DEFS: { key: string; label: string; description: string }[] = [
  { key: 'compare', label: 'Comparador', description: 'Acceso para ejecutar comparativos y análisis base.' },
  { key: 'insights', label: 'Insights IA', description: 'Permite generar guiones y resúmenes con IA.' },
  { key: 'dashboard', label: 'Dashboard OEM', description: 'Visibilidad de tableros y reportes del panel OEM.' },
  { key: 'catalog_admin', label: 'Catálogo', description: 'Gestiona datos del catálogo (precios, versiones, alias).' },
  { key: 'prompt_edit', label: 'Prompts', description: 'Editar prompts y plantillas de generación.' },
  { key: 'body_style_edit', label: 'Body styles', description: 'Crear/reacomodar body styles personalizados.' },
  { key: 'openai_keys', label: 'Llaves OpenAI', description: 'Administrar llaves OpenAI y costos asociados.' },
];

const FEATURE_LEVEL_LABEL: Record<FeatureLevel, string> = {
  edit: 'Edición',
  view: 'Lectura',
  none: 'Bloqueado',
};

const FEATURE_LEVEL_STYLES: Record<FeatureLevel, { background: string; color: string }> = {
  edit: { background: '#dcfce7', color: '#166534' },
  view: { background: '#e0f2fe', color: '#0c4a6e' },
  none: { background: '#f1f5f9', color: '#475569' },
};

type UserInfo = {
  id: string;
  email?: string | null;
  role: string;
  brand_id?: string | null;
  dealer_location_id?: string | null;
  feature_flags?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  template_count: number;
};

type AdminOrganizationResponse = {
  organization: {
    id: string;
    name: string;
    display_name?: string | null;
    legal_name?: string | null;
    tax_id?: string | null;
    package: string;
    status?: string;
    paused_at?: string | null;
    billing_email?: string | null;
    billing_phone?: string | null;
    billing_address?: Record<string, any> | null;
    contact_info?: Record<string, any> | null;
    metadata?: Record<string, any> | null;
    created_at: string;
    updated_at: string;
  };
  brands: BrandInfo[];
  dealers: DealerInfo[];
  users: UserInfo[];
  dealer_billing?: DealerBillingDetail;
  dealer_summary?: DealerSummary;
  created_user?: {
    id: string;
    email?: string | null;
    role: string;
    feature_flags?: Record<string, any> | null;
    metadata?: Record<string, any> | null;
    temp_password?: string;
  };
};

type OrgFormState = {
  name: string;
  package: 'marca' | 'black_ops';
  orgType: 'oem' | 'dealer_group';
  displayName: string;
  legalName: string;
  taxId: string;
  billingEmail: string;
  billingPhone: string;
  billingLine1: string;
  billingLine2: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  contactName: string;
  contactPhone: string;
  metadataNotes: string;
  superEmail: string;
  superPassword: string;
  superName: string;
  superPhone: string;
};

const emptyOrgForm: OrgFormState = {
  name: '',
  package: 'marca',
  orgType: 'oem',
  displayName: '',
  legalName: '',
  taxId: '',
  billingEmail: '',
  billingPhone: '',
  billingLine1: '',
  billingLine2: '',
  billingCity: '',
  billingState: '',
  billingZip: '',
  billingCountry: '',
  contactName: '',
  contactPhone: '',
  metadataNotes: '',
  superEmail: '',
  superPassword: '',
  superName: '',
  superPhone: '',
};

type OrgEditState = {
  name: string;
  displayName: string;
  legalName: string;
  taxId: string;
  billingEmail: string;
  billingPhone: string;
  billingLine1: string;
  billingLine2: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  contactName: string;
  contactPhone: string;
  metadataNotes: string;
};

const emptyOrgEdit: OrgEditState = {
  name: '',
  displayName: '',
  legalName: '',
  taxId: '',
  billingEmail: '',
  billingPhone: '',
  billingLine1: '',
  billingLine2: '',
  billingCity: '',
  billingState: '',
  billingZip: '',
  billingCountry: '',
  contactName: '',
  contactPhone: '',
  metadataNotes: '',
};

type OrgUserFormState = {
  email: string;
  name: string;
  phone: string;
  role: 'oem_user' | 'superadmin_oem';
  dealerAdmin: boolean;
};

const emptyOrgUserForm: OrgUserFormState = {
  email: '',
  name: '',
  phone: '',
  role: 'oem_user',
  dealerAdmin: false,
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatCurrency(amount?: number | null, currency?: string | null) {
  if (amount === null || amount === undefined) return '—';
  const curr = currency || 'MXN';
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: curr,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${curr}`;
  }
}

const roleLabels: Record<string, string> = {
  superadmin_global: 'Superadmin global',
  superadmin_oem: 'Superadmin OEM',
  oem_user: 'Usuario OEM',
  dealer_user: 'Usuario dealer',
};

const billingEventLabels: Record<DealerBillingEventType, string> = {
  payment: 'Pago',
  charge: 'Cargo',
  pause: 'Pausa',
  resume: 'Reactivación',
  note: 'Nota',
  activation: 'Activación',
};

function slugify(input: string): string {
  const base = String(input || '').trim();
  if (!base) return 'brand';
  try {
    return base
      .normalize('NFD')
      .replace(/\p{Diacritic}+/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'brand';
  } catch {
    return base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'brand';
  }
}

function toTitleCase(value: string): string {
  const base = String(value || '').trim();
  if (!base) return '';
  const lower = base.toLowerCase();
  return lower.replace(/(^|\s|[-_/])(\p{L})/gu, (match, p1, p2) => `${p1}${p2.toUpperCase()}`);
}

function normalizeBrandName(value: string): string {
  const base = String(value || '').trim();
  if (!base) return '';
  const isAllCaps = base === base.toUpperCase();
  if (isAllCaps) {
    if (base.length <= 4) return base;
    if (/^[A-Z0-9\s&.-]+$/.test(base)) {
      return toTitleCase(base);
    }
  }
  return base;
}

function normalizeFeatureLevel(value: any): FeatureLevel {
  if (value === 'edit' || value === 'view' || value === 'none') return value;
  if (value === true || value === 'enabled' || value === 'full' || value === 'yes') return 'edit';
  if (value === 'read' || value === 'readonly') return 'view';
  if (value === false || value === 'false' || value === 'disabled' || value === 'off') return 'none';
  if (value === null || value === undefined) return 'edit';
  return 'edit';
}

function extractFeatureLevels(flags?: Record<string, any> | null): Record<string, FeatureLevel> {
  const levels: Record<string, FeatureLevel> = {};
  for (const { key } of FEATURE_KEY_DEFS) {
    levels[key] = normalizeFeatureLevel(flags?.[key]);
  }
  return levels;
}

export default function AdminPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const impersonateOrgId = searchParams?.get('org') || '';
  const isOemView = searchParams?.get('view') === 'oem';
  const canManageBrandDistribution = !isOemView;
  const canManageDealers = isOemView;
  const canManageBilling = !isOemView;
  const { data, error, isLoading, mutate: mutateOverview } = useSWR<AdminOverviewResponse>('admin_overview', endpoints.adminOverview);
  const [selectedOrg, setSelectedOrg] = React.useState<string | null>(null);
  const [updatingPackage, setUpdatingPackage] = React.useState(false);
  const [updateError, setUpdateError] = React.useState<string>('');
  const [showBrandForm, setShowBrandForm] = React.useState(false);
  const [brandForm, setBrandForm] = React.useState({ name: '', slug: '', logoUrl: '', aliases: '', dealerLimit: '' });
  const [brandLoading, setBrandLoading] = React.useState(false);
  const [brandError, setBrandError] = React.useState('');
  const [brandAssignSelection, setBrandAssignSelection] = React.useState<BrandAssignSelectionState>(() => ({ ...EMPTY_BRAND_ASSIGN_SELECTION }));
  const [brandAssignLoading, setBrandAssignLoading] = React.useState(false);
  const [brandAssignError, setBrandAssignError] = React.useState('');
  const [brandTransferLoading, setBrandTransferLoading] = React.useState<string | null>(null);
  const [brandTransferError, setBrandTransferError] = React.useState('');
  const [brandTransferDraft, setBrandTransferDraft] = React.useState<Record<string, string>>({});
  const [brandLimitDrafts, setBrandLimitDrafts] = React.useState<Record<string, string>>({});
  const [brandLimitSaving, setBrandLimitSaving] = React.useState<string | null>(null);
  const [brandLimitError, setBrandLimitError] = React.useState('');
  const [showOrgForm, setShowOrgForm] = React.useState(false);
  const [orgForm, setOrgForm] = React.useState<OrgFormState>({ ...emptyOrgForm });
  const [orgLoading, setOrgLoading] = React.useState(false);
  const [orgError, setOrgError] = React.useState('');
  const [orgSuccess, setOrgSuccess] = React.useState('');
  const [orgMetadataLoading, setOrgMetadataLoading] = React.useState(false);
  const [orgMetadataError, setOrgMetadataError] = React.useState('');
  const [orgEditMode, setOrgEditMode] = React.useState(false);
  const [orgEditState, setOrgEditState] = React.useState<OrgEditState>({ ...emptyOrgEdit });
  const [orgEditLoading, setOrgEditLoading] = React.useState(false);
  const [orgEditError, setOrgEditError] = React.useState('');
  const [orgEditSuccess, setOrgEditSuccess] = React.useState('');
  const [showOrgUserForm, setShowOrgUserForm] = React.useState(false);
  const [orgUserForm, setOrgUserForm] = React.useState<OrgUserFormState>({ ...emptyOrgUserForm });
  const [orgUserLoading, setOrgUserLoading] = React.useState(false);
  const [orgUserError, setOrgUserError] = React.useState('');
  const [orgUserSuccess, setOrgUserSuccess] = React.useState('');
  const [userFeatureLoading, setUserFeatureLoading] = React.useState<string | null>(null);
  const [userFeatureError, setUserFeatureError] = React.useState('');
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [statusError, setStatusError] = React.useState('');
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');
  const [dealerStatusLoading, setDealerStatusLoading] = React.useState<string | null>(null);
  const [dealerStatusError, setDealerStatusError] = React.useState('');
  const [impersonateInfo, setImpersonateInfo] = React.useState('');
  const [impersonateError, setImpersonateError] = React.useState('');
  const [showDealerForm, setShowDealerForm] = React.useState(false);
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
  const [dealerError, setDealerError] = React.useState('');
  const [dealerLoading, setDealerLoading] = React.useState(false);
  const [dealerSuccess, setDealerSuccess] = React.useState('');
  const [billingPanel, setBillingPanel] = React.useState<{ dealer: DealerInfo; events: DealerBillingEvent[] } | null>(null);
  const [billingLoading, setBillingLoading] = React.useState(false);
  const [billingError, setBillingError] = React.useState('');
  const [billingSaving, setBillingSaving] = React.useState(false);
  const [billingForm, setBillingForm] = React.useState({ event_type: 'payment' as DealerBillingEventType, amount: '', currency: 'MXN', notes: '' });
  const [billingNotesDraft, setBillingNotesDraft] = React.useState('');
  const [billingNotesSaving, setBillingNotesSaving] = React.useState(false);
  const [permissionModal, setPermissionModal] = React.useState<{ user: UserInfo; levels: Record<string, FeatureLevel> } | null>(null);
  const [permissionSaving, setPermissionSaving] = React.useState(false);
  const [permissionError, setPermissionError] = React.useState('');
  const [contactModal, setContactModal] = React.useState<{ user: UserInfo; name: string; phone: string } | null>(null);
  const [contactSaving, setContactSaving] = React.useState(false);
  const [contactError, setContactError] = React.useState('');
  const [adminUserId, setAdminUserId] = React.useState('');
  const [adminUserEmail, setAdminUserEmail] = React.useState('');

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

  const organizationsData = React.useMemo(() => {
    const list = data?.organizations ?? [];
    if (isOemView && impersonateOrgId) {
      return list.filter((org) => org.id === impersonateOrgId);
    }
    return list;
  }, [data?.organizations, impersonateOrgId, isOemView]);

  React.useEffect(() => {
    if (isOemView) {
      setShowOrgForm(false);
    }
  }, [isOemView]);

  React.useEffect(() => {
    if (!canManageBilling) {
      setBillingPanel(null);
      setBillingError('');
      setBillingLoading(false);
      setBillingForm({ event_type: 'payment', amount: '', currency: 'MXN', notes: '' });
      setBillingNotesDraft('');
    }
  }, [canManageBilling]);

  React.useEffect(() => {
    if (impersonateOrgId) {
      if (organizationsData.some((org) => org.id === impersonateOrgId)) {
        setSelectedOrg(impersonateOrgId);
      }
      return;
    }
    if (!selectedOrg && organizationsData.length) {
      setSelectedOrg(organizationsData[0].id);
    }
  }, [impersonateOrgId, organizationsData, selectedOrg]);

  React.useEffect(() => {
    setStatusError('');
    setDeleteError('');
    setDealerStatusError('');
    setBillingPanel(null);
    setBillingError('');
    setBrandTransferDraft({});
    setBrandTransferError('');
    setBrandAssignError('');
    setBrandLimitDrafts({});
    setBrandLimitError('');
    setBrandLimitSaving(null);
    setOrgMetadataLoading(false);
    setOrgMetadataError('');
    setShowDealerForm(false);
    setDealerError('');
    setDealerLoading(false);
    setDealerSuccess('');
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
    setImpersonateInfo('');
    setImpersonateError('');
  }, [selectedOrg]);

  React.useEffect(() => {
    if (!impersonateInfo) return;
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => setImpersonateInfo(''), 6000);
    return () => window.clearTimeout(timer);
  }, [impersonateInfo]);

  React.useEffect(() => {
    if (!impersonateError) return;
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => setImpersonateError(''), 6000);
    return () => window.clearTimeout(timer);
  }, [impersonateError]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedId = window.localStorage.getItem('CORTEX_SUPERADMIN_USER_ID') || '';
      const storedEmail = window.localStorage.getItem('CORTEX_SUPERADMIN_EMAIL') || '';
      setAdminUserId(storedId);
      setAdminUserEmail(storedEmail);
    } catch {}
  }, []);

  React.useEffect(() => {
    setBrandAssignSelection({ ...EMPTY_BRAND_ASSIGN_SELECTION });
    setBrandAssignError('');
  }, [selectedOrg]);

  const {
    data: orgDetail,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateOrg,
  } = useSWR<AdminOrganizationResponse>(
    selectedOrg ? ['admin_org', selectedOrg] : null,
    () => endpoints.adminOrganization(selectedOrg as string)
  );
  const { data: brandPool, error: brandPoolError, mutate: mutateBrandPool } = useSWR<AdminBrandListResponse>('admin_brands', endpoints.adminBrands);

  const dealerSummaryTotals = orgDetail?.dealer_summary?.totals;
  const dealerSummaryRows = orgDetail?.dealer_summary?.rows ?? [];
  const overdueDealers = dealerSummaryRows.filter((row) => (row.days_since_payment ?? 0) > 30).length;
  const organizations = data?.organizations ?? [];
  const organizationMetadata = React.useMemo(() => {
    const meta = orgDetail?.organization?.metadata;
    return meta && typeof meta === 'object' ? (meta as Record<string, any>) : {};
  }, [orgDetail?.organization?.metadata]);
  const hydrateOrgEditState = React.useCallback((): OrgEditState => {
    const org = orgDetail?.organization;
    if (!org) return { ...emptyOrgEdit };
    const billingAddress = (org.billing_address ?? {}) as Record<string, any>;
    const contactInfo = (org.contact_info ?? {}) as Record<string, any>;
    const metadata = (org.metadata ?? {}) as Record<string, any>;
    return {
      name: org.name || '',
      displayName: org.display_name || '',
      legalName: org.legal_name || '',
      taxId: org.tax_id || '',
      billingEmail: org.billing_email || '',
      billingPhone: org.billing_phone || '',
      billingLine1: String(billingAddress.line1 ?? ''),
      billingLine2: String(billingAddress.line2 ?? ''),
      billingCity: String(billingAddress.city ?? ''),
      billingState: String(billingAddress.state ?? ''),
      billingZip: String(billingAddress.postal_code ?? ''),
      billingCountry: String(billingAddress.country ?? ''),
      contactName: String(contactInfo.name ?? ''),
      contactPhone: String(contactInfo.phone ?? ''),
      metadataNotes: typeof metadata?.notes === 'string' ? metadata.notes : '',
    };
  }, [orgDetail]);

  React.useEffect(() => {
    if (!orgDetail) {
      setOrgEditMode(false);
      setOrgEditState({ ...emptyOrgEdit });
      setOrgEditError('');
      setOrgEditSuccess('');
      return;
    }
    if (!orgEditMode) {
      setOrgEditState(hydrateOrgEditState());
    }
  }, [orgDetail, orgEditMode, hydrateOrgEditState]);

  React.useEffect(() => {
    if (isOemView) {
      setOrgEditMode(false);
      setOrgEditError('');
      setOrgEditSuccess('');
    }
  }, [isOemView]);

  const organizationBillingAddress = React.useMemo(() => {
    const addr = orgDetail?.organization?.billing_address;
    return addr && typeof addr === 'object' ? (addr as Record<string, any>) : {};
  }, [orgDetail?.organization?.billing_address]);
  const organizationContactInfo = React.useMemo(() => {
    const info = orgDetail?.organization?.contact_info;
    return info && typeof info === 'object' ? (info as Record<string, any>) : {};
  }, [orgDetail?.organization?.contact_info]);
  const billingAddressDisplay = React.useMemo(() => {
    const addr = organizationBillingAddress;
    const parts: string[] = [];
    const push = (value: unknown) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) parts.push(trimmed);
      }
    };
    push(addr.line1);
    push(addr.line2);
    const city = typeof addr.city === 'string' ? addr.city.trim() : '';
    const state = typeof addr.state === 'string' ? addr.state.trim() : '';
    if (city && state) push(`${city}, ${state}`);
    else {
      push(city);
      push(state);
    }
    push(addr.postal_code);
    push(addr.country);
    return parts.length ? parts.join(' · ') : '—';
  }, [organizationBillingAddress]);
  const contactInfoDisplay = React.useMemo(() => {
    const name = typeof organizationContactInfo.name === 'string' ? organizationContactInfo.name.trim() : '';
    const phone = typeof organizationContactInfo.phone === 'string' ? organizationContactInfo.phone.trim() : '';
    if (name && phone) return `${name} · ${phone}`;
    if (name) return name;
    if (phone) return phone;
    return '—';
  }, [organizationContactInfo]);
  const isDealerGroupOrg = React.useMemo(() => {
    const raw = String(organizationMetadata?.org_type || '').toLowerCase().trim();
    return raw === 'dealer_group';
  }, [organizationMetadata]);
  const canCreateOrgUsers = React.useMemo(() => !isDealerGroupOrg, [isDealerGroupOrg]);
  const metadataNotesDisplay = React.useMemo(() => {
    const note = organizationMetadata?.notes;
    return typeof note === 'string' && note.trim() ? note.trim() : '—';
  }, [organizationMetadata]);
  const canManageUserPermissions = React.useMemo(() => {
    if (!isOemView) return true;
    return !isDealerGroupOrg;
  }, [isOemView, isDealerGroupOrg]);
  const availableBrands = React.useMemo(() => {
    if (!brandPool?.brands) return [] as AdminBrand[];
    const source = selectedOrg
      ? brandPool.brands.filter((item) => item.organization_id !== selectedOrg)
      : [...brandPool.brands];
    const sorted = [...source];
    sorted.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return sorted;
  }, [brandPool, selectedOrg]);
  const availableBrandOptions = React.useMemo(() => {
    const duplicates = new Map<string, number>();
    return availableBrands.map<BrandOption>((brand) => {
      const baseSlug = brand.slug ? String(brand.slug) : slugify(brand.name);
      if (brand.id) {
        return {
          value: `existing:${brand.id}`,
          brand,
          slug: baseSlug,
          assignedOrgId: brand.organization_id || null,
          assignedOrgName: brand.organization_name || null,
        };
      }
      const seen = duplicates.get(baseSlug) ?? 0;
      duplicates.set(baseSlug, seen + 1);
      const suffix = seen === 0 ? '' : `:${seen}`;
      return {
        value: `catalog:${baseSlug}${suffix}`,
        brand,
        slug: baseSlug,
        assignedOrgId: brand.organization_id || null,
        assignedOrgName: brand.organization_name || null,
      };
    });
  }, [availableBrands]);
  const brandOptionMap = React.useMemo(() => {
    const map = new Map<string, BrandOption>();
    for (const option of availableBrandOptions) {
      map.set(option.value, option);
    }
    return map;
  }, [availableBrandOptions]);
  const displayBrands = React.useMemo(() => {
    if (!orgDetail?.brands?.length) return [] as typeof orgDetail.brands;
    return orgDetail.brands.filter((brand) => {
      const meta = (brand.metadata || {}) as Record<string, any>;
      const isSyntheticCatalog = !brand.id && !brand.organization_id;
      if (isSyntheticCatalog) return false;
      if (!brand.id && brand.organization_id && brand.slug && brand.name) {
        return true;
      }
      return true;
    });
  }, [orgDetail]);

  const getBrandDealerLimit = React.useCallback((meta?: Record<string, any> | null): number | null => {
    if (!meta) return null;
    const raw = (meta as any).dealer_limit;
    if (raw === undefined || raw === null || raw === '') return null;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? Math.floor(num) : null;
  }, []);

  React.useEffect(() => {
    const candidates = displayBrands.length ? displayBrands : (orgDetail?.brands ?? []);
    if (!candidates.length) {
      return;
    }
    const defaultBrand = candidates.find((brand) => {
      const limit = getBrandDealerLimit(brand.metadata ?? null);
      if (limit == null) return true;
      return (brand.dealer_count || 0) < limit;
    }) ?? candidates[0];
    const defaultBrandId = defaultBrand?.id ?? '';
    setDealerForm((prev) => {
      if (prev.brandId) return prev;
      return { ...prev, brandId: defaultBrandId };
    });
  }, [displayBrands, orgDetail?.brands, getBrandDealerLimit]);

  const selectedDealerBrand = React.useMemo(() => {
    const candidates = displayBrands.length ? displayBrands : (orgDetail?.brands ?? []);
    if (!candidates.length) return undefined;
    return candidates.find((brand) => brand.id === dealerForm.brandId) ?? candidates[0];
  }, [displayBrands, orgDetail?.brands, dealerForm.brandId]);
  const selectedDealerBrandLimit = React.useMemo(() => {
    return getBrandDealerLimit(selectedDealerBrand?.metadata ?? null);
  }, [selectedDealerBrand, getBrandDealerLimit]);
  const selectedDealerBrandRemaining = React.useMemo(() => {
    if (selectedDealerBrandLimit == null || !selectedDealerBrand) return null;
    const remaining = selectedDealerBrandLimit - (selectedDealerBrand.dealer_count || 0);
    return remaining;
  }, [selectedDealerBrandLimit, selectedDealerBrand]);
  const selectedDealerBrandLimitReached = React.useMemo(() => {
    if (selectedDealerBrandRemaining == null) return false;
    return selectedDealerBrandRemaining <= 0;
  }, [selectedDealerBrandRemaining]);

  const resetDealerForm = React.useCallback(() => {
    const candidates = displayBrands.length ? displayBrands : (orgDetail?.brands ?? []);
    const defaultBrand = candidates.find((brand) => {
      const limit = getBrandDealerLimit(brand.metadata ?? null);
      if (limit == null) return true;
      return (brand.dealer_count || 0) < limit;
    }) ?? candidates[0];
    const defaultBrandId = defaultBrand?.id ?? '';
    setDealerForm({
      brandId: defaultBrandId,
      name: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      contactName: '',
      contactPhone: '',
      serviceStartedAt: '',
    });
    setDealerError('');
  }, [displayBrands, orgDetail?.brands, getBrandDealerLimit]);

  const handlePackageChange = async (nextValue: string) => {
    if (!selectedOrg || !orgDetail) return;
    if (orgDetail.organization.package === nextValue) return;
    setUpdatingPackage(true);
    setUpdateError('');
    try {
      await endpoints.adminUpdateOrganization(selectedOrg, { package: nextValue });
      await Promise.all([mutateOrg(), mutateOverview()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el paquete';
      setUpdateError(message);
    } finally {
      setUpdatingPackage(false);
    }
  };

  const handleOrgTypeChange = async (nextValue: string) => {
    if (!selectedOrg || !orgDetail) return;
    const currentType = String((orgDetail.organization.metadata as any)?.org_type || 'dealer_group');
    if (currentType === nextValue) return;
    setOrgMetadataLoading(true);
    setOrgMetadataError('');
    try {
      const metadata = { ...(orgDetail.organization.metadata || {}), org_type: nextValue };
      await endpoints.adminUpdateOrganization(selectedOrg, { metadata });
      await Promise.all([mutateOrg(), mutateOverview()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el tipo de organización';
      setOrgMetadataError(message);
    } finally {
      setOrgMetadataLoading(false);
    }
  };

  const submitBrand = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOrg) {
      setBrandError('Selecciona una organización antes de crear una marca');
      return;
    }
    if (!brandForm.name.trim()) {
      setBrandError('El nombre es obligatorio');
      return;
    }
    setBrandLoading(true);
    setBrandError('');
    try {
      const payload: Record<string, any> = { name: brandForm.name.trim() };
      if (brandForm.slug.trim()) payload.slug = brandForm.slug.trim();
      if (brandForm.logoUrl.trim()) payload.logo_url = brandForm.logoUrl.trim();
      const aliases = brandForm.aliases
        .split(',')
        .map((alias) => alias.trim())
        .filter((alias) => alias.length > 0);
      if (aliases.length) payload.aliases = aliases;
      if (brandForm.dealerLimit.trim()) {
        const limitValue = Number(brandForm.dealerLimit.trim());
        if (!Number.isFinite(limitValue) || limitValue < 0) {
          setBrandLoading(false);
          setBrandError('El límite de dealers debe ser un número mayor o igual a 0');
          return;
        }
        payload.dealer_limit = Math.floor(limitValue);
      }

      await endpoints.adminCreateBrand(selectedOrg, payload);
      await Promise.all([mutateOrg(), mutateOverview()]);
      setBrandForm({ name: '', slug: '', logoUrl: '', aliases: '', dealerLimit: '' });
      setShowBrandForm(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear la marca';
      setBrandError(message);
    } finally {
      setBrandLoading(false);
    }
  };

  const cancelBrandForm = () => {
    setShowBrandForm(false);
    setBrandError('');
    setBrandLoading(false);
  };

  const toggleBrandForm = () => {
    if (showBrandForm) {
      cancelBrandForm();
    } else {
      setBrandForm({ name: '', slug: '', logoUrl: '', aliases: '', dealerLimit: '' });
      setBrandError('');
      setShowBrandForm(true);
    }
  };

  const submitAssignExistingBrand = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOrg) {
      setBrandAssignError('Selecciona primero una organización.');
      return;
    }
    if (!brandAssignSelection.brandId && brandAssignSelection.source !== 'catalog') {
      setBrandAssignError('Selecciona una marca para agregar.');
      return;
    }
    const isCatalogBrand = brandAssignSelection.source === 'catalog';
    const brandInfo = !isCatalogBrand && brandAssignSelection.brandId
      ? brandPool?.brands?.find((item) => item.id === brandAssignSelection.brandId)
      : undefined;
    if (!isCatalogBrand) {
      if (!brandInfo) {
        setBrandAssignError('Marca no encontrada');
        return;
      }
      if (brandInfo.organization_id === selectedOrg) {
        setBrandAssignError('La marca ya está asignada a esta organización.');
        return;
      }
    }

    const trimmedLimit = brandAssignSelection.limit.trim();
    let limitValue: number | null | undefined = undefined;
    if (trimmedLimit) {
      const parsed = Number(trimmedLimit);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setBrandAssignError('El límite de dealers debe ser un número mayor o igual a 0.');
        return;
      }
      limitValue = Math.floor(parsed);
    } else if (brandAssignSelection.brandId || isCatalogBrand) {
      limitValue = null;
    }

    if (!isCatalogBrand && brandInfo?.organization_id && brandInfo.organization_id !== selectedOrg) {
      const sourceName = brandInfo.organization_name || 'otra organización';
      const ok = typeof window === 'undefined'
        ? true
        : window.confirm(`Esta marca pertenece actualmente a ${sourceName}. ¿Deseas moverla a esta organización?`);
      if (!ok) {
        return;
      }
    }

    setBrandAssignLoading(true);
    setBrandAssignError('');
    try {
      if (isCatalogBrand) {
        const rawName = brandAssignSelection.name.trim();
        if (!rawName) {
          throw new Error('Selecciona una marca válida.');
        }
        const name = normalizeBrandName(rawName);
        const slug = (brandAssignSelection.slug || slugify(name)).trim() || slugify(name);
        const payload: Record<string, any> = { name, slug };
        if (limitValue !== undefined) {
          payload.dealer_limit = limitValue;
        }
        await endpoints.adminCreateBrand(selectedOrg, payload);
        await Promise.all([mutateOrg(), mutateOverview(), mutateBrandPool()]);
      } else {
        const payload: Record<string, any> = { organization_id: selectedOrg };
        if (limitValue !== undefined) {
          payload.dealer_limit = limitValue;
        }
        const response = await endpoints.adminUpdateBrand(brandAssignSelection.brandId, payload);
        const tasks: Promise<unknown>[] = [mutateBrandPool(), mutateOverview()];
        if (selectedOrg) {
          tasks.push(mutateOrg());
        }
        const previousOrgId = (response as any)?.previous_org_id ?? brandInfo?.organization_id;
        const newOrgId = (response as any)?.new_org_id ?? selectedOrg;
        if (previousOrgId && previousOrgId !== newOrgId) {
          tasks.push(globalMutate(['admin_org', previousOrgId]));
        }
        if (newOrgId) {
          tasks.push(globalMutate(['admin_org', newOrgId]));
        }
        await Promise.all(tasks);
      }
      setBrandAssignSelection({ ...EMPTY_BRAND_ASSIGN_SELECTION });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo asignar la marca';
      setBrandAssignError(message);
    } finally {
      setBrandAssignLoading(false);
    }
  };

  const handleBrandTransfer = async (brand: BrandInfo, targetOrgId: string) => {
    if (!canManageBrandDistribution) {
      setBrandTransferError('Solo el superadmin global puede reasignar marcas.');
      return;
    }
    if (!targetOrgId || targetOrgId === selectedOrg) {
      setBrandTransferDraft((prev) => {
        const next = { ...prev };
        delete next[brand.id];
        return next;
      });
      return;
    }
    const targetOrg = organizations.find((org) => org.id === targetOrgId);
    const ok = typeof window !== 'undefined'
      ? window.confirm(`¿Mover ${brand.name} a ${targetOrg?.name ?? 'otra organización'}?`)
      : true;
    if (!ok) {
      setBrandTransferDraft((prev) => {
        const next = { ...prev };
        delete next[brand.id];
        return next;
      });
      return;
    }

    setBrandTransferLoading(brand.id);
    setBrandTransferError('');
    try {
      const response = await endpoints.adminUpdateBrand(brand.id, { organization_id: targetOrgId });
      const tasks: Promise<unknown>[] = [mutateBrandPool(), mutateOverview()];
      if (selectedOrg) {
        tasks.push(mutateOrg());
      }
      const previousOrgId = (response as any)?.previous_org_id ?? selectedOrg;
      const newOrgId = (response as any)?.new_org_id ?? targetOrgId;
      if (previousOrgId) {
        tasks.push(globalMutate(['admin_org', previousOrgId]));
      }
      if (newOrgId) {
        tasks.push(globalMutate(['admin_org', newOrgId]));
      }
      await Promise.all(tasks);
      setBrandTransferDraft((prev) => {
        const next = { ...prev };
        delete next[brand.id];
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo mover la marca';
      setBrandTransferError(message);
      setBrandTransferDraft((prev) => {
        const next = { ...prev };
        delete next[brand.id];
        return next;
      });
    } finally {
      setBrandTransferLoading(null);
    }
  };

  const handleBrandLimitChange = (brandId: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageBrandDistribution) return;
    const value = event.target.value;
    setBrandLimitDrafts((prev) => ({ ...prev, [brandId]: value }));
    setBrandLimitError('');
  };

  const saveBrandLimit = async (brand: BrandInfo) => {
    if (!canManageBrandDistribution) {
      setBrandLimitError('Solo el superadmin global puede ajustar límites de dealers.');
      return;
    }
    const rawDraft = brandLimitDrafts[brand.id] ?? '';
    const trimmed = rawDraft.trim();
    let limitValue: number | null;
    if (!trimmed) {
      limitValue = null;
    } else {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setBrandLimitError('El límite de dealers debe ser un número mayor o igual a 0');
        return;
      }
      limitValue = Math.floor(parsed);
    }
    setBrandLimitSaving(brand.id);
    setBrandLimitError('');
    try {
      await endpoints.adminUpdateBrand(brand.id, { dealer_limit: limitValue });
      await Promise.all([mutateOrg(), mutateOverview(), mutateBrandPool()]);
      setBrandLimitDrafts((prev) => {
        const next = { ...prev };
        delete next[brand.id];
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el límite de dealers';
      setBrandLimitError(message);
    } finally {
      setBrandLimitSaving(null);
    }
  };

  const toggleDealerForm = () => {
    if (!canManageDealers) return;
    if (showDealerForm) {
      setShowDealerForm(false);
      resetDealerForm();
    } else {
      setDealerSuccess('');
      resetDealerForm();
      setShowDealerForm(true);
    }
  };

  const openOemPanel = React.useCallback(() => {
    if (!selectedOrg) return;
    if (typeof window === 'undefined') return;
    const url = new URL('/admin', window.location.origin);
    url.searchParams.set('org', selectedOrg);
    url.searchParams.set('view', 'oem');
    window.open(url.toString(), '_blank', 'noopener');
  }, [selectedOrg]);

  const openDealerPanel = React.useCallback((dealer: DealerInfo) => {
    if (!dealer?.id || typeof window === 'undefined') return;
    const url = new URL('/dealers', window.location.origin);
    url.searchParams.set('dealer', dealer.id);
    if (dealer.name) url.searchParams.set('name', dealer.name);
    if (dealer.address) url.searchParams.set('address', dealer.address);
    const meta = (dealer.metadata || {}) as Record<string, any>;
    const locationMeta = meta.location;
    if (locationMeta) {
      if (locationMeta.city) url.searchParams.set('city', String(locationMeta.city));
      if (locationMeta.state) url.searchParams.set('state', String(locationMeta.state));
    }
    if (meta.normalized_address) url.searchParams.set('normalizedAddress', String(meta.normalized_address));
    const contact = meta.sales_contact;
    if (contact) {
      if (contact.name) url.searchParams.set('contact', String(contact.name));
      if (contact.phone) url.searchParams.set('phone', String(contact.phone));
    }
    const brand = orgDetail?.brands.find((item) => item.id === dealer.brand_id);
    if (dealer.brand_id) url.searchParams.set('brandId', dealer.brand_id);
    const brandName = String(brand?.name || '').trim();
    if (brandName) {
      url.searchParams.set('brand', brandName);
      try {
        window.localStorage.setItem('CORTEX_DEALER_ALLOWED_BRAND', brandName);
        window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: brandName }));
      } catch {}
      applyAllowedBrands([brandName]);
    } else {
      try {
        window.localStorage.removeItem('CORTEX_DEALER_ALLOWED_BRAND');
        window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: '' }));
      } catch {}
      applyAllowedBrands([]);
    }
    const dealerAdmins = (orgDetail?.users || []).filter((user) => {
      if (!user.feature_flags?.dealer_admin) return false;
      return user.dealer_location_id === dealer.id;
    });
    if (dealerAdmins.length === 1) {
      const adminUser = dealerAdmins[0];
      url.searchParams.set('admin', adminUser.id);
      if (adminUser.email) url.searchParams.set('adminEmail', String(adminUser.email));
    }
    window.open(url.toString(), '_blank', 'noopener');
  }, [applyAllowedBrands, orgDetail?.brands, orgDetail?.users]);

  const handleDealerField = (field: keyof typeof dealerForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setDealerForm((prev) => ({ ...prev, [field]: value }));
    setDealerError('');
    if (field === 'brandId') {
      setDealerSuccess('');
    }
  };

  const submitDealer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageDealers) {
      setDealerError('Solo el superadmin de la organización puede crear dealers.');
      return;
    }
    if (!selectedOrg) {
      setDealerError('Selecciona una organización');
      return;
    }
    if (!dealerForm.brandId) {
      setDealerError('Selecciona la marca a la que pertenece el dealer');
      return;
    }
    if (!dealerForm.name.trim()) {
      setDealerError('El nombre del dealer es obligatorio');
      return;
    }
    if (!dealerForm.address.trim()) {
      setDealerError('La dirección es obligatoria');
      return;
    }
    const brandInfo = orgDetail?.brands?.find((brand) => brand.id === dealerForm.brandId);
    const brandLimit = getBrandDealerLimit(brandInfo?.metadata ?? null);
    if (brandLimit != null && (brandInfo?.dealer_count || 0) >= brandLimit) {
      setDealerError('Esta marca ya alcanzó el límite de dealers permitidos. Ajusta el límite antes de agregar más.');
      return;
    }
    setDealerLoading(true);
    setDealerError('');
    setDealerSuccess('');
    try {
      const payload: Record<string, any> = {
        brand_id: dealerForm.brandId,
        name: dealerForm.name.trim(),
        address: dealerForm.address.trim(),
      };
      if (dealerForm.city.trim()) payload.city = dealerForm.city.trim();
      if (dealerForm.state.trim()) payload.state = dealerForm.state.trim();
      if (dealerForm.postalCode.trim()) payload.postal_code = dealerForm.postalCode.trim();
      if (dealerForm.contactName.trim()) payload.contact_name = dealerForm.contactName.trim();
      if (dealerForm.contactPhone.trim()) payload.contact_phone = dealerForm.contactPhone.trim();
      if (dealerForm.serviceStartedAt) {
        try {
          payload.service_started_at = new Date(`${dealerForm.serviceStartedAt}T00:00:00`).toISOString();
        } catch {
          payload.service_started_at = undefined;
        }
      }

      const response = await endpoints.adminCreateDealer(selectedOrg, payload);
      await Promise.all([mutateOrg(response as AdminOrganizationResponse, { revalidate: false }), mutateOverview()]);
      const dealerId = (response as any)?.dealer_billing?.dealer_id as string | undefined;
      if (dealerId) {
        await mutateOrg();
      }
      setDealerSuccess('Dealer creado correctamente.');
      resetDealerForm();
      setShowDealerForm(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el dealer';
      setDealerError(message);
    } finally {
      setDealerLoading(false);
    }
  };

  const handleAdminIdentity = (field: 'id' | 'email') => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (field === 'id') {
      setAdminUserId(value.trim());
      if (typeof window !== 'undefined') {
        try {
          if (value.trim()) {
            window.localStorage.setItem('CORTEX_SUPERADMIN_USER_ID', value.trim());
          } else {
            window.localStorage.removeItem('CORTEX_SUPERADMIN_USER_ID');
          }
        } catch {}
      }
    } else {
      setAdminUserEmail(value);
      if (typeof window !== 'undefined') {
        try {
          if (value.trim()) {
            window.localStorage.setItem('CORTEX_SUPERADMIN_EMAIL', value.trim());
          } else {
            window.localStorage.removeItem('CORTEX_SUPERADMIN_EMAIL');
          }
        } catch {}
      }
    }
  };

  const resetOrgForm = () => setOrgForm({ ...emptyOrgForm });

  const handleOrgField = (field: keyof OrgFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setOrgForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleOrgEditField = (field: keyof OrgEditState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setOrgEditState((prev) => ({ ...prev, [field]: value }));
      setOrgEditError('');
      setOrgEditSuccess('');
    };

  const submitOrganization = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!orgForm.name.trim()) {
      setOrgError('El nombre de la organización es obligatorio');
      return;
    }
    setOrgLoading(true);
    setOrgError('');
    setOrgSuccess('');
    try {
      const payload: Record<string, any> = {
        name: orgForm.name.trim(),
        package: orgForm.package,
      };
      if (orgForm.displayName.trim()) payload.display_name = orgForm.displayName.trim();
      if (orgForm.legalName.trim()) payload.legal_name = orgForm.legalName.trim();
      if (orgForm.taxId.trim()) payload.tax_id = orgForm.taxId.trim();
      if (orgForm.billingEmail.trim()) payload.billing_email = orgForm.billingEmail.trim();
      if (orgForm.billingPhone.trim()) payload.billing_phone = orgForm.billingPhone.trim();

      const billingAddress: Record<string, string> = {};
      if (orgForm.billingLine1.trim()) billingAddress.line1 = orgForm.billingLine1.trim();
      if (orgForm.billingLine2.trim()) billingAddress.line2 = orgForm.billingLine2.trim();
      if (orgForm.billingCity.trim()) billingAddress.city = orgForm.billingCity.trim();
      if (orgForm.billingState.trim()) billingAddress.state = orgForm.billingState.trim();
      if (orgForm.billingZip.trim()) billingAddress.postal_code = orgForm.billingZip.trim();
      if (orgForm.billingCountry.trim()) billingAddress.country = orgForm.billingCountry.trim();
      if (Object.keys(billingAddress).length) payload.billing_address = billingAddress;

      const contactInfo: Record<string, string> = {};
      if (orgForm.contactName.trim()) contactInfo.name = orgForm.contactName.trim();
      if (orgForm.contactPhone.trim()) contactInfo.phone = orgForm.contactPhone.trim();
      if (Object.keys(contactInfo).length) payload.contact_info = contactInfo;

      const metadata: Record<string, any> = { org_type: orgForm.orgType };
      if (orgForm.metadataNotes.trim()) metadata.notes = orgForm.metadataNotes.trim();
      payload.metadata = metadata;

      if (orgForm.superEmail.trim()) {
        payload.superadmin = {
          email: orgForm.superEmail.trim(),
          password: orgForm.superPassword.trim() || undefined,
          name: orgForm.superName.trim() || undefined,
          phone: orgForm.superPhone.trim() || undefined,
        };
      }

      const response = await endpoints.adminCreateOrganization(payload);
      const newOrgId = response?.organization?.id as string | undefined;
      await mutateOverview();
      if (newOrgId) {
        setSelectedOrg(newOrgId);
      }
      const tempPassword = response?.superadmin?.temp_password as string | undefined;
      const supEmail = response?.superadmin?.email as string | undefined;
      if (supEmail && tempPassword) {
        setOrgSuccess(`Organización creada. Superadmin ${supEmail} contraseña temporal: ${tempPassword}`);
      } else {
        setOrgSuccess('Organización creada correctamente.');
      }
      resetOrgForm();
      setShowOrgForm(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear la organización';
      setOrgError(message);
    } finally {
      setOrgLoading(false);
    }
  };

  const toggleOrgEdit = () => {
    if (!orgDetail) {
      return;
    }
    if (orgEditMode) {
      setOrgEditMode(false);
      setOrgEditState(hydrateOrgEditState());
      setOrgEditError('');
      setOrgEditSuccess('');
    } else {
      setOrgEditState(hydrateOrgEditState());
      setOrgEditError('');
      setOrgEditSuccess('');
      setOrgEditMode(true);
    }
  };

  const submitOrgEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!orgDetail || !selectedOrg) {
      setOrgEditError('Selecciona una organización para actualizar.');
      return;
    }
    const org = orgDetail.organization;
    const payload: Record<string, any> = {};

    const requiredName = orgEditState.name.trim();
    if (!requiredName) {
      setOrgEditError('El nombre interno es obligatorio.');
      return;
    }
    if (requiredName !== (org.name || '')) {
      payload.name = requiredName;
    }

    const assignOptional = (value: string, original: string | null | undefined, key: string) => {
      const next = value.trim();
      const prev = (original || '').trim();
      if (next !== prev) {
        payload[key] = next ? next : null;
      }
    };

    assignOptional(orgEditState.displayName, org.display_name, 'display_name');
    assignOptional(orgEditState.legalName, org.legal_name, 'legal_name');
    assignOptional(orgEditState.taxId, org.tax_id, 'tax_id');
    assignOptional(orgEditState.billingEmail, org.billing_email, 'billing_email');
    assignOptional(orgEditState.billingPhone, org.billing_phone, 'billing_phone');

    const buildAddress = (state: OrgEditState) => {
      const out: Record<string, string> = {};
      const push = (key: string, value: string) => {
        const trimmed = value.trim();
        if (trimmed) out[key] = trimmed;
      };
      push('line1', state.billingLine1);
      push('line2', state.billingLine2);
      push('city', state.billingCity);
      push('state', state.billingState);
      push('postal_code', state.billingZip);
      push('country', state.billingCountry);
      return out;
    };

    const normalizeAddress = (addr: Record<string, any> | null | undefined) => {
      const out: Record<string, string> = {};
      if (!addr || typeof addr !== 'object') return out;
      const keys = ['line1', 'line2', 'city', 'state', 'postal_code', 'country'];
      for (const key of keys) {
        const raw = addr[key];
        if (typeof raw === 'string' && raw.trim()) {
          out[key] = raw.trim();
        }
      }
      return out;
    };

    const newAddress = buildAddress(orgEditState);
    const currentAddress = normalizeAddress(org.billing_address as Record<string, any> | null);
    if (JSON.stringify(newAddress) !== JSON.stringify(currentAddress)) {
      payload.billing_address = newAddress;
    }

    const buildContact = (state: OrgEditState) => {
      const out: Record<string, string> = {};
      if (state.contactName.trim()) out.name = state.contactName.trim();
      if (state.contactPhone.trim()) out.phone = state.contactPhone.trim();
      return out;
    };

    const normalizeContact = (contact: Record<string, any> | null | undefined) => {
      const out: Record<string, string> = {};
      if (!contact || typeof contact !== 'object') return out;
      if (typeof contact.name === 'string' && contact.name.trim()) out.name = contact.name.trim();
      if (typeof contact.phone === 'string' && contact.phone.trim()) out.phone = contact.phone.trim();
      return out;
    };

    const newContact = buildContact(orgEditState);
    const currentContact = normalizeContact(org.contact_info as Record<string, any> | null);
    if (JSON.stringify(newContact) !== JSON.stringify(currentContact)) {
      payload.contact_info = newContact;
    }

    const metadata = (org.metadata ?? {}) as Record<string, any>;
    const currentNotes = typeof metadata?.notes === 'string' ? metadata.notes.trim() : '';
    const nextNotes = orgEditState.metadataNotes.trim();
    if (nextNotes !== currentNotes) {
      const nextMetadata = { ...metadata };
      if (nextNotes) {
        nextMetadata.notes = nextNotes;
      } else {
        delete nextMetadata.notes;
      }
      payload.metadata = nextMetadata;
    }

    if (Object.keys(payload).length === 0) {
      setOrgEditSuccess('No hay cambios para guardar.');
      setOrgEditMode(false);
      setOrgEditState(hydrateOrgEditState());
      return;
    }

    setOrgEditLoading(true);
    setOrgEditError('');
    setOrgEditSuccess('');
    try {
      const response = await endpoints.adminUpdateOrganization(selectedOrg, payload);
      await Promise.all([
        mutateOrg(response as AdminOrganizationResponse, { revalidate: false }),
        mutateOverview(),
      ]);
      setOrgEditMode(false);
      setOrgEditState(hydrateOrgEditState());
      setOrgEditSuccess('Información actualizada correctamente.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar la organización';
      setOrgEditError(message);
    } finally {
      setOrgEditLoading(false);
    }
  };

  const toggleOrgUserForm = () => {
    if (showOrgUserForm) {
      setShowOrgUserForm(false);
      setOrgUserForm({ ...emptyOrgUserForm });
      setOrgUserError('');
      setOrgUserSuccess('');
    } else {
      setShowOrgUserForm(true);
      setOrgUserForm({ ...emptyOrgUserForm });
      setOrgUserError('');
      setOrgUserSuccess('');
    }
  };

  const handleOrgUserField = (field: 'email' | 'name' | 'phone') => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setOrgUserForm((prev) => ({ ...prev, [field]: value }));
    if (orgUserError) setOrgUserError('');
    if (orgUserSuccess) setOrgUserSuccess('');
  };

  const handleOrgUserRoleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as OrgUserFormState['role'];
    setOrgUserForm((prev) => ({
      ...prev,
      role: value,
      dealerAdmin: value === 'superadmin_oem' ? true : false,
    }));
    setOrgUserError('');
    setOrgUserSuccess('');
  };

  const handleOrgUserDealerAdmin = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setOrgUserForm((prev) => ({ ...prev, dealerAdmin: checked }));
  };

  const submitOrgUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOrg) {
      setOrgUserError('Selecciona una organización antes de crear usuarios.');
      return;
    }
    const email = orgUserForm.email.trim();
    if (!email) {
      setOrgUserError('El correo del usuario es obligatorio.');
      return;
    }
    setOrgUserLoading(true);
    setOrgUserError('');
    setOrgUserSuccess('');
    try {
      const payload: Record<string, any> = {
        email,
        role: orgUserForm.role,
      };
      if (orgUserForm.name.trim()) payload.name = orgUserForm.name.trim();
      if (orgUserForm.phone.trim()) payload.phone = orgUserForm.phone.trim();
      if (orgUserForm.role === 'superadmin_oem') {
        payload.dealer_admin = orgUserForm.dealerAdmin;
      } else if (orgUserForm.dealerAdmin) {
        payload.dealer_admin = true;
      }
      const response = await endpoints.adminCreateOrgUser(selectedOrg, payload);
      await mutateOrg(response as AdminOrganizationResponse, { revalidate: false });
      await mutateOverview();
      const created = (response as any)?.created_user;
      if (created?.temp_password) {
        setOrgUserSuccess(`Usuario creado. Contraseña temporal: ${created.temp_password}`);
      } else {
        setOrgUserSuccess('Usuario creado correctamente.');
      }
      setOrgUserForm({ ...emptyOrgUserForm });
      setShowOrgUserForm(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el usuario';
      setOrgUserError(message);
    } finally {
      setOrgUserLoading(false);
    }
  };

  const openContactModal = (user: UserInfo) => {
    const metadata = (user.metadata || {}) as Record<string, any>;
    setContactModal({
      user,
      name: typeof metadata.name === 'string' ? metadata.name : '',
      phone: typeof metadata.phone === 'string' ? metadata.phone : '',
    });
    setContactError('');
  };

  const closeContactModal = () => {
    if (contactSaving) return;
    setContactModal(null);
    setContactError('');
  };

  const handleContactField = (field: 'name' | 'phone') => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setContactModal((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const submitContactModal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactModal) return;
    const { user, name, phone } = contactModal;
    setContactSaving(true);
    setContactError('');
    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        phone: phone.trim(),
      };
      const response = await endpoints.adminUpdateUser(user.id, payload);
      await mutateOrg(response as AdminOrganizationResponse, { revalidate: false });
      setContactModal(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el contacto';
      setContactError(message);
    } finally {
      setContactSaving(false);
    }
  };

  const toggleOrgForm = () => {
    if (showOrgForm) {
      setShowOrgForm(false);
      setOrgError('');
      setOrgSuccess('');
      setOrgLoading(false);
      resetOrgForm();
    } else {
      setShowOrgForm(true);
      setOrgError('');
      setOrgSuccess('');
      resetOrgForm();
    }
  };

  const toggleDealerAdmin = async (userId: string, currentValue: boolean) => {
    if (!canManageUserPermissions) {
      setUserFeatureError('Solo el superadmin Cortex u OEM puede modificar estos permisos.');
      return;
    }
    if (!selectedOrg) return;
    setUserFeatureLoading(userId);
    setUserFeatureError('');
    try {
      await endpoints.adminUpdateUserFeatures(userId, { dealer_admin: !currentValue });
      await mutateOrg();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el permiso';
      setUserFeatureError(message);
    } finally {
      setUserFeatureLoading(null);
    }
  };

  const updateOrgStatus = async (action: 'pause' | 'resume') => {
    if (!selectedOrg) return;
    setStatusLoading(true);
    setStatusError('');
    try {
      await endpoints.adminUpdateOrganizationStatus(selectedOrg, { action });
      await Promise.all([mutateOrg(), mutateOverview()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el estado';
      setStatusError(message);
    } finally {
      setStatusLoading(false);
    }
  };

  const updateDealerStatus = async (dealer: DealerInfo, action: 'pause' | 'resume') => {
    setDealerStatusError('');
    setDealerStatusLoading(dealer.id);
    try {
      let reason: string | undefined;
      if (typeof window !== 'undefined') {
        const promptText = action === 'pause'
          ? 'Motivo para pausar el acceso (opcional)'
          : 'Nota para la reactivación (opcional)';
        const input = window.prompt(promptText) || '';
        reason = input.trim() ? input.trim() : undefined;
      }

      const payload: Record<string, any> = { action };
      if (reason) payload.reason = reason;
      if (adminUserId.trim()) payload.recorded_by = adminUserId.trim();

      const response = await endpoints.adminUpdateDealerStatus(dealer.id, payload);
      await mutateOrg(response as AdminOrganizationResponse, { revalidate: false });
      await mutateOverview();

      if (billingPanel?.dealer.id === dealer.id) {
        const updatedDealer = (response.dealers || []).find((item) => item.id === dealer.id) || dealer;
        const updatedEvents = response.dealer_billing?.events ?? billingPanel.events;
        setBillingPanel({ dealer: updatedDealer, events: updatedEvents });
        setBillingNotesDraft((updatedDealer as any)?.billing_notes || '');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el dealer';
      setDealerStatusError(message);
    } finally {
      setDealerStatusLoading(null);
    }
  };

  const openBillingHistory = async (dealer: DealerInfo) => {
    if (!canManageBilling) return;
    if (billingPanel?.dealer.id === dealer.id) {
      closeBillingPanel();
      return;
    }
    setBillingError('');
    setBillingPanel({ dealer, events: [] });
    setBillingNotesDraft(dealer.billing_notes || '');
    setBillingLoading(true);
    try {
      const response = await endpoints.adminDealerBillingEvents(dealer.id);
      const dealerInfo = response?.dealer ? { ...dealer, ...response.dealer } : dealer;
      setBillingPanel({ dealer: dealerInfo, events: response?.events || [] });
      setBillingNotesDraft((dealerInfo as any)?.billing_notes || '');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar el historial';
      setBillingError(message);
    } finally {
      setBillingLoading(false);
    }
  };

  const closeBillingPanel = () => {
    if (!canManageBilling) return;
    setBillingPanel(null);
    setBillingError('');
    setBillingLoading(false);
    setBillingForm({ event_type: 'payment', amount: '', currency: 'MXN', notes: '' });
    setBillingNotesDraft('');
  };

  const handleBillingField = (
    field: 'event_type' | 'amount' | 'currency' | 'notes'
  ) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setBillingForm((prev) => {
      if (field === 'event_type') {
        return {
          ...prev,
          event_type: value as DealerBillingEventType,
          amount: value === 'note' ? '' : prev.amount,
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const submitBillingEvent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageBilling) {
      setBillingError('Solo el superadmin Cortex puede registrar pagos.');
      return;
    }
    if (!billingPanel?.dealer) return;
    setBillingError('');
    setBillingSaving(true);
    try {
      const payload: Record<string, any> = {
        event_type: billingForm.event_type,
      };

      if (billingForm.event_type !== 'note') {
        const rawAmount = billingForm.amount.trim();
        if (!rawAmount) {
          throw new Error('El monto es obligatorio para pagos o cargos');
        }
        const parsed = Number(rawAmount.replace(',', '.'));
        if (Number.isNaN(parsed)) {
          throw new Error('Monto inválido. Usa números, ejemplo 1234.56');
        }
        payload.amount = parsed;
        payload.currency = (billingForm.currency || 'MXN').trim().toUpperCase() || 'MXN';
      }

      if (billingForm.notes.trim()) {
        payload.notes = billingForm.notes.trim();
      }

      if (adminUserId.trim()) {
        payload.recorded_by = adminUserId.trim();
      }

      const response = await endpoints.adminCreateDealerBillingEvent(billingPanel.dealer.id, payload);
      await mutateOrg(response as AdminOrganizationResponse, { revalidate: false });
      await mutateOverview();

      const updatedDealer = (response.dealers || []).find((item) => item.id === billingPanel.dealer.id) || billingPanel.dealer;
      const updatedEvents = response.dealer_billing?.events || [];
      setBillingPanel({ dealer: updatedDealer, events: updatedEvents });
      setBillingNotesDraft((updatedDealer as any)?.billing_notes || '');
      setBillingForm({ event_type: 'payment', amount: '', currency: 'MXN', notes: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar el evento';
      setBillingError(message);
    } finally {
      setBillingSaving(false);
    }
  };

  const saveBillingNotes = async () => {
    if (!canManageBilling) {
      setBillingError('Solo el superadmin Cortex puede actualizar notas de facturación.');
      return;
    }
    if (!billingPanel?.dealer) return;
    setBillingError('');
    setBillingNotesSaving(true);
    try {
      const payload: Record<string, any> = { billing_notes: billingNotesDraft }; // allow empty string to clear
      if (adminUserId.trim()) {
        payload.recorded_by = adminUserId.trim();
      }
      const response = await endpoints.adminUpdateDealer(billingPanel.dealer.id, payload);
      await mutateOrg(response as AdminOrganizationResponse, { revalidate: false });
      await mutateOverview();

      const updatedDealer = (response.dealers || []).find((item: DealerInfo) => item.id === billingPanel.dealer.id) || billingPanel.dealer;
      const updatedEvents = response.dealer_billing?.events || billingPanel.events;
      setBillingPanel({ dealer: updatedDealer, events: updatedEvents });
      setBillingNotesDraft((updatedDealer as any)?.billing_notes || '');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar las notas del dealer';
      setBillingError(message);
    } finally {
      setBillingNotesSaving(false);
    }
  };

  const openPermissionModal = (user: UserInfo) => {
    if (!canManageUserPermissions) {
      setPermissionError('Solo el superadmin Cortex u OEM puede ajustar permisos.');
      return;
    }
    setPermissionError('');
    setPermissionSaving(false);
    setPermissionModal({ user, levels: extractFeatureLevels(user.feature_flags || {}) });
  };

  const closePermissionModal = () => {
    setPermissionModal(null);
    setPermissionError('');
    setPermissionSaving(false);
  };

  const updatePermissionLevel = (featureKey: string, level: FeatureLevel) => {
    setPermissionModal((prev) => {
      if (!prev) return prev;
      return { ...prev, levels: { ...prev.levels, [featureKey]: level } };
    });
  };

  const savePermissionModal = async () => {
    if (!permissionModal) return;
    if (!canManageUserPermissions) {
      setPermissionError('Solo el superadmin Cortex u OEM puede ajustar permisos.');
      return;
    }
    setPermissionSaving(true);
    setPermissionError('');
    try {
      const response = await endpoints.adminUpdateUserFeatures(permissionModal.user.id, { features: permissionModal.levels });
      await mutateOrg(response as AdminOrganizationResponse, { revalidate: false });
      await mutateOverview();
      closePermissionModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron guardar los permisos';
      setPermissionError(message);
    } finally {
      setPermissionSaving(false);
    }
  };

  const impersonateUser = (user: UserInfo) => {
    setImpersonateError('');
    if (typeof window === 'undefined') return;
    try {
      const trimmedEmail = user.email?.trim() ?? '';
      window.localStorage.setItem('CORTEX_SUPERADMIN_USER_ID', user.id);
      if (trimmedEmail) {
        window.localStorage.setItem('CORTEX_SUPERADMIN_EMAIL', trimmedEmail);
      } else {
        window.localStorage.removeItem('CORTEX_SUPERADMIN_EMAIL');
      }

      const isDealerUser = Boolean(user.dealer_location_id);
      if (isDealerUser) {
        window.localStorage.setItem('CORTEX_DEALER_ADMIN_USER_ID', user.id);
        if (trimmedEmail) {
          window.localStorage.setItem('CORTEX_DEALER_ADMIN_EMAIL', trimmedEmail);
        } else {
          window.localStorage.removeItem('CORTEX_DEALER_ADMIN_EMAIL');
        }
      }

      setAdminUserId(user.id);
      setAdminUserEmail(trimmedEmail);

      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(user.id).catch(() => {});
      }

      const label = trimmedEmail || user.id;
      let openedPanel = false;
      const target = new URL('/ui', window.location.origin);

      if (isDealerUser && user.dealer_location_id) {
        target.searchParams.set('dealer', user.dealer_location_id);
        target.searchParams.set('admin', user.id);
        if (trimmedEmail) target.searchParams.set('adminEmail', trimmedEmail);

        const dealerRecord = (orgDetail?.dealers || []).find((item) => item.id === user.dealer_location_id);
        const dealerMeta = (dealerRecord?.metadata || {}) as Record<string, any>;
        const dealerLocation = dealerMeta?.location || {};
        const contact = dealerMeta?.contact || {};

        const contextPayload = {
          id: user.dealer_location_id,
          name: dealerRecord?.name || '',
          location:
            (dealerLocation?.city && dealerLocation?.state
              ? `${dealerLocation.city}, ${dealerLocation.state}`
              : dealerLocation?.normalized
            )
            || dealerRecord?.address
            || '',
          contactName: contact?.name || '',
          contactPhone: contact?.phone || '',
        };

        const brandId = dealerRecord?.brand_id || user.brand_id || null;
        const brandItem = brandId
          ? (orgDetail?.brands || []).find((brand) => brand.id === brandId)
          : null;
        const brandName = brandItem?.name?.trim() || '';
        if (dealerRecord?.name) target.searchParams.set('name', dealerRecord.name);
        if (dealerRecord?.address) target.searchParams.set('address', dealerRecord.address);
        if (dealerLocation?.city) target.searchParams.set('city', String(dealerLocation.city));
        if (dealerLocation?.state) target.searchParams.set('state', String(dealerLocation.state));
        if (dealerLocation?.normalized) target.searchParams.set('normalizedAddress', String(dealerLocation.normalized));

        if (brandName) {
          target.searchParams.set('brand', brandName);
        }

        try {
          window.localStorage.setItem('CORTEX_DEALER_ID', user.dealer_location_id);
          window.localStorage.setItem('CORTEX_DEALER_CONTEXT', JSON.stringify(contextPayload));
          if (brandName) {
            window.localStorage.setItem('CORTEX_DEALER_ALLOWED_BRAND', brandName);
            window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: brandName }));
          } else {
            window.localStorage.removeItem('CORTEX_DEALER_ALLOWED_BRAND');
            window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: '' }));
          }
        } catch {}

        applyAllowedBrands(brandName ? [brandName] : []);

        if (contextPayload.contactName) target.searchParams.set('contact', contextPayload.contactName);
        if (contextPayload.contactPhone) target.searchParams.set('phone', contextPayload.contactPhone);
        if (contextPayload.location) target.searchParams.set('location', contextPayload.location);
      } else {
        try {
          window.localStorage.removeItem('CORTEX_DEALER_ADMIN_USER_ID');
          window.localStorage.removeItem('CORTEX_DEALER_ADMIN_EMAIL');
          window.localStorage.removeItem('CORTEX_DEALER_ID');
          window.localStorage.removeItem('CORTEX_DEALER_CONTEXT');
          window.localStorage.removeItem('CORTEX_DEALER_ALLOWED_BRAND');
          window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: '' }));
        } catch {}

        applyAllowedBrands([]);
      }

      if (!isDealerUser) {
        const brandsForOrg = (orgDetail?.brands || [])
          .map((item) => String(item?.name || '').trim())
          .filter((value) => value.length > 0);
        applyAllowedBrands(brandsForOrg);
      }

      window.open(target.toString(), '_blank', 'noopener');
      openedPanel = true;

      const message = openedPanel
        ? `Identidad actualizada. Se abrió una pestaña como ${label}.`
        : `Identidad actualizada. Ahora operas como ${label}.`;
      setImpersonateInfo(message);
    } catch (err) {
      setImpersonateError('No se pudo actualizar la identidad en este navegador.');
    }
  };

  const deleteOrganization = async () => {
    if (!selectedOrg) return;
    const ok = typeof window !== 'undefined'
      ? window.confirm('¿Seguro que deseas eliminar esta organización? Esta acción no se puede deshacer.')
      : true;
    if (!ok) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await endpoints.adminDeleteOrganization(selectedOrg);
      await mutateOverview();
      setSelectedOrg(null);
      setOrgSuccess('Organización eliminada.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar la organización';
      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <main style={{ display: 'grid', gap: 24, padding: 24 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600 }}>{isOemView ? 'Panel Superadmin OEM' : 'Panel Superadmin Global'}</h1>
        <p style={{ maxWidth: 720, color: '#4b5563' }}>
          {isOemView
            ? 'Administra marcas, dealers y usuarios de esta organización sin ver el resto del catálogo.'
            : 'Revisa organizaciones, marcas, dealers y usuarios configurados en Supabase. Usa este panel para detectar huecos antes de delegar accesos.'}
        </p>
        {!SUPERADMIN_TOKEN_CONFIGURED ? (
          <div style={{ padding: '8px 12px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6 }}>
            Define las variables de entorno <code>SUPERADMIN_API_TOKEN</code> en el backend y
            <code> NEXT_PUBLIC_SUPERADMIN_TOKEN</code> en el frontend para proteger estas APIs.
          </div>
        ) : null}
        {!isOemView ? (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              <button
                onClick={toggleOrgForm}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #2563eb',
                  background: showOrgForm ? '#dbeafe' : '#2563eb',
                  color: showOrgForm ? '#1d4ed8' : '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {showOrgForm ? 'Cancelar creación' : 'Crear nueva organización'}
              </button>
            </div>
            {orgSuccess ? (
              <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: '#ecfdf5', border: '1px solid #22c55e', color: '#166534' }}>
                {orgSuccess}
              </div>
            ) : null}
            {orgError ? (
              <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: '#fee2e2', border: '1px solid #f87171', color: '#b91c1c' }}>
                {orgError}
              </div>
            ) : null}
          </>
        ) : null}
      </header>

      {!isOemView && showOrgForm ? (
        <form onSubmit={submitOrganization} style={{ border: '1px solid #d1d5db', borderRadius: 10, padding: 20, display: 'grid', gap: 16, background: '#fff' }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Nombre interno *</label>
              <input value={orgForm.name} onChange={handleOrgField('name')} placeholder="Ej. Grupo Demo" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Nombre comercial</label>
              <input value={orgForm.displayName} onChange={handleOrgField('displayName')} placeholder="Nombre visible" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Paquete</label>
              <select value={orgForm.package} onChange={handleOrgField('package')} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}>
                <option value="marca">Paquete Marca</option>
                <option value="black_ops">Black Ops</option>
              </select>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Tipo de organización</label>
              <select
                value={orgForm.orgType}
                onChange={handleOrgField('orgType')}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
              >
                <option value="oem">OEM / Marca</option>
                <option value="dealer_group">Grupo de dealers / Importador</option>
              </select>
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                Elige OEM para marcas que gestionan sus propios distribuidores; usa Grupo cuando administran múltiples marcas o franquicias.
              </span>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Razón social</label>
              <input value={orgForm.legalName} onChange={handleOrgField('legalName')} placeholder="Razón social" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>RFC / Tax ID</label>
              <input value={orgForm.taxId} onChange={handleOrgField('taxId')} placeholder="RFC" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Correo facturación</label>
              <input value={orgForm.billingEmail} onChange={handleOrgField('billingEmail')} placeholder="facturacion@empresa.com" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Teléfono facturación</label>
              <input value={orgForm.billingPhone} onChange={handleOrgField('billingPhone')} placeholder="+52 ..." style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Dirección (línea 1)</label>
              <input value={orgForm.billingLine1} onChange={handleOrgField('billingLine1')} placeholder="Calle" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Dirección (línea 2)</label>
              <input value={orgForm.billingLine2} onChange={handleOrgField('billingLine2')} placeholder="Colonia, piso" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Ciudad</label>
              <input value={orgForm.billingCity} onChange={handleOrgField('billingCity')} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Estado / Provincia</label>
              <input value={orgForm.billingState} onChange={handleOrgField('billingState')} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Código Postal</label>
              <input value={orgForm.billingZip} onChange={handleOrgField('billingZip')} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>País</label>
              <input value={orgForm.billingCountry} onChange={handleOrgField('billingCountry')} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Contacto principal</label>
              <input value={orgForm.contactName} onChange={handleOrgField('contactName')} placeholder="Nombre" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Teléfono contacto</label>
              <input value={orgForm.contactPhone} onChange={handleOrgField('contactPhone')} placeholder="+52 ..." style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Notas</label>
              <textarea value={orgForm.metadataNotes} onChange={handleOrgField('metadataNotes')} rows={2} placeholder="Notas internas" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5', resize: 'vertical' }} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Superadmin OEM (opcional)</h3>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontWeight: 600, fontSize: 13 }}>Correo</label>
                <input value={orgForm.superEmail} onChange={handleOrgField('superEmail')} placeholder="admin@marca.com" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontWeight: 600, fontSize: 13 }}>Contraseña temporal (opcional)</label>
                <input value={orgForm.superPassword} onChange={handleOrgField('superPassword')} placeholder="Se genera si queda vacío" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontWeight: 600, fontSize: 13 }}>Nombre</label>
                <input value={orgForm.superName} onChange={handleOrgField('superName')} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontWeight: 600, fontSize: 13 }}>Teléfono</label>
                <input value={orgForm.superPhone} onChange={handleOrgField('superPhone')} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="submit"
              disabled={orgLoading}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: orgLoading ? '#cbd5f5' : '#2563eb',
                color: orgLoading ? '#1e3a8a' : '#fff',
                fontWeight: 600,
                cursor: orgLoading ? 'default' : 'pointer',
              }}
            >
              {orgLoading ? 'Creando…' : 'Crear organización'}
            </button>
            <button
              type="button"
              onClick={toggleOrgForm}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <div style={{ padding: 16, border: '1px solid #f87171', background: '#fee2e2', color: '#b91c1c', borderRadius: 6 }}>
          Error cargando el resumen: {String((error as Error).message)}
        </div>
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', fontWeight: 600 }}>
            Organizaciones ({organizationsData.length})
          </div>
          <div style={{ display: 'grid' }}>
            {isLoading ? (
              <p style={{ padding: 16 }}>Cargando...</p>
            ) : organizationsData.length ? (
              organizationsData.map((org) => {
                const active = selectedOrg === org.id;
                return (
                  <button
                    key={org.id}
                    onClick={() => setSelectedOrg(org.id)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 16px',
                      border: 'none',
                      borderBottom: '1px solid #e5e7eb',
                      background: active ? '#eef2ff' : '#fff',
                      cursor: 'pointer',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{org.name}</span>
                    <span style={{ fontSize: 12, color: '#4b5563' }}>
                      Paquete {org.package} · Estado {org.status || 'active'} · {org.brand_count} marcas · {org.dealer_count} dealers · {org.user_count} usuarios
                    </span>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      Creada {formatDate(org.created_at)}
                    </span>
                  </button>
                );
              })
            ) : (
              <p style={{ padding: 16 }}>No hay organizaciones registradas.</p>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 24 }}>
          {detailError ? (
            <div style={{ padding: 16, border: '1px solid #f87171', background: '#fee2e2', color: '#b91c1c', borderRadius: 6 }}>
              Error cargando detalles: {String((detailError as Error).message)}
            </div>
          ) : null}

          {detailLoading && !orgDetail ? <p>Cargando detalle...</p> : null}

          {orgDetail ? (
            <div style={{ display: 'grid', gap: 24 }}>
              <section style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 16 }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{orgDetail.organization.name}</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 14 }}>
                  <span><strong>Paquete:</strong> {orgDetail.organization.package}</span>
                  <span>
                    <strong>Status:</strong> {orgDetail.organization.status || 'active'}
                    {orgDetail.organization.status === 'paused' && orgDetail.organization.paused_at
                      ? ` desde ${formatDate(orgDetail.organization.paused_at)}`
                      : ''}
                  </span>
                  <span><strong>Creado:</strong> {formatDate(orgDetail.organization.created_at)}</span>
                  <span><strong>Actualizado:</strong> {formatDate(orgDetail.organization.updated_at)}</span>
                  <span><strong>Marcas:</strong> {orgDetail.brands.length}</span>
                  <span><strong>Dealers:</strong> {orgDetail.dealers.length}</span>
                  <span><strong>Usuarios:</strong> {orgDetail.users.length}</span>
                </div>
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                  {!isOemView ? (
                    <>
                      <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        Cambiar paquete:
                        <select
                          value={orgDetail.organization.package}
                          onChange={(event) => handlePackageChange(event.target.value)}
                          disabled={updatingPackage}
                          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                        >
                          <option value="marca">Paquete Marca</option>
                          <option value="black_ops">Black Ops</option>
                        </select>
                      </label>
                      <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        Tipo de organización:
                        <select
                          value={String((orgDetail.organization.metadata as any)?.org_type || 'oem')}
                          onChange={(event) => handleOrgTypeChange(event.target.value)}
                          disabled={orgMetadataLoading}
                          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                        >
                          <option value="dealer_group">Grupo de dealers</option>
                          <option value="oem">OEM / Marca</option>
                        </select>
                      </label>
                    </>
                  ) : null}
                  {!isOemView ? (
                    <>
                      <button
                        onClick={() => updateOrgStatus(orgDetail.organization.status === 'paused' ? 'resume' : 'pause')}
                        disabled={statusLoading}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid #f97316',
                          background: orgDetail.organization.status === 'paused' ? '#fef3c7' : '#f97316',
                          color: orgDetail.organization.status === 'paused' ? '#b45309' : '#fff',
                          fontSize: 13,
                          cursor: statusLoading ? 'default' : 'pointer',
                        }}
                      >
                        {statusLoading
                          ? 'Actualizando...'
                          : orgDetail.organization.status === 'paused'
                            ? 'Reactivar acceso'
                            : 'Pausar acceso'}
                      </button>
                      <button
                        onClick={deleteOrganization}
                        disabled={deleteLoading}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid #dc2626',
                          background: deleteLoading ? '#fecaca' : '#dc2626',
                          color: deleteLoading ? '#7f1d1d' : '#fff',
                          fontSize: 13,
                          cursor: deleteLoading ? 'default' : 'pointer',
                        }}
                      >
                        {deleteLoading ? 'Eliminando...' : 'Eliminar organización'}
                      </button>
                    </>
                  ) : null}
                  {!isOemView ? (
                    <button
                      onClick={openOemPanel}
                      style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #047857', background: '#d1fae5', color: '#047857', fontSize: 13, cursor: 'pointer' }}
                    >
                      Impersonar superadmin OEM/Grupo
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          window.location.href = '/admin';
                        }
                      }}
                      style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #2563eb', background: '#eff6ff', color: '#1d4ed8', fontSize: 13, cursor: 'pointer' }}
                    >
                      Salir de impersonación
                    </button>
                  )}
                  {updatingPackage ? (
                    <span style={{ fontSize: 12, color: '#2563eb' }}>Guardando...</span>
                  ) : null}
                  {orgMetadataLoading ? (
                    <span style={{ fontSize: 12, color: '#047857' }}>Actualizando tipo...</span>
                  ) : null}
                </div>
                {updateError ? (
                  <p style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{updateError}</p>
                ) : null}
                {orgMetadataError ? (
                  <p style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>{orgMetadataError}</p>
                ) : null}
                {statusError ? (
                  <p style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>{statusError}</p>
                ) : null}
                {deleteError ? (
                  <p style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>{deleteError}</p>
                ) : null}

                <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Identidad del administrador</h4>
                    {!adminUserId ? (
                      <span style={{ fontSize: 12, color: '#b91c1c' }}>Recomendado capturar tu UUID de Supabase para auditar movimientos.</span>
                    ) : null}
                  </div>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Usuario UUID (Supabase)
                      <input
                        value={adminUserId}
                        onChange={handleAdminIdentity('id')}
                        placeholder="00000000-0000-0000-0000-000000000000"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', fontFamily: 'monospace' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Correo (opcional)
                      <input
                        value={adminUserEmail}
                        onChange={handleAdminIdentity('email')}
                        placeholder="admin@empresa.com"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                  </div>
                  {impersonateInfo ? (
                    <p style={{ margin: 0, fontSize: 12, color: '#047857' }}>{impersonateInfo}</p>
                  ) : null}
              {impersonateError ? (
                <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{impersonateError}</p>
              ) : null}
            </div>
          </section>

          {!isOemView ? (
          <section style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 16, display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Información de la organización</h3>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    Edita datos comerciales, fiscales y de contacto. Los cambios aplican inmediatamente para todos los paneles.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleOrgEdit}
                  disabled={orgEditLoading || !orgDetail}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #0f172a',
                    background: orgEditMode ? '#f8fafc' : '#0f172a',
                    color: orgEditMode ? '#0f172a' : '#fff',
                    fontSize: 13,
                    cursor: orgEditLoading ? 'default' : 'pointer',
                    opacity: orgEditLoading ? 0.6 : 1,
                  }}
                >
                  {orgEditMode ? 'Cancelar edición' : 'Editar datos'}
                </button>
              </div>
              {orgEditError ? (
                <div style={{ padding: '8px 10px', borderRadius: 6, background: '#fee2e2', border: '1px solid #f87171', color: '#b91c1c', fontSize: 12 }}>
                  {orgEditError}
                </div>
              ) : null}
              {orgEditSuccess ? (
                <div style={{ padding: '8px 10px', borderRadius: 6, background: '#ecfdf5', border: '1px solid #22c55e', color: '#166534', fontSize: 12 }}>
                  {orgEditSuccess}
                </div>
              ) : null}
              {orgEditMode ? (
                <form onSubmit={submitOrgEdit} style={{ display: 'grid', gap: 16 }}>
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Nombre interno *
                      <input
                        value={orgEditState.name}
                        onChange={handleOrgEditField('name')}
                        required
                        disabled={orgEditLoading}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Nombre comercial
                      <input
                        value={orgEditState.displayName}
                        onChange={handleOrgEditField('displayName')}
                        disabled={orgEditLoading}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Razón social
                      <input
                        value={orgEditState.legalName}
                        onChange={handleOrgEditField('legalName')}
                        disabled={orgEditLoading}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      RFC / Identificador fiscal
                      <input
                        value={orgEditState.taxId}
                        onChange={handleOrgEditField('taxId')}
                        disabled={orgEditLoading}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Correo de facturación
                      <input
                        value={orgEditState.billingEmail}
                        onChange={handleOrgEditField('billingEmail')}
                        disabled={orgEditLoading}
                        placeholder="facturacion@empresa.com"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Teléfono de facturación
                      <input
                        value={orgEditState.billingPhone}
                        onChange={handleOrgEditField('billingPhone')}
                        disabled={orgEditLoading}
                        placeholder="+52 ..."
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                  </div>

                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Dirección · Calle
                      <input
                        value={orgEditState.billingLine1}
                        onChange={handleOrgEditField('billingLine1')}
                        disabled={orgEditLoading}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Dirección · Complemento
                      <input
                        value={orgEditState.billingLine2}
                        onChange={handleOrgEditField('billingLine2')}
                        disabled={orgEditLoading}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Ciudad
                      <input
                        value={orgEditState.billingCity}
                        onChange={handleOrgEditField('billingCity')}
                        disabled={orgEditLoading}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Estado / Provincia
                      <input
                        value={orgEditState.billingState}
                        onChange={handleOrgEditField('billingState')}
                        disabled={orgEditLoading}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Código postal
                      <input
                        value={orgEditState.billingZip}
                        onChange={handleOrgEditField('billingZip')}
                        disabled={orgEditLoading}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      País
                      <input
                        value={orgEditState.billingCountry}
                        onChange={handleOrgEditField('billingCountry')}
                        disabled={orgEditLoading}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                  </div>

                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Contacto principal
                      <input
                        value={orgEditState.contactName}
                        onChange={handleOrgEditField('contactName')}
                        disabled={orgEditLoading}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Teléfono del contacto
                      <input
                        value={orgEditState.contactPhone}
                        onChange={handleOrgEditField('contactPhone')}
                        disabled={orgEditLoading}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </label>
                  </div>

                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Notas internas</label>
                    <textarea
                      value={orgEditState.metadataNotes}
                      onChange={handleOrgEditField('metadataNotes')}
                      disabled={orgEditLoading}
                      rows={3}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      type="submit"
                      disabled={orgEditLoading}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: orgEditLoading ? '#cbd5f5' : '#0f172a',
                        color: orgEditLoading ? '#1e293b' : '#fff',
                        fontWeight: 600,
                        cursor: orgEditLoading ? 'default' : 'pointer',
                      }}
                    >
                      {orgEditLoading ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                    <button
                      type="button"
                      onClick={toggleOrgEdit}
                      disabled={orgEditLoading}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: '1px solid #d1d5db',
                        background: '#fff',
                        color: '#0f172a',
                        fontWeight: 500,
                        cursor: orgEditLoading ? 'default' : 'pointer',
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'grid', gap: 8, fontSize: 13, color: '#1f2937' }}>
                  <div><strong>Nombre interno:</strong> {orgDetail.organization.name || '—'}</div>
                  <div><strong>Nombre comercial:</strong> {orgDetail.organization.display_name || '—'}</div>
                  <div><strong>Razón social:</strong> {orgDetail.organization.legal_name || '—'}</div>
                  <div><strong>RFC / ID fiscal:</strong> {orgDetail.organization.tax_id || '—'}</div>
                  <div><strong>Correo de facturación:</strong> {orgDetail.organization.billing_email || '—'}</div>
                  <div><strong>Teléfono de facturación:</strong> {orgDetail.organization.billing_phone || '—'}</div>
                  <div><strong>Dirección de facturación:</strong> {billingAddressDisplay}</div>
                  <div><strong>Contacto principal:</strong> {contactInfoDisplay}</div>
                  <div><strong>Notas internas:</strong> {metadataNotesDisplay}</div>
                </div>
              )}
          </section>
          ) : null}

          <section style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 16 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600 }}>Marcas</h3>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{displayBrands.length} registradas</span>
                  </div>
                  <button
                    onClick={toggleBrandForm}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid #4f46e5',
                      background: showBrandForm ? '#eef2ff' : '#4f46e5',
                      color: showBrandForm ? '#312e81' : '#fff',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    {showBrandForm ? 'Cancelar' : 'Agregar marca o grupo'}
                  </button>
                </header>
                {showBrandForm ? (
                  <form onSubmit={submitBrand} style={{ display: 'grid', gap: 12, marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f9fafb' }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>Nombre *</label>
                      <input
                        value={brandForm.name}
                        onChange={(event) => setBrandForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Ej. Grupo Plasencia"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>Slug (opcional)</label>
                      <input
                        value={brandForm.slug}
                        onChange={(event) => setBrandForm((prev) => ({ ...prev, slug: event.target.value }))}
                        placeholder="grupo-plasencia"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>Logo URL (opcional)</label>
                      <input
                        value={brandForm.logoUrl}
                        onChange={(event) => setBrandForm((prev) => ({ ...prev, logoUrl: event.target.value }))}
                        placeholder="https://..."
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>Submarcas / alias (separar por comas)</label>
                      <textarea
                        value={brandForm.aliases}
                        onChange={(event) => setBrandForm((prev) => ({ ...prev, aliases: event.target.value }))}
                        placeholder="Ford, Mazda, GWM, GAC"
                        rows={2}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', resize: 'vertical' }}
                      />
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        Usa esto para listar marcas que dependen de este grupo u OEM (ejemplo: Ford, Lincoln).
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>Límite de dealers (opcional)</label>
                      <input
                        value={brandForm.dealerLimit}
                        onChange={(event) => setBrandForm((prev) => ({ ...prev, dealerLimit: event.target.value }))}
                        placeholder="Ej. 55"
                        type="number"
                        min={0}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                      />
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        Déjalo en blanco para permitir dealers ilimitados.
                      </span>
                    </div>
                    {brandError ? (
                      <p style={{ fontSize: 12, color: '#dc2626' }}>{brandError}</p>
                    ) : null}
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        type="submit"
                        disabled={brandLoading}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: brandLoading ? '#cbd5f5' : '#2563eb',
                          color: brandLoading ? '#1e3a8a' : '#fff',
                          cursor: brandLoading ? 'default' : 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {brandLoading ? 'Guardando…' : 'Guardar marca'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelBrandForm}
                        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : null}
                {!isOemView ? (
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f8fafc', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Agregar marca existente a esta organización</div>
                    {brandPoolError ? (
                      <p style={{ fontSize: 12, color: '#dc2626' }}>
                        No se pudieron cargar las marcas globales:{' '}
                        {brandPoolError instanceof Error ? brandPoolError.message : String(brandPoolError)}
                      </p>
                    ) : null}
                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                      Elige una marca disponible del catálogo, define cuántos dealers podrá abrir esta organización y da clic en «Agregar».
                    </p>
                    <form onSubmit={submitAssignExistingBrand} style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                          Marca disponible
                          <select
                            value={brandAssignSelection.optionValue}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (!value) {
                                setBrandAssignSelection({ ...EMPTY_BRAND_ASSIGN_SELECTION });
                                setBrandAssignError('');
                                return;
                              }

                              const option = brandOptionMap.get(value);
                              if (!option) {
                                setBrandAssignSelection({ ...EMPTY_BRAND_ASSIGN_SELECTION });
                                setBrandAssignError('Marca no encontrada');
                                return;
                              }

                              const limitVal = getBrandDealerLimit(option.brand.metadata ?? null);
                              setBrandAssignSelection({
                                brandId: option.brand.id ?? '',
                                limit: limitVal != null ? String(limitVal) : '',
                                source: option.brand.id ? 'existing' : 'catalog',
                                name: option.brand.name,
                                slug: option.slug,
                                orgName: option.assignedOrgName || null,
                                optionValue: value,
                              });
                              setBrandAssignError('');
                            }}
                            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                          >
                            <option value="">Selecciona marca</option>
                            {availableBrandOptions.map((option) => {
                              const orgLabel = option.assignedOrgName
                                ? `Asignada a ${option.assignedOrgName}`
                                : 'Disponible';
                              return (
                                <option key={option.value} value={option.value}>
                                  {toTitleCase(option.brand.name)} · {orgLabel}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                          Límite de dealers (opcional)
                          <input
                            value={brandAssignSelection.limit}
                            onChange={(event) => setBrandAssignSelection((prev) => ({ ...prev, limit: event.target.value }))}
                            placeholder="Ej. 10"
                            type="number"
                            min={0}
                            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                            disabled={!brandAssignSelection.name}
                          />
                        </label>
                      </div>
                      {brandAssignSelection.name ? (
                        <>
                          <span style={{ fontSize: 12, color: '#6b7280' }}>
                            Marca: {toTitleCase(brandAssignSelection.name)} · {
                              brandAssignSelection.source === 'existing'
                                ? `Asignada a ${brandAssignSelection.orgName || 'sin organización'}`
                                : 'Disponible para asignar'
                            }
                            {' · '}
                            {brandAssignSelection.limit
                              ? `Cupo asignado: ${brandAssignSelection.limit} dealers`
                              : 'Cupo asignado: sin límite'}
                          </span>
                          {brandAssignSelection.source === 'existing'
                            && brandAssignSelection.orgName
                            && brandAssignSelection.orgName !== orgDetail?.organization?.name ? (
                              <span style={{ fontSize: 11, color: '#b45309' }}>
                                Esta acción moverá la marca desde {brandAssignSelection.orgName} hacia {orgDetail?.organization?.name}.
                              </span>
                            ) : null}
                        </>
                      ) : null}
                      {brandAssignError ? (
                        <p style={{ fontSize: 12, color: '#dc2626' }}>{brandAssignError}</p>
                      ) : null}
                      <div>
                        <button
                          type="submit"
                          disabled={
                            brandAssignLoading
                            || (!brandAssignSelection.name)
                            || (brandAssignSelection.source !== 'catalog' && !brandAssignSelection.brandId)
                          }
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: 'none',
                            background: brandAssignLoading ? '#cbd5f5' : '#1d4ed8',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: brandAssignLoading ? 'default' : 'pointer',
                          }}
                        >
                          {brandAssignLoading ? 'Asignando…' : 'Agregar marca a la organización'}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Nombre</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Slug</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Dealers actuales</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Límite dealers</th>
                        {!isDealerGroupOrg && canManageBrandDistribution ? (
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Reasignar</th>
                        ) : null}
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Actualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayBrands.map((brand) => {
                        const brandMeta = (brand.metadata || {}) as Record<string, any>;
                        const aliases = Array.isArray(brandMeta.aliases) ? brandMeta.aliases : [];
                        const isUmbrella = aliases.length > 0 && !brand.dealer_count;
                        if (!brand.id && !isUmbrella) {
                          return null;
                        }
                        const dealerLimit = getBrandDealerLimit(brandMeta);
                        const baseLimitValue = dealerLimit != null ? String(dealerLimit) : '';
                        const hasDraft = Object.prototype.hasOwnProperty.call(brandLimitDrafts, brand.id);
                        const draftValue = hasDraft ? brandLimitDrafts[brand.id] : baseLimitValue;
                        const hasDraftChanged = hasDraft && draftValue !== baseLimitValue;
                        const savingLimit = brandLimitSaving === brand.id;
                        const remaining = dealerLimit != null ? Math.max(dealerLimit - (brand.dealer_count || 0), 0) : null;
                        return (
                          <tr key={brand.id || brand.slug}>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{brand.name}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace' }}>{brand.slug}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{brand.dealer_count}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
                              {isUmbrella ? (
                                <div style={{ fontSize: 12, color: '#6b7280' }}>
                                  Submarcas: {aliases.join(', ')}
                                </div>
                              ) : canManageBrandDistribution ? (
                                <div style={{ display: 'grid', gap: 6 }}>
                                  <input
                                    type="number"
                                    min={0}
                                    value={draftValue}
                                    onChange={handleBrandLimitChange(brand.id)}
                                    placeholder="Sin límite"
                                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5f5', width: 110 }}
                                  />
                                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                                    {dealerLimit != null ? `Límite ${dealerLimit} • Restan ${remaining}` : 'Sin límite definido'}
                                  </div>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                      type="button"
                                      onClick={() => saveBrandLimit(brand)}
                                      disabled={savingLimit || !hasDraft}
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: 6,
                                        border: '1px solid #059669',
                                        background: savingLimit ? '#bbf7d0' : hasDraft ? '#047857' : '#e2e8f0',
                                        color: hasDraft ? '#fff' : '#475569',
                                        fontSize: 11,
                                        cursor: savingLimit || !hasDraft ? 'default' : 'pointer',
                                      }}
                                    >
                                      {savingLimit ? 'Guardando…' : 'Guardar'}
                                    </button>
                                    {hasDraft ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setBrandLimitDrafts((prev) => {
                                            const next = { ...prev };
                                            delete next[brand.id];
                                            return next;
                                          });
                                        }}
                                        disabled={savingLimit}
                                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 11, cursor: savingLimit ? 'default' : 'pointer' }}
                                      >
                                        Cancelar
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'grid', gap: 6 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                                    {dealerLimit != null ? `Límite ${dealerLimit}` : 'Sin límite definido'}
                                  </div>
                                  {dealerLimit != null ? (
                                    <div style={{ fontSize: 11, color: '#6b7280' }}>Restan {remaining}</div>
                                  ) : null}
                                  <span style={{ fontSize: 11, color: '#9ca3af' }}>Cambios únicamente desde el superadmin Cortex.</span>
                                </div>
                              )}
                            </td>
                            {!isDealerGroupOrg && canManageBrandDistribution ? (
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
                                {isUmbrella ? (
                                  <span style={{ fontSize: 11, color: '#9ca3af' }}>Usa las sub-marcas para reasignar.</span>
                                ) : (
                                  <>
                                    <select
                                      value={brandTransferDraft[brand.id] ?? (selectedOrg ?? '')}
                                      onChange={(event) => {
                                        const value = event.target.value;
                                        setBrandTransferDraft((prev) => ({ ...prev, [brand.id]: value }));
                                        handleBrandTransfer(brand, value);
                                      }}
                                      disabled={brandTransferLoading === brand.id || !organizations.length}
                                      style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5f5', minWidth: 180 }}
                                    >
                                      {organizations.map((org) => (
                                        <option key={org.id} value={org.id}>
                                          {org.name}{org.id === selectedOrg ? ' (actual)' : ''}
                                        </option>
                                      ))}
                                    </select>
                                    {brandTransferLoading === brand.id ? (
                                      <div style={{ fontSize: 11, color: '#2563eb', marginTop: 4 }}>Actualizando...</div>
                                    ) : (
                                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Selecciona una organización destino</div>
                                    )}
                                  </>
                                )}
                              </td>
                            ) : null}
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{formatDate(brand.updated_at)}</td>
                          </tr>
                        );
                      })}
                      {displayBrands.length === 0 ? (
                        <tr>
                          <td colSpan={(!isDealerGroupOrg && canManageBrandDistribution) ? 6 : 5} style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280' }}>Sin marcas registradas.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                {brandLimitError ? (
                  <p style={{ marginTop: 12, fontSize: 12, color: '#dc2626' }}>{brandLimitError}</p>
                ) : null}
                {brandTransferError ? (
                  <p style={{ marginTop: 12, fontSize: 12, color: '#dc2626' }}>{brandTransferError}</p>
                ) : null}
              </section>

              <section style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 16 }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600 }}>Dealers</h3>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{orgDetail.dealers.length} registrados</span>
                  </div>
                  {canManageDealers ? (
                    <button
                      onClick={toggleDealerForm}
                      disabled={!displayBrands.length}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #059669',
                        background: showDealerForm ? '#d1fae5' : '#047857',
                        color: showDealerForm ? '#065f46' : '#fff',
                        fontSize: 13,
                        cursor: displayBrands.length ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {showDealerForm ? 'Cancelar alta' : 'Agregar dealer'}
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                      Impersona a la organización con «Impersonar superadmin OEM/Grupo» para dar de alta dealers desde su panel dedicado.
                    </span>
                  )}
                </header>
                {dealerSummaryTotals ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12, fontSize: 12 }}>
                    <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 999 }}>Activos {dealerSummaryTotals.active}</span>
                    <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 999 }}>Pausados {dealerSummaryTotals.paused}</span>
                    <span style={{ background: overdueDealers > 0 ? '#fef3c7' : '#e5e7eb', color: overdueDealers > 0 ? '#b45309' : '#4b5563', padding: '2px 8px', borderRadius: 999 }}>
                      Sin pago &gt;30 días {overdueDealers}
                    </span>
                  </div>
                ) : null}
                {dealerSuccess ? (
                  <p style={{ marginBottom: 12, fontSize: 12, color: '#047857', background: '#d1fae5', border: '1px solid #34d399', borderRadius: 6, padding: '8px 10px' }}>{dealerSuccess}</p>
                ) : null}
                {dealerError ? (
                  <p style={{ marginBottom: 12, fontSize: 12, color: '#b91c1c', background: '#fee2e2', border: '1px solid #f87171', borderRadius: 6, padding: '8px 10px' }}>{dealerError}</p>
                ) : null}
                {canManageDealers && showDealerForm ? (
                  <form onSubmit={submitDealer} style={{ display: 'grid', gap: 12, marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f9fafb' }}>
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Marca asignada *
                        <select
                          value={dealerForm.brandId}
                          onChange={handleDealerField('brandId')}
                          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                        >
                          {orgDetail.brands.length === 0 ? (
                            <option value="">Registra una marca primero</option>
                          ) : null}
                          {orgDetail.brands.map((brand) => (
                            <option key={brand.id} value={brand.id}>
                              {(() => {
                                const limit = getBrandDealerLimit((brand.metadata || {}) as Record<string, any>);
                                const count = brand.dealer_count || 0;
                                const base = `${brand.name} (${count}`;
                                return limit != null ? `${base}/${limit})` : `${base})`;
                              })()}
                            </option>
                          ))}
                        </select>
                        {selectedDealerBrand ? (
                          <span style={{ fontSize: 11, color: selectedDealerBrandLimitReached ? '#b91c1c' : '#6b7280' }}>
                            {selectedDealerBrandLimit != null
                              ? selectedDealerBrandLimitReached
                                ? 'Sin cupo disponible. Ajusta el límite para agregar más dealers.'
                              : `Disponible: ${Math.max(selectedDealerBrandRemaining, 0)} dealers`
                              : 'Sin límite establecido para esta marca.'}
                          </span>
                        ) : null}
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Nombre del dealer *
                        <input
                          value={dealerForm.name}
                          onChange={handleDealerField('name')}
                          placeholder="Mazda Hermosillo"
                          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Fecha inicio servicio
                        <input
                          type="date"
                          value={dealerForm.serviceStartedAt}
                          onChange={handleDealerField('serviceStartedAt')}
                          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                        />
                      </label>
                    </div>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Dirección completa *
                      <textarea
                        value={dealerForm.address}
                        onChange={handleDealerField('address')}
                        placeholder="Av. Siempre Viva 742, Col. Centro"
                        rows={2}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', resize: 'vertical' }}
                      />
                      <span style={{ fontSize: 11, color: '#6b7280' }}>Un dealer con la misma dirección no puede tener más de dos marcas (excepto OEM).</span>
                    </label>
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Ciudad
                        <input value={dealerForm.city} onChange={handleDealerField('city')} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Estado
                        <input value={dealerForm.state} onChange={handleDealerField('state')} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Código postal
                        <input value={dealerForm.postalCode} onChange={handleDealerField('postalCode')} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Asesor de ventas
                        <input value={dealerForm.contactName} onChange={handleDealerField('contactName')} placeholder="Nombre completo" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Teléfono asesor
                        <input value={dealerForm.contactPhone} onChange={handleDealerField('contactPhone')} placeholder="55 1234 5678" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }} />
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        type="submit"
                        disabled={dealerLoading || selectedDealerBrandLimitReached}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: dealerLoading || selectedDealerBrandLimitReached ? '#cbd5f5' : '#047857',
                          color: dealerLoading || selectedDealerBrandLimitReached ? '#475569' : '#fff',
                          fontWeight: 600,
                          cursor: dealerLoading || selectedDealerBrandLimitReached ? 'default' : 'pointer',
                        }}
                      >
                        {dealerLoading ? 'Guardando…' : selectedDealerBrandLimitReached ? 'Sin cupo' : 'Guardar dealer'}
                      </button>
                      <button
                        type="button"
                        onClick={toggleDealerForm}
                        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : null}
                {dealerStatusError ? (
                  <p style={{ marginBottom: 12, color: '#dc2626', fontSize: 12 }}>{dealerStatusError}</p>
                ) : null}
                <div style={{ overflowX: 'auto' }}>
                  {orgDetail.dealers.length ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Dealer</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Marca</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Dirección</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Contacto</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Estado</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Inicio servicio</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Último pago</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Último evento</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orgDetail.dealers.map((dealer) => {
                          const brand = orgDetail.brands.find((b) => b.id === dealer.brand_id);
                          const paused = dealer.status === 'paused';
                          const lastEventType = dealer.last_event_type as DealerBillingEventType | undefined;
                          const lastEventLabel = lastEventType ? billingEventLabels[lastEventType] ?? lastEventType : null;
                          const isActiveBillingPanel = billingPanel?.dealer.id === dealer.id;
                          const metadata = dealer.metadata && typeof dealer.metadata === 'object' ? (dealer.metadata as Record<string, any>) : {};
                          const locationMeta = metadata?.location && typeof metadata.location === 'object' ? metadata.location as Record<string, any> : undefined;
                          const contactMeta = metadata?.sales_contact && typeof metadata.sales_contact === 'object' ? metadata.sales_contact as Record<string, any> : undefined;
                          return (
                            <tr
                              key={dealer.id}
                              style={{ background: paused ? '#fef3c7' : isActiveBillingPanel ? '#eef2ff' : undefined }}
                            >
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', fontWeight: 500 }}>{dealer.name}</td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{brand?.name ?? '—'}</td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', color: '#4b5563' }}>
                                <div>{dealer.address || '—'}</div>
                                {locationMeta?.city || locationMeta?.state || locationMeta?.postal_code ? (
                                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                                    {[locationMeta?.city, locationMeta?.state, locationMeta?.postal_code].filter(Boolean).join(', ')}
                                  </div>
                                ) : null}
                              </td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', color: '#4b5563' }}>
                                {contactMeta?.name ? <div>{contactMeta.name}</div> : <div>—</div>}
                                {contactMeta?.phone ? (
                                  <div style={{ fontSize: 12, color: '#6b7280' }}>{contactMeta.phone}</div>
                                ) : null}
                              </td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
                                <div style={{ fontWeight: 600 }}>{paused ? 'Pausado' : 'Activo'}</div>
                                {paused && dealer.paused_at ? (
                                  <div style={{ fontSize: 12, color: '#b45309' }}>desde {formatDate(dealer.paused_at)}</div>
                                ) : null}
                              </td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{formatDate(dealer.service_started_at)}</td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{formatDate(dealer.last_payment_at)}</td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
                                {lastEventLabel ? <div style={{ fontWeight: 500 }}>{lastEventLabel}</div> : '—'}
                                {dealer.last_event_amount != null ? (
                                  <div style={{ fontSize: 12, color: '#4b5563' }}>{formatCurrency(dealer.last_event_amount, dealer.last_event_currency)}</div>
                                ) : null}
                                {dealer.last_event_at ? (
                                  <div style={{ fontSize: 12, color: '#6b7280' }}>{formatDate(dealer.last_event_at)}</div>
                                ) : null}
                            {dealer.last_event_notes ? (
                              <div style={{ fontSize: 12, color: '#6b7280' }}>{dealer.last_event_notes}</div>
                            ) : null}
                          </td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                onClick={() => updateDealerStatus(dealer, paused ? 'resume' : 'pause')}
                                disabled={dealerStatusLoading === dealer.id}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  border: '1px solid #2563eb',
                                  background: dealerStatusLoading === dealer.id ? '#cbd5f5' : paused ? '#2563eb' : '#fff',
                                  color: paused ? '#fff' : '#1e3a8a',
                                  fontSize: 12,
                                  cursor: dealerStatusLoading === dealer.id ? 'default' : 'pointer',
                                }}
                              >
                                {dealerStatusLoading === dealer.id
                                  ? 'Actualizando…'
                                  : paused
                                    ? 'Reactivar'
                                    : 'Pausar'}
                              </button>
                              {canManageBilling ? (
                                <button
                                  onClick={() => openBillingHistory(dealer)}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #4f46e5',
                                    background: isActiveBillingPanel ? '#eef2ff' : '#fff',
                                    color: '#312e81',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isActiveBillingPanel ? 'Ocultar historial' : 'Ver historial'}
                                </button>
                              ) : (
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>Pagos administrados por superadmin Cortex</span>
                              )}
                              <button
                                type="button"
                                onClick={() => openDealerPanel(dealer)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  border: '1px solid #047857',
                                  background: '#d1fae5',
                                  color: '#047857',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                }}
                              >
                                Abrir panel dealer
                              </button>
                            </div>
                          </td>
                        </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ padding: 16, color: '#6b7280' }}>Sin dealers registrados.</p>
                  )}
                </div>
              </section>

              {canManageBilling && billingPanel ? (
                <section style={{ border: '1px solid #a855f7', borderRadius: 8, padding: 16, background: '#faf5ff' }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <h3 style={{ fontSize: 18, fontWeight: 600 }}>Historial de pagos · {billingPanel.dealer.name}</h3>
                      <span style={{ fontSize: 12, color: '#6b21a8' }}>
                        Estado actual: {billingPanel.dealer.status === 'paused' ? 'Pausado' : 'Activo'} · Servicio desde {formatDate(billingPanel.dealer.service_started_at)}
                      </span>
                    </div>
                    <button
                      onClick={closeBillingPanel}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #a855f7', background: '#fff', color: '#6b21a8', fontSize: 12, cursor: 'pointer' }}
                    >
                      Cerrar
                    </button>
                  </header>
                  {billingPanel.dealer.billing_notes ? (
                    <p style={{ fontSize: 12, color: '#6b21a8', marginBottom: 12 }}>
                      Nota actual: {billingPanel.dealer.billing_notes}
                    </p>
                  ) : null}
                  <form onSubmit={submitBillingEvent} style={{ display: 'grid', gap: 12, marginBottom: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Tipo de evento
                        <select value={billingForm.event_type} onChange={handleBillingField('event_type')} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #c4b5fd' }}>
                          <option value="payment">Pago</option>
                          <option value="charge">Cargo</option>
                          <option value="note">Nota interna</option>
                        </select>
                      </label>
                      {billingForm.event_type !== 'note' ? (
                        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                          Monto
                          <input
                            value={billingForm.amount}
                            onChange={handleBillingField('amount')}
                            placeholder="0.00"
                            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #c4b5fd', fontFamily: 'monospace' }}
                          />
                        </label>
                      ) : null}
                      {billingForm.event_type !== 'note' ? (
                        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                          Moneda
                          <input
                            value={billingForm.currency}
                            onChange={handleBillingField('currency')}
                            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #c4b5fd', textTransform: 'uppercase' }}
                          />
                        </label>
                      ) : null}
                    </div>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      Notas (visible solo en administración)
                      <textarea
                        value={billingForm.notes}
                        onChange={handleBillingField('notes')}
                        rows={2}
                        placeholder="Detalle del pago, referencia, etc."
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #c4b5fd', resize: 'vertical' }}
                      />
                    </label>
                    {billingError ? (
                      <p style={{ fontSize: 12, color: '#dc2626' }}>{billingError}</p>
                    ) : null}
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        type="submit"
                        disabled={billingSaving}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: billingSaving ? '#cbd5f5' : '#7c3aed',
                          color: '#fff',
                          fontWeight: 600,
                          cursor: billingSaving ? 'default' : 'pointer',
                        }}
                      >
                        {billingSaving ? 'Guardando…' : 'Registrar evento'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillingForm({ event_type: 'payment', amount: '', currency: 'MXN', notes: '' })}
                        disabled={billingSaving}
                        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: billingSaving ? 'default' : 'pointer' }}
                      >
                        Limpiar
                      </button>
                    </div>
                  </form>

                  <div style={{ display: 'grid', gap: 8, marginBottom: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Notas administrativas del dealer</label>
                    <textarea
                      value={billingNotesDraft}
                      onChange={(event) => setBillingNotesDraft(event.target.value)}
                      rows={3}
                      placeholder="Comentarios internos sobre pagos, facturación, etc."
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #c4b5fd', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        type="button"
                        onClick={saveBillingNotes}
                        disabled={billingNotesSaving}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: billingNotesSaving ? '#cbd5f5' : '#7c3aed',
                          color: '#fff',
                          fontWeight: 600,
                          cursor: billingNotesSaving ? 'default' : 'pointer',
                        }}
                      >
                        {billingNotesSaving ? 'Guardando…' : 'Guardar notas'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillingNotesDraft((billingPanel?.dealer as any)?.billing_notes || '')}
                        disabled={billingNotesSaving}
                        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: billingNotesSaving ? 'default' : 'pointer' }}
                      >
                        Restablecer
                      </button>
                    </div>
                  </div>

                  {billingLoading ? (
                    <p>Cargando eventos...</p>
                  ) : billingPanel.events.length ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#ede9fe', textAlign: 'left' }}>
                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #ddd6fe' }}>Evento</th>
                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #ddd6fe' }}>Monto</th>
                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #ddd6fe' }}>Fecha</th>
                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #ddd6fe' }}>Notas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {billingPanel.events.map((item) => {
                            const itemLabel = billingEventLabels[item.event_type] ?? item.event_type;
                            return (
                              <tr key={item.id}>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #ede9fe', fontWeight: 500 }}>{itemLabel}</td>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #ede9fe' }}>{formatCurrency(item.amount ?? undefined, item.currency)}</td>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #ede9fe' }}>{formatDate(item.created_at)}</td>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #ede9fe', fontSize: 12, color: '#4c1d95' }}>
                                  {item.notes || '—'}
                                  {item.recorded_by_email ? (
                                    <div style={{ color: '#6b21a8', marginTop: 4 }}>Registrado por {item.recorded_by_email}</div>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280', fontSize: 13 }}>Sin eventos registrados.</p>
                  )}
                </section>
              ) : null}

              <section style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 16 }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600 }}>Usuarios</h3>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{orgDetail.users.length} registrados</span>
                </header>
                {canCreateOrgUsers ? (
                  <div style={{ marginBottom: 12, display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <button
                        onClick={toggleOrgUserForm}
                        disabled={orgUserLoading}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid #0f172a',
                          background: showOrgUserForm ? '#e2e8f0' : '#0f172a',
                          color: showOrgUserForm ? '#0f172a' : '#fff',
                          fontSize: 13,
                          cursor: orgUserLoading ? 'default' : 'pointer',
                        }}
                      >
                        {showOrgUserForm ? 'Cancelar alta' : 'Agregar usuario OEM'}
                      </button>
                      {orgUserSuccess ? (
                        <span style={{ fontSize: 12, color: '#166534', background: '#dcfce7', padding: '4px 10px', borderRadius: 999 }}>{orgUserSuccess}</span>
                      ) : null}
                      {orgUserError ? (
                        <span style={{ fontSize: 12, color: '#b91c1c', background: '#fee2e2', padding: '4px 10px', borderRadius: 999 }}>{orgUserError}</span>
                      ) : null}
                    </div>
                    {showOrgUserForm ? (
                      <form onSubmit={submitOrgUser} style={{ display: 'grid', gap: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, background: '#f9fafb' }}>
                        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                            Correo *
                            <input
                              value={orgUserForm.email}
                              onChange={handleOrgUserField('email')}
                              type="email"
                              placeholder="admin@marca.com"
                              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                              required
                            />
                          </label>
                          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                            Nombre (opcional)
                            <input
                              value={orgUserForm.name}
                              onChange={handleOrgUserField('name')}
                              placeholder="Nombre completo"
                              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                            />
                          </label>
                          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                            Teléfono (opcional)
                            <input
                              value={orgUserForm.phone}
                              onChange={handleOrgUserField('phone')}
                              placeholder="+52 ..."
                              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                            />
                          </label>
                          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                            Rol
                            <select
                              value={orgUserForm.role}
                              onChange={handleOrgUserRoleChange}
                              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                            >
                              <option value="oem_user">Usuario OEM</option>
                              <option value="superadmin_oem">Superadmin OEM</option>
                            </select>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
                            <input
                              type="checkbox"
                              checked={orgUserForm.dealerAdmin}
                              onChange={handleOrgUserDealerAdmin}
                              disabled={orgUserForm.role !== 'superadmin_oem'}
                            />
                            Permitir administrar dealers
                          </label>
                        </div>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={toggleOrgUserForm}
                            disabled={orgUserLoading}
                            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#0f172a', cursor: orgUserLoading ? 'default' : 'pointer' }}
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={orgUserLoading}
                            style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: orgUserLoading ? '#cbd5f5' : '#0f172a', color: '#fff', fontWeight: 600, cursor: orgUserLoading ? 'default' : 'pointer' }}
                          >
                            {orgUserLoading ? 'Creando…' : 'Crear usuario'}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                ) : null}
                {userFeatureError ? (
                  <p style={{ marginBottom: 12, color: '#dc2626', fontSize: 12 }}>{userFeatureError}</p>
                ) : null}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Correo</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Rol</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Marca</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Dealer</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Contacto</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Templates</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Superadmin dealer</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Permisos</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Actualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgDetail.users.map((user) => {
                        const brand = user.brand_id ? orgDetail.brands.find((b) => b.id === user.brand_id) : undefined;
                        const dealer = user.dealer_location_id ? orgDetail.dealers.find((d) => d.id === user.dealer_location_id) : undefined;
                        const metadata = (user.metadata || {}) as Record<string, any>;
                        const contactName = typeof metadata.name === 'string' ? metadata.name : '';
                        const contactPhone = typeof metadata.phone === 'string' ? metadata.phone : '';
                        const dealerAdmin = Boolean(user.feature_flags?.dealer_admin);
                        const canManageDealers = user.role === 'dealer_user';
                        const allowDealerAdminToggle = canManageUserPermissions && canManageDealers;
                        const allowPermissionEdit = canManageUserPermissions;
                        const featureLevels = extractFeatureLevels(user.feature_flags || {});
                        const activeFeatureChips = FEATURE_KEY_DEFS.filter(({ key }) => featureLevels[key] !== 'none').map(({ key, label }) => ({
                          key,
                          label,
                          level: featureLevels[key],
                        }));
                        return (
                          <tr key={user.id}>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{user.email || '—'}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{roleLabels[user.role] || user.role}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{brand?.name || '—'}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{dealer?.name || '—'}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
                              <div style={{ fontSize: 13, color: '#0f172a' }}>{contactName || '—'}</div>
                              <div style={{ fontSize: 12, color: '#475569' }}>{contactPhone || '—'}</div>
                              {user.role === 'dealer_user' ? (
                                <button
                                  type="button"
                                  onClick={() => openContactModal(user)}
                                  style={{
                                    marginTop: 6,
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    border: '1px solid #0f172a',
                                    background: '#0f172a',
                                    color: '#fff',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {contactName || contactPhone ? 'Editar contacto' : 'Agregar contacto'}
                                </button>
                              ) : null}
                            </td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{user.template_count}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
                              {allowDealerAdminToggle ? (
                                <button
                                  onClick={() => toggleDealerAdmin(user.id, dealerAdmin)}
                                  disabled={userFeatureLoading === user.id}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #4c1d95',
                                    background: dealerAdmin ? '#ede9fe' : '#4c1d95',
                                    color: dealerAdmin ? '#4c1d95' : '#fff',
                                    fontSize: 12,
                                    cursor: userFeatureLoading === user.id ? 'default' : 'pointer',
                                  }}
                                >
                                  {userFeatureLoading === user.id
                                    ? 'Actualizando…'
                                    : dealerAdmin
                                      ? 'Revocar superadmin'
                                      : 'Asignar superadmin dealer'}
                                </button>
                              ) : (
                                <span style={{ fontSize: 12, color: '#6b7280' }}>
                                  {canManageDealers
                                    ? 'Solo el superadmin Cortex u OEM puede modificar este permiso.'
                                    : 'Disponible al crear usuarios dealer.'}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                {activeFeatureChips.length ? (
                                  activeFeatureChips.map((item) => {
                                    const style = FEATURE_LEVEL_STYLES[item.level];
                                    return (
                                      <span
                                        key={item.key}
                                        style={{
                                          padding: '2px 8px',
                                          borderRadius: 999,
                                          fontSize: 11,
                                          fontWeight: 600,
                                          background: style.background,
                                          color: style.color,
                                        }}
                                      >
                                        {item.label}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Sin permisos activos</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                <button
                                  onClick={() => allowPermissionEdit && openPermissionModal(user)}
                                  disabled={!allowPermissionEdit}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    border: allowPermissionEdit ? '1px solid #0f172a' : '1px solid #d1d5db',
                                    background: allowPermissionEdit ? '#0f172a' : '#e2e8f0',
                                    color: allowPermissionEdit ? '#fff' : '#94a3b8',
                                    fontSize: 12,
                                    cursor: allowPermissionEdit ? 'pointer' : 'not-allowed',
                                    opacity: allowPermissionEdit ? 1 : 0.8,
                                  }}
                                >
                                  Ajustar permisos
                                </button>
                                <button
                                  onClick={() => impersonateUser(user)}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #2563eb',
                                    background: '#eff6ff',
                                    color: '#1d4ed8',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Impersonar
                                </button>
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{formatDate(user.updated_at)}</td>
                          </tr>
                        );
                      })}
                      {orgDetail.users.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280' }}>Sin usuarios dados de alta.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </section>
      </main>

      {permissionModal ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: 16,
        }}
      >
        <div style={{ background: '#fff', borderRadius: 12, maxWidth: 520, width: '100%', boxShadow: '0 20px 45px rgba(15,23,42,0.25)', display: 'grid', gap: 16, padding: 20 }}>
          <header style={{ display: 'grid', gap: 4 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Permisos · {permissionModal.user.email || permissionModal.user.id}</h3>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              Define qué puede hacer este usuario en la plataforma. Usa “Lectura” para permitir consultas sin edición y “Bloqueado” para ocultar la sección.
            </p>
          </header>
          <div style={{ display: 'grid', gap: 12 }}>
            {FEATURE_KEY_DEFS.map(({ key, label, description }) => {
              const level = permissionModal.levels[key];
              return (
                <div key={key} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 600 }}>{label}</div>
                    <select
                      value={level}
                      onChange={(event) => updatePermissionLevel(key, event.target.value as FeatureLevel)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', minWidth: 140 }}
                      disabled={permissionSaving}
                    >
                      {FEATURE_LEVEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{FEATURE_LEVEL_LABEL[option.value]}</option>
                      ))}
                    </select>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{description}</p>
                </div>
              );
            })}
          </div>
          {permissionError ? (
            <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{permissionError}</p>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              onClick={closePermissionModal}
              disabled={permissionSaving}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #94a3b8', background: '#fff', color: '#475569', cursor: permissionSaving ? 'default' : 'pointer' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={savePermissionModal}
              disabled={permissionSaving}
              style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: permissionSaving ? '#cbd5f5' : '#0f172a', color: '#fff', fontWeight: 600, cursor: permissionSaving ? 'default' : 'pointer' }}
            >
              {permissionSaving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
        </div>
      ) : null}

      {contactModal ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <form
            onSubmit={submitContactModal}
            style={{
              background: '#fff',
              borderRadius: 12,
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 20px 45px rgba(15,23,42,0.25)',
              display: 'grid',
              gap: 16,
              padding: 20,
            }}
          >
            <header style={{ display: 'grid', gap: 4 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Editar contacto · {contactModal.user.email || contactModal.user.id}</h3>
              <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>Actualiza el nombre y teléfono visibles para este usuario de agencia.</p>
            </header>
            {contactError ? (
              <div style={{ fontSize: 12, color: '#b91c1c', background: '#fee2e2', border: '1px solid #fca5a5', padding: '6px 8px', borderRadius: 6 }}>
                {contactError}
              </div>
            ) : null}
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Nombre completo
              <input
                value={contactModal.name}
                onChange={handleContactField('name')}
                disabled={contactSaving}
                placeholder="Ej. María González"
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Teléfono de contacto
              <input
                value={contactModal.phone}
                onChange={handleContactField('phone')}
                disabled={contactSaving}
                placeholder="+52 ..."
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={closeContactModal}
                disabled={contactSaving}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#0f172a',
                  fontWeight: 500,
                  cursor: contactSaving ? 'default' : 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={contactSaving}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: contactSaving ? '#cbd5f5' : '#0f172a',
                  color: contactSaving ? '#1e293b' : '#fff',
                  fontWeight: 600,
                  cursor: contactSaving ? 'default' : 'pointer',
                }}
              >
                {contactSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
