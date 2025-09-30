"use client";

import React from 'react';
import useSWR from 'swr';
import { endpoints } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface OrganizationSummary {
  id: string;
  name: string;
  package: string;
  metadata?: Record<string, any> | null;
}

interface AdminOverviewResponse {
  organizations: OrganizationSummary[];
}

interface DealerRecord {
  id: string;
  name: string;
  status: string;
  brand_name: string;
  service_started_at?: string | null;
}

interface BrandInfo {
  id: string;
  name: string;
}

interface AdminOrganizationDetail {
  organization: {
    id: string;
    name: string;
    metadata?: Record<string, any> | null;
  };
  brands: BrandInfo[];
  dealers: DealerRecord[];
}

const clean = (value?: string | null) => {
  const trimmed = (value || '').trim();
  return trimmed.length ? trimmed : undefined;
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return value;
  }
};

export default function OemDealersPage(): JSX.Element {
  const { data } = useSWR<AdminOverviewResponse>('admin_overview', endpoints.adminOverview, { revalidateOnFocus: false });
  const organizations = React.useMemo(() => (data?.organizations || []).filter((org) => !String(org.metadata?.org_type).toLowerCase().includes('dealer_group')), [data?.organizations]);

  const [selectedOrg, setSelectedOrg] = React.useState<string | null>(organizations[0]?.id || null);
  React.useEffect(() => {
    if (!selectedOrg && organizations.length) setSelectedOrg(organizations[0].id);
  }, [organizations, selectedOrg]);

  const { data: orgDetail, mutate: mutateOrg } = useSWR<AdminOrganizationDetail>(
    selectedOrg ? ['admin_org', selectedOrg] : null,
    () => endpoints.adminOrganization(selectedOrg as string)
  );
  const dealers = orgDetail?.dealers || [];
  const orgMetadata = React.useMemo(
    () => ((orgDetail?.organization?.metadata ?? {}) as Record<string, any>),
    [orgDetail?.organization?.metadata]
  );
  const allowDealerCreation = Boolean(orgMetadata.allow_dealer_creation);
  const dealerLimitValue = React.useMemo(() => {
    const raw = orgMetadata.dealer_creation_limit;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  }, [orgMetadata.dealer_creation_limit]);
  const dealerLimitReached = dealerLimitValue !== null && dealers.length >= dealerLimitValue;

  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const initialForm = React.useMemo(
    () => ({
      brandId: '',
      name: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      contactName: '',
      contactPhone: '',
      serviceStartedAt: today,
    }),
    [today]
  );

  const [form, setForm] = React.useState(() => initialForm);
  const [formError, setFormError] = React.useState('');
  const [formSuccess, setFormSuccess] = React.useState('');
  const [formLoading, setFormLoading] = React.useState(false);

  const handleField = (field: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError('');
    setFormSuccess('');
  };

  const resetForm = () => {
    setForm({ ...initialForm });
  };

  const createDealer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOrg) {
      setFormError('Selecciona una organización primero.');
      return;
    }
    if (!allowDealerCreation) {
      setFormError('La creación de dealers está deshabilitada para esta organización.');
      return;
    }
    if (dealerLimitReached) {
      setFormError(
        dealerLimitValue !== null
          ? `Se alcanzó el límite de ${dealerLimitValue} dealers permitidos para esta organización.`
          : 'Se alcanzó el límite de dealers permitidos para esta organización.'
      );
      return;
    }
    if (!form.brandId.trim()) {
      setFormError('Selecciona la marca a la que pertenece este dealer.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('El nombre del dealer es obligatorio.');
      return;
    }
    if (!form.address.trim()) {
      setFormError('La dirección del dealer es obligatoria.');
      return;
    }
    if (!form.contactName.trim()) {
      setFormError('El nombre del asesor responsable es obligatorio.');
      return;
    }
    if (!form.contactPhone.trim()) {
      setFormError('El teléfono del asesor responsable es obligatorio.');
      return;
    }
    if (!form.serviceStartedAt.trim()) {
      setFormError('La fecha de inicio del servicio es obligatoria.');
      return;
    }
    setFormLoading(true);
    setFormError('');
    setFormSuccess('');
    try {
      const parsedDate = new Date(`${form.serviceStartedAt}T00:00:00Z`);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new Error('Fecha de inicio de servicio inválida.');
      }
      const payload: Record<string, any> = {
        brand_id: form.brandId,
        name: form.name.trim(),
        address: form.address.trim(),
        city: clean(form.city),
        state: clean(form.state),
        postal_code: clean(form.postalCode),
        contact_name: clean(form.contactName),
        contact_phone: form.contactPhone.trim(),
        service_started_at: parsedDate.toISOString(),
      };
      await endpoints.adminCreateDealer(selectedOrg, payload);
      setFormSuccess('Dealer creado correctamente.');
      resetForm();
      await mutateOrg();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo crear el dealer');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Dealers OEM</h2>
        <p className="text-sm text-slate-600">
          Registra agencias en las marcas autorizadas. Los datos ingresados se imprimen en los reportes del dealer.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600">
            Organización OEM
            <select
              className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
              value={selectedOrg || ''}
              onChange={(event) => setSelectedOrg(event.target.value || null)}
            >
              <option value="">Selecciona organización…</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {selectedOrg ? (
        <section className="grid gap-4">
          {!allowDealerCreation ? (
            <Card className="border-amber-200 bg-amber-50 text-amber-800">
              <CardContent className="text-sm">
                Esta organización no tiene habilitada la creación de dealers. Activa la opción en la configuración de la
                organización y define un límite permitido.
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-900">Dar de alta dealer</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={createDealer}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-sm text-slate-600">
                    Marca asignada *
                    <select
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={form.brandId}
                      onChange={(event) => {
                        const value = event.target.value;
                        setForm((prev) => ({ ...prev, brandId: value }));
                        setFormError('');
                        setFormSuccess('');
                      }}
                    >
                      <option value="">Selecciona marca…</option>
                      {(orgDetail?.brands || []).map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm text-slate-600">
                    Nombre comercial *
                    <Input value={form.name} onChange={handleField('name')} placeholder="Mazda Hermosillo" />
                  </label>
                  <label className="grid gap-1 text-sm text-slate-600 md:col-span-2">
                    Dirección completa *
                    <Textarea value={form.address} onChange={handleField('address')} placeholder="Calle, número, colonia" rows={2} />
                  </label>
                  <label className="grid gap-1 text-sm text-slate-600">
                    Ciudad
                    <Input value={form.city} onChange={handleField('city')} placeholder="Hermosillo" />
                  </label>
                  <label className="grid gap-1 text-sm text-slate-600">
                    Estado/Provincia
                    <Input value={form.state} onChange={handleField('state')} placeholder="Sonora" />
                  </label>
                  <label className="grid gap-1 text-sm text-slate-600">
                    Código postal
                    <Input value={form.postalCode} onChange={handleField('postalCode')} placeholder="98000" />
                  </label>
                  <label className="grid gap-1 text-sm text-slate-600">
                    Asesor responsable *
                    <Input value={form.contactName} onChange={handleField('contactName')} placeholder="Nombre del asesor" />
                  </label>
                  <label className="grid gap-1 text-sm text-slate-600">
                    Teléfono contacto *
                    <Input value={form.contactPhone} onChange={handleField('contactPhone')} placeholder="+52 ..." />
                  </label>
                  <label className="grid gap-1 text-sm text-slate-600">
                    Fecha inicio servicio *
                    <Input
                      type="date"
                      value={form.serviceStartedAt}
                      onChange={handleField('serviceStartedAt')}
                      max={today}
                    />
                  </label>
                </div>
                {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
                {formSuccess ? <p className="text-sm text-emerald-600">{formSuccess}</p> : null}
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={formLoading || !allowDealerCreation || dealerLimitReached}>
                    {formLoading ? 'Creando…' : 'Crear dealer'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={resetForm} disabled={formLoading}>
                    Limpiar formulario
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {dealerLimitValue !== null ? (
            <Card className="border-slate-200 bg-slate-50">
              <CardContent className="text-sm text-slate-600">
                Límite configurado: <strong>{dealerLimitValue}</strong> dealers.
                {' '}
                {dealerLimitReached
                  ? 'Has alcanzado el máximo permitido.'
                  : `Disponibles: ${Math.max(dealerLimitValue - dealers.length, 0)}`}
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-900">Dealers registrados ({dealers.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[360px]">
                <table className="w-full text-sm text-slate-700">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Dealer</th>
                      <th className="px-4 py-3 text-left font-medium">Marca</th>
                      <th className="px-4 py-3 text-left font-medium">Estado</th>
                      <th className="px-4 py-3 text-left font-medium">Inicio servicio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealers.length ? (
                      dealers.map((dealer: DealerRecord) => (
                        <tr key={dealer.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-semibold text-slate-900">{dealer.name}</td>
                          <td className="px-4 py-3 text-slate-600">{dealer.brand_name}</td>
                          <td className="px-4 py-3">
                            <Badge variant={dealer.status === 'paused' ? 'outline' : 'default'}>
                              {dealer.status === 'paused' ? 'Pausado' : 'Activo'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{formatDate(dealer.service_started_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-3 text-slate-500" colSpan={4}>
                          Todavía no hay dealers registrados para esta organización.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>
      ) : (
        <Card className="border-slate-200 bg-slate-50 text-slate-600">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Selecciona una organización OEM</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            Usa el selector superior para activar la organización que deseas administrar.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
