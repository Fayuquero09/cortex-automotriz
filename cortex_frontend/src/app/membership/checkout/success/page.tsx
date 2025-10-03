"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { endpoints } from '@/lib/api';

export default function MembershipCheckoutSuccessPage(): React.JSX.Element {
  const router = useRouter();
  const [status, setStatus] = React.useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = React.useState<string>('Confirmando tu pago con Stripe…');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const membershipSession = params.get('membership_session') || params.get('session') || '';
    const checkoutSessionId = params.get('session_id') || params.get('checkout_session') || '';
    if (!membershipSession || !checkoutSessionId) {
      setStatus('error');
      setMessage('No pudimos validar el pago porque faltan parámetros en la URL.');
      return;
    }

    let cancelled = false;

    async function confirm(): Promise<void> {
      try {
        await endpoints.membershipConfirmCheckout({
          session: membershipSession,
          checkout_session_id: checkoutSessionId,
        });
        if (cancelled) return;
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem('CORTEX_MEMBERSHIP_SESSION', membershipSession);
            window.localStorage.setItem('CORTEX_MEMBERSHIP_STATUS', 'paid');
          } catch {}
        }
        setStatus('ok');
        setMessage('¡Pago confirmado! Redirigiendo al panel del vendedor…');
        setTimeout(() => {
          try {
            window.location.href = '/ui';
          } catch {
            router.push('/ui');
          }
        }, 1500);
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'No pudimos confirmar el pago.');
      }
    }

    confirm();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <section style={{ maxWidth: 540, margin: '40px auto', padding: '24px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', display: 'grid', gap: 12 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1f2937' }}>Pago de membresía</h1>
      <p style={{ fontSize: 15, color: status === 'error' ? '#dc2626' : '#334155' }}>{message}</p>
      {status === 'error' && (
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={() => {
              try {
                window.location.href = '/ui';
              } catch {
                router.push('/ui');
              }
            }}
            style={{
              padding: '10px 16px',
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
            onClick={() => router.push('/membership')}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#1f2937',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Volver a Membresía
          </button>
        </div>
      )}
    </section>
  );
}
