"use client";
import React from 'react';
import useSWR from 'swr';
import { endpoints } from '@/lib/api';
import { useBrandAssets } from '@/lib/useBrandAssets';

export default function PrintHeader(){
  const { data: cfg } = useSWR<any>('config_print_header', endpoints.config);
  const brandAssets = useBrandAssets();
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    setHydrated(true);
  }, []);
  const [printed, setPrinted] = React.useState('');
  React.useEffect(() => {
    try {
      setPrinted(new Date().toLocaleString('es-MX', { dateStyle:'medium', timeStyle:'short' }));
    } catch {
      setPrinted('');
    }
  }, []);
  const updated = (()=>{
    try {
      const s = cfg?.data_last_updated as string | undefined;
      if (!s) return '';
      const d = new Date(s);
      return d.toLocaleString('es-MX', { dateStyle:'medium', timeStyle:'short' });
    } catch { return ''; }
  })();
  const updPrices = (()=>{
    try { const s = cfg?.prices_last_updated; return s ? new Date(s).toLocaleString('es-MX', { dateStyle:'medium', timeStyle:'short' }) : ''; } catch { return ''; }
  })();
  const updIndustry = (()=>{
    try { const s = cfg?.industry_last_updated; return s ? new Date(s).toLocaleString('es-MX', { dateStyle:'medium', timeStyle:'short' }) : ''; } catch { return ''; }
  })();
  const brandCandidates = React.useMemo(() => {
    const out: string[] = [];
    const push = (value?: string | null) => {
      if (!value) return;
      const label = String(value).trim();
      if (!label) return;
      const exists = out.some((item) => item.toLowerCase() === label.toLowerCase());
      if (!exists) out.push(label);
    };
    push(brandAssets.primary);
    brandAssets.allowed.forEach(push);
    return out;
  }, [brandAssets.allowed, brandAssets.primary]);

  const brandDisplayName = hydrated ? (brandCandidates[0] || '') : '';
  const brandLogoUrl = React.useMemo(() => {
    if (!hydrated) return '';
    for (const candidate of brandCandidates) {
      const resolved = brandAssets.resolveLogo(candidate);
      if (resolved) return resolved;
    }
    return '';
  }, [brandAssets.resolveLogo, brandCandidates, hydrated]);
  const printedLabel = printed || '—';
  // Visible solo al imprimir mediante clase global .print-only
  return (
    <header className="print-only" style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          {brandLogoUrl ? (
            <div style={{ padding:'10px 14px', border:'1px solid #e2e8f0', borderRadius:10, background:'#f8fafc' }}>
              <img
                src={brandLogoUrl}
                alt={brandDisplayName || 'Marca propia'}
                style={{ height:44, width:'auto', maxWidth:160, objectFit:'contain' }}
                onError={(event) => {
                  try {
                    event.currentTarget.style.display = 'none';
                  } catch {}
                }}
              />
            </div>
          ) : null}
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <img src="/logo_refacciones_digitales.png" alt="Refacciones Digitales" style={{ height:48, width:'auto' }} />
            <div>
              <div style={{ fontWeight:800, fontSize:18 }}>Reporte comparativo — Cortex Automotriz</div>
              <div style={{ fontSize:12, color:'#64748b' }}>Pulso del mercado + comparativo de versiones</div>
              <div style={{ fontSize:12, color:'#64748b' }}>{updPrices ? `Precios: ${updPrices}` : (updated? `Datos: ${updated}`: null)}</div>
              <div style={{ fontSize:12, color:'#64748b' }}>{updIndustry ? `Industria: ${updIndustry}` : null}</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign:'right', fontSize:12, color:'#64748b' }}>Fecha de impresión: {printedLabel}</div>
      </div>
    </header>
  );
}
