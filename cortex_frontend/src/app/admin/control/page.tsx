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
};

type EditFormState = {
  name: string;
  displayName: string;
  package: OrgPackage;
  orgType: OrgType;
  allowDealerCreation: boolean;
  dealerLimit: string;
};

const EMPTY_EDIT_FORM: EditFormState = {
  name: '',
  displayName: '',
  package: 'marca',
  orgType: 'oem',
  allowDealerCreation: false,
  dealerLimit: '',
};

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
  const [userForm, setUserForm] = React.useState({ email: '', role: 'superadmin_oem', dealerAdmin: true });
  const [userFormStatus, setUserFormStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [userFormLoading, setUserFormLoading] = React.useState(false);

  const organizations = React.useMemo(() => data?.organizations ?? [], [data?.organizations]);
  const oemCount = React.useMemo(() => organizations.filter((org) => organizationType(org.metadata) === 'oem').length, [organizations]);
  const dealerCount = organizations.length - oemCount;
  const brandOptions = React.useMemo(() => {
    const catalog = brandCatalog?.brands || [];
    const seen = new Set<string>();
    const options: Array<{ id: string; name: string }> = [];
    for (const item of catalog) {
      const rawName = String(item?.name || '').trim();
      if (!rawName) continue;
      const key = rawName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const rawId = item?.id ? String(item.id) : key;
      options.push({ id: rawId, name: rawName });
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
      setUserForm({ email: '', role: 'superadmin_oem', dealerAdmin: true });
      return;
    }
    hydrateEditForm();
    setBrandLimitDrafts({});
    setBrandLimitFeedback(null);
    setBrandFormStatus(null);
    setUserFormStatus(null);
  }, [editingOrgId, hydrateEditForm]);

  const applyPreset = React.useCallback((preset: typeof PRESETS[number]) => {
    setForm((prev) => ({
      ...prev,
      package: preset.package,
      orgType: preset.orgType,
      allowDealerCreation: preset.orgType === 'grupo' ? true : prev.allowDealerCreation,
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
    } catch {
      /* ignore */
    }
  }, []);

  const handleOpenOemPanel = React.useCallback(
    (orgId: string, orgName: string) => {
      if (typeof window === 'undefined') return;
      try {
        applyAllowedBrands([]);
        window.localStorage.setItem('CORTEX_SUPERADMIN_ORG_ID', orgId);
        window.open(`/panel/oem?org=${orgId}`, '_blank', 'noopener');
        setPanelNotice({ type: 'success', message: `Se abrió el panel OEM como ${orgName}.` });
      } catch {
        setPanelNotice({ type: 'error', message: 'No se pudo abrir el panel OEM en este navegador.' });
      }
    },
    [applyAllowedBrands],
  );


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
                          <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Acceso</th>
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
                            <td style={{ padding: '8px 10px' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                <a
                                  href={`/panel/dealer?org=${org.id}`}
                                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #2563eb', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                                >
                                  Panel dealer
                                </a>
                                {group === 'oem' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenOemPanel(org.id, org.name)}
                                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #0e7490', background: '#0e7490', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                                  >
                                    Panel OEM
                                  </button>
                                ) : null}
                              </div>
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
