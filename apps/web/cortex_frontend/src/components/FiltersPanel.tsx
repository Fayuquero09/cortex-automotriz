"use client";
import React from 'react';
import useSWR from 'swr';
import { useAppState } from '@/lib/state';
import { endpoints } from '@/lib/api';

export default function FiltersPanel() {
  const [mounted, setMounted] = React.useState(false);
  const { filters, setFilters, own, triggerAutoGen, autoGenerate, setAutoGenerate } = useAppState();
  const on = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ ...filters, [k]: e.target.checked });
  };
  const onNum = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const num = v === '' ? '' : Number(v);
    setFilters({ ...filters, [k]: (Number.isFinite(num as number) ? (num as number) : '') as any });
  };
  const onInt = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const n = v === '' ? 3 : Math.max(1, parseInt(v || '3', 10));
    setFilters({ ...filters, [k]: n } as any);
  };
  // Base length (mm) of selected own vehicle to link % and mm
  const ready = !!own.make && !!own.model && !!own.year;
  const { data: ownBase } = useSWR<any>(own.make && own.model && own.year ? ['own_base_len', own.make, own.model, own.year, own.version] : null, async () => {
    const params: any = { make: own.make, model: own.model, year: own.year, limit: 50 };
    const list = await endpoints.catalog(params);
    const rows: any[] = Array.isArray(list) ? list : (Array.isArray(list?.items) ? list.items : []);
    if (!rows.length) return null;
    if (own.version) {
      const found = rows.find(r => String(r.version||'').toUpperCase() === String(own.version).toUpperCase());
      return found || rows[0];
    }
    return rows[0];
  });
  const baseLen: number | null = ownBase && Number.isFinite(Number(ownBase.longitud_mm)) ? Number(ownBase.longitud_mm) : null;

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <section style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff', display:'grid', gap:10 }}>
      <div>
        <div style={{ fontWeight:700, marginBottom:8 }}>Filtros (aplican a listado y auto‑selección)</div>
        <div style={{ display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
          <label style={{ display:'inline-flex', gap:8, alignItems:'center' }}>
            <input suppressHydrationWarning type="checkbox" checked={filters.includeSameBrand} onChange={on('includeSameBrand')} /> Incluir misma marca
          </label>
          <label style={{ display:'inline-flex', gap:8, alignItems:'center' }}>
            <input suppressHydrationWarning type="checkbox" checked={filters.sameSegment} onChange={on('sameSegment')} /> Mismo segmento
          </label>
          <label style={{ display:'inline-flex', gap:8, alignItems:'center' }}>
            <input suppressHydrationWarning type="checkbox" checked={filters.samePropulsion} onChange={on('samePropulsion')} /> Misma propulsión (ICE/HEV/PHEV/EV)
          </label>
          <label style={{ display:'inline-flex', gap:8, alignItems:'center' }}>
            <input suppressHydrationWarning type="checkbox" checked={filters.includeDifferentYears} onChange={on('includeDifferentYears')} /> Incluir años modelo diferentes
          </label>
          <label style={{ display:'inline-flex', gap:8, alignItems:'center' }}>
            <input suppressHydrationWarning type="checkbox" checked={autoGenerate} onChange={(e)=> setAutoGenerate(e.target.checked)} /> Auto generar competidores
          </label>
        </div>
      </div>

      <div>
        <div style={{ fontWeight:700, margin: '6px 0 8px' }}>Filtros solo para auto‑selección</div>
        <div style={{ display:'flex', gap:20, alignItems:'center', flexWrap:'wrap', marginBottom:8 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, opacity:0.8 }}>Longitud (±):</span>
            <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
              <input
                suppressHydrationWarning
                type="number"
                min={0}
                step={1}
                value={filters.maxLengthPct}
                onChange={(e)=>{
                  const v = e.target.value;
                  const num = v === '' ? '' : Number(v);
                  const next: any = { ...filters, maxLengthPct: (v === '' ? '' : (Number.isFinite(num as number) ? num : '')) };
                  if (baseLen && v !== '') {
                    next.maxLengthMm = Math.round((num as number) * baseLen / 100);
                  }
                  setFilters(next);
                }}
                style={{ width:80 }}
              /> %
            </label>
            <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
              <input
                suppressHydrationWarning
                type="number"
                min={0}
                step={10}
                value={filters.maxLengthMm}
                onChange={(e)=>{
                  const v = e.target.value;
                  const num = v === '' ? '' : Number(v);
                  const next: any = { ...filters, maxLengthMm: (v === '' ? '' : (Number.isFinite(num as number) ? num : '')) };
                  if (baseLen && v !== '') {
                    next.maxLengthPct = Math.round(((num as number) / baseLen) * 1000) / 10; // 0.1% precision
                  }
                  setFilters(next);
                }}
                style={{ width:100 }}
              /> mm
            </label>
          </div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, opacity:0.8 }}>Tolerancia (±) equipo:</span>
            <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
              <input suppressHydrationWarning type="number" min={0} max={100} step={1} value={filters.scoreDiffPct} onChange={onNum('scoreDiffPct')} style={{ width:80 }} /> %
            </label>
          </div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, opacity:0.8 }}>Competidores:</span>
            <input suppressHydrationWarning type="number" min={1} step={1} value={filters.autoK} onChange={onInt('autoK')} style={{ width:80 }} />
          </div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, opacity:0.8 }}>% coincidencia total:</span>
            <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
              <input suppressHydrationWarning type="number" min={0} max={100} step={1} value={filters.minMatchPct as any} onChange={onNum('minMatchPct')} style={{ width:80 }} /> %
            </label>
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'center', width:'100%' }}>
          <button
            onClick={()=>{
              setAutoGenerate(true);
              triggerAutoGen();
            }}
            disabled={!ready}
            style={{ padding:'10px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:8, cursor: ready ? 'pointer':'not-allowed', minWidth:260 }}
            title={ready ? 'Generar competidores con IA' : 'Selecciona Marca, Modelo y Año primero'}
          >
            Generar competidores (IA)
          </button>
        </div>
      </div>
    </section>
  );
}
