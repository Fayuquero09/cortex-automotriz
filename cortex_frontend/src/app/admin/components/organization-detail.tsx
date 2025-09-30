"use client";

import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { endpoints } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { OrganizationEditForm, type OrgEditFormValues } from '@/app/admin/components/forms';

interface OrganizationRecord {
  id: string;
  name: string;
  display_name?: string | null;
  legal_name?: string | null;
  tax_id?: string | null;
  package: string;
  status?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_address?: Record<string, any> | null;
  contact_info?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  paused_at?: string | null;
}

interface BrandInfo {
  id: string;
  name: string;
  slug: string;
  dealer_count: number;
  created_at?: string | null;
}

interface DealerInfo {
  id: string;
  name: string;
  status: 'active' | 'paused';
  service_started_at: string;
  billing_notes?: string | null;
}

interface UserInfo {
  id: string;
  email?: string | null;
  role: string;
  feature_flags?: Record<string, any> | null;
  created_at: string;
}

interface DealerSummaryRow {
  id: string;
  name: string;
  status: 'active' | 'paused';
  days_since_payment?: number | null;
  days_since_event?: number | null;
  days_paused?: number | null;
  last_payment_at?: string | null;
}

interface AdminOrganizationResponse {
  organization: OrganizationRecord;
  brands: BrandInfo[];
  dealers: DealerInfo[];
  users: UserInfo[];
  dealer_summary?: {
    rows: DealerSummaryRow[];
  };
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatNumber(value?: number | null): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('es-MX').format(Number(value));
}

function buildEditDefaults(organization: OrganizationRecord): OrgEditFormValues {
  const billingAddress = (organization.billing_address ?? {}) as Record<string, any>;
  const contactInfo = (organization.contact_info ?? {}) as Record<string, any>;
  const metadata = (organization.metadata ?? {}) as Record<string, any>;
  const dealerLimit = metadata.dealer_creation_limit;

  const normalizedLimit = (() => {
    const num = Number(dealerLimit);
    if (Number.isFinite(num) && num > 0) return String(num);
    return '1';
  })();

  return {
    package: (organization.package as OrgEditFormValues['package']) || 'marca',
    name: organization.name || '',
    displayName: organization.display_name || '',
    legalName: organization.legal_name || '',
    taxId: organization.tax_id || '',
    billingEmail: organization.billing_email || '',
    billingPhone: organization.billing_phone || '',
    billingLine1: billingAddress.line1 || '',
    billingLine2: billingAddress.line2 || '',
    billingCity: billingAddress.city || '',
    billingState: billingAddress.state || '',
    billingZip: billingAddress.postal_code || '',
    billingCountry: billingAddress.country || '',
    contactName: contactInfo.name || '',
    contactPhone: contactInfo.phone || '',
    metadataNotes: metadata.notes || '',
    allowDealerCreation:
      metadata.allow_dealer_creation === undefined ? false : Boolean(metadata.allow_dealer_creation),
    allowDealerLimit: normalizedLimit,
  };
}

function buildUpdatePayload(values: OrgEditFormValues, organization: OrganizationRecord): Record<string, any> {
  const clean = (input?: string | null) => {
    const trimmed = (input ?? '').trim();
    return trimmed.length ? trimmed : null;
  };

  const payload: Record<string, any> = {
    name: values.name.trim(),
    package: values.package,
    display_name: clean(values.displayName),
    legal_name: clean(values.legalName),
    tax_id: clean(values.taxId),
    billing_email: clean(values.billingEmail),
    billing_phone: clean(values.billingPhone),
  };

  const address: Record<string, string> = {};
  const line1 = clean(values.billingLine1);
  const line2 = clean(values.billingLine2);
  const city = clean(values.billingCity);
  const state = clean(values.billingState);
  const zip = clean(values.billingZip);
  const country = clean(values.billingCountry);
  if (line1) address.line1 = line1;
  if (line2) address.line2 = line2;
  if (city) address.city = city;
  if (state) address.state = state;
  if (zip) address.postal_code = zip;
  if (country) address.country = country;
  if (Object.keys(address).length || organization.billing_address) {
    payload.billing_address = address;
  }

  const contact: Record<string, string> = {};
  const contactName = clean(values.contactName);
  const contactPhone = clean(values.contactPhone);
  if (contactName) contact.name = contactName;
  if (contactPhone) contact.phone = contactPhone;
  if (Object.keys(contact).length || organization.contact_info) {
    payload.contact_info = contact;
  }

  const existingMetadata = (organization.metadata ?? {}) as Record<string, any>;
  const metadata: Record<string, any> = { ...existingMetadata };
  const notes = clean(values.metadataNotes);
  if (notes) {
    metadata.notes = notes;
  } else {
    delete metadata.notes;
  }

  const limit = Number.parseInt(values.allowDealerLimit ?? '', 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('Define el número máximo de dealers permitidos');
  }
  metadata.dealer_creation_limit = limit;
  metadata.allow_dealer_creation = Boolean(values.allowDealerCreation);

  payload.metadata = metadata;

  return payload;
}

export default function OrganizationDetailView(): JSX.Element {
  const params = useParams<{ orgId: string }>();
  const orgId = params?.orgId;
  const { data, error, isLoading, mutate } = useSWR<AdminOrganizationResponse>(
    orgId ? ['admin_org', orgId] : null,
    () => endpoints.adminOrganization(orgId)
  );
  const [showEdit, setShowEdit] = React.useState(false);
  const [editError, setEditError] = React.useState('');
  const [editSuccess, setEditSuccess] = React.useState('');
  const [editLoading, setEditLoading] = React.useState(false);
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [statusError, setStatusError] = React.useState('');

  const organization = data?.organization;
  const brands = data?.brands ?? [];
  const dealers = data?.dealers ?? [];
  const users = data?.users ?? [];
  const dealer_summary = data?.dealer_summary;
  const editDefaults = React.useMemo(() => (organization ? buildEditDefaults(organization) : null), [organization]);

  const toggleEdit = React.useCallback(() => {
    setShowEdit((prev) => !prev);
    setEditError('');
    setEditSuccess('');
  }, []);

  const handleEditSubmit = React.useCallback(
    async (values: OrgEditFormValues) => {
      if (!orgId || !organization) return;
      setEditLoading(true);
      setEditError('');
      setEditSuccess('');
      try {
        const payload = buildUpdatePayload(values, organization);
        await endpoints.adminUpdateOrganization(orgId, payload);
        setEditSuccess('Organización actualizada correctamente.');
        setShowEdit(false);
        await mutate();
      } catch (err) {
        setEditError(err instanceof Error ? err.message : 'No se pudo actualizar la organización');
      } finally {
        setEditLoading(false);
      }
    },
    [mutate, organization, orgId]
  );

  const handleEditCancel = React.useCallback(() => {
    setShowEdit(false);
    setEditError('');
  }, []);

  const handleStatusToggle = React.useCallback(async () => {
    if (!orgId || !organization) return;
    setStatusLoading(true);
    setStatusError('');
    try {
      const action = organization.status === 'paused' ? 'resume' : 'pause';
      await endpoints.adminUpdateOrganizationStatus(orgId, { action });
      await mutate();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'No se pudo actualizar el estado');
    } finally {
      setStatusLoading(false);
    }
  }, [mutate, organization, orgId]);

  if (!orgId) {
    return <p className="text-sm text-slate-500">Selecciona una organización desde el listado para continuar.</p>;
  }

  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50 text-rose-700">
        <CardHeader>
          <CardTitle className="text-base font-semibold">No se pudo cargar la organización</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {error instanceof Error ? error.message : 'Intenta de nuevo más tarde.'}
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !organization) {
    return <p className="text-sm text-slate-500">Cargando información de la organización…</p>;
  }

  const billingAddress = organization.billing_address as Record<string, any> | undefined;
  const contactInfo = organization.contact_info as Record<string, any> | undefined;
  const metadata = organization.metadata as Record<string, any> | undefined;

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Configuración de la organización</h2>
            <p className="text-sm text-slate-600">Actualiza datos internos, contacto y estado operativo.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleStatusToggle}
              disabled={statusLoading}
            >
              {statusLoading
                ? 'Actualizando…'
                : organization.status === 'paused'
                  ? 'Reactivar organización'
                  : 'Pausar organización'}
            </Button>
            <Button size="sm" onClick={toggleEdit} variant={showEdit ? 'secondary' : 'default'}>
              {showEdit ? 'Cerrar edición' : 'Editar organización'}
            </Button>
          </div>
        </div>
        {statusError ? <p className="text-sm text-rose-600">{statusError}</p> : null}
        {editError ? <p className="text-sm text-rose-600">{editError}</p> : null}
        {editSuccess ? <p className="text-sm text-emerald-600">{editSuccess}</p> : null}
        {showEdit && editDefaults ? (
          <OrganizationEditForm
            key={organization.updated_at || organization.id}
            defaultValues={editDefaults}
            onSubmit={handleEditSubmit}
            onCancel={handleEditCancel}
            loading={editLoading}
          />
        ) : null}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">{organization.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-600">
            <div>
              <strong>Paquete:</strong>{' '}
              <Badge variant="outline" className="uppercase">
                {organization.package === 'black_ops' ? 'Black Ops' : 'Marca'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              {organization.package === 'black_ops'
                ? 'Puede seleccionar cualquier marca o modelo como vehículo propio para sus análisis.'
                : 'Sólo puede analizar la marca asignada por Cortex; vehiculo propio fijo.'}
            </p>
            <div><strong>Estado:</strong> {organization.status === 'paused' ? 'Pausada' : 'Activa'}</div>
            <div><strong>Creada:</strong> {formatDate(organization.created_at)}</div>
            <div><strong>Actualizada:</strong> {formatDate(organization.updated_at)}</div>
            <div><strong>Correo facturación:</strong> {organization.billing_email || '—'}</div>
            <div><strong>Teléfono facturación:</strong> {organization.billing_phone || '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">Contacto & notas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-600">
            <div><strong>Nombre comercial:</strong> {organization.display_name || '—'}</div>
            <div><strong>Razón social:</strong> {organization.legal_name || '—'}</div>
            <div><strong>RFC / ID:</strong> {organization.tax_id || '—'}</div>
            <div>
              <strong>Dirección:</strong>{' '}
              {billingAddress?.line1
                ? [billingAddress.line1, billingAddress.line2, billingAddress.city, billingAddress.state, billingAddress.postal_code]
                    .filter(Boolean)
                    .join(', ')
                : '—'}
            </div>
            <div>
              <strong>Contacto:</strong>{' '}
              {contactInfo?.name ? `${contactInfo.name}${contactInfo.phone ? ` · ${contactInfo.phone}` : ''}` : contactInfo?.phone || '—'}
            </div>
            <div>
              <strong>Notas:</strong>{' '}
              {metadata?.notes || '—'}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              Asegúrate de que el correo de los usuarios internos termine con <code>@{organization.billing_email?.split('@')[1] || 'compania.com'}</code> para habilitarlos como personal OEM.
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">Marcas asignadas ({brands.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-hštění
