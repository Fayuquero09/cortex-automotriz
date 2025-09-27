"use client";

import React from 'react';
import useSWR from 'swr';
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
    package: string;
    status?: string;
    paused_at?: string | null;
    metadata?: Record<string, any> | null;
    created_at: string;
    updated_at: string;
  };
  brands: BrandInfo[];
  dealers: DealerInfo[];
  users: UserInfo[];
  dealer_billing?: DealerBillingDetail;
  dealer_summary?: DealerSummary;
};

type OrgFormState = {
  name: string;
  package: 'marca' | 'black_ops';
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
  const { data, error, isLoading, mutate: mutateOverview } = useSWR<AdminOverviewResponse>('admin_overview', endpoints.adminOverview);
  const [selectedOrg, setSelectedOrg] = React.useState<string | null>(null);
  const [updatingPackage, setUpdatingPackage] = React.useState(false);
  const [updateError, setUpdateError] = React.useState<string>('');
  const [showBrandForm, setShowBrandForm] = React.useState(false);
  const [brandForm, setBrandForm] = React.useState({ name: '', slug: '', logoUrl: '', aliases: '' });
  const [brandLoading, setBrandLoading] = React.useState(false);
  const [brandError, setBrandError] = React.useState('');
  const [showOrgForm, setShowOrgForm] = React.useState(false);
  const [orgForm, setOrgForm] = React.useState<OrgFormState>({ ...emptyOrgForm });
  const [orgLoading, setOrgLoading] = React.useState(false);
  const [orgError, setOrgError] = React.useState('');
  const [orgSuccess, setOrgSuccess] = React.useState('');
  const [userFeatureLoading, setUserFeatureLoading] = React.useState<string | null>(null);
  const [userFeatureError, setUserFeatureError] = React.useState('');
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [statusError, setStatusError] = React.useState('');
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');
  const [dealerStatusLoading, setDealerStatusLoading] = React.useState<string | null>(null);
  const [dealerStatusError, setDealerStatusError] = React.useState('');
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
  const [adminUserId, setAdminUserId] = React.useState('');
  const [adminUserEmail, setAdminUserEmail] = React.useState('');

  React.useEffect(() => {
    if (!selectedOrg && data?.organizations?.length) {
      setSelectedOrg(data.organizations[0].id);
    }
  }, [data, selectedOrg]);

  React.useEffect(() => {
    setStatusError('');
    setDeleteError('');
    setDealerStatusError('');
    setBillingPanel(null);
    setBillingError('');
  }, [selectedOrg]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedId = window.localStorage.getItem('CORTEX_SUPERADMIN_USER_ID') || '';
      const storedEmail = window.localStorage.getItem('CORTEX_SUPERADMIN_EMAIL') || '';
      setAdminUserId(storedId);
      setAdminUserEmail(storedEmail);
    } catch {}
  }, []);

  const {
    data: orgDetail,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateOrg,
  } = useSWR<AdminOrganizationResponse>(
    selectedOrg ? ['admin_org', selectedOrg] : null,
    () => endpoints.adminOrganization(selectedOrg as string)
  );

  const dealerSummaryTotals = orgDetail?.dealer_summary?.totals;
  const dealerSummaryRows = orgDetail?.dealer_summary?.rows ?? [];
  const overdueDealers = dealerSummaryRows.filter((row) => (row.days_since_payment ?? 0) > 30).length;

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

      await endpoints.adminCreateBrand(selectedOrg, payload);
      await Promise.all([mutateOrg(), mutateOverview()]);
      setBrandForm({ name: '', slug: '', logoUrl: '', aliases: '' });
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
      setBrandForm({ name: '', slug: '', logoUrl: '', aliases: '' });
      setBrandError('');
      setShowBrandForm(true);
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

      if (orgForm.metadataNotes.trim()) payload.metadata = { notes: orgForm.metadataNotes.trim() };

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
        <h1 style={{ fontSize: 26, fontWeight: 600 }}>Panel Superadmin Global</h1>
        <p style={{ maxWidth: 720, color: '#4b5563' }}>
          Revisa organizaciones, marcas, dealers y usuarios configurados en Supabase. Usa este
          panel para detectar huecos antes de delegar accesos.
        </p>
        {!SUPERADMIN_TOKEN_CONFIGURED ? (
          <div style={{ padding: '8px 12px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6 }}>
            Define las variables de entorno <code>SUPERADMIN_API_TOKEN</code> en el backend y
            <code> NEXT_PUBLIC_SUPERADMIN_TOKEN</code> en el frontend para proteger estas APIs.
          </div>
        ) : null}
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
      </header>

      {showOrgForm ? (
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
            Organizaciones ({data?.organizations?.length ?? 0})
          </div>
          <div style={{ display: 'grid' }}>
            {isLoading ? (
              <p style={{ padding: 16 }}>Cargando...</p>
            ) : data?.organizations?.length ? (
              data.organizations.map((org) => {
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
                  {updatingPackage ? (
                    <span style={{ fontSize: 12, color: '#2563eb' }}>Guardando...</span>
                  ) : null}
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
                </div>
                {updateError ? (
                  <p style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{updateError}</p>
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
                </div>
              </section>

              <section style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 16 }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600 }}>Marcas</h3>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{orgDetail.brands.length} registradas</span>
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
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Nombre</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Slug</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Dealers</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Actualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgDetail.brands.map((brand) => (
                        <tr key={brand.id}>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{brand.name}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace' }}>{brand.slug}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{brand.dealer_count}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{formatDate(brand.updated_at)}</td>
                        </tr>
                      ))}
                      {orgDetail.brands.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280' }}>Sin marcas registradas.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <section style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 16 }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600 }}>Dealers</h3>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{orgDetail.dealers.length} registrados</span>
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
                          return (
                            <tr
                              key={dealer.id}
                              style={{ background: paused ? '#fef3c7' : isActiveBillingPanel ? '#eef2ff' : undefined }}
                            >
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', fontWeight: 500 }}>{dealer.name}</td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{brand?.name ?? '—'}</td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', color: '#4b5563' }}>{dealer.address || '—'}</td>
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

              {billingPanel ? (
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
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Templates</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Gestión dealers</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Permisos</th>
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>Actualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgDetail.users.map((user) => {
                        const brand = user.brand_id ? orgDetail.brands.find((b) => b.id === user.brand_id) : undefined;
                        const dealer = user.dealer_location_id ? orgDetail.dealers.find((d) => d.id === user.dealer_location_id) : undefined;
                        const dealerAdmin = Boolean(user.feature_flags?.dealer_admin);
                        const canManageDealers = user.role === 'superadmin_oem';
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
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{user.template_count}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
                              {canManageDealers ? (
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
                                      ? 'Revocar permiso'
                                      : 'Permitir crear dealers'}
                                </button>
                              ) : (
                                <span style={{ fontSize: 12, color: '#6b7280' }}>—</span>
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
                              <button
                                onClick={() => openPermissionModal(user)}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 6,
                                  border: '1px solid #0f172a',
                                  background: '#0f172a',
                                  color: '#fff',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                }}
                              >
                                Ajustar permisos
                              </button>
                            </td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{formatDate(user.updated_at)}</td>
                          </tr>
                        );
                      })}
                      {orgDetail.users.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280' }}>Sin usuarios dados de alta.</td>
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
    </>
  );
}
