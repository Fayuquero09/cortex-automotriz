"use client";
import React from 'react';
import useSWR from 'swr';
import { endpoints } from '@/lib/api';
import { useAppState } from '@/lib/state';
import dynamic from 'next/dynamic';
const EChart = dynamic(() => import('echarts-for-react'), { ssr: false });
import { useBrandAssets } from '@/lib/useBrandAssets';

const RADAR_PILLARS = [
  { key: 'equip_score', label: 'Score total' },
  { key: 'equip_p_adas', label: 'ADAS' },
  { key: 'equip_p_safety', label: 'Seguridad' },
  { key: 'equip_p_comfort', label: 'Confort' },
  { key: 'equip_p_infotainment', label: 'Infotenimiento' },
  { key: 'equip_p_traction', label: 'Tracción' },
  { key: 'equip_p_utility', label: 'Utility' },
  { key: 'equip_p_performance', label: 'Performance' },
  { key: 'equip_p_efficiency', label: 'Eficiencia' },
  { key: 'equip_p_electrification', label: 'Electrificación' },
  { key: 'warranty_score', label: 'Garantía' },
];

// Small info icon with tooltip
function InfoIcon({ title }: { title: string }) {
  return (
    <span title={title} style={{ display:'inline-block', marginLeft:6, width:16, height:16, border:'1px solid #cbd5e1', borderRadius:16, textAlign:'center', lineHeight:'14px', fontSize:12, color:'#475569', cursor:'help' }}>i</span>
  );
}

export default function MarketPulse() {
  const { own } = useAppState();
  const brandAssets = useBrandAssets();
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    setHydrated(true);
  }, []);

  const allowedBrands = React.useMemo(() => {
    const list = Array.isArray(brandAssets.allowed) ? brandAssets.allowed : [];
    return list.map((item) => String(item || '').trim()).filter((item) => item.length > 0);
  }, [brandAssets.allowed]);
  const hasBrandContext = hydrated && allowedBrands.length > 0;
  const { data: cfg } = useSWR<any>('config_dash', endpoints.config);
  const segKey = (own.make && own.model) ? `${own.make}|${own.model}|${own.year||''}` : '';
  const segKey2 = segKey; // preserve original semantics for baseRow fetch key
  const brandCandidates = React.useMemo(() => {
    if (!hasBrandContext) return [];
    const out: string[] = [];
    const push = (value?: string | null) => {
      if (!value) return;
      const label = String(value).trim();
      if (!label) return;
      const exists = out.some((item) => item.toLowerCase() === label.toLowerCase());
      if (!exists) out.push(label);
    };
    push(own.make);
    push(brandAssets.primary);
    allowedBrands.forEach(push);
    return out;
  }, [allowedBrands, brandAssets.primary, hasBrandContext, own.make]);

  const brandDisplayName = hasBrandContext ? (brandCandidates[0] || '') : '';
  const brandLogoUrl = React.useMemo(() => {
    if (!hydrated || !hasBrandContext) return '';
    for (const candidate of brandCandidates) {
      const resolved = brandAssets.resolveLogo(candidate);
      if (resolved) return resolved;
    }
    return '';
  }, [brandAssets.resolveLogo, brandCandidates, hasBrandContext, hydrated]);

  const brandSalesKey = hasBrandContext && hydrated && brandDisplayName
    ? ['brand_sales_totals', brandDisplayName]
    : null;
  const { data: brandSalesData, error: brandSalesError } = useSWR<any>(
    brandSalesKey,
    async ([, make]) => endpoints.brandSalesMonthly(make, [2025, 2024]),
  );
  const brandSalesLoading = Boolean(brandSalesKey) && !brandSalesData && !brandSalesError;

  const showBrandBanner = hasBrandContext && hydrated && Boolean(brandLogoUrl || brandSalesData || brandSalesLoading);

  const brandSalesOption = React.useMemo(() => {
    if (!hydrated || !hasBrandContext) return null;
    const months = Array.isArray(brandSalesData?.months) && brandSalesData.months.length === 12
      ? brandSalesData.months
      : ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const rawSeries = Array.isArray(brandSalesData?.series) ? brandSalesData.series : [];
    if (!rawSeries.length) return null;
    const palette = ['#2563eb', '#94a3b8', '#f97316', '#10b981'];
    const series = rawSeries
      .map((entry: any, idx: number) => {
        const data = Array.isArray(entry?.monthly)
          ? entry.monthly.map((value: any) => (Number.isFinite(Number(value)) ? Number(value) : 0))
          : Array(12).fill(0);
        return {
          label: String(entry?.year || ''),
          color: palette[idx % palette.length],
          data,
        };
      })
      .filter((entry) => entry.data.some((value) => value > 0));
    if (!series.length) return null;
    return {
      grid: { left: 60, right: 16, top: 30, bottom: 30, containLabel: true },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: number) => Intl.NumberFormat('es-MX').format(Math.round(value)),
      },
      legend: { top: 0, left: 'center', data: series.map((entry) => entry.label) },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value', min: 0, name: 'Unidades' },
      series: series.map((entry, idx) => ({
        name: entry.label,
        type: 'line',
        smooth: true,
        data: entry.data,
        itemStyle: { color: entry.color },
        lineStyle: { color: entry.color, width: idx === 0 ? 3 : 2 },
        symbolSize: 6,
      })),
    } as any;
  }, [brandSalesData, hasBrandContext, hydrated]);

  const { data: baseRow } = useSWR<any>(segKey2 ? ['dash_base', segKey2] : null, async () => {
    const p: any = { make: own.make, model: own.model };
    if (own.year) p.year = own.year as any;
    const res = await endpoints.catalog({ ...p, limit: 1, format: 'obj' });
    return (res?.items && res.items[0]) || null;
  });

  const bodyStyleRaw = React.useMemo(
    () => String(baseRow?.segmento_ventas || baseRow?.body_style || '').trim(),
    [baseRow?.segmento_ventas, baseRow?.body_style],
  );
  const bodyStyleLabel = React.useMemo(() => (bodyStyleRaw ? normalizeSegTitle(bodyStyleRaw) : ''), [bodyStyleRaw]);
  const bodyStyleKey = bodyStyleLabel ? ['body_style_radar', bodyStyleLabel] : null;
  const { data: bodyStyleData, error: bodyStyleError } = useSWR<any>(
    bodyStyleKey,
    async ([, style]) => endpoints.bodyStylePillars(style),
  );
  const bodyStyleLoading = Boolean(bodyStyleKey) && !bodyStyleData && !bodyStyleError;
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
  const seasonSeriesCount = Array.isArray((seasonOption as any)?.series) ? (seasonOption as any).series.length : 0;
  const hasSeasonData = Boolean(
    hasSelection &&
    Array.isArray((seasonOption as any)?.series) &&
    ((seasonOption as any)?.xAxis?.data?.length || 0) > 0 &&
    (seasonOption as any).series.some((s: any) => Array.isArray(s?.data) && s.data.length)
  );

  const bodyStyleRadarOption = React.useMemo(() => {
    if (!bodyStyleData || !baseRow) return null;
    const toScore = (value: any): number => {
      const num = Number(value);
      if (!Number.isFinite(num)) return 0;
      const bounded = Math.max(0, Math.min(100, num));
      return Number(bounded.toFixed(1));
    };

    const seriesList: Array<{ id: string; label: string; values: Record<string, any> | null }> = Array.isArray(bodyStyleData?.series)
      ? bodyStyleData.series.map((entry: any) => ({
          id: String(entry?.id || ''),
          label: String(entry?.label || ''),
          values: entry?.values && typeof entry.values === 'object' ? entry.values : null,
        }))
      : [];
    if (!seriesList.length) return null;
    const map = new Map(seriesList.map((item) => [item.id, item]));

    const resolveLabel = (key: string) => RADAR_PILLARS.find((pillar) => pillar.key === key)?.label || key;

    const pillars = Array.isArray(bodyStyleData?.pillars)
      ? bodyStyleData.pillars
          .map((item: any) => ({ key: String(item?.key || ''), label: String(item?.label || '') }))
          .filter((item: any) => item.key && RADAR_PILLARS.some((pillar) => pillar.key === item.key))
      : RADAR_PILLARS;

    const enrichPillars = pillars
      .map(({ key, label }) => {
        const own = toScore((baseRow as any)?.[key]);
        const body = toScore(map.get('body_style')?.values?.[key]);
        const market = toScore(map.get('overall')?.values?.[key]);
        const others = map.has('other_styles') ? toScore(map.get('other_styles')?.values?.[key]) : 0;
        return {
          key,
          label: label || resolveLabel(key),
          values: { own, body, market, others },
        };
      })
      .filter(({ values }) => [values.own, values.body, values.market, values.others].some((value) => value > 0));

    if (!enrichPillars.length) return null;

    const ownValues = enrichPillars.map(({ values }) => values.own);
    const bodyValues = enrichPillars.map(({ values }) => values.body);
    const marketValues = enrichPillars.map(({ values }) => values.market);
    const otherValues = map.has('other_styles')
      ? enrichPillars.map(({ values }) => values.others)
      : null;

    const indicator = enrichPillars.map(({ label }) => ({ name: label, max: 100 }));

    const radarData: Array<{ value: number[]; name: string; areaStyle?: any; lineStyle?: any; symbolSize?: number }> = [];
    radarData.push({ name: 'Propio', value: ownValues, areaStyle: { opacity: 0.2 }, lineStyle: { width: 3 }, symbolSize: 5 });
    radarData.push({ name: `Promedio ${bodyStyleLabel || 'body style'}`, value: bodyValues, areaStyle: { opacity: 0.12 }, symbolSize: 4 });
    radarData.push({ name: 'Mercado total', value: marketValues, areaStyle: { opacity: 0.06 }, symbolSize: 4 });
    if (otherValues) {
      radarData.push({ name: 'Otros body styles', value: otherValues, areaStyle: { opacity: 0.04 }, symbolSize: 3 });
    }

    return {
      tooltip: { trigger: 'item' },
      legend: { top: 0, left: 'center', data: radarData.map((entry) => entry.name) },
      radar: {
        indicator,
        radius: '65%',
        splitNumber: 4,
        axisName: { color: '#0f172a', fontSize: 12 },
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.5)' } },
        splitArea: { areaStyle: { color: ['rgba(148, 163, 184, 0.06)', 'rgba(148, 163, 184, 0.12)'] } },
        axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.4)' } },
      },
      series: [
        {
          type: 'radar',
          data: radarData,
          emphasis: { focus: 'series' },
        },
      ],
    } as any;
  }, [baseRow, bodyStyleData, bodyStyleLabel]);

  return (
    <section style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff' }}>
      {showBrandBanner && (brandLogoUrl || brandSalesOption || brandSalesLoading) ? (
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:12, padding:'12px 16px', border:'1px solid #e2e8f0', borderRadius:10, background:'#f8fafc' }}>
          {brandLogoUrl ? (
            <img
              src={brandLogoUrl}
              alt={brandDisplayName || 'Marca propia'}
              style={{ height:48, width:'auto', maxWidth:220, objectFit:'contain' }}
              loading="lazy"
              onError={(event) => {
                try {
                  event.currentTarget.style.display = 'none';
                } catch {}
              }}
            />
          ) : null}
          <div style={{ flex:1, minHeight: brandSalesOption ? 160 : undefined }}>
            {brandSalesLoading ? (
              <div style={{ fontSize:12, color:'#64748b' }}>Cargando ventas 2024–2025…</div>
            ) : brandSalesError ? (
              <div style={{ fontSize:12, color:'#dc2626' }}>No pudimos cargar las ventas de la marca.</div>
            ) : brandSalesOption ? (
              <EChart option={brandSalesOption} style={{ height:160 }} />
            ) : (
              <div style={{ fontSize:12, color:'#64748b' }}>{brandSalesData?.warning || 'No hay ventas registradas 2024–2025 para esta marca.'}</div>
            )}
          </div>
        </div>
      ) : null}
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
      {bodyStyleLoading ? (
        <div style={{ marginTop:12, fontSize:12, color:'#64748b' }}>Cargando pilares de equipamiento para {bodyStyleLabel || 'este body style'}…</div>
      ) : bodyStyleError ? (
        <div style={{ marginTop:12, fontSize:12, color:'#dc2626' }}>No pudimos obtener los pilares del body style.</div>
      ) : bodyStyleRadarOption ? (
        <section style={{ marginTop:12, border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff' }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>{`Pilares de equipamiento — ${bodyStyleLabel || 'Body style'}`}</div>
          <EChart option={bodyStyleRadarOption} style={{ height:360 }} />
        </section>
      ) : null}
      <div style={{ marginTop:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'0 4px 6px' }}>
          <div style={{ fontSize:12, color:'#64748b' }}>
            {hasSelection ? 'Tendencia de ventas (2025 vs 2024)' : 'Selecciona un vehículo para ver la tendencia de su segmento'}
          </div>
          <InfoIcon title={'Eje X: meses (ene–dic). Eje Y: unidades. Se grafica el segmento del vehículo seleccionado.'} />
        </div>
        {hasSeasonData ? (
          <div style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:6 }}>
            <EChart option={seasonOption} style={{ height:260 }} />
          </div>
        ) : (
          <div style={{ border:'1px dashed #e2e8f0', borderRadius:10, padding:'10px 12px', fontSize:12, color:'#64748b' }}>
            Las gráficas del panel OEM se deshabilitaron temporalmente mientras estabilizamos los datos de ventas (series disponibles: {seasonSeriesCount}).
          </div>
        )}
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
