"use client";

import React from 'react';
import PrintHeader from '@/components/PrintHeader';
import VehicleSelect from '@/components/VehicleSelect';
import DealerPanel from '@/components/DealerPanel';
import { endpoints } from '@/lib/api';

type DealerContext = {
  id: string;
  name: string;
  location: string;
  contactName: string;
  contactPhone: string;
};

type DealerStatusInfo = {
  dealer_id: string;
  dealer_name?: string;
  status?: string;
  paused_at?: string | null;
  service_started_at?: string | null;
  brand_name?: string | null;
  organization_name?: string | null;
  organization_status?: string | null;
  organization_paused_at?: string | null;
  blocked?: boolean;
};

const emptyContext: DealerContext = {
  id: '',
  name: '',
  location: '',
  contactName: '',
  contactPhone: '',
};

function persistDealerContext(ctx: DealerContext) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('CORTEX_DEALER_CONTEXT', JSON.stringify(ctx));
    if (ctx.id) {
      window.localStorage.setItem('CORTEX_DEALER_ID', ctx.id);
    } else {
      window.localStorage.removeItem('CORTEX_DEALER_ID');
    }
  } catch {}
}

export default function DealersPage() {
  const [context, setContext] = React.useState<DealerContext>(emptyContext);
  const [contextLoaded, setContextLoaded] = React.useState(false);
  const [statusInfo, setStatusInfo] = React.useState<DealerStatusInfo | null>(null);
  const [statusError, setStatusError] = React.useState('');
  const [statusLoading, setStatusLoading] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('CORTEX_DEALER_CONTEXT');
      if (raw) {
        const parsed = JSON.parse(raw as string);
        setContext({ ...emptyContext, ...parsed });
        if (parsed?.id) {
          window.localStorage.setItem('CORTEX_DEALER_ID', parsed.id);
        }
      }
    } catch {}
    setContextLoaded(true);
  }, []);

  const handleContextChange = (field: keyof DealerContext) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setContext((prev) => {
      const next = { ...prev, [field]: value };
      if (contextLoaded) persistDealerContext(next);
      return next;
    });
  };

  const clearContext = () => {
    setContext(emptyContext);
    setStatusInfo(null);
    setStatusError('');
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('CORTEX_DEALER_CONTEXT');
        window.localStorage.removeItem('CORTEX_DEALER_ID');
      } catch {}
    }
  };

  const fetchStatus = React.useCallback(async (dealerId: string) => {
    if (!dealerId) {
      setStatusInfo(null);
      setStatusError('');
      return;
    }
    setStatusLoading(true);
    setStatusError('');
    try {
      const result = await endpoints.dealerStatus(dealerId.trim());
      const blocked = result?.status === 'paused' || result?.organization_status === 'paused';
      setStatusInfo({ ...result, blocked });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo obtener el estado del dealer';
      setStatusError(message);
      setStatusInfo(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!contextLoaded) return;
    if (!context.id) {
      setStatusInfo(null);
      setStatusError('');
      if (typeof window !== 'undefined') {
        try { window.localStorage.removeItem('CORTEX_DEALER_ID'); } catch {}
      }
      return;
    }
    persistDealerContext(context);
    fetchStatus(context.id);
  }, [context.id, contextLoaded, fetchStatus]);

  const blocked = Boolean(statusInfo?.blocked);

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <PrintHeader />
      <section style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 16, background: '#fff', display: 'grid', gap: 12 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Identidad del dealer</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Configura tu concesionario para habilitar los comparativos y auditoría de accesos.</p>
          </div>
          <button
            onClick={clearContext}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 12, cursor: 'pointer' }}
          >
            Limpiar datos
          </button>
        </header>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Dealer UUID (obtenido del panel de superadmin)
            <input
              value={context.id}
              onChange={handleContextChange('id')}
              placeholder="00000000-0000-0000-0000-000000000000"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', fontFamily: 'monospace' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Nombre comercial
            <input
              value={context.name}
              onChange={handleContextChange('name')}
              placeholder="Mazda Hermosillo"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Ciudad / localidad
            <input
              value={context.location}
              onChange={handleContextChange('location')}
              placeholder="Hermosillo, Sonora"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Asesor responsable
            <input
              value={context.contactName}
              onChange={handleContextChange('contactName')}
              placeholder="Nombre del asesor"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Teléfono asesor
            <input
              value={context.contactPhone}
              onChange={handleContextChange('contactPhone')}
              placeholder="+52 ..."
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {context.id ? (
            <button
              onClick={() => fetchStatus(context.id)}
              disabled={statusLoading}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #4f46e5', background: statusLoading ? '#cbd5f5' : '#4f46e5', color: '#fff', fontSize: 12, cursor: statusLoading ? 'default' : 'pointer' }}
            >
              {statusLoading ? 'Verificando…' : 'Actualizar estado'}
            </button>
          ) : null}
          {statusInfo ? (
            <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: blocked ? '#fee2e2' : '#dcfce7', color: blocked ? '#991b1b' : '#166534' }}>
              {blocked ? 'Acceso en pausa' : 'Acceso activo'}
              {statusInfo.organization_name ? ` · ${statusInfo.organization_name}` : ''}
            </span>
          ) : null}
          {!context.id ? (
            <span style={{ fontSize: 12, color: '#b91c1c' }}>Ingresa el UUID del dealer para habilitar el comparador.</span>
          ) : null}
          {statusError ? (
            <span style={{ fontSize: 12, color: '#b91c1c' }}>{statusError}</span>
          ) : null}
        </div>

        {statusInfo?.status === 'paused' ? (
          <p style={{ fontSize: 12, color: '#b91c1c', margin: 0 }}>
            El superadmin pausó temporalmente este dealer. Contacta a tu marca para reactivar el acceso.
          </p>
        ) : null}
        {statusInfo?.organization_status === 'paused' ? (
          <p style={{ fontSize: 12, color: '#b91c1c', margin: 0 }}>
            La organización completa está en pausa; no podrás generar comparativos hasta nuevo aviso.
          </p>
        ) : null}
      </section>

      <div className="no-print">
        <VehicleSelect />
      </div>

      <DealerPanel dealerContext={context} dealerStatus={statusInfo || undefined} />
    </main>
  );
}
