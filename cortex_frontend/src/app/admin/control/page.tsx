"use client";

import React from 'react';
import useSWR from 'swr';
import { endpoints } from '@/lib/api';

type OrgPresetKey = 'oem' | 'dealer';

const PRESETS: Array<{ key: OrgPresetKey; label: string; helper: string; package: 'marca' | 'black_ops'; orgType: 'oem' | 'grupo' }> = [
  {
    key: 'oem',
    label: 'OEM / Marca',
    helper: 'Acceso completo al panel OEM, marcas y comparativos.',
    package: 'marca',
    orgType: 'oem',
  },
  {
    key: 'dealer',
    label: 'Grupo Dealer',
    helper: 'Solo panel de vendedor. Sin acceso a funciones OEM ni Black Ops.',
    package: 'marca',
    orgType: 'grupo',
  },
];

type OrganizationSummary = {
  id: string;
  name: string;
  package: 'marca' | 'black_ops';
  metadata?: Record<string, any> | null;
};

type AdminOverviewResponse = {
  organizations: OrganizationSummary[];
};

type FormState = {
  name: string;
  orgType: 'oem' | 'grupo';
  pkg: 'marca' | 'black_ops';
  superEmail: string;
  superPhone: string;
};

const emptyForm: FormState = {
  name: '',
  orgType: 'oem',
  pkg: 'marca',
  superEmail: '',
  superPhone: '',
};

function packageLabel(value: 'marca' | 'black_ops'): string {
  return value === 'black_ops' ? 'Black Ops' : 'Marca';
}

export default function SuperadminControlPage(): React.JSX.Element {
  const { data, error, isLoading, mutate } = useSWR<AdminOverviewResponse>('admin_control_overview', endpoints.adminOverview);
  const [form, setForm] = React.useState<FormState>({ ...emptyForm });
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string>('');
  const [errorMsg, setErrorMsg] = React.useState<string>('');

  const organizations = React.useMemo(() => data?.organizations ?? [], [data?.organizations]);
  const oemCount = React.useMemo(() => organizations.filter((org) => (org.metadata?.org_type ?? '').toLowerCase().includes('grupo') === false).length, [organizations]);
  const dealerCount = React.useMemo(() => organizations.filter((org) => String(org.metadata?.org_type || '').toLowerCase().includes('grupo')).length, [organizations]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const minimal = organizations.map((org) => {
        const meta = org.metadata || {};
        const rawType = String(meta.org_type || '').toLowerCase();
        const orgType = rawType.includes('grupo') ? 'grupo' : 'oem';
        return {
          id: org.id,
          name: org.name,
          orgType,
          panelOemUrl: `/admin?view=oem&org=${org.id}`,
          panelDealerUrl: `/admin?view=oem&org=${org.id}`,
          panelSuperadminUrl: `/admin?org=${org.id}`,
        };
      });
      window.localStorage.setItem('CORTEX_NAV_ORGS', JSON.stringify(minimal));
      window.dispatchEvent(new CustomEvent('cortex:nav_orgs'));
    } catch {}
  }, [organizations]);

  const updateForm = React.useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const applyPreset = React.useCallback((presetKey: OrgPresetKey) => {
    const preset = PRESETS.find((item) => item.key === presetKey);
    if (preset) {
      setForm((prev) => ({ ...prev, pkg: preset.package, orgType: preset.orgType }));
      setMessage(`Plantilla ${preset.label} aplicada. Completa el nombre y guarda.`);
    }
  }, []);

  const handleCreate = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setErrorMsg('Escribe el nombre interno de la organización.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        package: form.pkg,
        metadata: { org_type: form.orgType },
      };
      if (form.superEmail.trim()) {
        payload.superadmin = {
          email: form.superEmail.trim(),
          phone: form.superPhone.trim() || undefined,
        };
      }
      const response = await endpoints.adminCreateOrganization(payload);
      await mutate();
      const tempPassword = response?.superadmin?.temp_password as string | undefined;
      const supEmail = response?.superadmin?.email as string | undefined;
      if (supEmail && tempPassword) {
        setMessage(`Organización creada. Superadmin ${supEmail} (contraseña temporal: ${tempPassword}).`);
      } else {
        setMessage('Organización creada correctamente.');
      }
      setForm({ ...emptyForm, pkg: form.pkg, orgType: form.orgType });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear la organización';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }, [form, mutate]);

  return (
    <main style={{ display: 'grid', gap: 24, padding: 24 }}>
      <section style={{ display: 'grid', gap: 16 }}>
        <header>
          <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>Control rápido de organizaciones</h1>
          <p style={{ margin: '4px 0 0', color: '#475569', maxWidth: 720 }}>
            Crea OEMs o grupos dealer en segundos. Asigna opcionalmente un superadmin inicial y continúa su configuración desde los paneles dedicados.
          </p>
        </header>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {PRESETS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => applyPreset(item.key)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 12,
                border:
                  form.pkg === item.package && form.orgType === item.orgType
                    ? '2px solid #2563eb'
                    : '1px solid #cbd5f5',
                background:
                  form.pkg === item.package && form.orgType === item.orgType
                    ? '#eff6ff'
                    : '#fff',
                cursor: 'pointer',
                display: 'grid',
                gap: 6,
              }}
            >
              <span style={{ fontWeight: 600 }}>{item.label}</span>
              <span style={{ fontSize: 12, color: '#475569' }}>{item.helper}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleCreate} style={{ display: 'grid', gap: 12, padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Nombre interno</label>
            <input
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
              placeholder="Ej. Peugeot México"
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
              required
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Tipo de organización</label>
            <select
              value={form.orgType}
              onChange={(e) => updateForm('orgType', e.target.value as FormState['orgType'])}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', maxWidth: 220 }}
            >
              <option value="oem">OEM / Marca</option>
              <option value="grupo">Grupo / Agencia</option>
            </select>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Paquete</label>
            <select
              value={form.pkg}
              onChange={(e) => updateForm('pkg', e.target.value as FormState['pkg'])}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', maxWidth: 220 }}
            >
              <option value="marca">Paquete Marca</option>
              <option value="black_ops">Paquete Black Ops</option>
            </select>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Superadmin (opcional)</label>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <input
                value={form.superEmail}
                onChange={(e) => updateForm('superEmail', e.target.value)}
                placeholder="Correo"
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                type="email"
              />
              <input
                value={form.superPhone}
                onChange={(e) => updateForm('superPhone', e.target.value)}
                placeholder="Teléfono"
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
              />
            </div>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Si indicas un correo, generaremos un superadmin con contraseña temporal.
            </span>
          </div>

          {errorMsg ? (
            <div style={{ padding: '8px 10px', borderRadius: 8, background: '#fef2f2', color: '#b91c1c' }}>{errorMsg}</div>
          ) : null}
          {message ? (
            <div style={{ padding: '8px 10px', borderRadius: 8, background: '#ecfdf5', color: '#0f766e' }}>{message}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: loading ? '#94a3b8' : '#1d4ed8',
              color: '#fff',
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              maxWidth: 220,
            }}
          >
            {loading ? 'Creando…' : 'Crear organización'}
          </button>
        </form>
      </section>

      <section style={{ display: 'grid', gap: 16 }}>
        <header>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Organizaciones disponibles</h2>
          <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 13 }}>
            OEM registradas: {oemCount} · Grupos dealer: {dealerCount}
          </p>
        </header>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a
            className="app-link"
            href="/panel/oem"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 10,
              background: '#1d4ed8',
              color: '#fff',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <img src="/icon-oem.svg" alt="" width={14} height={14} style={{ filter: 'invert(1)' }} />
            Ir al Panel OEM
          </a>
          <a
            className="app-link"
            href="/panel/dealer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 10,
              background: '#15803d',
              color: '#fff',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <img src="/icon-dealer.svg" alt="" width={14} height={14} style={{ filter: 'invert(1)' }} />
            Ir al Panel Dealer
          </a>
        </div>
      </section>

      <section style={{ border: '1px dashed #cbd5f5', borderRadius: 12, padding: 16, background: '#f8fafc', color: '#1f2937' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>Usuarios self-service</h2>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#475569' }}>
          Para asesores individuales usa el flujo self-service. No requiere crear organización; cada usuario define su marca y datos de PDF.
        </p>
        <a
          href="/membership"
          style={{
            display: 'inline-block',
            padding: '8px 14px',
            borderRadius: 10,
            border: '1px solid #2563eb',
            color: '#2563eb',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Abrir flujo self-service
        </a>
      </section>
    </main>
  );
}
