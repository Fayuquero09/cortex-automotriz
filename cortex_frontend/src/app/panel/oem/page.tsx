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
  };
  brands: Array<{ id: string; name: string; slug?: string | null }>;
  dealers?: Array<{
    id: string;
    name?: string | null;
    brand_id?: string | null;
    metadata?: Record<string, any> | null;
    status?: string | null;
    service_started_at?: string | null;
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

export default function PanelOemPage(): React.JSX.Element {
  const { data, error, isLoading } = useSWR<AdminOverviewResponse>('panel_oem_overview', endpoints.adminOverview);
  const organizations = React.useMemo(() => {
    const list = data?.organizations ?? [];
    return list.filter((org) => orgType(org.metadata) === 'oem').sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [data?.organizations]);

  const [selectedOrgId, setSelectedOrgId] = React.useState<string>('');
  const selectedOrg = React.useMemo(() => organizations.find((org) => org.id === selectedOrgId) || null, [organizations, selectedOrgId]);
  const { data: orgDetail, error: orgDetailError } = useSWR<OrganizationDetail>(
    selectedOrgId ? ['panel_oem_org_detail', selectedOrgId] : null,
    () => endpoints.adminOrganization(selectedOrgId),
  );

  const selectedOrgBrands = React.useMemo(() => {
    const brands = orgDetail?.brands || [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const brand of brands) {
      const label = String(brand?.name || '').trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(label);
    }
    return list;
  }, [orgDetail?.brands]);

  const brandIdToName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const brand of orgDetail?.brands || []) {
      const name = String(brand?.name || '').trim();
      if (brand?.id && name) map.set(brand.id, name);
    }
    return map;
  }, [orgDetail?.brands]);

  const brandStats = React.useMemo(() => {
    const stats = new Map<string, { name: string; total: number }>();
    for (const name of selectedOrgBrands) {
      const key = name.toLowerCase();
      if (!stats.has(key)) stats.set(key, { name, total: 0 });
    }
    for (const dealer of orgDetail?.dealers || []) {
      const brandId = String(dealer?.brand_id || '').trim();
      const name = brandId ? (brandIdToName.get(brandId) || '') : '';
      const label = name || 'Sin marca';
      const key = label.toLowerCase();
      if (!stats.has(key)) stats.set(key, { name: label, total: 0 });
      const entry = stats.get(key);
      if (entry) entry.total += 1;
    }
    return Array.from(stats.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [brandIdToName, orgDetail?.dealers, selectedOrgBrands]);

  const dealerRows = React.useMemo(() => orgDetail?.dealers || [], [orgDetail?.dealers]);

  const resetAllowedBrands = React.useCallback(() => {
    try {
      window.localStorage.removeItem('CORTEX_ALLOWED_BRANDS');
      window.dispatchEvent(new CustomEvent('cortex:allowed_brands', { detail: [] }));
    } catch {}
  }, []);

  const openOemPanel = React.useCallback(
    (org: OrganizationSummary | null, brandList: string[], target: '_self' | '_blank' = '_self') => {
      if (!org || typeof window === 'undefined') return;
      try {
        resetAllowedBrands();
        const storage = window.localStorage;
        const cleanupKeys = [
          'CORTEX_DEALER_ID',
          'CORTEX_DEALER_CONTEXT',
          'CORTEX_DEALER_ALLOWED_BRAND',
          'CORTEX_DEALER_CONTEXT_LOCKED',
          'CORTEX_DEALER_PREVIEW',
          'CORTEX_MEMBERSHIP_SESSION',
          'CORTEX_MEMBERSHIP_STATUS',
          'CORTEX_MEMBERSHIP_BRAND',
          'CORTEX_MEMBERSHIP_PHONE',
        ];
        cleanupKeys.forEach((key) => {
          try { storage.removeItem(key); } catch {}
        });
        storage.setItem('CORTEX_SUPERADMIN_ORG_ID', org.id);
        storage.removeItem('CORTEX_DEALER_ALLOWED_BRAND');
        window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: '' }));
        if (brandList.length) {
          storage.setItem('CORTEX_ALLOWED_BRANDS', JSON.stringify(brandList));
          window.dispatchEvent(new CustomEvent('cortex:allowed_brands', { detail: brandList }));
        } else {
          storage.removeItem('CORTEX_ALLOWED_BRANDS');
          window.dispatchEvent(new CustomEvent('cortex:allowed_brands', { detail: [] }));
        }
        const targetUrl = new URL('/ui', window.location.origin);
        targetUrl.searchParams.set('org', org.id);
        if (target === '_self') {
          window.location.assign(targetUrl.toString());
        } else {
          window.open(targetUrl.toString(), '_blank', 'noopener');
        }
      } catch {}
    },
    [resetAllowedBrands],
  );

  const handleOpenOemPanel = React.useCallback(
    (
      event: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>,
      org: OrganizationSummary | null,
      brandList: string[],
      target: '_self' | '_blank' = '_self',
    ) => {
      event.preventDefault();
      openOemPanel(org, brandList, target);
    },
    [openOemPanel],
  );

  const handleOpenBrandPanel = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, org: OrganizationSummary | null, brandName: string) => {
      event.preventDefault();
      openOemPanel(org, brandName ? [brandName] : [], '_blank');
    },
    [openOemPanel],
  );

  const lastOpenedOrgRef = React.useRef('');
  React.useEffect(() => {
    if (!selectedOrg || !selectedOrgId) return;
    if (lastOpenedOrgRef.current === selectedOrgId) return;
    lastOpenedOrgRef.current = selectedOrgId;
    openOemPanel(selectedOrg, selectedOrgBrands, '_self');
  }, [openOemPanel, selectedOrg, selectedOrgBrands, selectedOrgId]);

  const renderDealerLocation = (metadata?: Record<string, any> | null) => {
    const location = metadata?.location || {};
    if (typeof location !== 'object' || !location) return '—';
    const city = String(location.city || '').trim();
    const state = String(location.state || '').trim();
    if (city && state) return `${city}, ${state}`;
    return city || state || String(location.normalized || '').trim() || '—';
  };

  const renderDealerContact = (metadata?: Record<string, any> | null) => {
    const contact = metadata?.sales_contact || metadata?.contact || {};
    if (typeof contact !== 'object' || !contact) return '—';
    const name = String(contact.name || '').trim();
    const phone = String(contact.phone || '').trim();
    if (name && phone) return `${name} · ${phone}`;
    return name || phone || '—';
  };

  const handleOpenOemView = React.useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (typeof window !== 'undefined') {
      try {
        const storage = window.localStorage;
        storage.removeItem('CORTEX_DEALER_ID');
        storage.removeItem('CORTEX_DEALER_CONTEXT');
        storage.removeItem('CORTEX_ALLOWED_BRANDS');
        storage.removeItem('CORTEX_DEALER_ALLOWED_BRAND');
        storage.removeItem('CORTEX_DEALER_PREVIEW');
        storage.removeItem('CORTEX_SUPERADMIN_ORG_ID');
        storage.removeItem('CORTEX_MEMBERSHIP_SESSION');
        storage.removeItem('CORTEX_MEMBERSHIP_STATUS');
        storage.removeItem('CORTEX_MEMBERSHIP_BRAND');
        storage.removeItem('CORTEX_MEMBERSHIP_PHONE');
      } catch {}
      try {
        window.location.assign('/ui');
        return;
      } catch {}
    }
    // Fallback en caso de no tener window disponible
    window.open('/ui', '_self');
  }, []);

  return (
    <main style={{ display: 'grid', gap: 24, padding: 24 }}>
      <section style={{ display: 'grid', gap: 12 }}>
        <header>
          <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>Panel OEM (vista operativa)</h1>
          <p style={{ margin: '4px 0 0', color: '#475569', maxWidth: 720 }}>
            Selecciona una organización OEM para abrir su panel operativo o editarla en el superadmin. También puedes abrir la vista general sin impersonar.
          </p>
        </header>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <a
                href="/ui"
                onClick={handleOpenOemView}
                style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #2563eb', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
              >
                Abrir vista OEM (sin filtro)
              </a>
          <button
            type="button"
            onClick={(event) => handleOpenOemPanel(event, selectedOrg, selectedOrgBrands)}
            style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #334155', background: '#fff', color: '#334155', fontWeight: 600, cursor: selectedOrg ? 'pointer' : 'not-allowed', opacity: selectedOrg ? 1 : 0.5 }}
            disabled={!selectedOrg}
          >
            Abrir panel OEM (impersonar)
          </button>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Organización OEM</label>
          <select
            value={selectedOrgId}
            onChange={(event) => setSelectedOrgId(event.target.value)}
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', maxWidth: 320 }}
          >
            <option value="">Selecciona una organización…</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Cargando organizaciones…</p>
        ) : error ? (
          <p style={{ color: '#dc2626', fontSize: 13 }}>No se pudieron cargar las organizaciones.</p>
        ) : organizations.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Aún no has creado organizaciones OEM.</p>
        ) : null}

        {selectedOrg ? (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff', display: 'grid', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{selectedOrg.name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Paquete {selectedOrg.package === 'black_ops' ? 'Black Ops' : 'Marca'} · Alta {formatDate(selectedOrg.created_at)}</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#475569' }}>
              <span><strong>Marcas:</strong> {selectedOrg.brand_count}</span>
              <span><strong>Dealers:</strong> {selectedOrg.dealer_count}</span>
              <span><strong>Usuarios:</strong> {selectedOrg.user_count}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <button
                type="button"
                onClick={(event) => handleOpenOemPanel(event, selectedOrg, selectedOrgBrands)}
                style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #2563eb', background: '#fff', color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}
              >
                Abrir panel OEM (impersonar)
              </button>
            </div>

            {orgDetailError ? (
              <p style={{ fontSize: 12, color: '#dc2626' }}>No se pudo cargar el detalle de la organización.</p>
            ) : !orgDetail ? (
              <p style={{ fontSize: 12, color: '#64748b' }}>Cargando marcas y red de distribuidores…</p>
            ) : (
              <div style={{ display: 'grid', gap: 24 }}>
                <section style={{ display: 'grid', gap: 12 }}>
                  <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>Marcas asignadas</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Define con qué marcas puedes operar el panel OEM. Abre la vista operativa con la marca filtrada.</div>
                    </div>
                  </header>
                  {brandStats.length ? (
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                      {brandStats.map((brand) => (
                        <div key={`brand-card-${brand.name}`} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{brand.name}</div>
                          <div style={{ fontSize: 12, color: '#475569' }}>{brand.total} {brand.total === 1 ? 'dealer' : 'dealers'}</div>
                          <button
                            type="button"
                            onClick={(event) => handleOpenBrandPanel(event, selectedOrg, brand.name)}
                            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2563eb', background: '#fff', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Abrir panel de marca
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: '#64748b' }}>Esta organización aún no tiene marcas asignadas.</p>
                  )}
                </section>

                <section style={{ display: 'grid', gap: 12 }}>
                  <header>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>Red de distribuidores</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Lista de dealers registrados bajo esta OEM. Usa el panel de control para crear o editar información detallada.</div>
                  </header>
                  {dealerRows.length ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead style={{ background: '#f8fafc' }}>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>Dealer</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>Marca</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>Ubicación</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>Contacto</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>Inicio servicio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dealerRows.map((dealer) => {
                            const metadata = (dealer?.metadata || {}) as Record<string, any>;
                            const brandName = brandIdToName.get(String(dealer?.brand_id || '')) || '—';
                            return (
                              <tr key={dealer?.id || Math.random().toString(36)} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{dealer?.name || '—'}</td>
                                <td style={{ padding: '6px 8px' }}>{brandName}</td>
                                <td style={{ padding: '6px 8px' }}>{renderDealerLocation(metadata)}</td>
                                <td style={{ padding: '6px 8px' }}>{renderDealerContact(metadata)}</td>
                                <td style={{ padding: '6px 8px' }}>{formatDate(dealer?.service_started_at || null)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: '#64748b' }}>Aún no se registran dealers para esta OEM.</p>
                  )}
                </section>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
