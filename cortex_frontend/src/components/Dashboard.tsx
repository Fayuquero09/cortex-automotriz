"use client";
import React from 'react';
import useSWR from 'swr';
import { endpoints } from '@/lib/api';
import { useAppState } from '@/lib/state';
import dynamic from 'next/dynamic';
const EChart = dynamic(() => import('echarts-for-react'), { ssr: false });
import { useBrandAssets } from '@/lib/useBrandAssets';
import {
  AdvantageMode,
  AdvantageSection,
  buildAdvantageOption,
  cleanVehicleRow,
  computeAdvantageSections,
  keyForRow,
  vehicleDisplayName,
} from '@/lib/advantage';

type Row = Record<string, any>;

// Small info icon with tooltip
function InfoIcon({ title }: { title: string }) {
  return (
    <span title={title} style={{ display:'inline-block', marginLeft:6, width:16, height:16, border:'1px solid #cbd5e1', borderRadius:16, textAlign:'center', lineHeight:'14px', fontSize:12, color:'#475569', cursor:'help' }}>i</span>
  );
}

export default function MarketPulse() {
  const { own, comparison } = useAppState();
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
  const [advantageMode, setAdvantageMode] = React.useState<AdvantageMode>('upsides');
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

  const sharedComparison = React.useMemo(() => {
    if (!baseRow) return null;
    const sharedBase = comparison?.base;
    if (!sharedBase) return null;
    if (keyForRow(sharedBase) !== keyForRow(baseRow)) return null;
    const list = Array.isArray(comparison?.competitors) ? comparison.competitors : [];
    return list.length ? list.map((entry) => ({ ...entry })) : null;
  }, [comparison, baseRow]);

  const advantageSections: AdvantageSection[] = React.useMemo(() => {
    const comps = (sharedComparison || []).map((entry) => ({
      ...entry,
      __deltas: entry?.__deltas || {},
      __diffs: entry?.__diffs || {},
    }));
    return computeAdvantageSections(baseRow, comps, advantageMode);
  }, [sharedComparison, baseRow, advantageMode]);

  const limitedAdvantageSections = React.useMemo(
    () => advantageSections.slice(0, 3),
    [advantageSections],
  );

  const advantageNotice = React.useMemo(() => {
    if (!baseRow) return 'Selecciona un vehículo propio para visualizar comparativos.';
    if (!sharedComparison) return 'Selecciona competidores en el panel de comparación para ver esta gráfica.';
    if (!advantageSections.length) return 'No encontramos diferencias claras con los competidores seleccionados.';
    return '';
  }, [baseRow, sharedComparison, advantageSections]);

  const showAdvantageChart = Boolean(sharedComparison && advantageSections.length);


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
      {baseRow ? (
        <div style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:12, marginTop:12 }}>
          <div style={{ paddingBottom:8, borderBottom:'1px solid #e2e8f0', marginBottom:12, background:'#fafafa', fontWeight:600 }}>
            Ventajas vs brechas (equipamiento & prestaciones)
          </div>
          <div className="no-print" style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
            <button
              type="button"
              onClick={() => setAdvantageMode('upsides')}
              style={{
                padding:'6px 12px',
                borderRadius:8,
                border: advantageMode === 'upsides' ? '1px solid #16a34a' : '1px solid #cbd5e1',
                background: advantageMode === 'upsides' ? '#dcfce7' : '#ffffff',
                color: advantageMode === 'upsides' ? '#166534' : '#0f172a',
                cursor:'pointer',
                fontSize:12,
                fontWeight:600,
              }}
            >
              Nuestras ventajas
            </button>
            <button
              type="button"
              onClick={() => setAdvantageMode('gaps')}
              style={{
                padding:'6px 12px',
                borderRadius:8,
                border: advantageMode === 'gaps' ? '1px solid #dc2626' : '1px solid #cbd5e1',
                background: advantageMode === 'gaps' ? '#fee2e2' : '#ffffff',
                color: advantageMode === 'gaps' ? '#991b1b' : '#0f172a',
                cursor:'pointer',
                fontSize:12,
                fontWeight:600,
              }}
            >
              Brechas vs rivales
            </button>
          </div>
          {showAdvantageChart ? (
            <div style={{ display:'grid', gap:12 }}>
              {limitedAdvantageSections.map((section, idx) => {
                const name = vehicleDisplayName(section.comp) || `Competidor ${idx + 1}`;
                const key = String((section.comp as any)?.vehicle_id || `${name}-${idx}`);
                return (
                  <div key={key} style={{ border:'1px solid #f1f5f9', borderRadius:10, padding:12, background:'#fff' }}>
                    <div style={{ fontWeight:600, marginBottom:8 }}>{name}</div>
                    {EChart ? (
                      <EChart
                        option={buildAdvantageOption(section.rows, advantageMode)}
                        style={{ height: Math.max(section.rows.length * 32, 180) }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color:'#64748b', fontSize:12, padding:12 }}>
              {advantageNotice || 'Selecciona competidores en el comparador para ver esta gráfica.'}
            </div>
          )}
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
