"use client";
import React from 'react';
import useSWR from 'swr';
import { endpoints } from '@/lib/api';
import { useAppState } from '@/lib/state';
import dynamic from 'next/dynamic';
import * as echarts from 'echarts';
const EChart = dynamic(() => import('echarts-for-react'), { ssr: false });

// Small info icon with tooltip
function InfoIcon({ title }: { title: string }) {
  return (
    <span title={title} style={{ display:'inline-block', marginLeft:6, width:16, height:16, border:'1px solid #cbd5e1', borderRadius:16, textAlign:'center', lineHeight:'14px', fontSize:12, color:'#475569', cursor:'help' }}>i</span>
  );
}

export default function MarketPulse() {
  const { own } = useAppState();
  const { data: cfg } = useSWR<any>('config_dash', endpoints.config);
  const segKey = (own.make && own.model) ? `${own.make}|${own.model}|${own.year||''}` : '';
  const segKey2 = segKey; // preserve original semantics for baseRow fetch key
  const { data: baseRow } = useSWR<any>(segKey2 ? ['dash_base', segKey2] : null, async () => {
    const p: any = { make: own.make, model: own.model };
    if (own.year) p.year = own.year as any;
    const res = await endpoints.catalog({ ...p, limit: 1, format: 'obj' });
    return (res?.items && res.items[0]) || null;
  });
  const { data: stats } = useSWR<any>(['dashboard', segKey, baseRow?.segmento_ventas || baseRow?.body_style || ''], () => {
    const seg = (baseRow?.segmento_ventas || baseRow?.body_style || '').toString().trim();
    const segName2 = (!seg || /^nan$/i.test(seg)) ? '' : seg;
    return endpoints.dashboard(segName2 ? { segment: segName2 } : undefined);
  });
  const segRaw = (baseRow?.segmento_ventas || baseRow?.body_style || '').toString().trim();
  const segmentScore = Number(baseRow?.segment_score ?? NaN);
  function normalizeSegTitle(s: string): string {
    const v = (s || '').toLowerCase();
    if (!v) return '';
    if (v.includes('pick') || v.includes('cab') || v.includes('chasis') || v.includes('camioneta')) return 'Pickup';
    if (v.includes('todo terreno') || v.includes('suv') || v.includes('crossover') || v.includes('sport utility')) return "SUV'S";
    if (v.includes('van') || v.includes('minivan') || v.includes('bus')) return 'Van';
    if (v.includes('hatch') || v.includes('hb')) return 'Hatchback';
    if (v.includes('sedan') || v.includes('saloon') || v.includes('berlina')) return 'Sedán';
    return s;
  }
  const segName = (!segRaw || /^nan$/i.test(segRaw)) ? '' : normalizeSegTitle(segRaw);
  // Solo pedimos la estacionalidad cuando hay un vehículo seleccionado (segmento conocido)
  const hasSelection = Boolean(own.make && own.model && segName);
  const { data: season25 } = useSWR<any>(hasSelection ? ['seasonal_seg_2025', segName] : null, () => endpoints.seasonality({ segment: segName, year: 2025 }));
  const { data: season24 } = useSWR<any>(hasSelection ? ['seasonal_seg_2024', segName] : null, () => endpoints.seasonality({ segment: segName, year: 2024 }));

  const seasonOption = React.useMemo(() => {
    const s25 = Array.isArray(season25?.segments) && season25.segments.length ? season25.segments[0] : null;
    const s24 = Array.isArray(season24?.segments) && season24.segments.length ? season24.segments[0] : null;
    const months = (s25?.months || s24?.months || []).map((m:any)=> m.m);
    const u25  = (s25?.months || []).map((m:any)=> m.units);
    const u24  = (s24?.months || []).map((m:any)=> m.units);
    if (!months.length) return {} as any;
    const titleSeg = hasSelection ? String((s25?.name || s24?.name || segName)).toUpperCase() : '';
    return {
      title: hasSelection ? { text: `Tendencia de ventas — ${titleSeg} (2025 vs 2024)`, left: 'center', top: 6 } : undefined,
      grid: { left: 60, right: 20, top: 40, bottom: 40, containLabel: true },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, left: 'center', data: ['2025','2024'] },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value', name: 'Unidades', min: 0 },
      series: [
        { type: 'line', name: '2025', data: u25, smooth: true },
        { type: 'line', name: '2024', data: u24, smooth: true }
      ]
    } as any;
  }, [season25, season24, hasSelection, segName]);

  return (
    <section style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff' }}>
      <div style={{ fontWeight:700, marginBottom:8, display:'flex', alignItems:'center' }}>
        <span>Pulso del mercado (Model Years 2024–2026)</span>
        <InfoIcon title={'Visión general del catálogo: marcas, modelos, versiones únicas y cuántas tienen bono (TX>0 y TX<MSRP). Abajo: tendencia de ventas mensuales por segmento (2025 vs 2024).'} />
      </div>
      <div style={{ fontSize:12, color:'#64748b', marginBottom:6 }}>
        {(() => {
          try {
            const p = cfg?.prices_last_updated ? new Date(cfg.prices_last_updated).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}) : null;
            const i = cfg?.industry_last_updated ? new Date(cfg.industry_last_updated).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}) : null;
            if (!p && !i) return null;
            return (<span>Actualizaciones — Precios: {p||'N/D'}{i? ` • Industria: ${i}`:''}</span>);
          } catch { return null; }
        })()}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(140px,1fr))', gap:12 }}>
        <StatCard label="Marcas" value={stats?.brands_count} />
        <StatCard label="Modelos" value={stats?.models_count} />
        <StatCard label="Versiones" value={stats?.versions_count} />
        <StatCard label="Con bono" value={stats?.with_bonus_count} sub={formatBonusByYear(stats?.with_bonus_by_year, stats?.versions_by_year)} />
        {Number.isFinite(segmentScore) ? (
          <StatCard label="Score segmento" value={Number(segmentScore.toFixed(1))} sub={segName ? segName.toUpperCase() : undefined} />
        ) : null}
      </div>
      <div style={{ marginTop:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'0 4px 6px' }}>
          <div style={{ fontSize:12, color:'#64748b' }}>
            {hasSelection ? 'Tendencia de ventas (2025 vs 2024)' : 'Selecciona un vehículo para ver la tendencia de su segmento'}
          </div>
          <InfoIcon title={'Eje X: meses (ene–dic). Eje Y: unidades. Se grafica el segmento del vehículo seleccionado.'} />
        </div>
        {hasSelection && EChart ? <EChart echarts={echarts} option={seasonOption} opts={{ renderer: 'svg' }} style={{ height: 220 }} /> : null}
      </div>
      {hasSelection ? (
        <div style={{ marginTop:12 }}>
          <div style={{ fontSize:12, color:'#64748b', margin:'0 4px 6px' }}>Tabla del segmento — {String(segName).toUpperCase()}</div>
          <SegmentTable stats={stats} />
        </div>
      ) : null}
      <div style={{ marginTop:10, fontSize:12, color:'#64748b', lineHeight:1.4 }}>
        Cobertura: años modelo 2024–2026. La tendencia muestra unidades mensuales del segmento seleccionado (2025 vs 2024).
        Fuentes: INEGI, AMDA/JATO y estimaciones propias para marcas que no reportan a INEGI.
      </div>
    </section>
  );
}

function SegmentTable({ stats }: { stats?: any }){
  try {
    if (!stats) return null as any;
    const years = [2024, 2025, 2026];
    const totalByY = stats?.versions_by_year || {};
    const bonusByY = stats?.with_bonus_by_year || {};
    const row = (y:number) => {
      const tot = Number(totalByY[y] ?? 0);
      const bon = Number(bonusByY[y] ?? 0);
      const pct = tot ? Math.round((bon / tot) * 100) : 0;
      return { y, tot, bon, pct };
    };
    const rows = years.map(row);
    const th = { textAlign:'right', padding:'6px 8px', fontWeight:600, color:'#475569', borderBottom:'1px solid #e5e7eb' } as React.CSSProperties;
    const td = { textAlign:'right', padding:'6px 8px', borderBottom:'1px solid #f1f5f9' } as React.CSSProperties;
    const tdL = { ...td, textAlign:'left' } as React.CSSProperties;
    return (
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={tdL}>Año</th>
              <th style={th}>Total versiones</th>
              <th style={th}>Con bono</th>
              <th style={th}>% con bono</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.y}>
                <td style={tdL}>{r.y}</td>
                <td style={td}>{r.tot.toLocaleString('es-MX')}</td>
                <td style={td}>{r.bon.toLocaleString('es-MX')}</td>
                <td style={td}>{r.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } catch {
    return null as any;
  }
}

function StatCard({ label, value, sub }: { label: string; value?: number; sub?: string }) {
  return (
    <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12, background:'#fafafa' }}>
      <div style={{ fontSize:12, color:'#64748b' }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:700 }}>{value ?? '—'}</div>
      {sub ? <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>{sub}</div> : null}
    </div>
  );
}

function formatBonusByYear(map?: Record<string, number>, totals?: Record<string, number>) {
  try {
    if (!map) return undefined;
    const years = [2024, 2025, 2026];
    const parts = years.map((y:number) => {
      const v = (map as any)[y] ?? 0;
      const t = totals ? ((totals as any)[y] ?? 0) : undefined;
      return t !== undefined ? `${y}: ${v}/${t}` : `${y}: ${v}`;
    });
    return parts.join(' • ');
  } catch {
    return undefined;
  }
}
