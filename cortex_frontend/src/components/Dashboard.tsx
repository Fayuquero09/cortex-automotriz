"use client";
import React from 'react';
import useSWR from 'swr';
import { endpoints } from '@/lib/api';
import { useAppState } from '@/lib/state';
import dynamic from 'next/dynamic';
import * as echarts from 'echarts';
const EChart = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function MarketPulse() {
  const { own } = useAppState();
  const { data: stats } = useSWR<any>('dashboard', () => endpoints.dashboard());
  const segKey = (own.make && own.model) ? `${own.make}|${own.model}|${own.year||''}` : '';
  const { data: baseRow } = useSWR<any>(segKey ? ['dash_base', segKey] : null, async () => {
    const p: any = { make: own.make, model: own.model };
    if (own.year) p.year = own.year as any;
    const res = await endpoints.catalog({ ...p, limit: 1, format: 'obj' });
    return (res?.items && res.items[0]) || null;
  });
  const segRaw = (baseRow?.segmento_ventas || baseRow?.body_style || '').toString().trim();
  const segName = (!segRaw || /^nan$/i.test(segRaw)) ? '' : segRaw;
  const { data: season25 } = useSWR<any>(['seasonal_seg_2025', segName || '(ALL)'], () => endpoints.seasonality({ segment: segName || undefined, year: 2025 }));
  const { data: season24 } = useSWR<any>(['seasonal_seg_2024', segName || '(ALL)'], () => endpoints.seasonality({ segment: segName || undefined, year: 2024 }));

  const seasonOption = React.useMemo(() => {
    const s25 = Array.isArray(season25?.segments) && season25.segments.length ? season25.segments[0] : null;
    const s24 = Array.isArray(season24?.segments) && season24.segments.length ? season24.segments[0] : null;
    const months = (s25?.months || s24?.months || []).map((m:any)=> m.m);
    const u25  = (s25?.months || []).map((m:any)=> m.units);
    const u24  = (s24?.months || []).map((m:any)=> m.units);
    if (!months.length) return {} as any;
    const titleSeg = String((s25?.name || s24?.name || 'Todos')).toUpperCase();
    return {
      title: { text: `Tendencia de ventas — ${titleSeg} (2025 vs 2024)`, left: 'center', top: 6 },
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
  }, [season25, season24]);

  return (
    <section style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff' }}>
      <div style={{ fontWeight:700, marginBottom:8 }}>Pulso del mercado (Model Years 2024–2026)</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(140px,1fr))', gap:12 }}>
        <StatCard label="Marcas" value={stats?.brands_count} />
        <StatCard label="Modelos" value={stats?.models_count} />
        <StatCard label="Versiones" value={stats?.versions_count} />
        <StatCard label="Con bono" value={stats?.with_bonus_count} sub={formatBonusByYear(stats?.with_bonus_by_year)} />
      </div>
      <div style={{ marginTop:12 }}>
        {EChart ? <EChart echarts={echarts} option={seasonOption} style={{ height: 220 }} /> : null}
      </div>
      <div style={{ marginTop:10, fontSize:12, color:'#64748b', lineHeight:1.4 }}>
        Cobertura: años modelo 2024–2026. La tendencia muestra unidades mensuales del segmento seleccionado (2025 vs 2024).
        Fuentes: INEGI, AMDA/JATO y estimaciones propias para marcas que no reportan a INEGI.
      </div>
    </section>
  );
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

function formatBonusByYear(map?: Record<string, number>) {
  try {
    if (!map) return undefined;
    const years = [2024, 2025, 2026];
    const parts = years.map((y:number) => `${y}: ${(map as any)[y] ?? 0}`);
    return parts.join(' • ');
  } catch {
    return undefined;
  }
}
