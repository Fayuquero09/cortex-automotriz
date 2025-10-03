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
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff', display: 'grid', gap: 12 }}>
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
              <a
                href={`/admin?view=oem&org=${selectedOrg.id}`}
                style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #2563eb', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
              >
                Abrir panel OEM (impersonar)
              </a>
              <a
                href={`/admin?org=${selectedOrg.id}`}
                style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #334155', color: '#334155', textDecoration: 'none', fontWeight: 600 }}
              >
                Editar en Superadmin
              </a>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
