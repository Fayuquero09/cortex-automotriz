"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { endpoints } from '@/lib/api';

const STEP_LABELS = ['Verifica tu teléfono', 'Confirma tu código', 'Personaliza tu membresía'];

type BrandOption = {
  name: string;
  slug: string;
  logo_url?: string | null;
  source?: string | null;
};

type Step = 'phone' | 'code' | 'details' | 'done';

export default function MembershipPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>('phone');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [sessionToken, setSessionToken] = React.useState<string | null>(null);
  const [brands, setBrands] = React.useState<BrandOption[]>([]);
  const [selectedBrand, setSelectedBrand] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [footerNote, setFooterNote] = React.useState('');
  const [debugCode, setDebugCode] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const applyDealerState = React.useCallback(
    (
      state?: { dealer_id?: string; brand_label?: string; allowed_brands?: string[]; context?: Record<string, any> },
      fallbackBrand?: string,
    ) => {
      if (typeof window === 'undefined' || !state) return;
      try {
        const allowedRaw = Array.isArray(state.allowed_brands) ? state.allowed_brands : [];
        const normalizedAllowed = allowedRaw
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0);
        const primaryBrand = (state.brand_label || fallbackBrand || '').trim();
        const allowedSet = new Set(normalizedAllowed.map((item) => item.toLowerCase()));
        if (primaryBrand && !allowedSet.has(primaryBrand.toLowerCase())) {
          normalizedAllowed.unshift(primaryBrand);
        }

        if (normalizedAllowed.length) {
          window.localStorage.setItem('CORTEX_ALLOWED_BRANDS', JSON.stringify(normalizedAllowed));
          window.localStorage.setItem('CORTEX_DEALER_ALLOWED_BRAND', normalizedAllowed[0]);
          window.localStorage.removeItem('CORTEX_ALLOWED_BRAND_META');
          window.dispatchEvent(new CustomEvent('cortex:allowed_brand_meta', { detail: [] }));
          window.dispatchEvent(new CustomEvent('cortex:allowed_brands', { detail: normalizedAllowed }));
        } else {
          window.localStorage.removeItem('CORTEX_ALLOWED_BRANDS');
          window.localStorage.removeItem('CORTEX_DEALER_ALLOWED_BRAND');
          window.localStorage.removeItem('CORTEX_ALLOWED_BRAND_META');
          window.dispatchEvent(new CustomEvent('cortex:allowed_brand_meta', { detail: [] }));
          window.dispatchEvent(new CustomEvent('cortex:allowed_brands', { detail: [] }));
        }

        if (primaryBrand) {
          window.localStorage.setItem('CORTEX_MEMBERSHIP_BRAND', primaryBrand);
          window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: primaryBrand }));
        } else {
          window.localStorage.removeItem('CORTEX_MEMBERSHIP_BRAND');
          window.dispatchEvent(new CustomEvent('cortex:dealer_brand', { detail: '' }));
        }

        if (state.dealer_id) {
          window.localStorage.setItem('CORTEX_DEALER_ID', state.dealer_id);
        }

        if (state.context) {
          window.localStorage.setItem('CORTEX_DEALER_CONTEXT', JSON.stringify(state.context));
        }
      } catch {
        /* ignore storage errors */
      }
    },
    [],
  );

  const currentStepIndex = (() => {
    switch (step) {
      case 'phone':
        return 0;
      case 'code':
        return 1;
      case 'details':
      case 'done':
        return 2;
      default:
        return 0;
    }
  })();

  const sendCode = async () => {
    setLoading(true);
    setError(null);
    setDebugCode(null);
    try {
      const payload = await endpoints.membershipSendCode(phone);
      if (payload?.debug_code) {
        setDebugCode(String(payload.debug_code));
      }
      setSuccessMessage('Enviamos un código por WhatsApp. Revisa la conversación y escríbelo en el siguiente paso.');
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el código.');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload = await endpoints.membershipVerifyCode({ phone, code });
      if (!payload?.session) {
        throw new Error('No recibimos la sesión de membresía.');
      }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('CORTEX_MEMBERSHIP_SESSION', payload.session);
          if (payload?.paid) {
            window.localStorage.setItem('CORTEX_MEMBERSHIP_STATUS', payload.paid ? 'paid' : 'free');
          } else {
            window.localStorage.setItem('CORTEX_MEMBERSHIP_STATUS', 'free');
          }
          applyDealerState(payload?.dealer_state as any);
        } catch {}
      }
      setSessionToken(payload.session);
      setStep('details');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido o expirado.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (!sessionToken || step !== 'details') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    endpoints.membershipBrands(sessionToken)
      .then((resp) => {
        if (cancelled) return;
        const list = Array.isArray(resp?.items) ? (resp.items as BrandOption[]) : [];
        setBrands(list);
        if (list.length) {
          setSelectedBrand((prev) => prev || list[0].slug || list[0].name);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'No pudimos obtener las marcas disponibles.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken, step]);

  const saveProfile = async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const body = {
        session: sessionToken,
        brand: selectedBrand,
        pdf_display_name: displayName,
        pdf_footer_note: footerNote || undefined,
      };
      const response = await endpoints.membershipSaveProfile(body);
      const selectedOption = brands.find((b) => (b.slug || b.name) === selectedBrand) || null;
      const brandLabel = (selectedOption?.name || selectedBrand || '').trim();
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('CORTEX_MEMBERSHIP_STATUS', 'active');
          applyDealerState(response?.dealer_state as any, brandLabel);
        } catch {
          /* ignore storage errors */
        }
      }
      setSuccessMessage('¡Tu membresía self-service quedó configurada!');
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar tu configuración.');
    } finally {
      setLoading(false);
    }
  };

  const canSendCode = phone.trim().length >= 8;
  const canVerify = code.trim().length >= 4;
  const canSave = Boolean(selectedBrand && displayName.trim());

  return (
    <section style={{ display: 'grid', gap: 18 }}>
      <header>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Membresía Self-Service</h1>
        <p style={{ color: '#475569', fontSize: 14 }}>
          Completa este recorrido para habilitar la descarga de insights con tu marca personalizada.
        </p>
      </header>

      <ol style={{ display: 'flex', gap: 12, listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
        {STEP_LABELS.map((label, idx) => {
          const isActive = idx === currentStepIndex && step !== 'done';
          const isCompleted = idx < currentStepIndex || step === 'done';
          return (
            <li
              key={label}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid',
                borderColor: isCompleted ? '#4ade80' : isActive ? '#3b82f6' : '#cbd5f5',
                background: isCompleted ? '#dcfce7' : isActive ? '#eff6ff' : '#f8fafc',
                color: '#1f2937',
                fontSize: 12,
              }}
            >
              {label}
            </li>
          );
        })}
      </ol>

      {error ? (
        <div style={{ padding: '10px 12px', border: '1px solid #fecaca', borderRadius: 8, background: '#fef2f2', color: '#b91c1c' }}>
          {error}
        </div>
      ) : null}

      {successMessage && step !== 'done' ? (
        <div style={{ padding: '10px 12px', border: '1px solid #bbf7d0', borderRadius: 8, background: '#f0fdf4', color: '#166534' }}>
          {successMessage}
        </div>
      ) : null}

      {step === 'phone' ? (
        <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Número de teléfono</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10 dígitos"
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
              disabled={loading}
            />
          </label>
          <button
            type="button"
            onClick={sendCode}
            disabled={!canSendCode || loading}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: 'none',
              background: canSendCode && !loading ? '#2563eb' : '#94a3b8',
              color: '#fff',
              fontWeight: 600,
              cursor: canSendCode && !loading ? 'pointer' : 'default',
            }}
          >
            {loading ? 'Enviando…' : 'Enviar código'}
          </button>
        </div>
      ) : null}

      {step === 'code' ? (
        <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
          <p style={{ color: '#475569', fontSize: 13 }}>
            Ingresa el código de 6 dígitos que enviamos vía WhatsApp.
          </p>
          {debugCode ? (
            <div style={{ fontSize: 12, color: '#16a34a' }}>
              <strong>Código para pruebas:</strong> {debugCode}
            </div>
          ) : null}
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Código WhatsApp</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', letterSpacing: '0.2em' }}
              disabled={loading}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={verifyCode}
              disabled={!canVerify || loading}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: 'none',
                background: canVerify && !loading ? '#2563eb' : '#94a3b8',
                color: '#fff',
                fontWeight: 600,
                cursor: canVerify && !loading ? 'pointer' : 'default',
              }}
            >
              {loading ? 'Verificando…' : 'Confirmar código'}
            </button>
            <button
              type="button"
              onClick={() => setStep('phone')}
              style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#1f2937' }}
              disabled={loading}
            >
              Cambiar teléfono
            </button>
          </div>
        </div>
      ) : null}

      {step === 'details' ? (
        <div style={{ display: 'grid', gap: 14, maxWidth: 520 }}>
          <p style={{ color: '#475569', fontSize: 13 }}>
            Selecciona la marca que representas y cómo quieres que aparezca tu nombre en los PDF generados.
          </p>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Marca principal</span>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
              disabled={loading || !brands.length}
            >
              <option value="" disabled>
                {brands.length ? 'Selecciona una marca…' : 'Cargando marcas…'}
              </option>
              {brands.map((brand) => (
                <option key={`${brand.slug}-${brand.name}`} value={brand.slug || brand.name}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Nombre para tus reportes PDF</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ej. Ana García / Grupo Rivera"
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
              disabled={loading}
            />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Nota opcional para el pie del PDF</span>
            <textarea
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              placeholder={'Ej. "Oferta válida hasta agotar existencias"'}
              rows={3}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', resize: 'vertical' }}
              disabled={loading}
            />
          </label>

          <button
            type="button"
            onClick={saveProfile}
            disabled={!canSave || loading}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: 'none',
              background: canSave && !loading ? '#16a34a' : '#94a3b8',
              color: '#fff',
              fontWeight: 600,
              cursor: canSave && !loading ? 'pointer' : 'default',
            }}
          >
            {loading ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </div>
      ) : null}

      {step === 'done' ? (
        <div style={{ border: '1px solid #bbf7d0', borderRadius: 12, background: '#f0fdf4', padding: 16, display: 'grid', gap: 10, maxWidth: 520 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#166534' }}>¡Listo!</h2>
          <p style={{ margin: 0, color: '#166534' }}>Tu membresía self-service quedó configurada. A partir de ahora los insights descargados utilizarán la información que definiste.</p>
          <div style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.5 }}>
            <div><strong>Teléfono:</strong> {phone}</div>
            <div><strong>Marca seleccionada:</strong> {brands.find((b) => (b.slug || b.name) === selectedBrand)?.name || selectedBrand}</div>
            <div><strong>Nombre en PDF:</strong> {displayName}</div>
            {footerNote ? <div><strong>Nota de pie:</strong> {footerNote}</div> : null}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                try {
                  window.location.href = '/dealers';
                } catch {
                  router.push('/dealers');
                }
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#2563eb',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Ir al panel del vendedor
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('details');
                setSuccessMessage('Puedes ajustar tus datos y volver a guardar si lo necesitas.');
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #34d399',
                background: '#fff',
                color: '#065f46',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Editar configuración
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
