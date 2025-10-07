"use client";

import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { endpoints } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface DealerInfo {
  id: string;
  name: string;
  status: 'active' | 'paused';
  brand_name: string;
  service_started_at?: string | null;
}

interface BrandInfo {
  id: string;
  name: string;
  slug: string;
  dealer_count: number;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface AdminOrganizationResponse {
  organization: Record<string, any>;
  dealers: DealerInfo[];
  brands: BrandInfo[];
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export default function GroupOrganizationDetailPage(): JSX.Element {
  const params = useParams<{ orgId: string }>();
  const orgId = params?.orgId;
  const { data, error, isLoading, mutate } = useSWR<AdminOrganizationResponse>(
    orgId ? ['group_org_detail', orgId] : null,
    () => endpoints.adminOrganization(orgId as string),
  );

  const [brandForm, setBrandForm] = React.useState({ name: '', dealerLimit: '' });
  const [brandFormError, setBrandFormError] = React.useState('');
  const [brandFormSuccess, setBrandFormSuccess] = React.useState('');
  const [brandFormLoading, setBrandFormLoading] = React.useState(false);

  const [brandLimitDrafts, setBrandLimitDrafts] = React.useState<Record<string, string>>({});
  const [brandLimitFeedback, setBrandLimitFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [brandLimitSaving, setBrandLimitSaving] = React.useState('');

  const brands = React.useMemo<BrandInfo[]>(() => (data?.brands ?? []) as BrandInfo[], [data?.brands]);

  const { data: brandCatalogData, error: brandCatalogError } = useSWR<{ brands: Array<{ name: string }> }>(
    'admin_brands',
    endpoints.adminBrands,
    { revalidateOnFocus: false }
  );

  const normalizeName = React.useCallback((value: string) => {
    return value
      .normalize('NFD')
      .replace(/[^\p{Letter}\p{Number}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }, []);

  const CLUSTER_CONFIG = React.useMemo(
    () => [
      { label: 'GM · Chevrolet', members: ['Chevrolet'] },
      { label: 'GM · GMC / Buick / Cadillac', members: ['GMC', 'Buick', 'Cadillac'] },
      { label: 'Bestune · JIM', members: ['Bestune', 'JIM'] },
      {
        label: 'Stellantis',
        members: [
          'Alfa Romeo',
          'Chrysler',
          'Citroen',
          'Citroën',
          'Dodge',
          'Fiat',
          'Jeep',
          'Peugeot',
          'Ram',
          'Opel',
          'Maserati',
          'Abarth',
        ],
      },
    ],
    []
  );

  const clusterMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const cluster of CLUSTER_CONFIG) {
      for (const member of cluster.members) {
        map.set(normalizeName(member), cluster.label);
      }
    }
    return map;
  }, [CLUSTER_CONFIG, normalizeName]);

  const brandOptions = React.useMemo(() => {
    const catalog = brandCatalogData?.brands ?? [];
    const used = new Set(brands.map((brand) => brand.name.toLowerCase()));
    const seen = new Set<string>();
    const options: Array<{ value: string; label: string }> = [];
    for (const item of catalog) {
      const label = (item?.name || '').trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (used.has(key)) continue;
      options.push({ value: label, label });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [brandCatalogData?.brands, brands]);

  const brandOptionsByGroup = React.useMemo(() => {
    const groups = new Map<string, { label: string; options: Array<{ value: string; label: string }> }>();
    for (const option of brandOptions) {
      const key = normalizeName(option.label);
      const clusterLabel = clusterMap.get(key);
      const groupLabel = clusterLabel || 'Otras marcas';
      if (!groups.has(groupLabel)) {
        groups.set(groupLabel, { label: groupLabel, options: [] });
      }
      groups.get(groupLabel)!.options.push(option);
    }

    const ordered: Array<{ label: string; options: Array<{ value: string; label: string }> }> = [];
    const added = new Set<string>();
    for (const cluster of CLUSTER_CONFIG) {
      const group = groups.get(cluster.label);
      if (group) {
        group.options.sort((a, b) => a.label.localeCompare(b.label, 'es'));
        ordered.push(group);
        added.add(cluster.label);
      }
    }

    for (const [label, group] of groups.entries()) {
      if (added.has(label)) continue;
      group.options.sort((a, b) => a.label.localeCompare(b.label, 'es'));
      ordered.push(group);
    }

    return ordered;
  }, [CLUSTER_CONFIG, brandOptions, clusterMap, normalizeName]);

  React.useEffect(() => {
    setBrandLimitDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const brand of brands) {
        if (!brand.id) continue;
        if (Object.prototype.hasOwnProperty.call(prev, brand.id)) {
          next[brand.id] = prev[brand.id];
        }
      }
      return next;
    });
  }, [brands]);

  if (!orgId) {
    return <p className="text-sm text-slate-500">Selecciona un grupo desde el listado para continuar.</p>;
  }

  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50 text-rose-700">
        <CardHeader>
          <CardTitle className="text-base font-semibold">No se pudo cargar el grupo</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {error instanceof Error ? error.message : 'Intenta de nuevo más tarde.'}
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return <p className="text-sm text-slate-500">Cargando datos del grupo…</p>;
  }

  const organization = data.organization;
  const dealers = data.dealers || [];

  const handleBrandFormChange = (field: 'name' | 'dealerLimit') => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = event.target.value;
    setBrandForm((prev) => ({ ...prev, [field]: value }));
    if (brandFormError) setBrandFormError('');
    if (brandFormSuccess) setBrandFormSuccess('');
  };

  const resetBrandForm = () => {
    setBrandForm({ name: '', dealerLimit: '' });
    setBrandFormError('');
    setBrandFormSuccess('');
  };

  const toSlug = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);

  const createBrand = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!orgId) return;
    const name = brandForm.name.trim();
    const limitRaw = brandForm.dealerLimit.trim();
    if (!name) {
      setBrandFormError('Selecciona una marca del catálogo.');
      return;
    }
    const limit = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(limit) || limit <= 0) {
      setBrandFormError('Define un número válido de agencias permitidas.');
      return;
    }

    setBrandFormLoading(true);
    setBrandFormError('');
    setBrandFormSuccess('');
    try {
      const payload: Record<string, any> = {
        name,
        slug: toSlug(name),
        dealer_limit: limit,
      };
      await endpoints.adminCreateBrand(orgId, payload);
      setBrandFormSuccess('Marca agregada correctamente.');
      resetBrandForm();
      await mutate();
    } catch (err) {
      setBrandFormError(err instanceof Error ? err.message : 'No se pudo agregar la marca');
    } finally {
      setBrandFormLoading(false);
    }
  };

  const getBrandLimit = (brand: BrandInfo): number | null => {
    const meta = (brand.metadata || {}) as Record<string, any>;
    const raw = meta.dealer_limit;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const handleBrandLimitInput = (brandId: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setBrandLimitDrafts((prev) => ({ ...prev, [brandId]: value }));
    if (brandLimitFeedback) setBrandLimitFeedback(null);
  };

  const resetBrandLimitDraft = (brandId: string) => {
    setBrandLimitDrafts((prev) => {
      const next = { ...prev };
      delete next[brandId];
      return next;
    });
    if (brandLimitFeedback) setBrandLimitFeedback(null);
  };

  const saveBrandLimit = async (brand: BrandInfo) => {
    if (!brand.id) return;
    const draftRaw = brandLimitDrafts[brand.id] ?? '';
    const limit = Number.parseInt(draftRaw.trim(), 10);
    if (!Number.isFinite(limit) || limit <= 0) {
      setBrandLimitFeedback({ type: 'error', message: 'Define un número válido de agencias para la marca.' });
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
      await mutate();
    } catch (err) {
      setBrandLimitFeedback({ type: 'error', message: err instanceof Error ? err.message : 'No se pudo actualizar el límite.' });
    } finally {
      setBrandLimitSaving('');
    }
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">{organization?.name || 'Grupo'}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-slate-600">
          <div><strong>Marcas vinculadas:</strong> {brands.length}</div>
          <div><strong>Dealers activos:</strong> {dealers.filter((dealer) => dealer.status === 'active').length}</div>
          <div><strong>Creado:</strong> {formatDate(organization?.created_at)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">Marcas autorizadas ({brands.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={createBrand}>
            <div className="grid gap-1">
              <label className="text-sm font-medium text-slate-700">Marca *</label>
              <select
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={brandForm.name}
                onChange={handleBrandFormChange('name')}
                disabled={!brandOptions.length || brandFormLoading}
              >
                <option value="">Selecciona una marca…</option>
                {brandOptionsByGroup.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {brandCatalogError ? (
                <span className="text-xs text-rose-600">No se pudieron cargar las marcas disponibles.</span>
              ) : null}
              {!brandOptions.length && !brandCatalogError ? (
                <span className="text-xs text-slate-500">Todas las marcas del catálogo ya están asignadas.</span>
              ) : null}
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium text-slate-700">Agencias permitidas *</label>
              <Input
                type="number"
                min={1}
                value={brandForm.dealerLimit}
                onChange={handleBrandFormChange('dealerLimit')}
                placeholder="Ej. 10"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 md:col-span-2">
              <Button type="submit" disabled={brandFormLoading || !brandForm.name || !brandOptions.length}>
                {brandFormLoading ? 'Agregando…' : 'Agregar marca'}
              </Button>
              <Button type="button" variant="ghost" onClick={resetBrandForm} disabled={brandFormLoading}>
                Limpiar
              </Button>
              {brandFormError ? <span className="text-sm text-rose-600">{brandFormError}</span> : null}
              {brandFormSuccess ? <span className="text-sm text-emerald-600">{brandFormSuccess}</span> : null}
            </div>
          </form>

          {brandLimitFeedback ? (
            <div
              className={brandLimitFeedback.type === 'success'
                ? 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'
                : 'rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'}
            >
              {brandLimitFeedback.message}
            </div>
          ) : null}

          <ScrollArea className="max-h-[360px]">
            <table className="w-full text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Marca</th>
                  <th className="px-4 py-3 text-left font-medium">Slug</th>
                  <th className="px-4 py-3 text-left font-medium">Dealers</th>
                  <th className="px-4 py-3 text-left font-medium">Límite</th>
                </tr>
              </thead>
              <tbody>
                {brands.length ? (
                  brands.map((brand) => {
                    const limit = getBrandLimit(brand);
                    const draft = Object.prototype.hasOwnProperty.call(brandLimitDrafts, brand.id)
                      ? brandLimitDrafts[brand.id]
                      : limit != null ? String(limit) : '';
                    const saving = brandLimitSaving === brand.id;
                    const hasDraft = Object.prototype.hasOwnProperty.call(brandLimitDrafts, brand.id);
                    const hasChanges = hasDraft && draft.trim() !== (limit != null ? String(limit) : '');

                    return (
                      <tr key={brand.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-slate-900">{brand.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{brand.slug}</td>
                        <td className="px-4 py-3">{brand.dealer_count}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            <Input
                              type="number"
                              min={1}
                              value={draft}
                              onChange={handleBrandLimitInput(brand.id)}
                              className="max-w-[140px]"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => saveBrandLimit(brand)}
                                disabled={saving || !hasChanges}
                              >
                                {saving ? 'Guardando…' : 'Guardar'}
                              </Button>
                              {hasDraft ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => resetBrandLimitDraft(brand.id)}
                                  disabled={saving}
                                >
                                  Cancelar
                                </Button>
                              ) : null}
                            </div>
                            <span className="text-xs text-slate-500">
                              {limit != null
                                ? `Definido: ${limit} · Restantes: ${Math.max(limit - (brand.dealer_count ?? 0), 0)}`
                                : 'Sin límite establecido'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-slate-500" colSpan={4}>
                      Todavía no hay marcas asignadas a este grupo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">Dealers del grupo ({dealers.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[360px]">
            <table className="w-full text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Dealer</th>
                  <th className="px-4 py-3 text-left font-medium">Marca</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                  <th className="px-4 py-3 text-left font-medium">Servicio desde</th>
                  <th className="px-4 py-3 text-left font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {dealers.length ? (
                  dealers.map((dealer) => (
                    <tr key={dealer.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">{dealer.name}</td>
                      <td className="px-4 py-3">{dealer.brand_name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={dealer.status === 'paused' ? 'outline' : 'default'}>
                          {dealer.status === 'paused' ? 'Pausado' : 'Activo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{formatDate(dealer.service_started_at)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/grupos/dealers?dealer=${dealer.id}`} className="text-blue-600 underline-offset-2 hover:underline">
                          Ver portal
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-slate-500" colSpan={5}>
                      Este grupo todavía no tiene dealers registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
