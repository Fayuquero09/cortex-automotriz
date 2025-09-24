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
    <div className="no-print" style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:10 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontWeight:600 }}>Agregar competidor:</span>
        <input placeholder="Marca o modelo" value={q} onChange={e=>setQ(e.target.value)} style={{ minWidth:260 }} />
      </div>
      {list.length>0 ? (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
          {list.map((r:Row, i:number)=> (
            <button
              key={i}
              onClick={()=> onAdd(r)}
              style={{ border:'1px solid #e5e7eb', background:'#fff', padding:'4px 8px', borderRadius:6, cursor:'pointer' }}
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
  const [allowDifferentYears, setAllowDifferentYears] = React.useState<boolean>(false);
  const addComp = async (r: Row) => {
    // Regla: mismo año modelo por defecto; permitir diferentes si se activa el toggle
    try{
      if (!allowDifferentYears && own?.year && r?.ano && Number(r.ano)!==Number(own.year)){
        const list = await endpoints.catalog({ make: r.make, model: r.model, year: Number(own.year), limit: 50 });
        const rows: Row[] = Array.isArray(list) ? list : (Array.isArray((list as any)?.items) ? (list as any).items : []);
        if (rows && rows.length){ r = rows[0]; }
      }
    } catch {}
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

  const BODY_GUIDE: Record<string, { desc: string; pros: string[]; when: string[] }> = {
    'Sedán': {
      desc: 'Carrocería tradicional de 4 puertas con maletero separado; cómoda y estable. ',
      pros: ['Confort y manejo estable', 'Buen espacio para 4–5 pasajeros', 'Maletero amplio y aislado'],
      when: ['Familias y viajes de trabajo', 'Trayectos largos en carretera']
    },
    'Hatchback': {
      desc: 'Cajuela integrada que abre hacia arriba; tamaño compacto y versátil para ciudad.',
      pros: ['Compacto y práctico', 'Buen volumen de carga relativo', 'Fácil de estacionar'],
      when: ['Uso urbano diario', 'Primer auto o familias pequeñas']
    },
    "SUV'S": {
      desc: 'Altura y espacio superiores; útil en caminos mixtos y para familias.',
      pros: ['Posición de manejo alta', 'Interior y cajuela amplios', 'Mejor despeje y opciones AWD/4x4'],
      when: ['Familias y viajes largos', 'Actividades al aire libre o caminos irregulares']
    },
    'Crossover': {
      desc: 'Mezcla de SUV y hatch/sedán: más eficiente y compacto pero con postura alta.',
      pros: ['Tamaño contenido', 'Práctico para ciudad', 'Postura alta con buena visibilidad'],
      when: ['Ciudad con viajes ocasionales', 'Familias pequeñas que buscan versatilidad']
    },
    'Station Wagon': {
      desc: 'Versión alargada del sedán con gran cajuela; muy útil para carga/viaje.',
      pros: ['Gran capacidad de carga', 'Consumo contenido por aerodinámica', 'Confort de sedán'],
      when: ['Familias grandes', 'Necesidad de cajuela ampliada sin ir a SUV']
    },
    'Pickup': {
      desc: 'Caja abierta para carga; opción de doble o sencilla cabina; enfoque de trabajo.',
      pros: ['Alta capacidad de carga y arrastre', 'Estructura robusta', 'Versiones 4x4 disponibles'],
      when: ['Uso comercial (obra, campo, logística)', 'Necesidad de transportar carga a cielo abierto']
    },
    'Cabriolet': {
      desc: 'Techo retráctil para manejo a cielo abierto; enfoque emocional/deportivo.',
      pros: ['Experiencia de conducción abierta', 'Diseño y desempeño'],
      when: ['Uso recreativo', 'Entusiastas que priorizan estilo/performance']
    },
    'Van': {
      desc: 'Gran volumen interior para pasajeros o carga; ideal para logística o familias grandes.',
      pros: ['Habitáculo enorme', 'Configuraciones de asientos flexibles', 'Gran capacidad de carga'],
      when: ['Transporte comercial y de pasajeros', 'Familias muy grandes o equipaje voluminoso']
    },
  };

  // Insights para dealer (centrado en el propio)
  const [insightsStruct, setInsightsStruct] = React.useState<any|null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const genDealer = async ()=>{
    try{
      setLoading(true);
      const r = await endpoints.insights({ own: baseRow, competitors: manual, prompt_lang: 'es', refresh: Date.now() });
      const ok = r?.ok !== false;
      setInsightsStruct(ok ? (r?.insights_struct || null) : null);
    } finally { setLoading(false); }
  };

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
    screen: number | null;
    safety: number | null;
    isBase: boolean;
  };

  const chartsRows = React.useMemo(() => {
    if (!baseRow) return [] as ChartRow[];
    const rows = [{ ...baseRow, __isBase: true }, ...comps];
    return rows.map((row: any) => {
      const price = num(row?.precio_transaccion) ?? num(row?.msrp);
      const hp = num(row?.caballos_fuerza);
      const length = num(row?.longitud_mm);
      const screen = num(row?.screen_main_in);
      const safety = getPillarValue(row, 'seguridad');
      const name = `${brandLabel(row)} ${row?.model || ''}${row?.version ? ` – ${row.version}` : ''}`.trim();
      return { name: name || 'Vehículo', price, hp, length, screen, safety, isBase: !!row?.__isBase };
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
    const data = chartsRows.filter(d => d.length !== null);
    if (!data.length) return {} as any;
    const categories = data.map(d => d.name);
    const values = data.map(d => ({
      value: d.length,
      itemStyle: { color: d.isBase ? '#0fa968' : '#0c4a30' },
      label: { show: true, position: 'right', formatter: ({ value }: any) => `${Intl.NumberFormat('es-MX').format(value)} mm` },
    }));
    return {
      title: { text: 'Longitud total', left: 'center', top: 6 },
      grid: { left: 120, right: 30, top: 60, bottom: 40 },
      xAxis: {
        type: 'value',
        name: 'mm',
        axisLabel: { formatter: (val: number) => `${Intl.NumberFormat('es-MX').format(val)} mm` },
        splitNumber: 4,
      },
      yAxis: {
        type: 'category',
        data: categories,
      },
      series: [{ type: 'bar', data: values }],
    } as any;
  }, [chartsRows]);

  const screenOption = React.useMemo(() => {
    const data = chartsRows.filter(d => d.screen !== null);
    if (!data.length) return {} as any;
    const categories = data.map(d => d.name);
    const values = data.map(d => ({
      value: d.screen,
      itemStyle: { color: d.isBase ? '#1d4ed8' : '#7c3aed' },
      label: { show: true, position: 'right', formatter: ({ value }: any) => `${Number(value).toFixed(1)}"` },
    }));
    return {
      title: { text: 'Pantalla principal (pulgadas)', left: 'center', top: 6 },
      grid: { left: 120, right: 30, top: 60, bottom: 40 },
      xAxis: {
        type: 'value',
        name: '"',
        axisLabel: { formatter: (val: number) => `${Number(val).toFixed(1)}"` },
        min: Math.max(0, Math.min(...data.map(d => d.screen!)) - 1),
      },
      yAxis: { type: 'category', data: categories },
      series: [{ type: 'bar', data: values }],
    } as any;
  }, [chartsRows]);

  const safetyOption = React.useMemo(() => {
    const data = chartsRows.filter(d => d.safety !== null);
    if (!data.length) return {} as any;
    return {
      title: { text: `${PILLAR_LABELS['seguridad']} (0-100)`, left: 'center', top: 6 },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const safetyVal = Number(params.value);
          return `<strong>${params.name}</strong><br/>${PILLAR_LABELS['seguridad']}: ${safetyVal.toFixed(1)}`;
        },
      },
      grid: { left: 50, right: 20, top: 60, bottom: 50 },
      xAxis: {
        type: 'value',
        name: PILLAR_LABELS['seguridad'],
        min: 0,
        max: 100,
      },
      yAxis: {
        type: 'category',
        data: data.map(d => d.name),
      },
      series: [{
        type: 'bar',
        data: data.map(d => ({
          value: d.safety,
          itemStyle: { color: d.isBase ? '#0fa968' : '#14b8a6' },
          label: { show: true, position: 'right', formatter: ({ value }: any) => `${Number(value).toFixed(0)}` },
        })),
      }],
    } as any;
  }, [chartsRows]);

  // Radar simple (6 pilares)
  const radarOption = React.useMemo(() => {
    if (!baseRow) return {} as any;
    const keys = ['seguridad','motor','confort','audio_y_entretenimiento','transmision','energia'];
    const ind = keys.map(k => ({ name: PILLAR_LABELS[k] || k, max: 100 }));
    const rows = [ { ...baseRow, __isBase: true }, ...comps ];
    const series = rows.map((r:any) => ({
      name: `${brandLabel(r)} ${r.model||''}${r.version?` – ${r.version}`:''}`,
      value: keys.map(k => {
        const val = getPillarValue(r, k);
        return val != null ? Number(val.toFixed(1)) : 0;
      })
    }));
    if (!series.length) return {} as any;
    return {
      title: { text: 'Pilares de equipamiento', left:'center', top:6 },
      tooltip: { trigger: 'item' },
      radar: { indicator: ind, radius: 90 },
      legend: { bottom: 0 },
      series: [{ type: 'radar', data: series }]
    } as any;
  }, [baseRow, comps]);

  // Tabla principal (deltas)
  function fmtMoney(v:any){ const n=Number(v); return Number.isFinite(n)? Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n):'-'; }
  function fmtNum(v:any){ const n=Number(v); return Number.isFinite(n)? Intl.NumberFormat('es-MX').format(n):'-'; }
  function tri(n:number){ return n>0?'↑':(n<0?'↓':'='); }

  return (
    <section style={{ display:'grid', gap:16 }}>
      <div className="no-print" style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <DealerManualBlock onAdd={addComp} year={own.year} allowDifferentYears={allowDifferentYears} />
        <label style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input type="checkbox" checked={allowDifferentYears} onChange={e=>setAllowDifferentYears(e.target.checked)} />
          <span style={{ fontSize:12, color:'#475569' }}>Permitir años diferentes</span>
        </label>
        <button
          type="button"
          onClick={exportPdf}
          style={{ padding:'8px 12px', background:'#1f2937', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}
        >
          Exportar PDF
        </button>
      </div>

      {/* Tabla de deltas */}
      {baseRow ? (
        <div>
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

      {/* Equipo: diferencias vs base */}
      {baseRow && comps.length ? (
        <div style={{ border:'1px solid #e5e7eb', borderRadius:10 }}>
          <div style={{ padding:'8px 10px', borderBottom:'1px solid #e5e7eb', background:'#fafafa', fontWeight:600 }}>Equipo: diferencias vs base</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:12, padding:10 }}>
            {comps.map((r:any, idx:number)=>{
              const diffs = (r as any).__diffs || {};
              const plus: string[] = Array.isArray(diffs.features_plus)? diffs.features_plus as string[] : [];
              const minus: string[] = Array.isArray(diffs.features_minus)? diffs.features_minus as string[] : [];
              return (
                <div key={idx} style={{ border:'1px solid #f1f5f9', borderRadius:8, padding:10 }}>
                  <div style={{ fontWeight:600, marginBottom:6, color:'#334155' }}>{vehicleLabel(r)}</div>
                  <div style={{ display:'flex', gap:12 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, color:'#16a34a', marginBottom:4 }}>Ellos no tienen (nosotros sí)</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {minus.length ? minus.map((p,i)=>(<span key={i} style={{ fontSize:11, background:'rgba(22,163,74,0.08)', color:'#166534', border:`1px solid rgba(22,163,74,0.25)`, borderRadius:6, padding:'2px 6px' }}>{p}</span>)) : <span style={{ fontSize:11, color:'#64748b' }}>—</span>}
                      </div>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, color:'#dc2626', marginBottom:4 }}>Ellos sí tienen (nosotros no)</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {plus.length ? plus.map((p,i)=>(<span key={i} style={{ fontSize:11, background:'rgba(220,38,38,0.06)', color:'#991b1b', border:`1px solid rgba(220,38,38,0.25)`, borderRadius:6, padding:'2px 6px' }}>{p}</span>)) : <span style={{ fontSize:11, color:'#64748b' }}>—</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Guía de segmentos cuando hay diferencias de body style */}
      {baseRow && comps.length ? (() => {
        const baseSeg = segLabel(baseRow);
        const diffs = Array.from(new Set(comps.map((r:any)=> segLabel(r)).filter((s)=> s && s!==baseSeg)));
        if (!diffs.length) return null;
        const show = [baseSeg, ...diffs];
        return (
          <div style={{ border:'1px solid #e5e7eb', borderRadius:10, marginTop:12 }}>
            <div style={{ padding:'8px 10px', borderBottom:'1px solid #e5e7eb', background:'#fafafa', fontWeight:600 }}>
              Guía rápida de segmentos (comparación entre estilos distintos)
            </div>
            <div style={{ padding:10, color:'#334155' }}>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>
                Cuando el cliente compara vehículos de segmentos diferentes, conviene explicar pros, uso típico y trade‑offs.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px,1fr))', gap:12 }}>
                {show.map((seg)=>{
                  const info = BODY_GUIDE[seg] || null;
                  return (
                    <div key={seg} style={{ border:'1px solid #eef2f7', borderRadius:8, padding:10 }}>
                      <div style={{ fontWeight:700, marginBottom:4 }}>{seg}</div>
                      <div style={{ fontSize:12, marginBottom:6 }}>{info?.desc || '—'}</div>
                      <div style={{ fontSize:12, marginBottom:4 }}><span style={{ fontWeight:600 }}>Ventajas:</span> {(info?.pros||[]).join(' · ') || '—'}</div>
                      <div style={{ fontSize:12 }}><span style={{ fontWeight:600 }}>¿Cuándo conviene?</span> {(info?.when||[]).join(' · ') || '—'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })() : null}

      {/* Charts for desempeño */}
      <div style={{ display:'grid', gap:16, gridTemplateColumns:'repeat(2, minmax(320px,1fr))', gridAutoRows:'minmax(320px, auto)' }}>
        <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12 }}>
          {EChart && Object.keys(hpPriceOption).length ? (
            <EChart echarts={echarts} option={hpPriceOption} opts={{ renderer: 'svg' }} style={{ height: 300 }} />
          ) : (
            <div style={{ color:'#64748b', fontSize:12, padding:12 }}>Sin datos suficientes de precio y HP.</div>
          )}
        </div>
        <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12 }}>
          {EChart && Object.keys(lengthOption).length ? (
            <EChart echarts={echarts} option={lengthOption} opts={{ renderer: 'svg' }} style={{ height: 300 }} />
          ) : (
            <div style={{ color:'#64748b', fontSize:12, padding:12 }}>Sin datos de longitud para graficar.</div>
          )}
        </div>
        <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12 }}>
          {EChart && Object.keys(screenOption).length ? (
            <EChart echarts={echarts} option={screenOption} opts={{ renderer: 'svg' }} style={{ height: 300 }} />
          ) : (
            <div style={{ color:'#64748b', fontSize:12, padding:12 }}>Sin datos de pantalla para graficar.</div>
          )}
        </div>
        <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12 }}>
          {EChart && Object.keys(safetyOption).length ? (
            <EChart echarts={echarts} option={safetyOption} opts={{ renderer: 'svg' }} style={{ height: 300 }} />
          ) : (
            <div style={{ color:'#64748b', fontSize:12, padding:12 }}>Sin datos de seguridad para graficar.</div>
          )}
        </div>
      </div>

      {/* Radar pilares */}
      <div>
        {EChart ? <EChart echarts={echarts} option={radarOption} opts={{ renderer: 'svg' }} style={{ height: 360 }} /> : null}
      </div>

      {/* Insights (Dealer) */}
      <div style={{ border:'1px solid #e5e7eb', borderRadius:10 }}>
        <div className="no-print" style={{ padding:'8px 10px', borderBottom:'1px solid #e5e7eb', background:'#fafafa', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700 }}>Insights</div>
          <button onClick={genDealer} disabled={loading || !baseRow} style={{ padding:'6px 10px', background:'#111827', color:'#fff', border:'none', borderRadius:8, cursor: (loading||!baseRow)?'not-allowed':'pointer', opacity:(loading||!baseRow)?0.6:1 }}>
            {loading? 'Generando…':'Generar insights'}
          </button>
        </div>
        <div style={{ padding:10 }}>
          {insightsStruct ? (renderStruct(insightsStruct, 'es' as any)) : (
            <div style={{ color:'#64748b', fontSize:13 }}>Pulsa “Generar insights” para ver highlights del vehículo.</div>
          )}
        </div>
      </div>

    </section>
  );
}
