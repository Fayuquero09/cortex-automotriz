"use client";
import React from 'react';
import useSWR from 'swr';
import { endpoints } from '@/lib/api';
import { useBrandAssets } from '@/lib/useBrandAssets';
import { useAppState } from '@/lib/state';

export default function PrintHeader(){
  const { data: cfg } = useSWR<any>('config_print_header', endpoints.config);
  const brandAssets = useBrandAssets();
  const { comparison } = useAppState();
  const baseRow = comparison?.base || null;
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    setHydrated(true);
  }, []);
  const allowedBrands = React.useMemo(() => {
    const list = Array.isArray(brandAssets.allowed) ? brandAssets.allowed : [];
    return list.map((item) => String(item || '').trim()).filter((item) => item.length > 0);
  }, [brandAssets.allowed]);
  const hasBrandContext = hydrated && allowedBrands.length > 0;
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
  const baseBrandHints = React.useMemo(() => {
    if (!baseRow) return [];
    const out: string[] = [];
    const push = (value?: string | null) => {
      if (!value) return;
      const label = String(value).trim();
      if (!label) return;
      const exists = out.some((item) => item.toLowerCase() === label.toLowerCase());
      if (!exists) out.push(label);
    };
    push((baseRow as any)?.brand_label);
    push((baseRow as any)?.brand);
    push((baseRow as any)?.brand_name);
    push((baseRow as any)?.brandSlug);
    push((baseRow as any)?.brand_slug);
    push((baseRow as any)?.make);
    push((baseRow as any)?.marca);
    push((baseRow as any)?.organization_name);
    return out;
  }, [baseRow]);

  const brandCandidates = React.useMemo(() => {
    const out: string[] = [];
    const push = (value?: string | null) => {
      if (!value) return;
      const label = String(value).trim();
      if (!label) return;
      const exists = out.some((item) => item.toLowerCase() === label.toLowerCase());
      if (!exists) out.push(label);
    };
    baseBrandHints.forEach(push);
    if (hasBrandContext) {
      allowedBrands.forEach(push);
      push(brandAssets.primary);
    }
    return out;
  }, [allowedBrands, baseBrandHints, brandAssets.primary, hasBrandContext]);

  const ownLogoDirect = React.useMemo(() => {
    if (!baseRow) return '';
    const candidates = [
      (baseRow as any)?.brand_logo_url,
      (baseRow as any)?.logo_url,
      (baseRow as any)?.own_logo_url,
      (baseRow as any)?.logo,
      (baseRow as any)?.primary_logo_url,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return '';
  }, [baseRow]);

  const brandDisplayName = hydrated ? (brandCandidates[0] || '') : '';
  const brandLogoUrl = React.useMemo(() => {
    if (!hydrated) return '';
    if (ownLogoDirect) return ownLogoDirect;
    for (const candidate of brandCandidates) {
      const resolved = brandAssets.resolveLogo(candidate);
      if (resolved) return resolved;
    }
    return '';
  }, [brandAssets.resolveLogo, brandCandidates, hydrated, ownLogoDirect]);
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
