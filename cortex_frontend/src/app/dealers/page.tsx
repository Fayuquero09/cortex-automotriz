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
  address: string;
  normalizedAddress: string;
  city: string;
  state: string;
  postalCode: string;
  serviceStartedAt: string;
  brandId: string;
  brandName: string;
  locked?: boolean;
};

type DealerUserSummary = {
  id: string;
  email: string;
  role: string;
  name: string;
  phone: string;
  createdAt: string;
  dealerAdmin: boolean;
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
  address: '',
  normalizedAddress: '',
  city: '',
  state: '',
  postalCode: '',
  serviceStartedAt: '',
  brandId: '',
  brandName: '',
  locked: false,
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
  const [contextLocked, setContextLocked] = React.useState(false);
  const [statusInfo, setStatusInfo] = React.useState<DealerStatusInfo | null>(null);
  const [statusError, setStatusError] = React.useState('');
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [previewMode, setPreviewMode] = React.useState(false);
  const [dealerUsers, setDealerUsers] = React.useState<DealerUserSummary[]>([]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const flag = params.get('preview') || window.localStorage.getItem('CORTEX_DEALER_PREVIEW') || '';
      const normalized = flag.toLowerCase();
      const isPreview = ['1', 'true', 'preview', 'yes'].includes(normalized);
      setPreviewMode(isPreview);
      if (isPreview) {
        window.localStorage.removeItem('CORTEX_DEALER_PREVIEW');
      }
    } catch {
      setPreviewMode(false);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('CORTEX_DEALER_CONTEXT');
      let initialLocked = false;
      if (raw) {
        try {
          const parsed = JSON.parse(raw as string) as Partial<DealerContext>;
          const merged: DealerContext = { ...emptyContext, ...parsed };
          setContext(merged);
          if (merged.id) {
            window.localStorage.setItem('CORTEX_DEALER_ID', merged.id);
          }
          if (typeof parsed.locked === 'boolean') {
            initialLocked = Boolean(parsed.locked);
          }
        } catch {
          setContext(emptyContext);
        }
      }
      const rawUsers = window.localStorage.getItem('CORTEX_DEALER_USERS');
      if (rawUsers) {
        try {
          const parsed = JSON.parse(rawUsers) as DealerUserSummary[];
          if (Array.isArray(parsed)) setDealerUsers(parsed);
        } catch {
          setDealerUsers([]);
        }
      }
      const rawLock = window.localStorage.getItem('CORTEX_DEALER_CONTEXT_LOCKED');
      const lockFromStorage = raw && rawLock === '1';
      setContextLocked(initialLocked || lockFromStorage);
    } catch {}
    setContextLoaded(true);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleContextEvent = (event: Event) => {
      try {
        const detail = (event as CustomEvent<Partial<DealerContext>>).detail;
        if (detail) {
          setContext((prev) => {
            const next = { ...prev, ...detail };
            persistDealerContext(next);
            return next;
          });
          if (typeof detail.locked === 'boolean') {
            const locked = detail.locked;
            setContextLocked(locked);
            try {
              if (locked) {
                window.localStorage.setItem('CORTEX_DEALER_CONTEXT_LOCKED', '1');
              } else {
                window.localStorage.removeItem('CORTEX_DEALER_CONTEXT_LOCKED');
              }
            } catch {}
          }
        }
      } catch {}
    };
    const handleUsersEvent = (event: Event) => {
      try {
        const detail = (event as CustomEvent<DealerUserSummary[]>).detail;
        if (Array.isArray(detail)) {
          setDealerUsers(detail);
          if (typeof window !== 'undefined') {
            try { window.localStorage.setItem('CORTEX_DEALER_USERS', JSON.stringify(detail)); } catch {}
          }
        }
      } catch {}
    };
    const handleLockEvent = (event: Event) => {
      try {
        const detail = (event as CustomEvent<boolean>).detail;
        const locked = Boolean(detail);
        setContextLocked(locked);
        setContext((prev) => ({ ...prev, locked }));
        try {
          if (locked) {
            window.localStorage.setItem('CORTEX_DEALER_CONTEXT_LOCKED', '1');
          } else {
            window.localStorage.removeItem('CORTEX_DEALER_CONTEXT_LOCKED');
          }
        } catch {}
      } catch {}
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'CORTEX_DEALER_CONTEXT' && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as Partial<DealerContext>;
          setContext({ ...emptyContext, ...parsed });
        } catch {}
      }
      if (event.key === 'CORTEX_DEALER_USERS') {
        if (event.newValue) {
          try {
            const parsed = JSON.parse(event.newValue) as DealerUserSummary[];
            setDealerUsers(Array.isArray(parsed) ? parsed : []);
          } catch {
            setDealerUsers([]);
          }
        } else {
          setDealerUsers([]);
        }
      }
      if (event.key === 'CORTEX_DEALER_CONTEXT_LOCKED') {
        setContextLocked(event.newValue === '1');
        setContext((prev) => ({ ...prev, locked: event.newValue === '1' }));
      }
    };
    window.addEventListener('cortex:dealer_context', handleContextEvent as EventListener);
    window.addEventListener('cortex:dealer_users', handleUsersEvent as EventListener);
    window.addEventListener('cortex:dealer_context_lock', handleLockEvent as EventListener);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('cortex:dealer_context', handleContextEvent as EventListener);
      window.removeEventListener('cortex:dealer_users', handleUsersEvent as EventListener);
      window.removeEventListener('cortex:dealer_context_lock', handleLockEvent as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const handleContextChange = (field: keyof DealerContext) => (event: React.ChangeEvent<HTMLInputElement>) => {
    if (contextLocked) return;
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
    setDealerUsers([]);
    setContextLocked(false);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('CORTEX_DEALER_CONTEXT');
        window.localStorage.removeItem('CORTEX_DEALER_ID');
        window.localStorage.removeItem('CORTEX_DEALER_USERS');
        window.localStorage.removeItem('CORTEX_DEALER_CONTEXT_LOCKED');
        window.dispatchEvent(new CustomEvent('cortex:dealer_context_lock', { detail: false }));
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
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', fontFamily: 'monospace', background: contextLocked ? '#f1f5f9' : '#fff' }}
              readOnly={contextLocked}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Nombre comercial
            <input
              value={context.name}
              onChange={handleContextChange('name')}
              placeholder="Mazda Hermosillo"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', background: contextLocked ? '#f1f5f9' : '#fff' }}
              readOnly={contextLocked}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Ciudad / localidad
            <input
              value={context.location}
              onChange={handleContextChange('location')}
              placeholder="Hermosillo, Sonora"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', background: contextLocked ? '#f1f5f9' : '#fff' }}
              readOnly={contextLocked}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Asesor responsable
            <input
              value={context.contactName}
              onChange={handleContextChange('contactName')}
              placeholder="Nombre del asesor"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', background: contextLocked ? '#f1f5f9' : '#fff' }}
              readOnly={contextLocked}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Teléfono asesor
            <input
              value={context.contactPhone}
              onChange={handleContextChange('contactPhone')}
              placeholder="+52 ..."
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5f5', background: contextLocked ? '#f1f5f9' : '#fff' }}
              readOnly={contextLocked}
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
          {previewMode ? (
            <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: '#e0f2fe', color: '#0c4a6e' }}>
              Vista libre (sin UUID)
            </span>
          ) : null}
          {!context.id && !previewMode ? (
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

      <DealerPanel dealerContext={context} dealerStatus={statusInfo || undefined} dealerUsers={dealerUsers} previewMode={previewMode} />
    </main>
  );
}
