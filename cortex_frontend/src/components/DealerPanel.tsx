"use client";
import React from 'react';
import dynamic from 'next/dynamic';
import * as echarts from 'echarts';
const EChart = dynamic(() => import('echarts-for-react'), { ssr: false });
import useSWR from 'swr';
import { useAppState } from '@/lib/state';
import { endpoints } from '@/lib/api';
import { renderStruct } from '@/lib/insightsTemplates';
import { brandLabel, vehicleLabel } from '@/lib/vehicleLabels';

type Row = Record<string, any>;

function num(x: any): number | null {
  if (x === null || x === undefined || (typeof x === 'string' && x.trim() === '')) return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

const PILLAR_LABELS: Record<string, string> = {
  audio_y_entretenimiento: 'Audio & entretenimiento',
  climatizacion: 'Climatización',
  confort: 'Confort',
  seguridad: 'Seguridad',
  motor: 'Motor',
  dimensiones: 'Dimensiones',
  transmision: 'Tracción / transmisión',
  suspension: 'Suspensión',
  frenos: 'Frenos',
  exterior: 'Exterior',
  energia: 'Energía',
  llantas_y_rines: 'Llantas y rines',
};

const PILLAR_LEGACY_FIELDS: Record<string, string[]> = {
  audio_y_entretenimiento: ['equip_p_infotainment'],
  climatizacion: ['equip_p_comfort'],
  confort: ['equip_p_comfort'],
  seguridad: ['equip_p_safety', 'equip_p_adas'],
  motor: ['equip_p_performance'],
  dimensiones: ['equip_p_utility'],
  transmision: ['equip_p_traction'],
  suspension: ['equip_p_traction', 'equip_p_utility'],
  frenos: ['equip_p_safety'],
  exterior: ['equip_p_value', 'equip_p_utility'],
  energia: ['equip_p_electrification', 'equip_p_efficiency'],
  llantas_y_rines: ['equip_p_utility'],
};

function getPillarValue(row: any, key: string): number | null {
  if (!row) return null;
  const direct = num(row?.pillar_scores?.[key]);
  if (direct != null && direct > 0) return direct;
  const raw = num(row?.pillar_scores_raw?.[key]);
  if (raw != null && raw > 0) return raw;
  const same = num((row as any)?.[key]);
  if (same != null && same > 0) return same;
  const legacy = PILLAR_LEGACY_FIELDS[key] || [];
  for (const legacyKey of legacy) {
    const legacyVal = num((row as any)?.[legacyKey]);
    if (legacyVal != null && legacyVal > 0) return legacyVal;
  }
  return null;
}

// Bloque para agregar competidores (versión ligera del que existe en ComparePanel)
function DealerManualBlock({ onAdd, year, allowDifferentYears }: { onAdd: (r: Row)=>void, year?: number | '', allowDifferentYears?: boolean }){
  const [q, setQ] = React.useState('');
  const { data: sugg } = useSWR<Row[]>(q.trim().length>=2 ? ['dealer_sugg', q, year||0, !!allowDifferentYears] : null, async () => {
    const params: any = { q, limit: 50 };
    if (!allowDifferentYears && year) params.year = year;
    const list = await endpoints.catalog(params);
    const rows: Row[] = Array.isArray(list) ? list : (Array.isArray((list as any)?.items) ? (list as any).items : []);
    return rows;
  });
  const list = (sugg||[]).slice(0, 12);
  return (
    <div className="no-print" style={{ display:'grid', gap:6 }}>
      <input placeholder="Marca o modelo" value={q} onChange={e=>setQ(e.target.value)} style={{ minWidth:260, padding:'6px 8px', borderRadius:6, border:'1px solid #cbd5f5' }} />
      {list.length>0 ? (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {list.map((r:Row, i:number)=> (
            <button
              key={i}
              onClick={()=> onAdd(r)}
              style={{ border:'1px solid #e5e7eb', background:'#fff', padding:'4px 8px', borderRadius:6, cursor:'pointer', fontSize:12 }}
            >
              {vehicleLabel(r)}
            </button>
          ))}
        </div>
      ): null}
    </div>
  );
}

export default function DealerPanel(){
  const { own } = useAppState();
  const { data: cfg } = useSWR<any>('cfg', () => endpoints.config());
  const fuelPrices = cfg?.fuel_prices || {};
  const ready = !!own.model && !!own.year && (!!own.make || true);
  const { data: ownRows } = useSWR<Row[]>(ready ? ['dealer_own', own.make, own.model, own.year, own.version] : null, async () => {
    const params: Record<string, any> = { make: own.make, model: own.model, year: own.year, limit: 50 };
    const list = await endpoints.catalog(params);
    const rows: Row[] = Array.isArray(list) ? list : (Array.isArray(list?.items) ? list.items : []);
    if (own.version) {
      const match = rows.find(r => String(r.version || '').toUpperCase() === String(own.version).toUpperCase());
      return match ? [match] : rows.slice(0,1);
    }
    return rows.slice(0,1);
  });
  const ownRow = (ownRows && ownRows[0]) || null;

  const [manual, setManual] = React.useState<Row[]>([]);
  const [manualNotice, setManualNotice] = React.useState<string>('');
  const [allowDifferentYears, setAllowDifferentYears] = React.useState<boolean>(false);
  const [allowDifferentSegments, setAllowDifferentSegments] = React.useState<boolean>(false);
  const addComp = async (r: Row) => {
    // Regla: mismo año modelo por defecto; permitir diferentes si se activa el toggle
    setManualNotice('');
    try{
      if (!allowDifferentYears && own?.year && r?.ano && Number(r.ano)!==Number(own.year)){
        const list = await endpoints.catalog({ make: r.make, model: r.model, year: Number(own.year), limit: 50 });
        const rows: Row[] = Array.isArray(list) ? list : (Array.isArray((list as any)?.items) ? (list as any).items : []);
        if (rows && rows.length){ r = rows[0]; }
      }
    } catch {}
    if (!allowDifferentSegments && ownRow){
      const baseSeg = segLabel(ownRow);
      const candSeg = segLabel(r);
      if (baseSeg && candSeg && baseSeg !== candSeg){
        setManualNotice(`El competidor pertenece al segmento "${candSeg}". Activa la casilla para permitir segmentos distintos.`);
        return;
      }
    }
    const key = `${r.make}|${r.model}|${r.version||''}|${r.ano||''}`;
    if (!manual.some(x => `${x.make}|${x.model}|${x.version||''}|${x.ano||''}` === key)) setManual(prev => [...prev, r]);
  };
  const removeComp = (idx:number) => setManual(prev => prev.filter((_,i)=>i!==idx));

  const sig = (rows: Row[]) => rows.map(r => `${r.make}|${r.model}|${r.version||''}|${r.ano||''}`).join(',');
  const { data: compared } = useSWR(ownRow ? ['dealer_compare', ownRow?.id || ownRow?.model, ownRow?.ano, sig(manual)] : null, async () => {
    return endpoints.compare({ own: ownRow, competitors: manual });
  });
  const baseRow = (compared?.own || ownRow) as Row | null;
  const comps = ((compared?.competitors || []) as any[]).map(c => ({ ...c.item, __deltas: c.deltas || {}, __diffs: c.diffs || {} }));

  function _fuelRaw(row: any): string {
    return String(
      row?.categoria_combustible_final ||
      row?.tipo_de_combustible_original ||
      row?.tipo_combustible ||
      row?.combustible ||
      ''
    ).toLowerCase();
  }
  function propulsionLabel(row: any): string {
    const raw = _fuelRaw(row);
    if (!raw) return '';
    if (raw.includes('elé') || raw.includes('elect')) return 'Eléctrico';
    if (raw.includes('phev') || raw.includes('enchuf')) return 'PHEV';
    if (raw.includes('hev') || raw.includes('híbrido') || raw.includes('hibrido')) return 'HEV';
    if (raw.includes('diesel')) return 'Diésel';
    if (raw.includes('gasolina') || raw.includes('nafta') || raw.includes('petrol')) {
      if (raw.includes('premium')) return 'PREMIUM';
      if (raw.includes('magna')) return 'MAGNA';
      return 'GASOLINA';
    }
    return raw.toUpperCase();
  }
  function fuelPriceLabel(row: any): string {
    const raw = _fuelRaw(row);
    const p = propulsionLabel(row).toLowerCase();
    if (!p) return '';
    const asOf = cfg?.fuel_prices_meta?.as_of ? ` • ${cfg.fuel_prices_meta.as_of}` : '';
    const src = cfg?.fuel_prices_meta?.source ? ' • CRE' : '';
    if (p === 'diésel' || p === 'diesel') {
      const v = fuelPrices?.diesel_litro; return v?`• $${Number(v).toFixed(2)}/L${asOf}${src}`:'';
    }
    if (p.includes('gasolina') || p.includes('premium') || p.includes('magna')) {
      const isPrem = raw.includes('premium');
      const v = isPrem ? (fuelPrices?.gasolina_premium_litro ?? fuelPrices?.gasolina_magna_litro) : (fuelPrices?.gasolina_magna_litro ?? fuelPrices?.gasolina_premium_litro);
      return v ? `• $${Number(v).toFixed(2)}/L${asOf}${src}` : '';
    }
    if (p === 'eléctrico') {
      const v = fuelPrices?.electricidad_kwh; return v?`• $${Number(v).toFixed(2)}/kWh${asOf}${src}`:'';
    }
    return '';
  }

  // Precio/HP: mismos fallbacks que ComparePanel (inferir HP de texto si falta)
  function cph(row: any): number | null {
    if (!row) return null;
    const direct = Number((row as any)?.cost_per_hp_mxn);
    if (Number.isFinite(direct)) return direct;
    const tx = Number((row as any)?.precio_transaccion);
    const msr = Number((row as any)?.msrp);
    const price = Number.isFinite(tx) && tx>0 ? tx : (Number.isFinite(msr) && msr>0 ? msr : NaN);
    let hp = Number((row as any)?.caballos_fuerza);
    if (!Number.isFinite(hp) || hp === 0) {
      try {
        const src = `${String((row as any)?.version||'')} ${String((row as any)?.version_display||'')} ${String((row as any)?.header_description||'')}`.toLowerCase();
        const mHp = src.match(/(\d{2,4})\s*(hp|bhp)\b/);
        const mPs = src.match(/(\d{2,4})\s*(ps|cv)\b/);
        if (mHp) hp = Number(mHp[1]);
        else if (mPs) hp = Number(mPs[1]) * 0.98632;
      } catch {}
    }
    if (!Number.isFinite(price) || !Number.isFinite(hp) || hp === 0) return null;
    return price / hp;
  }

  // Segmento/Body style helpers
  function segLabel(row: any): string {
    const raw = String(row?.segmento_display || row?.segmento_ventas || row?.body_style || '').toString().trim();
    const s = raw.toLowerCase();
    if (!s) return '-';
    if (s.includes('todo terreno') || s.includes('suv') || s.includes('crossover')) return "SUV'S";
    if (s.includes('pick') || s.includes('cab') || s.includes('chasis') || s.includes('camioneta')) return 'Pickup';
    if (s.includes('hatch')) return 'Hatchback';
    if (s.includes('van')) return 'Van';
    if (s.includes('wagon') || s.includes('familiar')) return 'Station Wagon';
    if (s.includes('cabrio') || s.includes('roadster') || s.includes('convertible')) return 'Cabriolet';
    if (s.includes('sedan') || s.includes('sedán') || s.includes('saloon')) return 'Sedán';
    return raw.slice(0,1).toUpperCase() + raw.slice(1);
  }

  // Insights para dealer (centrado en el propio)
  const [insightsStruct, setInsightsStruct] = React.useState<any|null>(null);
  const [insightsNotice, setInsightsNotice] = React.useState<string>('Pulsa “Generar speech comercial” para armar el guion.');
  const [loading, setLoading] = React.useState<boolean>(false);

  const equipScoreFor = React.useCallback((row: any): number | null => {
    const direct = num(row?.equip_score);
    if (direct != null && direct > 0) return direct;
    const pillars = ['equip_p_adas','equip_p_safety','equip_p_comfort','equip_p_infotainment','equip_p_traction','equip_p_utility'];
    const vals = pillars
      .map(key => num((row as any)?.[key]))
      .filter((v): v is number => v != null && v > 0);
    if (vals.length) {
      const avg = vals.reduce((acc, v) => acc + v, 0) / vals.length;
      return Number(avg.toFixed(1));
    }
    return null;
  }, []);

  const formatMoney = React.useCallback((val: number | null | undefined) => {
    if (val == null || !Number.isFinite(val)) return 'N/D';
    return Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(val);
  }, []);

  const formatDeltaMoney = React.useCallback((val: number | null | undefined) => {
    if (val == null || !Number.isFinite(val) || Math.abs(val) < 1) return '±$0';
    const sign = val > 0 ? '+' : '-';
    return `${sign}${formatMoney(Math.abs(val))}`;
  }, [formatMoney]);

  const pickFeatures = (arr: any[] | undefined, fallback: string) => {
    if (!Array.isArray(arr) || !arr.length) return fallback;
    const unique = Array.from(new Set(arr.map(item => String(item).trim()).filter(Boolean)));
    return unique.slice(0, 3).join(', ');
  };

  const buildFallbackScript = React.useCallback(() => {
    if (!baseRow) return { sections: [] };
    const baseName = `${brandLabel(baseRow)} ${baseRow.model || ''}${baseRow.version ? ` – ${baseRow.version}` : ''}`.trim();
    const basePrice = num(baseRow?.precio_transaccion) ?? num(baseRow?.msrp);
    const baseEquip = equipScoreFor(baseRow);
    const baseFuel = num(baseRow?.fuel_cost_60k_mxn);

    const saludo = `Saluda al cliente, presenta ${baseName} y pregunta para qué lo necesita (familia, viajes, carga).`;
    const valor = `Menciona que ofrece ${baseRow.caballos_fuerza ? `${fmtNum(baseRow.caballos_fuerza)} hp` : 'potencia destacada'}, tracción ${propulsionLabel(baseRow)} y precio ${basePrice != null ? formatMoney(basePrice) : 'competitivo'}.`;

    const compareItems = comps.length ? comps.map((comp: any) => {
      const compName = `${brandLabel(comp)} ${comp.model || ''}${comp.version ? ` – ${comp.version}` : ''}`.trim();
      const compPrice = num(comp?.precio_transaccion) ?? num(comp?.msrp);
      const compEquip = equipScoreFor(comp);
      const compFuel = num(comp?.fuel_cost_60k_mxn);
      const priceDelta = basePrice != null && compPrice != null ? basePrice - compPrice : null;
      const equipDelta = baseEquip != null && compEquip != null ? baseEquip - compEquip : null;
      const fuelDelta = baseFuel != null && compFuel != null ? baseFuel - compFuel : null;
      const ourWins = pickFeatures((comp as any)?.__diffs?.features_minus, 'cámara 360, ventilación, ADAS completos');
      const theirWins = pickFeatures((comp as any)?.__diffs?.features_plus, 'un detalle menor');
      const precioTxt = priceDelta == null ? 'precio similar' : (priceDelta <= 0 ? `estamos ${formatDeltaMoney(priceDelta)} vs ${compName}` : `ellos bajan ${formatDeltaMoney(-priceDelta)}; responde con valor agregado`);
      const equipTxt = equipDelta == null ? 'equipo comparable' : (equipDelta >= 0 ? `tenemos ~${Math.abs(equipDelta).toFixed(1)} pts más de cobertura` : `quedamos ~${Math.abs(equipDelta).toFixed(1)} pts bajo; ofrece paquete de valor`);
      const fuelTxt = fuelDelta == null ? 'consumo similar' : (fuelDelta <= 0 ? `nuestro gasto a 60k es ${formatDeltaMoney(fuelDelta)} menor` : `ellos ahorran ${formatDeltaMoney(-fuelDelta)}; compénsalo con garantía/servicio`);
      const text = `vs ${compName}: ${precioTxt}. Equipo: ${equipTxt}. Nosotros sí tenemos ${ourWins}; ellos presumen ${theirWins}. ${fuelTxt}.`;
      return { key: 'hallazgo', args: { text } };
    }) : [{ key: 'hallazgo', args: { text: 'Agrega un competidor para practicar comparativos sencillos.' } }];

    const cierre = `Invita a la prueba de manejo, presume garantía (${baseRow.warranty_full_months ? `${baseRow.warranty_full_months} meses` : 'extendida'}) y ofrece financiamiento, accesorios o servicio incluido para cerrar.`;

    return {
      sections: [
        { id: 'paso1', title: 'Paso 1 — Rompe el hielo', items: [ { key: 'hallazgo', args: { text: saludo } }, { key: 'hallazgo', args: { text: valor } } ] },
        { id: 'paso2', title: 'Paso 2 — Cara a cara con rivales', items: compareItems },
        { id: 'paso3', title: 'Paso 3 — Cierra la venta', items: [ { key: 'hallazgo', args: { text: cierre } } ] },
      ],
    };
  }, [baseRow, comps, equipScoreFor, formatDeltaMoney, formatMoney, pickFeatures]);

  const genDealer = React.useCallback(async () => {
    if (!baseRow) {
      setInsightsStruct(null);
      setInsightsNotice('Selecciona un vehículo base para armar el guion.');
      return;
    }
    const fallbackStruct = buildFallbackScript();
    try {
      setLoading(true);
      setInsightsNotice('Generando speech con IA…');
      const payload: Record<string, any> = {
        own: baseRow,
        competitors: manual,
        prompt_lang: 'es',
        prompt_scope: 'dealer_script',
        refresh: Date.now(),
      };
      const resp = await endpoints.insights(payload);
      if (resp?.ok === false) {
        if (fallbackStruct) {
          setInsightsStruct(fallbackStruct);
          setInsightsNotice(resp?.error ? `No se pudo generar con IA (${resp.error}). Usando guion base.` : 'No se pudo generar con IA. Usando guion base.');
        } else {
          setInsightsStruct(null);
          setInsightsNotice(resp?.error ? `No se pudo generar: ${resp.error}` : 'No se pudo generar el speech.');
        }
        return;
      }
      const struct = resp?.insights_struct;
      if (struct && Array.isArray(struct.sections) && struct.sections.length) {
        setInsightsStruct(struct);
        setInsightsNotice('Guion listo: usa los tres pasos para conducir la conversación.');
      } else if (fallbackStruct) {
        setInsightsStruct(fallbackStruct);
        setInsightsNotice('Guion listo (modo base).');
      } else {
        setInsightsStruct(null);
        setInsightsNotice('El modelo no devolvió contenido utilizable.');
      }
    } catch (error: any) {
      if (fallbackStruct) {
        setInsightsStruct(fallbackStruct);
        setInsightsNotice(`Error al generar con IA (${error instanceof Error ? error.message : 'desconocido'}). Usando guion base.`);
      } else {
        setInsightsStruct(null);
        setInsightsNotice(`Error al generar con IA: ${error instanceof Error ? error.message : 'desconocido'}.`);
      }
    } finally {
      setLoading(false);
    }
  }, [baseRow, manual, buildFallbackScript]);

  const exportPdf = React.useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.print();
      }
    } catch {}
  }, []);

  type ChartRow = {
    name: string;
    price: number | null;
    hp: number | null;
    length: number | null;
    isBase: boolean;
  };

  const chartsRows = React.useMemo(() => {
    if (!baseRow) return [] as ChartRow[];
    const rows = [{ ...baseRow, __isBase: true }, ...comps];
    return rows.map((row: any) => {
      const price = num(row?.precio_transaccion) ?? num(row?.msrp);
      const hp = num(row?.caballos_fuerza);
      const length = num(row?.longitud_mm);
      const name = `${brandLabel(row)} ${row?.model || ''}${row?.version ? ` – ${row.version}` : ''}`.trim();
      return { name: name || 'Vehículo', price, hp, length, isBase: !!row?.__isBase };
    }) as ChartRow[];
  }, [baseRow, comps]);

  const formatCurrencyShort = (value: number) => {
    if (!Number.isFinite(value)) return '$0';
    if (Math.abs(value) >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)} M`;
    }
    if (Math.abs(value) >= 1_000) {
      return `$${(value / 1_000).toFixed(0)} K`;
    }
    return Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
  };

  const hpPriceOption = React.useMemo(() => {
    const data = chartsRows.filter(d => d.price !== null && d.hp !== null);
    if (!data.length) return {} as any;
    const seriesData = data.map(d => ({
      name: d.name,
      value: [d.price as number, d.hp as number],
      itemStyle: { color: d.isBase ? '#0fa968' : '#0c5840' },
      symbolSize: d.isBase ? 18 : 14,
    }));
    return {
      title: { text: 'HP vs Precio tx', left: 'center', top: 6 },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const [price, hp] = params.value || [];
          const fmt = Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
          const fmtNum = Intl.NumberFormat('es-MX');
          return `<strong>${params.name}</strong><br/>Precio: ${fmt.format(price)}<br/>HP: ${fmtNum.format(hp)}`;
        },
      },
      grid: { left: 70, right: 30, top: 60, bottom: 60 },
      xAxis: {
        name: 'Precio tx (MXN)',
        axisLabel: {
          formatter: (val: number) => formatCurrencyShort(val),
        },
        axisPointer: { show: true, label: { formatter: ({ value }: any) => formatCurrencyShort(value) } },
      },
      yAxis: {
        name: 'HP',
        axisLabel: {
          formatter: (val: number) => Intl.NumberFormat('es-MX').format(val),
        },
      },
      series: [{ type: 'scatter', data: seriesData }],
    } as any;
  }, [chartsRows]);

  const lengthOption = React.useMemo(() => {
    const baseLength = num(baseRow?.longitud_mm);
    const data = chartsRows.filter(d => d.length !== null);
    if (!data.length || baseLength == null) return {} as any;
    const formatted = data.map(d => {
      const delta = (d.length ?? 0) - baseLength;
      return {
        name: d.isBase ? `${d.name} (Nosotros)` : d.name,
        value: Number(delta.toFixed(0)),
        abs: d.length,
        isBase: d.isBase,
      };
    });
    const maxAbs = Math.max(...formatted.map(d => Math.abs(d.value))) || 1;
    const pad = Math.max(100, Math.ceil(maxAbs * 0.1));
    const xMax = maxAbs + pad;
    return {
      title: { text: 'Δ Longitud vs base (mm)', left: 'center', top: 6 },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const mmFmt = (n: number) => `${Intl.NumberFormat('es-MX').format(n)} mm`;
          const delta = Number(params.value);
          const original = formatted[params.dataIndex]?.abs ?? baseLength;
          const label = formatted[params.dataIndex]?.isBase ? 'Nosotros' : params.name;
          const sign = delta > 0 ? '+' : '';
          return `<strong>${label}</strong><br/>Longitud: ${mmFmt(Number(original))}<br/>Δ vs base: ${sign}${mmFmt(delta)}`;
        },
      },
      grid: { left: 120, right: 40, top: 60, bottom: 40 },
      xAxis: {
        type: 'value',
        min: -xMax,
        max: xMax,
        splitNumber: 6,
        axisLabel: { formatter: (val: number) => `${Intl.NumberFormat('es-MX').format(val)} mm` },
      },
      yAxis: {
        type: 'category',
        data: formatted.map(d => d.name),
      },
      series: [{
        type: 'bar',
        data: formatted.map(d => ({
          value: d.value,
          itemStyle: { color: d.isBase ? '#0fa968' : (d.value >= 0 ? '#0c4a30' : '#dc2626') },
          label: {
            show: true,
            position: d.value >= 0 ? 'right' : 'left',
            formatter: ({ value }: any) => `${value >= 0 ? '+' : ''}${Intl.NumberFormat('es-MX').format(value)} mm`,
            color: '#0f172a',
          },
        })),
      }],
    } as any;
  }, [chartsRows, baseRow]);

  // Tabla principal (deltas)
  function fmtMoney(v:any){ const n=Number(v); return Number.isFinite(n)? Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n):'-'; }
  function fmtNum(v:any){ const n=Number(v); return Number.isFinite(n)? Intl.NumberFormat('es-MX').format(n):'-'; }
  function tri(n:number){ return n>0?'↑':(n<0?'↓':'='); }

  return (
    <section style={{ display:'grid', gap:16 }}>
      <div className="no-print" style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12, background:'#f8fafc' }}>
          <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Vehículo propio</div>
          {baseRow ? (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ fontWeight:700, fontSize:16 }}>{brandLabel(baseRow)} {String(baseRow.model||'')}</div>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:12, color:'#475569' }}>
                <span>{baseRow.version || 'Versión N/D'}</span>
                <span>{baseRow.ano ? `MY ${baseRow.ano}` : 'Año N/D'}</span>
                <span>{propulsionLabel(baseRow)}</span>
              </div>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:13 }}>
                <span>Precio tx: {fmtMoney(baseRow.precio_transaccion ?? baseRow.msrp)}</span>
                <span>HP: {fmtNum(baseRow.caballos_fuerza)}</span>
                <span>Equipamiento: {fmtNum(getPillarValue(baseRow, 'seguridad') ?? 0)} pts seguridad</span>
              </div>
              <button type="button" onClick={exportPdf} style={{ alignSelf:'flex-start', marginTop:6, padding:'6px 10px', background:'#111827', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}>Exportar PDF</button>
            </div>
          ) : (
            <div style={{ fontSize:12, color:'#64748b' }}>Selecciona un vehículo en la parte superior para ver detalles.</div>
          )}
        </div>
        <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12 }}>
          <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Agregar competidor</div>
          <DealerManualBlock onAdd={addComp} year={own.year} allowDifferentYears={allowDifferentYears} />
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:8, fontSize:12, color:'#475569' }}>
            <label style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input
                type="checkbox"
                checked={allowDifferentYears}
                onChange={e => {
                  setAllowDifferentYears(e.target.checked);
                  setManualNotice('');
                }}
              />
              Permitir otros años modelo
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input
                type="checkbox"
                checked={allowDifferentSegments}
                onChange={e => {
                  setAllowDifferentSegments(e.target.checked);
                  setManualNotice('');
                }}
              />
              Permitir otros segmentos
            </label>
          </div>
          {manualNotice ? (
            <div style={{ marginTop:6, fontSize:11, color:'#b91c1c' }}>{manualNotice}</div>
          ) : null}
        </div>
      </div>

      {/* Tabla de deltas */}
      {baseRow ? (
        <div className="print-block">
          <table className="avoid-break" style={{ width:'100%', minWidth: 1100, borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e5e7eb' }}></th>
                <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e5e7eb' }}>Vehículo</th>
                <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e5e7eb' }}>MSRP</th>
                <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e5e7eb' }}>Precio tx</th>
                <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e5e7eb' }}>Comb/Energ 60k</th>
                <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e5e7eb' }}>Servicio 60k</th>
                <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e5e7eb' }}>TCO 60k</th>
                <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e5e7eb' }}>HP</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td></td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
          <div style={{ fontWeight:700 }}>{brandLabel(baseRow)} {String(baseRow.model||'')}</div>
                  <div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>{baseRow.ano || ''}</div>
                  <div style={{ fontWeight:500 }}>{String(baseRow.version||'')}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtMoney(baseRow.msrp)}</td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtMoney(baseRow.precio_transaccion)}</td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                  {fmtMoney(baseRow.fuel_cost_60k_mxn)}
                  <div style={{ fontSize:12, opacity:0.75 }}>{propulsionLabel(baseRow)} {fuelPriceLabel(baseRow)} • Rendimiento Combinado</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtMoney(baseRow.service_cost_60k_mxn)}</td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtMoney(baseRow.tco_60k_mxn)}</td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtNum((baseRow as any)?.caballos_fuerza)}</td>
              </tr>
              {comps.map((r:any, i:number)=>{
                const d = r.__deltas || {};
                const inv = (dd:any)=> (dd && typeof dd.delta==='number') ? -dd.delta : null;
                const d_m = inv(d.msrp), d_tx=inv(d.precio_transaccion), d_f=inv(d.fuel_cost_60k_mxn), d_s=inv(d.service_cost_60k_mxn), d_t=inv(d.tco_60k_mxn);
                const d_h = (d.caballos_fuerza && typeof d.caballos_fuerza.delta==='number') ? d.caballos_fuerza.delta : null;
                const rowBg = i%2===0? '#ffffff':'#fafafa';
                return (
                  <tr key={i} style={{ background: rowBg }}>
                    <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                      <button className="no-print" onClick={()=>removeComp(i)} title="Quitar" style={{ border:'1px solid #e5e7eb', background:'#fff', borderRadius:6, padding:'2px 6px' }}>×</button>
                    </td>
                    <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                      <div style={{ fontWeight:600 }}>{brandLabel(r)} {String(r.model||'')}</div>
                      <div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>{r.ano||''}</div>
                      <div style={{ fontWeight:500 }}>{String(r.version||'')}</div>
                    </td>
                    <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtMoney(r.msrp)}<div style={{ fontSize:12, opacity:0.9, color: d_m!=null ? (d_m<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_m==null?'-':`${tri(d_m)} ${fmtMoney(Math.abs(d_m))}`}</div></td>
                    <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtMoney(r.precio_transaccion)}<div style={{ fontSize:12, opacity:0.9, color: d_tx!=null ? (d_tx<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_tx==null?'-':`${tri(d_tx)} ${fmtMoney(Math.abs(d_tx))}`}</div></td>
                    <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                      {fmtMoney(r.fuel_cost_60k_mxn)}
                      <div style={{ fontSize:12, opacity:0.75 }}>{propulsionLabel(r)} {fuelPriceLabel(r)} • Rendimiento Combinado</div>
                      <div style={{ fontSize:12, opacity:0.9, color: d_f!=null ? (d_f<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_f==null?'-':`${tri(d_f)} ${fmtMoney(Math.abs(d_f))}`}</div>
                    </td>
                    <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtMoney(r.service_cost_60k_mxn)}<div style={{ fontSize:12, opacity:0.9, color: d_s!=null ? (d_s<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_s==null?'-':`${tri(d_s)} ${fmtMoney(Math.abs(d_s))}`}</div></td>
                    <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtMoney(r.tco_60k_mxn)}<div style={{ fontSize:12, opacity:0.9, color: d_t!=null ? (d_t<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_t==null?'-':`${tri(d_t)} ${fmtMoney(Math.abs(d_t))}`}</div></td>
                    <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtNum((r as any)?.caballos_fuerza)}<div style={{ fontSize:12, opacity:0.9, color: d_h!=null ? (d_h>0?'#16a34a':'#dc2626'):'#64748b' }}>{d_h==null?'-':`${tri(d_h)} ${fmtNum(Math.abs(d_h))}`}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Tabla de equipamiento (pilares) */}
      {baseRow ? (() => {
        const rows = [{ row: baseRow, isBase: true }, ...comps.map(r => ({ row: r, isBase: false }))];
        const pillars = ['seguridad','confort','audio_y_entretenimiento','transmision','energia'];
        return (
          <div className="print-block" style={{ border:'1px solid #e5e7eb', borderRadius:10 }}>
            <div style={{ padding:'8px 10px', borderBottom:'1px solid #e5e7eb', background:'#fafafa', fontWeight:600 }}>Cobertura de equipamiento (0-100)</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', minWidth: 800, borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#f8fafc' }}>
                    <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e5e7eb' }}>Vehículo</th>
                    {pillars.map(p => (
                      <th key={p} style={{ textAlign:'center', padding:'6px 8px', borderBottom:'1px solid #e5e7eb' }}>{PILLAR_LABELS[p]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ row, isBase }, idx) => (
                    <tr key={idx} style={{ background: isBase ? '#f0fdf4' : 'transparent' }}>
                      <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:isBase?600:500 }}>
                        {brandLabel(row)} {String(row.model||'')} {row.version ? `– ${row.version}` : ''}
                      </td>
                      {pillars.map(p => {
                        const val = getPillarValue(row, p);
                        return (
                          <td key={p} style={{ textAlign:'center', padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                            {val != null ? `${Number(val).toFixed(1)} pts` : 'N/D'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })() : null}

      {/* Charts: HP y Dimensiones */}
      <div className="print-block" style={{ display:'grid', gap:16, gridTemplateColumns:'repeat(auto-fit, minmax(320px,1fr))' }}>
        <div className="print-block" style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12 }}>
          {EChart && Object.keys(hpPriceOption).length ? (
            <EChart echarts={echarts} option={hpPriceOption} opts={{ renderer: 'svg' }} style={{ height: 300 }} />
          ) : (
            <div style={{ color:'#64748b', fontSize:12, padding:12 }}>Sin datos suficientes de precio y HP.</div>
          )}
        </div>
        <div className="print-block" style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12 }}>
          {EChart && Object.keys(lengthOption).length ? (
            <EChart echarts={echarts} option={lengthOption} opts={{ renderer: 'svg' }} style={{ height: 300 }} />
          ) : (
            <div style={{ color:'#64748b', fontSize:12, padding:12 }}>Sin datos de longitud para graficar.</div>
          )}
        </div>
      </div>

      {/* Insights (Dealer) */}
      <div className="print-block" style={{ border:'1px solid #e5e7eb', borderRadius:10 }}>
        <div className="no-print" style={{ padding:'8px 10px', borderBottom:'1px solid #e5e7eb', background:'#fafafa', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700 }}>Guion de ventas</div>
          <button onClick={genDealer} disabled={!baseRow || loading} style={{ padding:'6px 10px', background:'#111827', color:'#fff', border:'none', borderRadius:8, cursor: (!baseRow || loading) ? 'not-allowed' : 'pointer', opacity: (!baseRow || loading) ? 0.6 : 1 }}>
            {loading ? 'Generando…' : 'Generar speech comercial'}
          </button>
        </div>
        <div style={{ padding:10, display:'grid', gap:10 }}>
          {insightsStruct ? renderStruct(insightsStruct, 'es' as any) : null}
          <div style={{ color:'#64748b', fontSize:13 }}>{insightsNotice}</div>
        </div>
      </div>

    </section>
  );
}
