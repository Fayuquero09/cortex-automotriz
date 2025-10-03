"use client";
import React from 'react';
import useSWR from 'swr';
import { endpoints } from '@/lib/api';

export default function PrintHeader(){
  const { data: cfg } = useSWR<any>('config_print_header', endpoints.config);
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
  const printedLabel = printed || '—';
  // Visible solo al imprimir mediante clase global .print-only
  return (
    <header className="print-only" style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {/* Coloca el archivo en public/logo_refacciones_digitales.png */}
          <img src="/logo_refacciones_digitales.png" alt="Refacciones Digitales" style={{ height:48, width:'auto' }} />
          <div>
            <div style={{ fontWeight:800, fontSize:18 }}>Reporte comparativo — Cortex Automotriz</div>
            <div style={{ fontSize:12, color:'#64748b' }}>Pulso del mercado + comparativo de versiones</div>
            <div style={{ fontSize:12, color:'#64748b' }}>{updPrices ? `Precios: ${updPrices}` : (updated? `Datos: ${updated}`: null)}</div>
            <div style={{ fontSize:12, color:'#64748b' }}>{updIndustry ? `Industria: ${updIndustry}` : null}</div>
          </div>
        </div>
        <div style={{ textAlign:'right', fontSize:12, color:'#64748b' }}>Fecha de impresión: {printedLabel}</div>
      </div>
    </header>
  );
}
