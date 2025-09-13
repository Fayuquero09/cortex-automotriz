"use client";
import React from 'react';
import dynamic from 'next/dynamic';
import * as echarts from 'echarts';
const EChart = dynamic(() => import('echarts-for-react'), { ssr: false });
import useSWR from 'swr';
import { useAppState } from '@/lib/state';
import { useI18n } from '@/lib/i18n';
import { endpoints } from '@/lib/api';
import { renderStruct } from '@/lib/insightsTemplates';

type Row = Record<string, any>;

type ManualBlockProps = {
  manModel: string;
  setManModel: (v: string) => void;
  manMake: string;
  setManMake: (v: string) => void;
  ownYear: number | '';
  brandAlpha: string;
  setBrandAlpha: (v: string) => void;
  brandSugg: string[];
  modelSugg: string[];
  modelsForMake: string[];
  vehSugg?: Row[];
  addManual: (selVersion?: string, directRow?: Row) => Promise<void> | void;
  manVersions: string[];
  manual: Row[];
  removeManual: (idx: number) => void;
  manInputRef: React.RefObject<HTMLInputElement>;
};

function ManualBlock({ manModel, setManModel, manMake, ownYear, brandAlpha, setBrandAlpha, brandSugg, modelSugg, modelsForMake, setManMake, vehSugg, addManual, manVersions, manual, removeManual, manInputRef }: ManualBlockProps) {
  const [hi, setHi] = React.useState<number>(-1);
  const list = React.useMemo(() => (vehSugg ? (vehSugg as Row[]).slice(0, 12) : []), [vehSugg]);
  React.useEffect(() => { setHi(-1); }, [manModel, list.length]);
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const N = list.length;
    if (!N) return;
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h+1>=N?0:h+1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h<=0?N-1:h-1)); }
    else if (e.key === 'Enter') { if (hi>=0 && hi<N) { e.preventDefault(); addManual(undefined, list[hi]); } }
    else if (e.key === 'Escape') { setHi(-1); }
  }
  // hover state handled in main table; keep ManualBlock pure

  return (
    <>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6, flexWrap:'wrap' }}>
        <span style={{ fontWeight:600 }}>Agregar competidor manual:</span>
        <input
          ref={manInputRef}
          placeholder="Marca o modelo"
          value={manModel}
          onChange={(e)=> setManModel(e.target.value)}
          onKeyDown={onKeyDown}
          style={{ minWidth:260 }}
        />
        <button
          type="button"
          onClick={()=>{ setManModel(''); setManMake(''); setBrandAlpha(''); setTimeout(()=>manInputRef.current?.focus(), 0); }}
          style={{ border:'1px solid #e5e7eb', background:'#fff', padding:'6px 10px', borderRadius:8, cursor:'pointer' }}
          title="Limpiar"
        >
          Limpiar
        </button>
        {ownYear ? <span style={{ fontSize:12, opacity:0.6 }}>Año base: {ownYear}</span> : null}
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', margin:'4px 0' }}>
        {['Todos','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'].map((ch) => (
          <button key={ch}
            onClick={()=>setBrandAlpha(ch==='Todos'?'*':ch)}
            style={{ border:'1px solid #e5e7eb', background: (brandAlpha===ch || (ch==='Todos' && brandAlpha==='*')) ? '#eef2ff':'#fff', padding:'2px 6px', borderRadius:6, cursor:'pointer', fontSize:12 }}>
            {ch}
          </button>
        ))}
      </div>
      {brandSugg.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:4 }}>
          {brandSugg.map((b: string) => (
            <button key={b} tabIndex={-1} onClick={()=>setManMake(b)} style={{ border:'1px solid #e5e7eb', background:'#fff', padding:'2px 6px', borderRadius:6, cursor:'pointer' }}>{b}</button>
          ))}
        </div>
      )}
      {/* Modelos de la marca seleccionada */}
      {manMake && (modelsForMake || []).length > 0 && !manModel && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
          {(modelsForMake || []).slice(0, 80).map((m: string) => (
            <button key={m} tabIndex={-1} onClick={()=>setManModel(m)} style={{ border:'1px solid #e5e7eb', background:'#fff', padding:'2px 6px', borderRadius:6, cursor:'pointer' }}>{m}</button>
          ))}
        </div>
      )}
      {/* Sugerencias por texto (si escribe) */}
      {modelSugg.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
          {modelSugg.map((s: string) => (
            <button key={s} tabIndex={-1} onClick={()=>setManModel(s)} style={{ border:'1px solid #e5e7eb', background:'#fff', padding:'2px 6px', borderRadius:6, cursor:'pointer' }}>{s}</button>
          ))}
        </div>
      )}
      {(() => { const q = manModel.trim(); return (list && list.length>0 && q.length>=2); })() && (
        <div style={{ display:'grid', gap:4, marginBottom:6 }}>
          {list.map((r: any, idx: number) => (
            <button key={idx} tabIndex={-1} onMouseDown={(ev)=>{ ev.preventDefault(); addManual(undefined, r); }} onClick={(ev)=>ev.preventDefault()} title="Agregar" style={{ textAlign:'left', border:'1px solid #e5e7eb', background:(idx===hi?'#eef2ff':'#f8fafc'), padding:'6px 8px', borderRadius:8, cursor:'pointer' }}>
              {String(r.make||'') + ' ' + String(r.model||'') + ' ' + (r.ano||'') + (r.version ? (' – ' + r.version) : '')}
            </button>
          ))}
        </div>
      )}
      {manVersions.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:6 }}>
          {manVersions.map((v: string) => (
            <button key={v} onClick={()=>addManual(v)} style={{ border:'1px solid #e5e7eb', background:'#f8fafc', padding:'4px 8px', borderRadius:14, cursor:'pointer' }}>{v}</button>
          ))}
        </div>
      )}
      {manual.length > 0 && (
        <div style={{ marginTop:4, color:'#64748b' }}>Manuales: {manual.map((m: any,i: number)=> (
          <span key={i} style={{ marginRight:8 }}>
            {m.make} {m.model} {m.version||''} <button onClick={()=>removeManual(i)} title="Quitar">×</button>
          </span>
        ))}</div>
      )}
    </>
  );
}

function num(x: any): number | null {
  if (x === null || x === undefined || (typeof x === 'string' && x.trim() === '')) return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

export default function ComparePanel() {
  const { t, lang } = useI18n() as any;
  const { own, filters, autoGenSeq, autoGenerate, triggerAutoGen } = useAppState();
  const ready = !!own.model && !!own.make && !!own.year;
  const { data: cfg } = useSWR<any>('cfg', () => endpoints.config());
  const fuelPrices = cfg?.fuel_prices || {};
  const [hoverRow, setHoverRow] = React.useState<number | null>(null);
  const hoverStyle = (idx: number) => (hoverRow === idx ? { background:'#f8fafc' } : {});
  const [insights, setInsights] = React.useState<string>('');
  const [loading, setLoading] = React.useState<boolean>(false);
  const [insightsObj, setInsightsObj] = React.useState<any | null>(null);
  const [insightsStruct, setInsightsStruct] = React.useState<any | null>(null);
  const [priceExplainList, setPriceExplainList] = React.useState<any[]>([]);

  const { data: ownRows } = useSWR<Row[]>(ready ? ['own_row', own.make, own.model, own.year, own.version] : null, async () => {
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

  // Auto‑generación opcional: si está activo el switch y cambia el vehículo base, dispara una generación
  const autoKey = `${own.make}|${own.model}|${own.year}|${own.version}`;
  const prevAutoKey = React.useRef<string>('');
  React.useEffect(() => {
    if (autoGenerate && ownRow) {
      if (prevAutoKey.current !== autoKey) {
        prevAutoKey.current = autoKey;
        try { triggerAutoGen(); } catch {}
      }
    }
  }, [autoGenerate, ownRow, autoKey, triggerAutoGen]);

  // Helpers: YTD units and month
  function ytdUnits(row: any, year?: number): number | null {
    try {
      if (!row) return null;
      const y = Number(year || own.year || 2025);
      const ytdKey = `ventas_ytd_${y}`;
      const vYtd = Number((row as any)?.[ytdKey]);
      if (Number.isFinite(vYtd)) return vYtd;
      // Try monthly columns ventas_{y}_MM
      let sum = 0; let any = false;
      for (let m=1; m<=12; m++){
        const k = `ventas_${y}_${String(m).padStart(2,'0')}`;
        const v = Number((row as any)?.[k]);
        if (Number.isFinite(v)) { sum += v; any = true; }
      }
      if (any) return sum;
      const vu = Number((row as any)?.ventas_unidades);
      return Number.isFinite(vu) ? vu : null;
    } catch { return null; }
  }
  function lastYtdMonth(rows: any[], year?: number): number | null {
    try {
      const y = Number(year || own.year || 2025);
      for (let m=12; m>=1; m--){
        const k = `ventas_${y}_${String(m).padStart(2,'0')}`;
        for (const r of rows){
          const v = Number((r as any)?.[k]);
          if (Number.isFinite(v) && v>0) return m;
        }
      }
      return null;
    } catch { return null; }
  }
  function monthNameEs(m: number): string { const N=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; return (m>=1&&m<=12)?N[m-1]:''; }

  // Manual competitors (available always)
  const { data: baseOpts } = useSWR<{
    makes?: string[]; brands?: string[]; models_all?: string[];
  }>('options_base', () => endpoints.options());
  const [manMake, setManMake] = React.useState('');
  const [manModel, setManModel] = React.useState('');
  const manInputRef = React.useRef<HTMLInputElement>(null);
  const [manYear, setManYear] = React.useState<number | ''>('');
  const [manVersion, setManVersion] = React.useState('');
  const [manual, setManual] = React.useState<Row[]>([]);

  // When model changes, fetch makes and years
  const { data: manOpts } = useSWR<any>(manModel ? ['man_opts', manModel] : null, () => endpoints.options({ model: manModel }));
  const { data: makeOpts } = useSWR<any>(manMake ? ['man_make', manMake] : null, () => endpoints.options({ make: manMake }));
  React.useEffect(() => {
    if (!manOpts) return;
    const mk = (manOpts.autofill?.make_from_model || manOpts.selected?.make || '') as string;
    if (mk && !manMake) setManMake(mk);
    const yrs = (manOpts.years || []) as number[];
    if (yrs.length) {
      // default year: if includeDifferentYears is false and own.year present, stick to own.year if available
      const prefer = (!filters.includeDifferentYears && own.year) ? Number(own.year) : (manOpts.autofill?.default_year || yrs[yrs.length - 1]);
      const pick = yrs.includes(prefer as number) ? (prefer as number) : (yrs[yrs.length - 1] as number);
      setManYear(pick);
    }
    setManVersion('');
  }, [manOpts]);

  React.useEffect(() => {
    if (!makeOpts) return;
    // No borramos lo que el usuario escribe; solo proponemos año por defecto
    const yrs = (makeOpts.years || []) as number[];
    if (!manModel && yrs.length) {
      const prefer = (!filters.includeDifferentYears && own.year) ? Number(own.year) : yrs[yrs.length - 1];
      const pick = yrs.includes(prefer as number) ? (prefer as number) : (yrs[yrs.length - 1] as number);
      setManYear(pick);
    }
  }, [makeOpts]);

  // When year changes, fetch versions for model-year
  const { data: manVerOpts } = useSWR<any>(manModel && manYear ? ['man_ver', manModel, manYear, manMake] : null, () => endpoints.options({ model: manModel, year: manYear as number, make: manMake }));
  const manYears: number[] = (manModel ? (manOpts?.years || []) : (makeOpts?.years || [])) as number[];
  const manMakesForModel: string[] = (manOpts?.makes_for_model || []) as string[];
  const modelsForMake: string[] = (makeOpts?.models_for_make || []) as string[];
  const manVersions: string[] = (manVerOpts?.versions || []) as string[];

  // Auto‑agregar versión si solo existe una para el modelo+año seleccionado
  const autoAddedRef = React.useRef<string>('');
  React.useEffect(() => {
    try {
      if (manModel && manYear && Array.isArray(manVersions) && manVersions.length === 1) {
        const v = String(manVersions[0] || '');
        const key = `${manMake}|${manModel}|${manYear}|${v}`;
        if (v && autoAddedRef.current !== key) {
          autoAddedRef.current = key;
          addManual(v);
        }
      }
    } catch {}
  }, [manMake, manModel, manYear, manVersions && manVersions.join('|')]);

  const addManual = async (selVersion?: string, directRow?: Row) => {
    // Si recibimos el renglón directo (de sugerencias), agregamos sin consultar
    if (directRow) {
      const cand = directRow;
      const key = `${cand.make}|${cand.model}|${cand.version||''}|${cand.ano||''}`;
      const exists = manual.some(r => `${r.make}|${r.model}|${r.version||''}|${r.ano||''}` === key);
      if (!exists) setManual(prev => [...prev, cand]);
      return;
    }
    const params: any = { limit: 100 };
    if (manMake) params.make = manMake;
    if (manModel) params.model = manModel;
    if (manYear) params.year = manYear;
    const list = await endpoints.catalog(params);
    const rows: Row[] = Array.isArray(list) ? list : (Array.isArray(list?.items) ? list.items : []);
    if (!rows.length) return;
    let cand = rows[0];
    const pickVer = (selVersion || manVersion || '').toUpperCase();
    if (pickVer) {
      const found = rows.find(r => String(r.version||'').toUpperCase() === pickVer);
      if (found) cand = found;
    }
    const key = `${cand.make}|${cand.model}|${cand.version||''}|${cand.ano||''}`;
    const exists = manual.some(r => `${r.make}|${r.model}|${r.version||''}|${r.ano||''}` === key);
    if (!exists) setManual(prev => [...prev, cand]);
  };
  const removeManual = (idx: number) => setManual(prev => prev.filter((_,i)=>i!==idx));

  // Predictive suggestions for model
  function norm(s: string){
    try { return s.normalize('NFD').replace(/\p{Diacritic}+/gu,'').toLowerCase().replace(/[^a-z0-9]/g,''); } catch { return s.toLowerCase().replace(/[^a-z0-9]/g,''); }
  }
  const modelSource: string[] = (modelsForMake.length ? modelsForMake : (baseOpts?.models_all || [])) as string[];
  // Filtrar marcas por año si NO se permiten años diferentes
  const yearForBrands = (!filters.includeDifferentYears && own.year) ? Number(own.year) : undefined;
  const { data: optsByYear } = useSWR<any>(yearForBrands ? ['opts_by_year', yearForBrands] : null, () => endpoints.options({ year: yearForBrands }));
  const brandSource: string[] = (optsByYear?.brands || optsByYear?.makes || baseOpts?.brands || baseOpts?.makes || []) as string[];
  const [brandAlpha, setBrandAlpha] = React.useState<string>('');
  const modelSugg: string[] = React.useMemo(() => {
    const q = manModel.trim();
    if (q.length < 2) return [];
    const nq = norm(q);
    const list = modelSource.filter(m => norm(String(m)).includes(nq));
    return list.slice(0, 10);
  }, [manModel, modelSource]);
  const brandSugg: string[] = React.useMemo(() => {
    const q = (manModel || manMake).trim();
    if (brandSource.length === 0) return [];
    // 1) Texto libre
    if (q.length >= 1) {
      const nq = norm(q);
      return brandSource.filter(b => norm(String(b)).includes(nq)).slice(0, 24);
    }
    // 2) Filtro alfabético
    if (brandAlpha) {
      if (brandAlpha === '*') return brandSource.slice(0, 80);
      return brandSource.filter(b => String(b).toUpperCase().startsWith(String(brandAlpha).toUpperCase())).slice(0, 80);
    }
    // 3) Sin query ni letra → mostrar top N por defecto (mejor UX)
    return brandSource.slice(0, 40);
  }, [manModel, manMake, brandAlpha, brandSource]);

  // Optional: simple brand origin mapping (extendable)
  const brandOrigin: Record<string,string> = {
    'TOYOTA':'Japón','HONDA':'Japón','NISSAN':'Japón','ACURA':'Japón','LEXUS':'Japón','MAZDA':'Japón','SUZUKI':'Japón',
    'VOLKSWAGEN':'Alemania','AUDI':'Alemania','BMW':'Alemania','MERCEDES-BENZ':'Alemania','PORSCHE':'Alemania','MINI':'Alemania',
    'FORD':'EEUU','CHEVROLET':'EEUU','TESLA':'EEUU','JEEP':'EEUU','GMC':'EEUU','RAM':'EEUU','CADILLAC':'EEUU','DODGE':'EEUU',
    'KIA':'Corea','HYUNDAI':'Corea','GENESIS':'Corea',
    'PEUGEOT':'Francia','RENAULT':'Francia','CITROEN':'Francia',
    'FIAT':'Italia','ALFA ROMEO':'Italia','FERRARI':'Italia','MASERATI':'Italia',
  };

  // Predictive vehicle suggestions (make/model match)
  const qPred = manModel.trim();
  const { data: vehSugg } = useSWR<Row[]>(qPred.length >= 2 ? ['veh_sugg', qPred, own.year, filters.includeDifferentYears] : null, async () => {
    const params: any = { q: qPred, limit: 30 };
    if (!filters.includeDifferentYears && own.year) params.year = own.year;
    const list = await endpoints.catalog(params);
    const rows: Row[] = Array.isArray(list) ? list : (Array.isArray(list?.items) ? list.items : []);
    return rows;
  });

  

  const k = filters.autoK || 3;
  // Solo generar cuando el botón sea presionado (autoGenSeq>0)
  // Importante: no re-disparar por cambios en filtros; solo por autoGenSeq
  const { data: auto } = useSWR(ownRow && autoGenSeq > 0 ? ['auto_comp', ownRow.id || ownRow.model, ownRow.ano, autoGenSeq] : null, async () => {
    const payload: any = {
      own: { make: own.make, model: own.model, ano: own.year, precio_transaccion: ownRow?.precio_transaccion, msrp: ownRow?.msrp, longitud_mm: ownRow?.longitud_mm, equip_score: ownRow?.equip_score },
      k,
      same_segment: !!filters.sameSegment,
      same_propulsion: !!filters.samePropulsion,
      include_same_brand: !!filters.includeSameBrand,
      include_different_years: !!filters.includeDifferentYears,
      max_length_pct: filters.maxLengthPct === '' ? undefined : Number(filters.maxLengthPct),
      max_length_mm: filters.maxLengthMm === '' ? undefined : Number(filters.maxLengthMm),
      score_diff_pct: filters.scoreDiffPct === '' ? undefined : Number(filters.scoreDiffPct),
    };
    if (filters.minMatchPct !== '') {
      payload.min_match_pct = Number(filters.minMatchPct);
      // Override: ignora restricciones de longitud y score; solo usa min_match_pct
      delete payload.max_length_pct;
      delete payload.max_length_mm;
      delete payload.score_diff_pct;
    }
    return endpoints.autoCompetitors(payload);
  });
  const usedFilters = auto?.used_filters || null;

  // Nota: competidores automáticos solo se generan al pulsar el botón.
  // No disparamos auto‑gen al cargar para que el usuario decida manual/automático.

  const sig = (rows: Row[]) => rows.map(r => `${r.make}|${r.model}|${r.version||''}|${r.ano||''}`).join(',');
  // Fallback: calcular fuel_cost_60k_mxn si falta (a partir de KML y precios de combustible)
  function kmlFromRow(row: any): number | null {
    const cand = [
      'combinado_kml','kml_mixto','mixto_kml','rendimiento_mixto_kml','consumo_mixto_kml','consumo_combinado_kml',
      'combinado_km_l','km_l_mixto','mixto_km_l','rendimiento_mixto_km_l','rendimiento_combinado_km_l','consumo_combinado_km_l'
    ];
    for (const k of cand) {
      const v = Number(row?.[k]);
      if (Number.isFinite(v) && v>0) return v;
    }
    // Soporte L/100km -> KML
    const l100cand = ['mixto_l_100km','consumo_mixto_l_100km','l_100km_mixto'];
    for (const k of l100cand) {
      const v = Number(row?.[k]);
      if (Number.isFinite(v) && v>0) return 100 / v;
    }
    return null;
  }
  function fuelPriceFor(row: any): number | null {
    const raw = _fuelRaw(row);
    const lc = raw.toLowerCase();
    if (!lc) return null;
    if (lc.includes('elect')) return 0; // sin costo directo de combustible
    if (lc.includes('diesel')) return Number(fuelPrices?.diesel_litro ?? NaN);
    if (lc.includes('premium')) return Number(fuelPrices?.gasolina_premium_litro ?? fuelPrices?.gasolina_magna_litro ?? NaN);
    if (lc.includes('gas') || lc.includes('nafta') || lc.includes('petrol')) return Number(fuelPrices?.gasolina_magna_litro ?? fuelPrices?.gasolina_premium_litro ?? NaN);
    return null;
  }
  function ensureFuel60(row: any): any {
    if (row == null) return row;
    const out = { ...row } as any;
    if (out.fuel_cost_60k_mxn == null) {
      const kml = kmlFromRow(out);
      const price = fuelPriceFor(out);
      if (kml && price != null) {
        out.fuel_cost_60k_mxn = Math.round((60000 / kml) * price);
      }
    }
    return out;
  }

  const { data: compared } = useSWR(ownRow ? ['compare', ownRow?.id || ownRow?.model, ownRow?.ano, sig((auto?.items||[]) as Row[]), sig(manual), !!cfg] : null, async () => {
    const autoRows: Row[] = (auto?.items || []) as Row[];
    // merge unique (auto + manual)
    const seen = new Set<string>();
    const items: Row[] = [];
    for (const r of [...autoRows, ...manual]){
      const key = `${r.make}|${r.model}|${r.version||''}|${r.ano||''}`;
      if (!seen.has(key)) { seen.add(key); items.push(r); }
    }
    // Incluir fuel_cost_60k si falta (se usa para deltas en /compare)
    const ownW = ensureFuel60(ownRow);
    const itemsW = items.map(ensureFuel60);
    return endpoints.compare({ own: ownW, competitors: itemsW });
  });

  // Evitar returns tempranos que cambian el orden de hooks.
  // Usar valores de respaldo cuando aún no hay base/ownRow listo.
  const baseRow = (ownRow ? ((compared?.own || ownRow) as Row) : null);
  const comps = (compared?.competitors || []).map((c: any) => ({ ...c.item, __deltas: c.deltas || {}, __diffs: c.diffs || {} }));
  const headers = [
    { key: 'foto', label: '' },
    { key: 'vehiculo', label: t('vehicle') },
    { key: 'msrp', label: t('msrp') },
    { key: 'precio_transaccion', label: t('tx_price') },
    { key: 'bono', label: t('bonus') },
    { key: 'fuel_cost_60k_mxn', label: t('energy60k') },
    { key: 'service_cost_60k_mxn', label: t('service60k') },
    { key: 'tco_60k_mxn', label: t('tco60k') },
    { key: 'cost_per_hp_mxn', label: t('price_per_hp') },
    { key: 'equip_over_under_pct', label: t('equip_rel') },
    { key: 'segmento', label: t('segment') },
  ];

  // Small info icon with tooltip
  function InfoIcon({ title }: { title: string }) {
    return (
      <span title={title} style={{ display:'inline-block', marginLeft:6, width:16, height:16, border:'1px solid #cbd5e1', borderRadius:16, textAlign:'center', lineHeight:'14px', fontSize:12, color:'#475569', cursor:'help' }}>i</span>
    );
  }

  // -------- Diferencias de versión (mismo modelo) --------
  const { data: diffs } = useSWR<any>(own.model ? ['version_diffs', own.make, own.model, own.year, own.version] : null, () => endpoints.versionDiffs({ make: own.make, model: own.model, year: own.year, base_version: own.version || undefined }));

  function renderVersionDiffs() {
    if (!diffs || !diffs.items || !diffs.items.length) return null;
    const base = diffs.base || {};
    const items = (diffs.items as any[]) || [];
    const fmtDeltaMoney = (n: any) => {
      const v = Number(n); if (!Number.isFinite(v)) return '-';
      const s = v>=0?'+':''; return `${s}${fmtMoney(v)}`;
    };
    const moneyCols = [
      { k:'msrp', label:'Δ MSRP' },
      { k:'precio_transaccion', label:'Δ Precio tx' },
    ];
    return (
      <div style={{ marginTop: 20, border:'1px solid #e5e7eb', borderRadius:10 }}>
        <div style={{ padding:'10px 12px', borderBottom:'1px solid #e5e7eb', background:'#fafafa', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700 }}>Diferencias de versión — {String(own.make||'')} {String(own.model||'')}{own.year?` (${own.year})`:''}</div>
          <div style={{ fontSize:12, color:'#475569' }}>Base: {String(base.version||'–')}</div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb', minWidth:160 }}>Versión</th>
                {moneyCols.map(col => (
                  <th key={col.k} style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb', minWidth:120 }}>{col.label}</th>
                ))}
                <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb', minWidth:260 }}>Features +</th>
                <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb', minWidth:260 }}>Features −</th>
                <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb', minWidth:260 }}>Cambios cuantitativos</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it:any, idx:number) => {
                const r = it.item || {};
                const d = it.deltas || {};
                const plus: string[] = Array.isArray(it.diffs?.features_plus)? it.diffs.features_plus.slice(0,12): [];
                const minus: string[] = Array.isArray(it.diffs?.features_minus)? it.diffs.features_minus.slice(0,12): [];
                const nums: any[] = Array.isArray(it.diffs?.numeric_diffs)? it.diffs.numeric_diffs.slice(0,8): [];
                const rowBg = idx%2===0? '#ffffff':'#fafafa';
                return (
                  <tr key={idx} style={{ background: rowBg }}>
                    <td style={{ padding:'8px 10px', borderBottom:'1px solid #eef2f7' }}>
                      <div style={{ fontWeight:600 }}>{String(r.version||'')}</div>
                    </td>
                    {moneyCols.map(col => {
                      const dv = d?.[col.k]?.delta ?? null;
                      return (
                        <td key={col.k} style={{ padding:'8px 10px', borderBottom:'1px solid #eef2f7', color: dv!=null ? (dv>0?'#dc2626':'#16a34a'):'#334155' }}>
                          {dv==null?'-':fmtDeltaMoney(dv)}
                        </td>
                      );
                    })}
                    <td style={{ padding:'8px 10px', borderBottom:'1px solid #eef2f7' }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {plus.length? plus.map((t,i)=> <span key={i} style={{ fontSize:12, background:'#ecfdf5', color:'#065f46', border:'1px solid #a7f3d0', borderRadius:12, padding:'2px 8px' }}>{t}</span>) : <span style={{ fontSize:12, color:'#64748b' }}>—</span>}
                      </div>
                    </td>
                    <td style={{ padding:'8px 10px', borderBottom:'1px solid #eef2f7' }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {minus.length? minus.map((t,i)=> <span key={i} style={{ fontSize:12, background:'#fef2f2', color:'#991b1b', border:'1px solid #fecaca', borderRadius:12, padding:'2px 8px' }}>{t}</span>) : <span style={{ fontSize:12, color:'#64748b' }}>—</span>}
                      </div>
                    </td>
                    <td style={{ padding:'8px 10px', borderBottom:'1px solid #eef2f7' }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {nums.length? nums.map((n:any, i:number)=> {
                          const vOwn = (n?.own!=null? String(n.own):'-');
                          const vComp = (n?.comp!=null? String(n.comp):'-');
                          return <span key={i} style={{ fontSize:12, background:'#eff6ff', color:'#1e40af', border:'1px solid #bfdbfe', borderRadius:12, padding:'2px 8px' }}>{n.label}: {vOwn} → {vComp}</span>;
                        }) : <span style={{ fontSize:12, color:'#64748b' }}>—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // -------- Price Explain Modal & actions --------
  // Eliminados estados del modal de explicación; se integrará a Insights

  function Waterfall({ decomp }: { decomp: any[] }){
    if (!Array.isArray(decomp) || !decomp.length) return null;
    const cats = decomp.map(d=> String(d.componente));
    const vals = decomp.map(d=> Number(d.monto||0));
    let running = 0; const helper: number[] = [];
    vals.forEach((v) => { if (v>=0) { helper.push(running); running += v; } else { helper.push(running+v); running += v; } });
    const option = {
      title: { text: 'Descomposición del precio (waterfall)', left: 'center', top: 6 },
      grid: { left: 60, right: 20, top: 50, bottom: 60, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p:any)=> {
        const it = Array.isArray(p) ? p[1] : p; const v = it?.value ?? 0; const s = v>0?'+':''; return `${it?.name||''}<br/>${s}$ ${Intl.NumberFormat('es-MX').format(Math.round(v))}`;
      }},
      xAxis: { type: 'category', data: cats, axisLabel: { interval: 0, rotate: 20 } },
      yAxis: { type: 'value', axisLabel: { formatter: (v:any)=> Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(v) } },
      series: [
        { name:'helper', type:'bar', stack:'total', itemStyle:{ borderColor:'transparent', color:'transparent' }, emphasis:{ itemStyle:{ color:'transparent' } }, data: helper },
        { name:'contrib', type:'bar', stack:'total', data: vals.map((v:any)=> ({ value: v, itemStyle:{ color: v>=0 ? '#16a34a' : '#dc2626' } })) }
      ]
    } as any;
    return (EChart ? <EChart echarts={echarts} option={option} opts={{ renderer: 'svg' }} style={{ height: 300 }} /> : null);
  }

  // ExplainModal eliminado: la explicación de precio se integrará a Insights

  function fmtMoney(v: any) { const n = num(v); return n==null?'-':Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n); }
  function fmtNum(v: any) { const n = num(v); return n==null?'-':Intl.NumberFormat().format(n); }
  function fmtPct(v: any) { const n = num(v); return n==null?'-':`${Number(n).toFixed(0)}%`; }
  function fmtDeltaPct(v: any) { const n = num(v); if (n==null) return '-'; const s = n>0?'+':''; return `${s}${Number(n).toFixed(0)}%`; }
  const tri = (n: number) => (n >= 0 ? '▲' : '▼');

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
      // precisión Magna/Premium; por defecto Magna
      if (raw.includes('premium')) return 'Gasolina Premium';
      if (raw.includes('magna')) return 'Gasolina Magna';
      return 'Gasolina Magna';
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
    if (p.startsWith('gasolina')) {
      const isPrem = raw.includes('premium');
      const v = isPrem ? (fuelPrices?.gasolina_premium_litro ?? fuelPrices?.gasolina_magna_litro) : (fuelPrices?.gasolina_magna_litro ?? fuelPrices?.gasolina_premium_litro);
      return v ? `• $${Number(v).toFixed(2)}/L${asOf}${src}` : '';
    }
    if (p === 'eléctrico') {
      const v = fuelPrices?.electricidad_kwh; return v?`• $${Number(v).toFixed(2)}/kWh${asOf}${src}`:'';
    }
    return '';
  }

  function segLabel(row: any): string {
    const raw = String(row?.segmento_display || row?.segmento_ventas || row?.body_style || '').toString().trim();
    const s = raw.toLowerCase();
    if (!s) return '-';
    if (s.includes('todo terreno') || s.includes('suv') || s.includes('crossover')) return "SUV'S";
    if (s.includes('pick') || s.includes('cab') || s.includes('chasis') || s.includes('camioneta')) return 'Pickup';
    if (s.includes('hatch')) return 'Hatchback';
    if (s.includes('van')) return 'Van';
    if (s.includes('sedan') || s.includes('sedán')) return 'Sedán';
    // Capitaliza por consistencia
    return raw.slice(0,1).toUpperCase() + raw.slice(1);
  }
  function cph(row: any): number | null {
    const v = row?.cost_per_hp_mxn;
    if (v != null) return Number(v);
    const price = Number(row?.precio_transaccion ?? row?.msrp);
    const hp = Number(row?.caballos_fuerza);
    if (!Number.isFinite(price) || !Number.isFinite(hp) || hp === 0) return null;
    return price / hp;
  }
  // Auditoría: fuente del costo de servicio
  function serviceSourceLabel(row: any): string {
    const incRaw = String((row as any)?.service_included_60k || '').toLowerCase();
    const included = incRaw === 'true' || incRaw === '1' || incRaw === 'si' || incRaw === 'sí' || incRaw === 'incluido' || Number(row?.service_cost_60k_mxn) === 0;
    if (included) return 'Incluido';
    const v = Number(row?.service_cost_60k_mxn ?? NaN);
    if (Number.isFinite(v)) {
      if (v === 1) return 'fallback $1';
      return 'mantenimiento';
    }
    return '';
  }
  // Etiqueta consistente para todas las gráficas
  function vehLabel(r: any): string {
    const mk = String(r.make || '').trim();
    const md = String(r.model || '').trim();
    const vr = normalizeVersion(String(r.version || '').trim());
    const yr = r.ano || r.year || '';
    return `${mk} ${md}${vr?` – ${vr}`:''}${yr?` (${yr})`:''}`.trim();
  }
  // Etiqueta corta para el punto (sólo versión + año ‘25)
  function versionShortLabel(r: any): string {
    // No mostrar etiqueta de versión para el vehículo base en las gráficas
    if (r && (r as any).__isBase) return '';
    const vr = normalizeVersion(String(r?.version || '').trim());
    const yr = r?.ano || r?.year || '';
    const yy = yr ? String(yr).slice(-2) : '';
    return vr ? (yy ? `${vr} ’${yy}` : vr) : (yy ? `’${yy}` : '');
  }

  // Normalizador visual de nombres de versión (tokens comunes)
  function normalizeVersion(v: string): string {
    let s = String(v || '').trim();
    if (!s) return s;
    // Reemplazos base (case-insensitive)
    s = s.replace(/\b(d-?cab(?:ina)?)\b|\b(double\s*cab)\b|\b(doble\s*cabina)\b/gi, 'D-Cab');
    s = s.replace(/\b(diesel|diésel|díesel|d[ií]esel|dsl)\b/gi, 'DSL');
    s = s.replace(/\b(automático|automatico|auto|a\/t|at)\b/gi, 'AT');
    s = s.replace(/\b(mild\s*hybrid|mhev|h[íi]brido\s*ligero)\b/gi, 'MHEV');
    s = s.replace(/\bgsr\b/gi, 'GSR');
    s = s.replace(/\bgls\b/gi, 'GLS');
    // Requested tokens -> upper
    s = s.replace(/\btm\b/gi, 'TM');
    s = s.replace(/\bivt\b/gi, 'IVT');
    s = s.replace(/\bgl\b/gi, 'GL');
    s = s.replace(/\bglx\b/gi, 'GLX');
    s = s.replace(/\bgt\b/gi, 'GT');
    s = s.replace(/\bgti\b/gi, 'GTI');
    s = s.replace(/\bcvt\b/gi, 'CVT');
    s = s.replace(/\bdct\b/gi, 'DCT');
    s = s.replace(/\bdsg\b/gi, 'DSG');
    s = s.replace(/\bmt\b|\bmanual\b/gi, 'MT');
    s = s.replace(/\b4\s*x\s*4\b/gi, '4x4');
    // Compactar espacios y guiones duplicados
    s = s.replace(/\s{2,}/g, ' ').replace(/-{2,}/g, '-').trim();
    // Evitar tokens duplicados contiguos (AT AT, DSL DSL)
    s = s.replace(/\b(AT|DSL|MHEV|GSR|GLS|MT|4x4)(?:\s+\1)+\b/g, '$1');
    // Capitalizar palabras normales (deja tokens en mayúsculas como están)
    s = s.split(' ').map(w => (/^(AT|DSL|MHEV|GSR|GLS|MT|4x4|D-Cab)$/i.test(w) ? w.toUpperCase() : (w.slice(0,1).toUpperCase()+w.slice(1)))).join(' ');
    return s;
  }
  // Símbolo consistente por vehículo en todas las gráficas (se declara después de chartRows)

  // ------------------------- Charts (ECharts) -------------------------
  const chartRows: any[] = React.useMemo(() => {
    const list: any[] = [];
    if (baseRow) list.push({ ...baseRow, __isBase: true });
    list.push(...comps.map((r: any) => ({ ...r, __isBase: false })));
    return list;
  }, [baseRow, comps]);

  // Ventas mensuales 2025 (líneas)
  // NOTE: se define después de colorForVersion; este placeholder evita referencias circulares.
  let salesLineOption: any = {} as any;

  const symbolMap = React.useMemo(() => {
    const symbols = ['circle','diamond','triangle','rect','roundRect','pin','arrow'];
    const labels = Array.from(new Set(chartRows.map((r:any)=> vehLabel(r))));
    const map: Record<string,string> = {};
    labels.forEach((lab, i)=> { map[lab] = symbols[i % symbols.length]; });
    return map;
  }, [chartRows]);

  // Colores por versión (consistentes en todas las gráficas)
  const versionColorMap = React.useMemo(() => {
    // Paleta con alto contraste (Tableau10 + extras)
    const palette = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf',
                     '#0ea5e9','#16a34a','#f59e0b','#ef4444','#8b5cf6','#a855f7','#22c55e','#f97316','#14b8a6','#e11d48'];
    const vers = Array.from(new Set(chartRows.map((r:any)=> String(r?.version||'').toUpperCase())));
    const map: Record<string,string> = {};
    vers.forEach((v, i)=> { map[v] = palette[i % palette.length]; });
    return map;
  }, [chartRows]);
  const colorForVersion = (r: any) => versionColorMap[String(r?.version||'').toUpperCase()] || '#6b7280';

  // Ventas mensuales 2025 (líneas) — depende de colorForVersion
  salesLineOption = React.useMemo(() => {
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const rows = [ ...(baseRow?[baseRow]:[]), ...comps ];
    const series: any[] = [];
    let usedForecast = false;
    let monthlyTotals: number[] = new Array(12).fill(0);
    const applyForecast = (vals: (number|null)[]): (number|null)[] => {
      // Si faltan meses 10–12, usa último valor conocido (carry‑forward) como placeholder
      const out = [...vals];
      // último valor observado hasta septiembre
      let last: number | null = null;
      for (let i=0;i<9;i++) {
        const v = out[i];
        if (typeof v === 'number' && isFinite(v)) last = v;
      }
      for (let i=9;i<12;i++) {
        if (out[i] == null) {
          if (last != null) { out[i] = last; usedForecast = true; }
        }
      }
      return out;
    };
    rows.forEach((r:any, idx:number) => {
      const name = vehLabel(r);
      const color = colorForVersion(r);
      const vals: (number|null)[] = [];
      // lee meses
      for (let m=1;m<=12;m++) {
        const k = `ventas_2025_${String(m).padStart(2,'0')}`;
        const v = Number((r as any)?.[k] ?? NaN);
        vals.push(Number.isFinite(v) ? v : null);
      }
      // pronóstico: trata null o 0 como faltante en Sep–Dic si hubo ventas previas
      const observed = vals.slice(0,9).some(v => (v??0) > 0);
      const valsWithForecast = (()=>{
        if (!observed) return vals; // nada que pronosticar
        const out = [...vals];
        let last: number | null = null;
        for (let i=0;i<9;i++) { const v = out[i]; if (typeof v==='number' && isFinite(v) && v>0) last = v; }
        for (let i=8;i<12;i++) {
          const v = out[i];
          if ((v==null || v===0) && last!=null) { out[i]=last; usedForecast = true; }
        }
        return out;
      })();
      // acumula totales (incluyendo forecast si lo hubo)
      for (let i=0;i<12;i++) { const v = valsWithForecast[i]; if (typeof v==='number' && isFinite(v)) monthlyTotals[i]+=v; }
      if (vals.some(v=> (v??0)>0)) {
        series.push({ type:'line', name, data: valsWithForecast, smooth: true, showSymbol: false, itemStyle:{ color }, lineStyle:{ color, width: (idx===0?3:2) } });
      }
    });
    if (!series.length) return {} as any;
    const option: any = {
      title: { text: 'Ventas mensuales 2025 (unidades)', left: 'center', top: 6 },
      grid: { left: 60, right: 20, top: 50, bottom: 50, containLabel: true },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'line' },
        formatter: (p:any) => {
          const idx = Array.isArray(p) && p.length ? p[0].dataIndex : 0;
          const tot = monthlyTotals[idx] || 0;
          const lines = (Array.isArray(p)?p:[]).map((it:any)=>{
            const u = Number(it.data||0);
            const share = tot>0 ? (u/tot*100).toFixed(1) : '0.0';
            return `${it.marker} ${it.seriesName}: ${Intl.NumberFormat('es-MX').format(u)} u (${share}%)`;
          });
          return `<strong>${months[idx]}</strong><br/>${lines.join('<br/>')}`;
        }
      },
      legend: { bottom: 0, left: 'center' },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value', name: 'Unidades', min: 0 },
      series
    };
    // Watermark y sombreado de pronóstico Sep–Dic si se aplicó forecast
    if (usedForecast) {
      // sombrear región de pronóstico en la primera serie, con etiqueta dentro del área
      if (option.series && option.series.length) {
        option.series[0].markArea = {
          silent: true,
          itemStyle: { color: 'rgba(148,163,184,0.12)' },
          label: { show: true, formatter: 'Work in progress — pronóstico Sep–Dic', position: 'insideTop', color: '#64748b', fontSize: 12, fontWeight: 'bold' },
          data: [[{ xAxis: 'Sep' }, { xAxis: 'Dic' }]]
        };
      }
    }
    return option as any;
  }, [baseRow, comps, versionColorMap]);

  // Reusable legend block used under each chart row
  function renderLegend() {
    if (!chartRows.length) return null;
    const uniq: Record<string, any> = {};
    chartRows.forEach((r:any)=> { const key = vehLabel(r); if (!uniq[key]) uniq[key]=r; });
    const entries = Object.keys(uniq).map(k=> ({ r: uniq[k], label: vehLabel(uniq[k]), symbol: symbolMap[vehLabel(uniq[k])], color: colorForVersion(uniq[k]) }));
    const Icon = ({symbol, color, filled}:{symbol:string;color:string;filled:boolean}) => {
      const sz = 20;
      const stroke = filled ? 'none' : color;
      const fill = filled ? color : 'transparent';
      const common = { stroke: stroke, strokeWidth: 2, fill: fill } as any;
      const s = symbol;
      return (
        <svg width={sz} height={sz} viewBox="0 0 20 20" style={{ display:'inline-block' }}>
          {s==='diamond' ? <path d="M10 2 L18 10 L10 18 L2 10 Z" {...common} />
           : s==='triangle' ? <path d="M10 2 L18 18 L2 18 Z" {...common} />
           : s==='rect' ? <rect x="3" y="3" width="14" height="14" {...common} />
           : s==='roundRect' ? <rect x="3" y="3" width="14" height="14" rx="3" {...common} />
           : s==='pin' ? <path d="M10 2 C6 2 4 5 4 7.5 C4 10 10 18 10 18 C10 18 16 10 16 7.5 C16 5 14 2 10 2 Z" {...common} />
           : s==='arrow' ? <path d="M3 10 L13 10 L13 6 L18 12 L13 18 L13 14 L3 14 Z" {...common} />
           : <circle cx="10" cy="10" r="7" {...common} />}
        </svg>
      );
    };
    return (
      <div style={{ marginTop:8, borderTop:'1px solid #e5e7eb', paddingTop:8, textAlign:'center' }}>
        <div style={{ fontSize:12, color:'#64748b', marginBottom:6 }}>Lleno = MSRP • Hueco = TX • Color por marca • Forma fija por vehículo</div>
        <div style={{ display:'flex', gap:16, flexWrap:'wrap', justifyContent:'center' }}>
          {entries.map((e,idx)=> (
            <div key={idx} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Icon symbol={e.symbol} color={e.color} filled={true} />
              <Icon symbol={e.symbol} color={e.color} filled={false} />
              <span style={{ fontSize:12, color:'#334155' }}>{e.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------- Segmento y pilares ----------------
  function segmentMain(row: any): string {
    const raw = (row?.segmento_ventas || row?.body_style || '').toString();
    const s = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // quita acentos (sedan/sedán, suv´s/suv's)
    if (!s) return '';
    if (s.includes('pick') || s.includes('cab') || s.includes('chasis')) return 'pickup';
    if (s.includes('todo terreno') || s.includes('suv') || s.includes('crossover') || s.includes('sport utility') || s.includes('utility')) return 'suv';
    if (s.includes('van') || s.includes('minivan') || s.includes('bus')) return 'van';
    if (s.includes('hatch') || s.includes('hb')) return 'hatch';
    if (s.includes('sedan') || s.includes('saloon') || s.includes('berlina')) return 'sedan';
    return '';
  }
  function topPillarsForSegment(seg: string): Array<{key:string,label:string}> {
    const maps: Record<string, Array<{key:string,label:string}>> = {
      suv: [ {key:'equip_p_adas',label:'ADAS'}, {key:'equip_p_safety',label:'Seguridad'} ],
      pickup: [ {key:'equip_p_traction',label:'Tracción'}, {key:'equip_p_safety',label:'Seguridad'} ],
      sedan: [ {key:'equip_p_adas',label:'ADAS'}, {key:'equip_p_infotainment',label:'Info‑entretenimiento'} ],
      hatch: [ {key:'equip_p_adas',label:'ADAS'}, {key:'equip_p_infotainment',label:'Info‑entretenimiento'} ],
      van: [ {key:'equip_p_comfort',label:'Confort'}, {key:'equip_p_utility',label:'Utilidad'} ],
    };
    return maps[seg] || maps['sedan'];
  }

  // Radar: keys por segmento (hasta 6 ejes)
  function radarKeysForSegment(seg: string): Array<{key:string,label:string}> {
    const m: Record<string, Array<{key:string,label:string}>> = {
      suv: [
        {key:'equip_p_adas',label:'ADAS'},
        {key:'equip_p_safety',label:'Seguridad'},
        {key:'equip_p_comfort',label:'Confort'},
        {key:'equip_p_infotainment',label:'Info'},
        {key:'equip_p_traction',label:'Tracción'},
        {key:'warranty_score',label:'Garantía'},
      ],
      pickup: [
        {key:'equip_p_traction',label:'Tracción'},
        {key:'equip_p_utility',label:'Utilidad'},
        {key:'equip_p_safety',label:'Seguridad'},
        {key:'equip_p_adas',label:'ADAS'},
        {key:'equip_p_comfort',label:'Confort'},
        {key:'equip_p_infotainment',label:'Info'},
      ],
      sedan: [
        {key:'equip_p_adas',label:'ADAS'},
        {key:'equip_p_safety',label:'Seguridad'},
        {key:'equip_p_comfort',label:'Confort'},
        {key:'equip_p_infotainment',label:'Info'},
        {key:'equip_p_performance',label:'Performance'},
        {key:'warranty_score',label:'Garantía'},
      ],
      hatch: [
        {key:'equip_p_adas',label:'ADAS'},
        {key:'equip_p_safety',label:'Seguridad'},
        {key:'equip_p_comfort',label:'Confort'},
        {key:'equip_p_infotainment',label:'Info'},
        {key:'equip_p_performance',label:'Performance'},
        {key:'warranty_score',label:'Garantía'},
      ],
      van: [
        {key:'equip_p_comfort',label:'Confort'},
        {key:'equip_p_utility',label:'Utilidad'},
        {key:'equip_p_safety',label:'Seguridad'},
        {key:'equip_p_adas',label:'ADAS'},
        {key:'equip_p_infotainment',label:'Info'},
        {key:'equip_p_traction',label:'Tracción'},
      ],
    };
    return m[seg] || m['sedan'];
  }

  // Elegir dinámicamente los 2 pilares con más cobertura de datos para el segmento
  function bestPillarsForSegment(seg: string): Array<{key:string,label:string}> {
    const cand = topPillarsForSegment(seg);
    const allCand: Array<{key:string,label:string}> = [
      ...cand,
      {key:'equip_p_performance',label:'Performance'},
      {key:'equip_p_efficiency',label:'Eficiencia'},
      {key:'equip_p_electrification',label:'Electrificación'},
      {key:'warranty_score',label:'Garantía'},
      {key:'equip_score',label:'Score equipo'},
    ];
    const seen = new Set<string>();
    const uniq = allCand.filter(it => { const k = it.key; if (seen.has(k)) return false; seen.add(k); return true; });
    function coverage(key: string): number {
      let cnt = 0;
      chartRows.forEach((r:any) => {
        if (seg && segmentMain(r) !== seg) return;
        const x = pillarValue(r, key);
        const price = priceTxOrMsrp(r);
        if (x != null && Number.isFinite(Number(price))) cnt++;
      });
      return cnt;
    }
    const sorted = uniq
      .map(it => ({ ...it, _cov: coverage(it.key) }))
      .sort((a,b) => b._cov - a._cov);
    const picks = sorted.filter(it => it._cov >= 2).slice(0,2);
    if (picks.length >= 2) return picks.map(({key,label})=>({key,label}));
    // Fallback: al menos devuelve los primeros dos candidatos originales
    const back = uniq.slice(0,2);
    return back.length === 2 ? back : (uniq.length ? [uniq[0]] : []);
  }

  function priceTxOrMsrp(row: any): number | null {
    const tx = Number(row?.precio_transaccion ?? NaN);
    const ms = Number(row?.msrp ?? NaN);
    if (Number.isFinite(tx)) return tx;
    if (Number.isFinite(ms)) return ms;
    return null;
  }

  function pillarValue(row:any, key:string): number | null {
    const v = Number((row as any)?.[key] ?? NaN);
    // Trata 0 o valores no numéricos como sin dato (evita puntos en X=0 que suelen ser faltantes)
    if (!Number.isFinite(v) || v <= 0) return null;
    return v;
  }

  function buildPillarVsPriceOption(pillarKey: string, pillarLabel: string) {
    const ptsMsrp: any[] = [];
    const ptsTx: any[] = [];
    const seg = baseRow ? segmentMain(baseRow) : '';
    chartRows.forEach((r:any) => {
      if (seg && segmentMain(r) !== seg) return;
      const x = pillarValue(r, pillarKey);
      const ms = Number(r?.msrp ?? NaN);
      const tx = Number(r?.precio_transaccion ?? NaN);
      const name = vehLabel(r);
      if (!Number.isFinite(x)) return;
      if (Number.isFinite(ms)) ptsMsrp.push({ value: [x, ms], name, base: !!r.__isBase, symbol: symbolMap[name], itemStyle: { color: colorForVersion(r) } });
      if (Number.isFinite(tx) && tx !== ms) ptsTx.push({ value: [x, tx], name, base: !!r.__isBase, symbol: symbolMap[name], itemStyle: { color: 'transparent', borderColor: colorForVersion(r), borderWidth: 2 } });
    });
    // Bigger markers: base version highlighted
    const sym = (_: any, p: any) => (p?.data?.base ? 20 : 14);
    // Vertical dashed segments to show MSRP vs TX difference at same pillar value
    const segData: Array<[number, number, number]> = [];
    chartRows.forEach((r:any) => {
      if (seg && segmentMain(r) !== seg) return;
      const x = pillarValue(r, pillarKey);
      const ms = Number(r?.msrp ?? NaN);
      const tx = Number(r?.precio_transaccion ?? NaN);
      if (Number.isFinite(x) && Number.isFinite(ms) && Number.isFinite(tx) && ms !== tx) {
        const y1 = Math.min(ms, tx);
        const y2 = Math.max(ms, tx);
        segData.push([Number(x), y1, y2]);
      }
    });
    const verticalDiffSeries = segData.length ? [{
      name: 'Δ TX vs MSRP', type: 'custom', renderItem: function(params: any, api: any) {
        const xVal = api.value(0);
        const yLow = api.value(1);
        const yHigh = api.value(2);
        const p1 = api.coord([xVal, yLow]);
        const p2 = api.coord([xVal, yHigh]);
        return { type: 'line', shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }, style: api.style({ stroke: '#94a3b8', lineWidth: 1, lineDash: [4,4] }) } as any;
      }, data: segData, tooltip: { show: false }
    }] : [];
    // Compute nicer Y scale
    const allY = [
      ...ptsMsrp.map((d:any)=> Number(d?.value?.[1] ?? NaN)).filter(Number.isFinite),
      ...ptsTx.map((d:any)=> Number(d?.value?.[1] ?? NaN)).filter(Number.isFinite)
    ];
    const yMin = allY.length ? Math.max(0, Math.floor(Math.min(...allY)*0.95)) : 0;
    const yMax = allY.length ? Math.ceil(Math.max(...allY)*1.05) : 1;

    // Autoscale X with sensible bounds (0..100) and minimum span
    const allX = [
      ...ptsMsrp.map((d:any)=> Number(d?.value?.[0] ?? NaN)).filter(Number.isFinite),
      ...ptsTx.map((d:any)=> Number(d?.value?.[0] ?? NaN)).filter(Number.isFinite)
    ];
    let minX = allX.length ? Math.min(...allX) : 0;
    let maxX = allX.length ? Math.max(...allX) : 1;
    const xSpan = maxX - minX;
    if (xSpan < 10) { const mid = (minX+maxX)/2; minX = mid-5; maxX = mid+5; }
    minX = Math.max(0, Math.floor(minX));
    maxX = Math.min(100, Math.ceil(maxX));

    return {
      title: { text: `${pillarLabel} vs Precio (${seg.toUpperCase()||'todos'})`, left: 'center', top: 6 },
      grid: { left: 80, right: 80, top: 60, bottom: 60, containLabel: true },
      tooltip: { trigger: 'item', formatter: (p:any)=> `${p.seriesName}<br/>${p.data.name}<br/>${pillarLabel}: ${p.data.value[0]}<br/>Precio: $ ${Intl.NumberFormat('es-MX').format(p.data.value[1])}` },
      xAxis: { name: pillarLabel, nameLocation: 'middle', nameGap: 26, type: 'value', min: minX, max: maxX },
      yAxis: { name: 'Precio (MXN)', nameGap: 34, type: 'value', min: yMin, max: yMax, axisLabel: { formatter: (v:any)=> Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(v) } },
      legend: { bottom: 0, left: 'center', data: ['MSRP','TX'] },
      series: [
        { name: 'MSRP', type: 'scatter', data: ptsMsrp, symbol: (v:any,p:any)=> (p?.data?.symbol||'circle'), symbolSize: sym },
        { name: 'TX', type: 'scatter', data: ptsTx, symbol: (v:any,p:any)=> (p?.data?.symbol||'circle'), symbolSize: sym },
        ...verticalDiffSeries,
      ]
    } as any;
  }

  const scoreVsPriceOption = React.useMemo(() => {
    const msrpData: any[] = [];
    const txData: any[] = [];
    const scoresAll: number[] = [];
    // Pequeño jitter para evitar solapamientos exactos (mismo score y precio)
    const seen: Record<string, number> = {};
    const jitterX = (x: number, y: number) => {
      const key = `${Math.round(x*10)/10}|${Math.round(y)}`;
      const n = (seen[key] = (seen[key]||0) + 1);
      return x + (n>1 ? (n-1)*0.12 : 0); // desplaza ~0.12 pts por duplicado
    };
    chartRows.forEach((r) => {
      const score = Number((r as any)?.equip_score ?? NaN);
      const msrp = Number(r?.msrp ?? NaN);
      const tx = Number(r?.precio_transaccion ?? NaN);
      const name = vehLabel(r);
      if (Number.isFinite(score)) {
        scoresAll.push(score);
        if (Number.isFinite(msrp)) {
          const x = jitterX(score, msrp);
          msrpData.push({ value: [x, msrp], name, base: !!(r as any).__isBase, symbol: symbolMap[name], labelStr: versionShortLabel(r), itemStyle: { color: colorForVersion(r) } });
        }
        // Graficar TX sólo si existe y es diferente de MSRP
        if (Number.isFinite(tx) && Number.isFinite(msrp) && tx !== msrp) {
          const x = jitterX(score, tx);
          txData.push({ value: [x, tx], name, base: !!(r as any).__isBase, symbol: symbolMap[name], itemStyle: { color: 'transparent', borderColor: colorForVersion(r), borderWidth: 2 } });
        }
      }
    });
    const sym = (_val: any, params: any) => (params?.data?.base ? 20 : 14);
    // Vertical segments para mostrar diferencia TX vs MSRP al mismo score
    const segData: Array<[number, number, number]> = [];
    chartRows.forEach((r) => {
      const s = Number((r as any)?.equip_score ?? NaN);
      const msrp = Number(r?.msrp ?? NaN);
      const tx = Number(r?.precio_transaccion ?? NaN);
      if (Number.isFinite(s) && Number.isFinite(msrp) && Number.isFinite(tx) && msrp !== tx) {
        const y1 = Math.min(msrp, tx);
        const y2 = Math.max(msrp, tx);
        segData.push([s, y1, y2]);
      }
    });
    const verticalDiffSeries = segData.length ? [{
      name: 'Δ TX vs MSRP', type: 'custom', renderItem: function(params: any, api: any) {
        const xVal = api.value(0);
        const yLow = api.value(1);
        const yHigh = api.value(2);
        const p1 = api.coord([xVal, yLow]);
        const p2 = api.coord([xVal, yHigh]);
        return { type: 'line', shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }, style: api.style({ stroke: '#94a3b8', lineWidth: 1, lineDash: [4,4] }) } as any;
      }, data: segData, tooltip: { show: false }
    }] : [];
    // Rango X: expandimos alrededor de los datos y garantizamos un ancho mínimo
    let minS = scoresAll.length ? Math.min(...scoresAll) : 0;
    let maxS = scoresAll.length ? Math.max(...scoresAll) : 1;
    const span = maxS - minS;
    // Si el rango es muy chico, ensancha a al menos 10 pts; centra en la media
    if (span < 10) {
      const mid = (minS + maxS) / 2;
      minS = mid - 10/2;
      maxS = mid + 10/2;
    }
    minS = Math.max(0, Math.floor(minS));
    maxS = Math.min(100, Math.ceil(maxS));
    // Nicer Y scale
    const allY = [
      ...msrpData.map((d:any)=> Number(d?.value?.[1] ?? NaN)).filter(Number.isFinite),
      ...txData.map((d:any)=> Number(d?.value?.[1] ?? NaN)).filter(Number.isFinite)
    ];
    const yMin = allY.length ? Math.max(0, Math.floor(Math.min(...allY)*0.95)) : 0;
    const yMax = allY.length ? Math.ceil(Math.max(...allY)*1.05) : 1;
    return {
      title: { text: 'Score de equipo vs Precio', left: 'center', top: 6 },
      grid: { left: 80, right: 80, top: 60, bottom: 60, containLabel: true },
      tooltip: { trigger: 'item', formatter: (p: any) => `${p.seriesName}<br/>${p.data.name}<br/>Score: ${p.data.value[0]}<br/>$ ${Intl.NumberFormat('es-MX').format(p.data.value[1])}` },
      xAxis: { name: 'Score equipo', nameLocation: 'middle', nameGap: 28, type: 'value', min: minS, max: maxS, axisLabel: { formatter: (v:any)=> Math.round(v) } },
      yAxis: { name: 'Precio (MXN)', nameGap: 36, type: 'value', min: yMin, max: yMax, axisLabel: { formatter: (v:any)=> Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(v) } },
      legend: { bottom: 0, left: 'center', data: ['MSRP','TX'] },
      series: [
        { name: 'MSRP', type: 'scatter', data: msrpData, symbol: (v:any,p:any)=> (p?.data?.symbol||'circle'), symbolSize: sym,
          label: { show: false }
        },
        // TX: hueco (sin relleno) para diferenciar cuando se imprima. SIN etiqueta (un solo nombre por vehículo)
        { name: 'TX', type: 'scatter', data: txData, symbol: (v:any,p:any)=> (p?.data?.symbol||'circle'), symbolSize: sym,
          label: { show: false }
        },
        ...verticalDiffSeries
      ]
    } as any;
  }, [chartRows]);

  // Radar de pilares (filtrado al segmento del vehículo base)
  const radarPillarsOption = React.useMemo(() => {
    if (!baseRow) return {} as any;
    const seg = segmentMain(baseRow) || 'sedan';
    const axes = radarKeysForSegment(seg);
    const indicator = axes.map(a => ({ name: a.label, max: 100 }));
    const toVals = (r: any) => axes.map(a => {
      const v = Number((r as any)?.[a.key] ?? NaN);
      return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
    });
    const nonZeroCount = (vals: number[]) => vals.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0);
    const baseVals = toVals(baseRow);
    const seriesData: any[] = [];
    // Siempre mostrar la base (aunque falten ejes), pero con estilo tenue si carece de datos
    const baseHas = nonZeroCount(baseVals) >= 2;
    seriesData.push({
      value: baseVals,
      name: vehLabel(baseRow),
      areaStyle: { color: 'rgba(30,58,138,0.12)' },
      lineStyle: { color: '#1e3a8a', width: baseHas ? 2 : 1, opacity: baseHas ? 1 : 0.6 },
      symbol: 'none'
    });
    // Agregar competidores solo si tienen al menos dos pilares con dato (>0)
    comps.forEach((r:any) => {
      const vals = toVals(r);
      if (nonZeroCount(vals) < 2) return; // evita polígonos raros con casi todo en 0
      const color = colorForVersion(r);
      seriesData.push({ value: vals, name: vehLabel(r), areaStyle: { color: 'rgba(0,0,0,0.02)' }, lineStyle: { color, width: 1.5, opacity: 0.9 }, symbol: 'none' });
    });
    if (!seriesData.length) return {} as any;
    return {
      title: { text: `Pilares por segmento (${(seg||'').toUpperCase()})`, left: 'center', top: 6 },
      tooltip: { trigger: 'item' },
      legend: { show: false },
      radar: { indicator, center: ['50%','54%'], radius: 110, splitNumber: 4 },
      series: [{ type: 'radar', data: seriesData }]
    } as any;
  }, [baseRow, comps]);

  // ΔHP vs base (barras)
  const deltaHpOption = React.useMemo(() => {
    if (!baseRow) return {} as any;
    const base = Number(baseRow?.caballos_fuerza ?? NaN);
    const items: Array<{name:string, val:number, color:string}> = [];
    comps.forEach((r:any) => {
      const hp = Number(r?.caballos_fuerza ?? NaN);
      if (!Number.isFinite(hp) || !Number.isFinite(base)) return;
      items.push({ name: versionShortLabel(r), val: hp - base, color: colorForVersion(r) });
    });
    if (!items.length) return {} as any;
    // y‑range robusta: incluye 0 y expande márgenes
    const vals = items.map(i=>i.val);
    const minV = Math.min(0, ...vals);
    const maxV = Math.max(0, ...vals);
    const span = Math.max(1, Math.abs(maxV - minV));
    const pad = Math.max(2, span*0.1);
    const yMin = Math.floor((minV - pad));
    const yMax = Math.ceil((maxV + pad));
    return {
      title: { text: 'Δ HP vs base', left: 'center', top: 6 },
      grid: { left: 60, right: 20, top: 40, bottom: 40, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p:any)=> {
        const it = Array.isArray(p) ? p[0] : p;
        return `${it.name}<br/>Δ HP: ${it.value>0?'+':''}${it.value}`;
      }},
      xAxis: { type: 'category', data: items.map(i=> i.name || ''), axisLabel: { interval: 0, rotate: 30 } },
      yAxis: { type: 'value', name: 'HP', min: yMin, max: yMax },
      series: [{ type: 'bar', data: items.map(i=> ({ value: i.val, itemStyle: { color: i.color } })) , markLine: { data: [{ yAxis: 0 }], lineStyle: { color: '#94a3b8' } } }]
    } as any;
  }, [baseRow, comps]);

  // Δ Longitud vs base (mm) (barras)
  const deltaLenOption = React.useMemo(() => {
    if (!baseRow) return {} as any;
    const base = Number(baseRow?.longitud_mm ?? NaN);
    const items: Array<{name:string, val:number, color:string}> = [];
    comps.forEach((r:any) => {
      const L = Number(r?.longitud_mm ?? NaN);
      if (!Number.isFinite(L) || !Number.isFinite(base)) return;
      items.push({ name: versionShortLabel(r), val: Math.round(L - base), color: colorForVersion(r) });
    });
    return {
      title: { text: 'Δ Longitud (mm) vs base', left: 'center', top: 6 },
      grid: { left: 70, right: 20, top: 40, bottom: 40, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p:any)=> {
        const it = Array.isArray(p) ? p[0] : p; const s = it.value>0?'+':''; return `${it.name}<br/>Δ Longitud: ${s}${Intl.NumberFormat('es-MX').format(it.value)} mm`;
      }},
      xAxis: { type: 'category', data: items.map(i=> i.name), axisLabel: { interval: 0, rotate: 30 } },
      yAxis: { type: 'value', name: 'mm', min: (v:any)=> v.min*1.05, max: (v:any)=> v.max*1.05 },
      series: [{ type: 'bar', data: items.map(i=> ({ value: i.val, itemStyle: { color: i.color } })), markLine: { data: [{ yAxis: 0 }], lineStyle: { color: '#94a3b8' } } }]
    } as any;
  }, [baseRow, comps]);

  // Δ Aceleración 0–100 km/h (s) frente a base
  const deltaAccelOption = React.useMemo(() => {
    if (!baseRow) return {} as any;
    const base = Number(baseRow?.accel_0_100_s ?? NaN);
    if (!Number.isFinite(base)) return {} as any;
    const items: Array<{name:string, val:number, color:string}> = [];
    comps.forEach((r:any) => {
      const t = Number(r?.accel_0_100_s ?? NaN);
      if (!Number.isFinite(t)) return;
      const dv = Number((t - base).toFixed(2));
      const color = dv < 0 ? '#16a34a' : (dv>0 ? '#dc2626' : '#64748b');
      items.push({ name: versionShortLabel(r), val: dv, color });
    });
    if (!items.length) return {} as any;
    return {
      title: { text: 'Δ 0–100 km/h (s) vs base', left: 'center', top: 6 },
      grid: { left: 70, right: 20, top: 40, bottom: 40, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p:any)=> {
        const it = Array.isArray(p) ? p[0] : p; const s = it.value>0?'+':''; return `${it.name}<br/>Δ 0–100: ${s}${it.value} s`;
      }},
      xAxis: { type: 'category', data: items.map(i=> i.name), axisLabel: { interval: 0, rotate: 30 } },
      yAxis: { type: 'value', name: 'segundos', min: (v:any)=> v.min*1.05, max: (v:any)=> v.max*1.05 },
      series: [{ type: 'bar', data: items.map(i=> ({ value: i.val, itemStyle: { color: i.color } })), markLine: { data: [{ yAxis: 0 }], lineStyle: { color: '#94a3b8' } } }]
    } as any;
  }, [baseRow, comps]);

  // Mostrar/ocultar aceleración y ajustar layout para centrar si falta
  const hasDeltaAccel = React.useMemo(() => {
    try {
      const base = Number(baseRow?.accel_0_100_s ?? NaN);
      if (!Number.isFinite(base)) return false;
      return comps.some((r:any) => Number.isFinite(Number(r?.accel_0_100_s)));
    } catch { return false; }
  }, [baseRow, comps]);

  // Huella (largo x ancho) superpuesta si hay datos de ancho
  const footprintOption = React.useMemo(() => {
    const parseNum = (v:any): number | null => {
      if (v==null) return null; const s=String(v).replace(/[^0-9\.\-]/g,'').trim(); if(!s) return null; const n=Number(s); return Number.isFinite(n)?n:null;
    };
    const widthMM = (row:any): number | null => {
      const cand = [row?.ancho_mm, row?.width_mm, row?.ancho];
      for (const c of cand) { const n=parseNum(c); if (n!=null) return (n<100? n*1000 : n); }
      return null;
    };
    const lengthMM = (row:any): number | null => {
      const cand = [row?.longitud_mm, row?.length_mm, row?.largo_mm, row?.longitud];
      for (const c of cand) { const n=parseNum(c); if (n!=null) return (n<100? n*1000 : n); }
      return null;
    };
    const haveDims = (row:any) => Number.isFinite(Number(widthMM(row))) && Number.isFinite(Number(lengthMM(row)));
    if (!baseRow || !haveDims(baseRow)) return {} as any;
    const items = [baseRow, ...comps.filter((r:any)=> haveDims(r))];
    const xs = items.map((r:any)=> Number(widthMM(r)));
    const ys = items.map((r:any)=> Number(lengthMM(r)));
    const xMin = Math.max(0, Math.floor(Math.min(...xs)*0.95)), xMax = Math.ceil(Math.max(...xs)*1.05);
    const yMin = Math.max(0, Math.floor(Math.min(...ys)*0.95)), yMax = Math.ceil(Math.max(...ys)*1.05);
    const series = items.map((r:any, idx:number) => {
      const w = Number(widthMM(r)), l = Number(lengthMM(r));
      const color = colorForVersion(r);
      const isBase = idx===0;
      return {
        type: 'custom', name: versionShortLabel(r),
        renderItem: function(params:any, api:any) {
          const x0 = api.coord([0, 0]);
          const x1 = api.coord([w, l]);
          const left = x0[0], top = x1[1], right = x1[0], bottom = x0[1];
          const width = right - left; const height = bottom - top;
          return {
            type: 'rect', shape: { x: left, y: top, width, height },
            style: { fill: isBase ? color : 'transparent', stroke: color, lineWidth: isBase ? 2.5 : 2, opacity: isBase ? 0.15 : 1 }
          } as any;
        },
        data: [[w,l]]
      };
    });
    return {
      title: { text: 'Huella (ancho x largo) — superposición', left: 'center', top: 6 },
      grid: { left: 60, right: 20, top: 40, bottom: 50, containLabel: true },
      tooltip: { show: false },
      xAxis: { name: 'Ancho (mm)', type: 'value', min: xMin, max: xMax },
      yAxis: { name: 'Largo (mm)', type: 'value', min: yMin, max: yMax },
      series
    } as any;
  }, [baseRow, comps]);

  // Perfil (alto x largo) superpuesta si hay datos de altura
  const profileOption = React.useMemo(() => {
    const parseNum = (v:any): number | null => {
      if (v==null) return null; const s=String(v).replace(/[^0-9\.\-]/g,'').trim(); if(!s) return null; const n=Number(s); return Number.isFinite(n)?n:null;
    };
    const heightMM = (row:any): number | null => {
      const cand = [row?.altura_mm, row?.alto_mm, row?.height_mm, row?.alto];
      for (const c of cand) { const n=parseNum(c); if (n!=null) return (n<100? n*1000 : n); }
      return null;
    };
    const lengthMM = (row:any): number | null => {
      const cand = [row?.longitud_mm, row?.length_mm, row?.largo_mm, row?.longitud];
      for (const c of cand) { const n=parseNum(c); if (n!=null) return (n<100? n*1000 : n); }
      return null;
    };
    const haveDims = (row:any) => Number.isFinite(Number(heightMM(row))) && Number.isFinite(Number(lengthMM(row)));
    if (!baseRow || !haveDims(baseRow)) return {} as any;
    const items = [baseRow, ...comps.filter((r:any)=> haveDims(r))];
    const xs = items.map((r:any)=> Number(lengthMM(r)));
    const ys = items.map((r:any)=> Number(heightMM(r)));
    const xMin = Math.max(0, Math.floor(Math.min(...xs)*0.95)), xMax = Math.ceil(Math.max(...xs)*1.05);
    const yMin = Math.max(0, Math.floor(Math.min(...ys)*0.95)), yMax = Math.ceil(Math.max(...ys)*1.05);
    const series = items.map((r:any, idx:number) => {
      const h = Number(heightMM(r)), l = Number(lengthMM(r));
      const color = colorForVersion(r);
      const isBase = idx===0;
      return {
        type: 'custom', name: versionShortLabel(r),
        renderItem: function(params:any, api:any) {
          const x0 = api.coord([0, 0]);
          const x1 = api.coord([l, h]);
          const left = x0[0], top = x1[1], right = x1[0], bottom = x0[1];
          const width = right - left; const height = bottom - top;
          return {
            type: 'rect', shape: { x: left, y: top, width, height },
            style: { fill: isBase ? color : 'transparent', stroke: color, lineWidth: isBase ? 2.5 : 2, opacity: isBase ? 0.15 : 1 }
          } as any;
        },
        data: [[l,h]]
      };
    });
    return {
      title: { text: 'Perfil (alto x largo) — superposición', left: 'center', top: 6 },
      grid: { left: 60, right: 20, top: 40, bottom: 50, containLabel: true },
      tooltip: { show: false },
      xAxis: { name: 'Largo (mm)', type: 'value', min: xMin, max: xMax },
      yAxis: { name: 'Alto (mm)', type: 'value', min: yMin, max: yMax },
      series
    } as any;
  }, [baseRow, comps]);

  const hpVsPriceOption = React.useMemo(() => {
    const msrpData: any[] = [];
    const txData: any[] = [];
    const cphData: any[] = [];
    let minH = Number.POSITIVE_INFINITY, maxH = 0;
    const seen: Record<string, number> = {};
    const jitterX = (x: number, y: number) => {
      const key = `${Math.round(x)}|${Math.round(y)}`;
      const n = (seen[key] = (seen[key]||0) + 1);
      return x + (n>1 ? (n-1)*0.5 : 0); // desplaza 0.5 HP por duplicado
    };
    chartRows.forEach((r) => {
      const hp = Number(r?.caballos_fuerza ?? NaN);
      const msrp = Number(r?.msrp ?? NaN);
      const tx = Number(r?.precio_transaccion ?? NaN);
      const costPerHp = cph(r);
      const name = vehLabel(r);
      if (Number.isFinite(hp)) {
        minH = Math.min(minH, hp);
        maxH = Math.max(maxH, hp);
        const x = jitterX(hp, msrp||0);
        const labelStr = versionShortLabel(r);
        if (Number.isFinite(msrp)) msrpData.push({ value: [x, msrp], name, labelStr, base: !!r.__isBase, symbol: symbolMap[name], itemStyle: { color: colorForVersion(r) } });
        if (Number.isFinite(tx) && Number.isFinite(msrp) && tx !== msrp) txData.push({ value: [jitterX(hp, tx), tx], name, labelStr, base: !!r.__isBase, symbol: symbolMap[name], itemStyle: { color:'transparent', borderColor: colorForVersion(r), borderWidth: 2 } });
        if (costPerHp != null) cphData.push({ value: [jitterX(hp, Number(costPerHp)), Number(costPerHp)], name, base: !!r.__isBase, symbol: symbolMap[name], itemStyle: { color: colorForVersion(r) } });
      }
    });
    const sym = (_val: any, params: any) => (params?.data?.base ? 20 : 14);
    // vertical dashed segments at same HP to show MSRP vs TX difference
    const segData: Array<[number, number, number]> = [];
    chartRows.forEach((r) => {
      const hp = Number(r?.caballos_fuerza ?? NaN);
      const msrp = Number(r?.msrp ?? NaN);
      const tx = Number(r?.precio_transaccion ?? NaN);
      if (Number.isFinite(hp) && Number.isFinite(msrp) && Number.isFinite(tx) && msrp !== tx) {
        const y1 = Math.min(msrp, tx);
        const y2 = Math.max(msrp, tx);
        segData.push([hp, y1, y2]);
      }
    });
    const verticalDiffSeries = segData.length ? [{
      name: 'Δ TX vs MSRP', type: 'custom', renderItem: function(params: any, api: any) {
        const xVal = api.value(0);
        const yLow = api.value(1);
        const yHigh = api.value(2);
        const p1 = api.coord([xVal, yLow]);
        const p2 = api.coord([xVal, yHigh]);
        return {
          type: 'line',
          shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] },
          style: api.style({ stroke: '#94a3b8', lineWidth: 1, lineDash: [4,4] })
        } as any;
      }, data: segData, tooltip: { show: false }
    }] : [];
    // Líneas de isocosto $/HP (y = c * x) dibujadas en el eje de precio
    const allCph: number[] = [];
    chartRows.forEach((r)=>{
      const hp = Number(r?.caballos_fuerza ?? NaN);
      if (!Number.isFinite(hp) || hp<=0) return;
      const msrp = Number(r?.msrp ?? NaN);
      const tx = Number(r?.precio_transaccion ?? NaN);
      if (Number.isFinite(msrp)) allCph.push(msrp/hp);
      if (Number.isFinite(tx)) allCph.push(tx/hp);
    });
    let guideLevels: number[] = [];
    if (allCph.length) {
      const cmin = Math.min(...allCph);
      const cmax = Math.max(...allCph);
      const range = Math.max(1, cmax - cmin);
      const candidates = [250, 500, 1000, 2000, 5000];
      let step = 1000;
      for (const s of candidates) { if (range / s <= 4) { step = s; break; } }
      const start = Math.max(250, Math.floor(cmin/step)*step);
      const end = Math.ceil(cmax/step)*step;
      for (let v = start; v <= end; v += step) guideLevels.push(v);
      if (guideLevels.length < 3) guideLevels = [start, start+step, start+2*step];
    } else {
      guideLevels = [3000, 4000, 5000];
    }
    if (!Number.isFinite(minH)) { minH = 0; maxH = 1; }
    const span = Math.max(1, (maxH - minH));
    const pad = Math.max(1, span * 0.05);
    const xMin = Math.floor(minH - pad);
    const xMax = Math.ceil(maxH + pad);
    const xStart = xMin; const xEnd = xMax;
    const guideLines = guideLevels.map((c, i) => ({
      type: 'line', xAxisIndex: 0,
      data: [ [xStart, c*xStart], [xEnd, c*xEnd] ], symbol: 'none',
      lineStyle: { type: 'dashed', width: 1, color: ['#94a3b8','#a3a3a3','#cbd5e1','#9ca3af'][i % 4] },
      tooltip: { show: false },
      endLabel: { show: true, formatter: () => `$${Intl.NumberFormat('es-MX').format(c)}/HP`, color: '#64748b', distance: 6 },
      clip: false,
      z: 0
    }));

    // Nice Y scale based on both MSRP and TX
    const allY = [
      ...msrpData.map((d:any)=> Number(d?.value?.[1] ?? NaN)).filter(Number.isFinite),
      ...txData.map((d:any)=> Number(d?.value?.[1] ?? NaN)).filter(Number.isFinite)
    ];
    let yMin = allY.length ? Math.max(0, Math.floor(Math.min(...allY)*0.95)) : 0;
    let yMax = allY.length ? Math.ceil(Math.max(...allY)*1.05) : 1;
    // Expand Y range to ensure $/HP guide lines and their end labels sean visibles
    if (guideLevels.length) {
      const gMin = Math.min(...guideLevels.map(c=> c * xMin));
      const gMax = Math.max(...guideLevels.map(c=> c * xMax));
      yMin = Math.min(yMin, Math.floor(gMin*0.98));
      yMax = Math.max(yMax, Math.ceil(gMax*1.02));
    }
    return {
      title: { text: 'HP vs Precio y $/HP', left: 'center', top: 6 },
      grid: { left: 80, right: 110, top: 60, bottom: 60, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const x = p.data?.value?.[0];
          const y = p.data?.value?.[1];
          return `${p.seriesName}<br/>${p.data.name}<br/>HP: ${x}<br/>Precio: $ ${Intl.NumberFormat('es-MX').format(y)}`;
        }
      },
      xAxis: { name: 'HP', nameLocation: 'middle', nameGap: 24, type: 'value', min: xMin, max: xMax, axisLabel: { formatter: (v:any)=> Math.round(v) } },
      yAxis: { name: 'Precio (MXN)', nameGap: 40, type: 'value', min: yMin, max: yMax, axisLabel: { formatter: (v:any)=> Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(v) } },
      legend: { bottom: 0, left: 'center', data: ['MSRP','TX'] },
      series: [
        { name: 'MSRP', type: 'scatter', data: msrpData, symbol: (v:any,p:any)=> (p?.data?.symbol||'circle'), symbolSize: sym,
          label: { show: true, position: 'top', formatter: (p:any)=> (p?.data?.base ? (p?.data?.labelStr || '') : '') },
          labelLayout: { hideOverlap: true }
        },
        { name: 'TX', type: 'scatter', data: txData, symbol: (v:any,p:any)=> (p?.data?.symbol||'circle'), symbolSize: sym,
          label: { show: true, position: 'bottom', formatter: (p:any)=> (p?.data?.base ? '' : '') }
        },
        ...verticalDiffSeries,
        ...guideLines
      ]
    } as any;
  }, [chartRows]);

  // MSRP vs HP (MSRP lleno vs TX hueco)
  const msrpVsHpWithLinesOption = React.useMemo(() => {
    const pts: any[] = [];
    const ptsTx: any[] = [];
    const segData: Array<[number, number, number]> = [];
    // X = HP, Y = Precio (MXN)
    let minHp = Number.POSITIVE_INFINITY, maxHp = 0;
    let minPrice = Number.POSITIVE_INFINITY, maxPrice = 0;
    chartRows.forEach((r) => {
      const hp = Number(r?.caballos_fuerza ?? NaN);
      const msrp = Number(r?.msrp ?? NaN);
      const tx = Number(r?.precio_transaccion ?? NaN);
      const name = vehLabel(r);
      if (Number.isFinite(hp) && Number.isFinite(msrp)) {
        pts.push({ value: [hp, msrp], name, base: !!(r as any).__isBase, symbol: symbolMap[name], itemStyle: { color: colorForVersion(r) } });
        minHp = Math.min(minHp, hp); maxHp = Math.max(maxHp, hp);
        minPrice = Math.min(minPrice, msrp); maxPrice = Math.max(maxPrice, msrp);
        if (Number.isFinite(tx) && tx !== msrp) {
          ptsTx.push({ value: [hp, tx], name, base: !!(r as any).__isBase, symbol: symbolMap[name], itemStyle: { color: 'transparent', borderColor: colorForVersion(r), borderWidth: 2 } });
          minPrice = Math.min(minPrice, tx); maxPrice = Math.max(maxPrice, tx);
          const y1 = Math.min(msrp, tx); const y2 = Math.max(msrp, tx);
          segData.push([hp, y1, y2]);
        }
      }
    });
    if (!Number.isFinite(minHp) || !Number.isFinite(maxHp)) { minHp = 0; maxHp = 1; }
    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) { minPrice = 0; maxPrice = 1; }
    const sym = (_: any, params: any) => (params?.data?.base ? 20 : 14);
    const verticalDiffSeries = segData.length ? [{
      name: 'Δ TX vs MSRP', type: 'custom', renderItem: function(params: any, api: any) {
        const xVal = api.value(0);
        const yLow = api.value(1);
        const yHigh = api.value(2);
        const p1 = api.coord([xVal, yLow]);
        const p2 = api.coord([xVal, yHigh]);
        return { type: 'line', shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }, style: api.style({ stroke: '#94a3b8', lineWidth: 1, lineDash: [4,4] }) } as any;
      }, data: segData, tooltip: { show: false }
    }] : [];
    return {
      title: { text: 'MSRP vs Potencia (HP)', left: 'center', top: 6 },
      grid: { left: 80, right: 80, top: 60, bottom: 60, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => `${p.data.name}<br/>HP: ${p.data.value[0]}<br/>MSRP: $ ${Intl.NumberFormat('es-MX').format(p.data.value[1])}`
      },
      xAxis: { name: 'HP', nameLocation: 'middle', nameGap: 28, type: 'value', min: Math.max(0, Math.floor(minHp*0.98)), max: Math.ceil(maxHp*1.02) },
      yAxis: { name: 'MSRP (MXN)', nameGap: 28, type: 'value', min: Math.max(0, Math.floor(minPrice*0.95)), max: Math.ceil(maxPrice*1.05) },
      legend: { bottom: 0, left: 'center', data: ['MSRP','TX'] },
      series: [
        { name: 'MSRP', type: 'scatter', data: pts, symbol: (v:any,p:any)=> (p?.data?.symbol||'circle'), symbolSize: sym },
        { name: 'TX', type: 'scatter', data: ptsTx, symbol: (v:any,p:any)=> (p?.data?.symbol||'circle'), symbolSize: sym },
        ...verticalDiffSeries
      ]
    } as any;
  }, [chartRows]);

  // Score vs Price (with trendlines)
  const scoreVsPriceWithTrend = React.useMemo(() => {
    const pointsMsrp: Array<[number, number, any]> = [];
    const pointsTx: Array<[number, number, any]> = [];
    chartRows.forEach((r) => {
      const s = Number((r as any)?.equip_score ?? NaN);
      const msrp = Number(r?.msrp ?? NaN);
      const tx = Number(r?.precio_transaccion ?? NaN);
      const name = vehLabel(r);
      if (Number.isFinite(s) && Number.isFinite(msrp)) pointsMsrp.push([s, msrp, { name, base: !!(r as any).__isBase }]);
      if (Number.isFinite(s) && Number.isFinite(tx))   pointsTx.push([s, tx,   { name, base: !!(r as any).__isBase }]);
    });
    const linreg = (pairs: Array<[number,number]>) => {
      if (pairs.length < 2) return null;
      const n = pairs.length;
      let sumx=0,sumy=0,sumxy=0,sumxx=0;
      for (const [x,y] of pairs) { sumx+=x; sumy+=y; sumxy+=x*y; sumxx+=x*x; }
      const denom = (n*sumxx - sumx*sumx); if (!denom) return null;
      const b = (n*sumxy - sumx*sumy)/denom; // slope
      const a = (sumy - b*sumx)/n;           // intercept
      return { a, b };
    };
    const sMsrp = linreg(pointsMsrp.map(([x,y])=>[x,y]));
    const sTx   = linreg(pointsTx.map(([x,y])=>[x,y]));
    const minS = Math.min(...pointsMsrp.map(p=>p[0]), ...pointsTx.map(p=>p[0]), 0);
    const maxS = Math.max(...pointsMsrp.map(p=>p[0]), ...pointsTx.map(p=>p[0]), 100);
    const lineMsrp = sMsrp ? [[minS, sMsrp.a + sMsrp.b*minS],[maxS, sMsrp.a + sMsrp.b*maxS]] : [];
    const lineTx   = sTx   ? [[minS, sTx.a   + sTx.b*minS  ],[maxS, sTx.a   + sTx.b*maxS  ]] : [];
    const sym = (_: any, p: any) => (p?.data?.[2]?.base ? 20 : 14);
    // vertical dashed segments at same score to show MSRP vs TX difference
    const segData: Array<[number, number, number]> = [];
    chartRows.forEach((r) => {
      const s = Number((r as any)?.equip_score ?? NaN);
      const msrp = Number(r?.msrp ?? NaN);
      const tx = Number(r?.precio_transaccion ?? NaN);
      if (Number.isFinite(s) && Number.isFinite(msrp) && Number.isFinite(tx) && msrp !== tx) {
        const y1 = Math.min(msrp, tx);
        const y2 = Math.max(msrp, tx);
        segData.push([s, y1, y2]);
      }
    });
    const verticalDiffSeries = segData.length ? [{
      name: 'Δ TX vs MSRP', type: 'custom', renderItem: function(params: any, api: any) {
        const xVal = api.value(0);
        const yLow = api.value(1);
        const yHigh = api.value(2);
        const p1 = api.coord([xVal, yLow]);
        const p2 = api.coord([xVal, yHigh]);
        return {
          type: 'line',
          shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] },
          style: api.style({ stroke: '#94a3b8', lineWidth: 1, lineDash: [4,4] })
        } as any;
      }, data: segData, tooltip: { show: false }
    }] : [];
    // Rango Y dinámico para mantener proporciones
    const yVals = [...pointsMsrp.map(p=>p[1]), ...pointsTx.map(p=>p[1])];
    const yMin = yVals.length? Math.max(0, Math.floor(Math.min(...yVals)*0.95)) : 0;
    const yMax = yVals.length? Math.ceil(Math.max(...yVals)*1.05) : 1;
    return {
      grid: { left: 60, right: 20, top: 30, bottom: 40, containLabel: true },
      tooltip: { trigger: 'item', formatter: (p: any)=> `${p.seriesName}<br/>${(p?.data?.[2]?.name)||''}<br/>Score: ${p.data[0]}<br/>Precio: $ ${Intl.NumberFormat('es-MX').format(p.data[1])}` },
      xAxis: { name: 'Score equipo', type: 'value', min: Math.max(0, Math.floor(minS)), max: Math.min(100, Math.ceil(maxS)) },
      yAxis: { name: 'Precio (MXN)', type: 'value', min: yMin, max: yMax },
      legend: { data: ['MSRP','Precio tx','Tendencia MSRP','Tendencia tx'], bottom: 0, left: 'center' },
      series: [
        { name: 'MSRP', type: 'scatter', data: pointsMsrp, symbolSize: sym, itemStyle: { color: '#2563eb' } },
        { name: 'Precio tx', type: 'scatter', data: pointsTx, symbolSize: sym, itemStyle: { color: '#16a34a' } },
        { name: 'Tendencia MSRP', type: 'line', data: lineMsrp, symbol: 'none', lineStyle: { type: 'dashed', color: '#2563eb' } },
        { name: 'Tendencia tx', type: 'line', data: lineTx, symbol: 'none', lineStyle: { type: 'dashed', color: '#16a34a' } },
        ...verticalDiffSeries
      ]
    } as any;
  }, [chartRows]);

  // Waterfall ΔTX con desagregación: HP + Equipo + 4x4 + Propulsión + Cabina + Garantía + No explicado
  const txWaterfallOption = React.useMemo(() => {
    if (!baseRow) return {};
    const baseTx = Number(baseRow?.precio_transaccion ?? baseRow?.msrp ?? NaN);
    const baseHp = Number(baseRow?.caballos_fuerza ?? NaN);
    const baseScore = Number((baseRow as any)?.equip_score ?? NaN);
    // $/HP de referencia: del propio si es válido; si no, promedio del grupo
    let refCph = baseHp>0 && Number.isFinite(baseTx) ? baseTx/baseHp : undefined;
    if (!refCph) {
      const vals = chartRows.map(r=>{
        const tx = Number(r?.precio_transaccion ?? NaN);
        const hp = Number(r?.caballos_fuerza ?? NaN);
        return (Number.isFinite(tx) && hp>0) ? tx/hp : NaN;
      }).filter(v=>Number.isFinite(v)) as number[];
      if (vals.length) refCph = vals.reduce((a,b)=>a+b,0)/vals.length;
    }
    if (!refCph) refCph = 4000; // fallback
    // Pendiente precio vs score (para contribución de equipo)
    const pairs: Array<[number,number]> = chartRows.map(r=>{
      const s = Number((r as any)?.equip_score ?? NaN);
      const tx = Number(r?.precio_transaccion ?? r?.msrp ?? NaN);
      return [s, tx];
    }).filter(([s,t])=>Number.isFinite(s)&&Number.isFinite(t));
    const reg = (()=>{
      if (pairs.length<2) return {a:0,b:0};
      const n=pairs.length; let sx=0,sy=0,sxy=0,sxx=0; for(const [x,y] of pairs){sx+=x;sy+=y;sxy+=x*y;sxx+=x*x;}
      const denom = (n*sxx - sx*sx) || 1; const b=(n*sxy - sx*sy)/denom; const a=(sy - b*sx)/n; return {a,b};
    })();
    // Helpers para rasgos categóricos
    function is4x4(row: any): number {
      const s = String(row?.driven_wheels || row?.traccion_original || '').toLowerCase();
      return (/(4x4|awd|4wd)/.test(s)) ? 1 : 0;
    }
    function fuelBucket(row: any): string {
      const s = String(row?.categoria_combustible_final || row?.tipo_de_combustible_original || '').toLowerCase();
      if (/bev|eléctr|electr/.test(s)) return 'bev';
      if (/phev|enchuf/.test(s)) return 'phev';
      if (/hev|híbrido|hibrido/.test(s)) return 'hev';
      if (/diesel|diésel/.test(s)) return 'diesel';
      return 'gasolina';
    }
    function cabBucket(row: any): string {
      const v = String(row?.cab_type || row?.cabina || '').toLowerCase();
      if (/doble|double|d-?cab/.test(v)) return 'dcab';
      if (/chasis/.test(v)) return 'chasis';
      if (/sencilla|single/.test(v)) return 'scab';
      return 'std';
    }
    function warrantyScore(row: any): number {
      const w = Number((row as any)?.warranty_score ?? NaN);
      return Number.isFinite(w) ? w : 0;
    }

    // Construir matriz para regresión local TX ~ HP + equip_score + 4x4 + fuel + cab + warranty
    const rows = [baseRow, ...comps];
    const feats = rows.map(r => ({
      tx: Number(r?.precio_transaccion ?? NaN),
      hp: Number(r?.caballos_fuerza ?? NaN),
      eq: Number((r as any)?.equip_score ?? NaN),
      f4: is4x4(r),
      fuel: fuelBucket(r),
      cab: cabBucket(r),
      war: warrantyScore(r)
    }));
    // One-hot fuel (gasolina base): bev, phev, hev, diesel
    const X: number[][] = []; const y: number[] = [];
    feats.forEach(f => {
      if (!Number.isFinite(f.tx)) return;
      const row = [1,
        Number.isFinite(f.hp)?f.hp:0,
        Number.isFinite(f.eq)?f.eq:0,
        f.f4,
        f.fuel==='bev'?1:0,
        f.fuel==='phev'?1:0,
        f.fuel==='hev'?1:0,
        f.fuel==='diesel'?1:0,
        f.cab==='dcab'?1:0,
        f.cab==='chasis'?1:0,
        f.cab==='scab'?1:0,
        f.war
      ];
      X.push(row); y.push(f.tx);
    });
    function ols(X: number[][], y: number[]): number[] | null {
      try {
        const m = X.length, n = X[0].length;
        // Compute XtX and Xty
        const XtX = Array.from({length:n}, ()=>Array(n).fill(0));
        const Xty = Array(n).fill(0);
        for (let i=0;i<m;i++){
          const xi = X[i];
          for (let a=0;a<n;a++){
            Xty[a]+= xi[a]*y[i];
            for (let b=0;b<n;b++) XtX[a][b]+= xi[a]*xi[b];
          }
        }
        // Solve XtX * beta = Xty via Gaussian elimination
        for (let i=0;i<n;i++) XtX[i].push(Xty[i]); // augment
        // forward elimination
        for (let i=0;i<n;i++){
          // pivot
          let piv=i; for(let r=i+1;r<n;r++) if (Math.abs(XtX[r][i])>Math.abs(XtX[piv][i])) piv=r;
          if (Math.abs(XtX[piv][i])<1e-8) return null;
          if (piv!==i) { const tmp=XtX[i]; XtX[i]=XtX[piv]; XtX[piv]=tmp; }
          const div = XtX[i][i];
          for (let c=i;c<=n;c++) XtX[i][c]/=div;
          for (let r=0;r<n;r++) if (r!==i){
            const factor = XtX[r][i];
            for (let c=i;c<=n;c++) XtX[r][c]-=factor*XtX[i][c];
          }
        }
        const beta = XtX.map(row=>row[n]);
        return beta;
      } catch { return null; }
    }
    const beta = (X.length>=rows.length && X[0]?.length && X.length>=6) ? ols(X,y) : null;

    const barsByComp = comps.slice(0,5).map((r:any)=>{
      const tx = Number(r?.precio_transaccion ?? NaN);
      const hp = Number(r?.caballos_fuerza ?? NaN);
      const score = Number((r as any)?.equip_score ?? NaN);
      if (!Number.isFinite(tx) || !Number.isFinite(baseTx)) return null;
      const dtx = tx - baseTx;
      // Contribuciones básicas
      const dHp = (Number.isFinite(hp)&&Number.isFinite(baseHp)) ? (hp - baseHp)*refCph : 0;
      const dEq = (Number.isFinite(score)&&Number.isFinite(baseScore)) ? reg.b*(score - baseScore) : 0;
      // Granulares por regresión si beta disponible
      let d4 = 0, dfuel = 0, dcab = 0, dwar = 0;
      if (beta){
        const base4 = is4x4(baseRow); const comp4 = is4x4(r); d4 = beta[3]*(comp4-base4);
        const bf = fuelBucket(baseRow), cf = fuelBucket(r);
        const idxFuel = {bev:4,phev:5,hev:6,diesel:7} as any;
        dfuel = (beta[idxFuel[cf]]||0) - (beta[idxFuel[bf]]||0);
        const bc = cabBucket(baseRow), cc = cabBucket(r);
        const idxCab = {dcab:8,chasis:9,scab:10} as any;
        dcab = (beta[idxCab[cc]]||0) - (beta[idxCab[bc]]||0);
        const bw = warrantyScore(baseRow), cw = warrantyScore(r);
        dwar = (beta[11]||0) * (cw - bw);
      }
      const baseline = dHp + dEq + d4 + dfuel + dcab + dwar;
      const resid = dtx - baseline;
      const ver = normalizeVersion(String((r as any)?.version_display || r?.version || ''));
      const name = `${r.make||''} ${r.model||''}${ver?` – ${ver}`:''}`.trim();
      const items = [dHp, dEq, d4, dfuel, dcab, dwar, resid];
      return { name, items, total: dtx };
    }).filter(Boolean) as any[];
    // ECharts waterfall emulado: barras apiladas con baseline acumulativo
    const categories = barsByComp.map((b:any)=>b.name);
    const seriesNames = ['HP','Equipo','4x4','Propulsión','Cabina','Garantía','No explicado'];
    const stackSeries = seriesNames.map((sn, idx)=>({
      name: sn,
      type: 'bar', stack: 's',
      data: barsByComp.map((b:any)=>b.items[idx]),
      label: { show: true, position: 'inside', formatter: (p:any)=> (p.value? (p.value>0?'+':'')+Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(p.value):'') }
    }));
    // Capa extra solo para mostrar el total ΔTX en la parte superior
    const totalSeries = {
      name: 'ΔTX', type: 'bar', barGap: '-100%',
      itemStyle: { color: 'transparent' },
      emphasis: { disabled: true },
      tooltip: { show: false },
      data: barsByComp.map((b:any)=>b.total),
      label: { show: true, position: 'top', formatter: (p:any)=> (p.value? (p.value>0?'+':'')+Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(p.value):''), color: '#111827' }
    } as any;
    return {
      title: { text: 'Gap de precio (TX) — Waterfall', left: 'center', top: 6 },
      grid: { left: 80, right: 80, top: 70, bottom: 70, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: seriesNames, bottom: 0, left: 'center' },
      xAxis: { type: 'category', data: categories, axisLabel: { interval: 0, rotate: 15 } },
      yAxis: { name: 'ΔTX (MXN)', type: 'value' },
      series: [...stackSeries, totalSeries]
    } as any;
  }, [chartRows, comps, baseRow]);

  return (
    <>
    <section style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff', overflowX:'auto' }}>
      <div style={{ fontWeight:700, marginBottom:8 }}>Comparar versiones</div>
      <div style={{ marginBottom:10, color:'#64748b', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        {ownRow ? (
          <span>Base: <strong>{String(ownRow.make||'')} {String(ownRow.model||'')} {ownRow.ano||''} {ownRow.version?`– ${ownRow.version}`:''}</strong></span>
        ) : <span>Base: —</span>}
        <span style={{ fontSize:12 }}>k = {k}</span>
        <span style={{ opacity:0.8 }}>
          {usedFilters ? (
            <>
              <strong>IA</strong> · Filtros usados: {usedFilters.include_same_brand? 'Incluye misma marca':'Sin misma marca'} • {usedFilters.same_segment? 'Mismo segmento':'Cualquier segmento'} • {usedFilters.same_propulsion? 'Misma propulsión':'Cualquier propulsión'} • {usedFilters.include_different_years? 'Años diferentes: Sí':'Año base solo'}{(usedFilters.max_length_pct!=null)?` • Largo ±${usedFilters.max_length_pct}%`:''}{(usedFilters.max_length_mm!=null)?` • Largo ±${usedFilters.max_length_mm} mm`:''}{(usedFilters.score_diff_pct!=null)?` • Score ±${usedFilters.score_diff_pct}%`:''}{(usedFilters.min_match_pct!=null)?` • Match ≥ ${usedFilters.min_match_pct}%`:''}
            </>
          ) : (
            <>Filtros: {filters.includeSameBrand?'Incluye misma marca':'Sin misma marca'} • {filters.sameSegment?'Mismo segmento':'Cualquier segmento'} • {filters.samePropulsion?'Misma propulsión':'Cualquier propulsión'}</>
          )}
        </span>
      </div>
      {/* Auditoría rápida de datos */}
      {(() => {
        const issues: string[] = [];
        function pushIf(cond: boolean, msg: string){ if(cond) issues.push(msg); }
        const ptx = Number(baseRow?.precio_transaccion ?? 0);
        const msrp = Number(baseRow?.msrp ?? 0);
        const svc = Number(baseRow?.service_cost_60k_mxn ?? 0);
        const tco = Number(baseRow?.tco_60k_mxn ?? 0);
        // Reglas básicas
        pushIf(ptx && msrp && ptx>msrp*1.2, 'Precio transacción > 120% del MSRP (revisar).');
        pushIf(svc && svc>msrp*0.5, 'Servicio 60k > 50% del MSRP (revisar).');
        pushIf((ptx||msrp) && (tco && Math.abs((ptx||msrp) + (svc||0) - tco) > 5), 'TCO 60k != Precio tx + Servicio 60k.');
        pushIf(!Number.isFinite(Number(baseRow?.caballos_fuerza)), 'HP faltante o inválido.');
        pushIf(baseRow?.fuel_cost_60k_mxn==null && (String(baseRow?.categoria_combustible_final||'').toLowerCase().includes('gas') || String(baseRow?.tipo_de_combustible_original||'').toLowerCase().includes('gas')), 'Falta Comb/Energ 60k para gasolina.');
        return issues.length ? (
          <div style={{ margin:'6px 0 10px', padding:'8px 10px', background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:8, color:'#334155', fontSize:12 }}>
            Auditoría rápida: {issues.map((s,i)=>(<span key={i}>• {s} </span>))}
          </div>
        ) : null;
      })()}

      <div className="no-print">
      <ManualBlock
        manModel={manModel}
        setManModel={setManModel}
        manMake={manMake}
        setManMake={setManMake}
        ownYear={own.year}
        brandAlpha={brandAlpha}
        setBrandAlpha={setBrandAlpha}
        brandSugg={brandSugg}
        modelSugg={modelSugg}
        modelsForMake={modelsForMake}
        vehSugg={vehSugg}
        addManual={addManual}
        manVersions={manVersions}
        manual={manual}
        removeManual={removeManual}
        manInputRef={manInputRef}
      />
      </div>
      <table style={{ width:'100%', minWidth: 1200, borderCollapse:'collapse' }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h.key} style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e5e7eb' }}>
                {h.label}
                {h.key==='equip_over_under_pct' ? (
                  <InfoIcon title={'Equipo relativo al vehículo base. Positivo = más equipo; negativo = menos. Calculado por pilares o, si faltan, por score.'} />
                ) : h.key==='segmento' ? (
                  (() => {
                    const rows = [ ...(ownRow?[ownRow]:[]), ...comps ];
                    const m = lastYtdMonth(rows);
                    const mon = m ? monthNameEs(m) : '';
                    const share = Number((ownRow as any)?.ventas_share_seg_pct ?? NaN);
                    const shareTxt = Number.isFinite(share) ? ` • Share base: ${share.toFixed(1)}%` : '';
                    const y = Number(own.year || 2025);
                    const t = `Ventas del total del modelo (YTD a ${mon || 'mes actual'} ${y}). Incluye participación dentro del segmento${shareTxt}.`;
                    return <InfoIcon title={t} />;
                  })()
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Fila base (vehículo propio) */}
          {baseRow && (<tr>
            {/* Foto base */}
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
              {(() => {
                const src = String((baseRow as any)?.images_default || (baseRow as any)?.image_url || '');
                if (!src) return null;
                return (<img src={src} alt="foto" style={{ width:84, height:56, objectFit:'cover', borderRadius:6, background:'#f1f5f9' }} onError={(e:any)=>{ e.currentTarget.style.display='none'; }} />);
              })()}
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', minWidth: 220 }}>
              <div style={{ fontWeight:700, fontSize:16 }}>{String(baseRow.make||'')}</div>
              <div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>{baseRow.ano || ''}</div>
              <div style={{ fontWeight:500, fontSize:15 }}>{String(baseRow.model||'')}</div>
              <div style={{ fontWeight:500, fontSize:14 }}>{normalizeVersion(String(baseRow.version||''))}</div>
            </td>
            {/* Fila base: sin deltas (es la referencia) */}
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600 }}>
              <div>{fmtMoney(baseRow.msrp)}</div>
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600 }}>
              <div>{fmtMoney(baseRow.precio_transaccion)}</div>
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600 }}>
              <div>{fmtMoney(baseRow.bono ?? baseRow.bono_mxn)}</div>
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600 }}>
              <div>{fmtMoney(baseRow.fuel_cost_60k_mxn)}</div>
              <div style={{ fontSize:12, opacity:0.75 }}>{propulsionLabel(baseRow)} {fuelPriceLabel(baseRow)}</div>
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600 }}>
              <div>{fmtMoney(baseRow.service_cost_60k_mxn)}</div>
              {(() => { const s = serviceSourceLabel(baseRow); return s? <div style={{ fontSize:12, color:'#64748b' }}>{s}</div> : null; })()}
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600 }}>
              <div>{fmtMoney(baseRow.tco_60k_mxn)}</div>
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600 }}>
              <div>{fmtMoney(cph(baseRow))}</div>
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600 }}>              <div>100%</div><div style={{ fontSize:11, color:'#64748b' }}>Base</div>
            </td>
                {/* Segmento base */}
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600, minWidth: 200 }}>
              <div>{segLabel(baseRow)}</div>
              {(() => {
                const y = Number(own.year || 2025);
                const mon = (()=>{
                  const lm = Number((baseRow as any)?.ventas_model_ytd_month ?? NaN);
                  if (Number.isFinite(lm)) return monthNameEs(lm);
                  const m = lastYtdMonth([baseRow], y); return m?monthNameEs(m):'';
                })();
                const u = (()=>{ const v = Number((baseRow as any)?.ventas_model_ytd ?? NaN); return Number.isFinite(v)?v:ytdUnits(baseRow, y) })();
                const share = (()=>{ const v = Number((baseRow as any)?.ventas_model_seg_share_pct ?? (baseRow as any)?.ventas_share_seg_pct ?? NaN); return Number.isFinite(v)?v:null; })();
                return (
                  <>
                    <div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>
                      {u!=null ? `${fmtNum(u)} u YTD${mon?` (${mon})`:''}` : ''}
                    </div>
                    {share!=null ? (<div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>{share.toFixed(1)}%</div>) : null}
                  </>
                );
              })()}
            </td>
          </tr>)}
          {comps.map((r: any, i: number) => {
            const dMsrp = r.__deltas?.msrp || r.__deltas?.msrp_mxn || null;
            const dTx   = r.__deltas?.precio_transaccion || null;
            const dB    = r.__deltas?.bono || r.__deltas?.bono_mxn || null;
            const dFuel = r.__deltas?.fuel_cost_60k_mxn || null;
            const dSvc  = r.__deltas?.service_cost_60k_mxn || null;
            const dTco  = r.__deltas?.tco_60k_mxn || null;
            const dCPH  = r.__deltas?.cost_per_hp_mxn || null;
            // Mostrar delta desde la perspectiva de nuestro vehículo (own - competitor)
            const inv = (d:any) => (d && typeof d.delta === 'number') ? -d.delta : null;
            const d_msrp = inv(dMsrp);
            const d_tx   = inv(dTx);
            const d_b    = inv(dB);
            const d_fuel = inv(dFuel);
            const d_svc  = inv(dSvc);
            const d_tco  = inv(dTco);
            const d_cph  = inv(dCPH);
            const rowBg = i % 2 === 0 ? '#ffffff' : '#fafafa';
            return (
              <tr key={i} style={{ background: rowBg, ...hoverStyle(i) }} onMouseEnter={()=>setHoverRow(i)} onMouseLeave={()=>setHoverRow(null)}>
                {/* Foto */}
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                  {(() => {
                    const src = String((r as any)?.images_default || (r as any)?.image_url || '');
                    if (!src) return null;
                    return (<img src={src} alt="foto" style={{ width:84, height:56, objectFit:'cover', borderRadius:6, background:'#f1f5f9' }} onError={(e:any)=>{ e.currentTarget.style.display='none'; }} />);
                  })()}
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', minWidth: 220 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{String(r.make||'')}</div>
                  <div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>{r.ano || ''}</div>
                  <div style={{ fontWeight:500, fontSize:13.5 }}>{String(r.model||'')}</div>
                  <div style={{ fontWeight:500, fontSize:12.5 }}>{normalizeVersion(String(r.version||''))}</div>
                </td>
                
                {/* Segmento al final: se renderiza más abajo */}
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                  <div>{fmtMoney(r.msrp)}</div>
                  <div style={{ fontSize:12, opacity:0.9, color: d_msrp!=null ? (d_msrp<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_msrp==null?'-':`${tri(d_msrp)} ${fmtMoney(Math.abs(d_msrp))}`}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                  <div>{fmtMoney(r.precio_transaccion)}</div>
                  <div style={{ fontSize:12, opacity:0.9, color: d_tx!=null ? (d_tx<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_tx==null?'-':`${tri(d_tx)} ${fmtMoney(Math.abs(d_tx))}`}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                  <div>{fmtMoney(r.bono ?? r.bono_mxn)}</div>
                  <div style={{ fontSize:12, opacity:0.9, color:'#64748b' }}>{d_b==null?'-':`${tri(d_b)} ${fmtMoney(Math.abs(d_b))}`}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                  <div>{fmtMoney(r.fuel_cost_60k_mxn)}</div>
                  <div style={{ fontSize:12, opacity:0.75 }}>{propulsionLabel(r)} {fuelPriceLabel(r)}</div>
                  <div style={{ fontSize:12, opacity:0.9, color: d_fuel!=null ? (d_fuel<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_fuel==null?'-':`${tri(d_fuel)} ${fmtMoney(Math.abs(d_fuel))}`}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                  <div>{fmtMoney(r.service_cost_60k_mxn)}</div>
                  {(() => { const s = serviceSourceLabel(r); return s? <div style={{ fontSize:12, color: s==='Incluido'? '#16a34a':'#64748b' }}>{s}</div> : null; })()}
                  <div style={{ fontSize:12, opacity:0.9, color: d_svc!=null ? (d_svc<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_svc==null?'-':`${tri(d_svc)} ${fmtMoney(Math.abs(d_svc))}`}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                  <div>{fmtMoney(r.tco_60k_mxn)}</div>
                  <div style={{ fontSize:12, opacity:0.9, color: d_tco!=null ? (d_tco<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_tco==null?'-':`${tri(d_tco)} ${fmtMoney(Math.abs(d_tco))}`}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                  <div>{fmtMoney(cph(r))}</div>
                  <div style={{ fontSize:12, opacity:0.9, color: d_cph!=null ? (d_cph<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_cph==null?'-':`${tri(d_cph)} ${fmtMoney(Math.abs(d_cph))}`}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                  {(() => {
                    const val = num((r as any)?.equip_over_under_pct);
                    const src = String((r as any)?.equip_over_under_source || '').toLowerCase();
                    const brk = Array.isArray((r as any)?.equip_over_under_breakdown) ? (r as any).equip_over_under_breakdown as any[] : [];
                    // Color del porcentaje: rojo si el competidor es mejor (>0), verde si nosotros mejor (<0)
                    const detailColor = (val==null)?'#64748b': (val>0?'#dc2626': (val<0?'#16a34a':'#334155'));
                    const label = src==='pillars' ? 'pilares' : (src==='score' ? 'score' : '');
                    const tip = brk.length ? brk.map((b:any)=> `${b.label}: ${b.delta_pct>0?'+':''}${Number(b.delta_pct).toFixed(1)}%`).join('\n') : (label?`Calculado por ${label}`:undefined);
                    const n = Number(val);
                    const phrase = (n==null || !Number.isFinite(n)) ? '-' : (n>0 ? 'Mejor que nosotros' : (n<0 ? 'Nosotros mejor' : 'Igual'));
                    const phraseColor = '#111827'; // frase en negro
                    const details = (n==null || !Number.isFinite(n)) ? '' : `${Math.abs(n).toFixed(0)}%${label?` (${label})`:''}`;
                    return (
                      <div title={tip}>
                        {details ? <div style={{ fontWeight:600, color: detailColor }}>{details}</div> : <div style={{ fontWeight:600, color:'#64748b' }}>-</div>}
                        <div style={{ fontSize:11, color: phraseColor }}>{phrase}</div>
                      </div>
                    );
                  })()}
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', minWidth: 200 }}>
                  <div>{segLabel(r)}</div>
                  {(() => {
                    const y = Number(own.year || 2025);
                    const mon = (()=>{
                      const lm = Number((r as any)?.ventas_model_ytd_month ?? NaN);
                      if (Number.isFinite(lm)) return monthNameEs(lm);
                      const rowsAll = [ ...(ownRow?[ownRow]:[]), ...comps ];
                      const m = lastYtdMonth(rowsAll, y); return m?monthNameEs(m):'';
                    })();
                    const u = (()=>{ const v = Number((r as any)?.ventas_model_ytd ?? NaN); return Number.isFinite(v)?v:ytdUnits(r, y) })();
                    const ub = (()=>{ const v = Number((baseRow as any)?.ventas_model_ytd ?? NaN); return Number.isFinite(v)?v:ytdUnits(baseRow, y) })();
                    const share = (()=>{ const v = Number((r as any)?.ventas_model_seg_share_pct ?? (r as any)?.ventas_share_seg_pct ?? NaN); return Number.isFinite(v)?v:null; })();
                    const d_units = (u!=null && ub!=null) ? (u - ub) : null;
                    return (
                      <>
                        <div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>
                          {u!=null ? `${fmtNum(u)} u YTD${mon?` (${mon})`:''}` : ''}
                        </div>
                        {share!=null ? (
                          <div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>{share.toFixed(1)}%</div>
                        ) : null}
                        <div style={{ fontSize:12, opacity:0.9, color: d_units!=null ? (d_units>0?'#16a34a':'#dc2626'):'#64748b' }}>
                          {d_units==null?'-':`${tri(d_units)} ${fmtNum(Math.abs(d_units))} u`}
                        </div>
                      </>
                    );
                  })()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Manual list rendered inside ManualBlock */}
      <div style={{ marginTop:16, display:'grid', gap:16 }}>
        {/* Diferencias de equipo vs base (lista simple) */}
        {(() => {
          if (!baseRow || !comps.length) return null;
          // Detecta si la base declara algún feature (para explicar vacíos)
          const truthy = (v:any) => {
            const s = String(v??'').trim().toLowerCase();
            if (s === '') return false;
            if (['true','1','si','sí','estandar','estándar','incluido','standard','std','present','x','y'].includes(s)) return true;
            const n = Number(v); return Number.isFinite(n) && n>0;
          };
          const featureKeys = [
            'alerta_colision','sensor_punto_ciego','tiene_camara_punto_ciego','camara_360','asistente_estac_frontal','asistente_estac_trasero',
            'control_frenado_curvas','llave_inteligente','tiene_pantalla_tactil','android_auto','apple_carplay','techo_corredizo',
            'apertura_remota_maletero','cierre_automatico_maletero','limpiaparabrisas_lluvia','rieles_techo','tercera_fila','enganche_remolque','preparacion_remolque'
          ];
          const baseHasAny = featureKeys.some(k => truthy((baseRow as any)?.[k]));
          return (
            <div style={{ border:'1px solid #e5e7eb', borderRadius:10 }}>
              <div style={{ padding:'8px 10px', borderBottom:'1px solid #e5e7eb', background:'#fafafa', fontWeight:600 }}>Equipo: diferencias vs base</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:12, padding:10 }}>
                {comps.map((r:any, idx:number) => {
                  const diffs = (r as any).__diffs || {};
                  const plus: string[] = Array.isArray(diffs.features_plus)? diffs.features_plus as string[] : [];
                  const minus: string[] = Array.isArray(diffs.features_minus)? diffs.features_minus as string[] : [];
                  const color = colorForVersion(r);
                  return (
                    <div key={idx} style={{ border:'1px solid #f1f5f9', borderRadius:8, padding:10 }}>
                      <div style={{ fontWeight:600, marginBottom:6, color:'#334155' }}>{vehLabel(r)}</div>
                      <div style={{ display:'flex', gap:12 }}>
                        <div style={{ flex:1 }}>
                          {/* Verde = Nosotros mejor: ellos NO tienen y nosotros SÍ (features_minus) */}
                          <div style={{ fontSize:12, color:'#16a34a', marginBottom:4 }}>Ellos no tienen (nosotros sí)</div>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                            {minus.length ? minus.map((p,i)=>(<span key={i} style={{ fontSize:11, background:'rgba(22,163,74,0.08)', color:'#166534', border:`1px solid rgba(22,163,74,0.25)`, borderRadius:6, padding:'2px 6px' }}>{p}</span>)) : (
                              baseHasAny ? <span style={{ fontSize:11, color:'#64748b' }}>—</span> : <span style={{ fontSize:11, color:'#64748b' }}>La base no declara equipamiento</span>
                            )}
                          </div>
                        </div>
                        <div style={{ flex:1 }}>
                          {/* Rojo = Ellos mejor: ellos SÍ tienen y nosotros NO (features_plus) */}
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
          );
        })()}

        {/* Acciones transversales (consolidadas sobre competidores seleccionados) */}
        {(() => {
          if (!baseRow || !comps.length) return null;
          const toNum = (x:any)=> { const v = Number(x); return Number.isFinite(v)? v : null; };
          const pillarKeys = [
            {key:'equip_p_adas', label:'ADAS'},
            {key:'equip_p_safety', label:'Seguridad'},
            {key:'equip_p_infotainment', label:'Info'},
            {key:'equip_p_comfort', label:'Confort'},
            {key:'equip_p_traction', label:'Tracción'},
            {key:'equip_p_utility', label:'Utilidad'},
          ];
          // 1) Gaps por pilar repetidos
          const gaps: Array<{label:string, count:number, avg:number}> = [];
          for (const pk of pillarKeys) {
            const b = toNum((baseRow as any)?.[pk.key]);
            if (b==null || b<=0) continue;
            let cnt=0, sum=0; 
            comps.forEach((r:any)=>{ const v=toNum((r as any)?.[pk.key]); if (v!=null && v>0 && v>b){ cnt++; sum += (v-b); }});
            if (cnt>0) gaps.push({ label: pk.label, count: cnt, avg: sum/cnt });
          }
          gaps.sort((a,b)=> b.count===a.count ? b.avg-a.avg : b.count-a.count);
          const topGaps = gaps.slice(0,3);
          const pillarToFeatures: Record<string,string[]> = {
            'ADAS': ['Frenado de emergencia','Punto ciego','Cámara 360'],
            'Seguridad': ['Control de estabilidad','Bolsas cortina'],
            'Info': ['Android Auto','Apple CarPlay','Pantalla táctil'],
            'Confort': ['Llave inteligente','Portón eléctrico'],
            'Tracción': ['Control de tracción'],
            'Utilidad': ['Rieles de techo','Enganche remolque'],
          };
          // 2) Features recurrentes (ellos sí / nosotros no)
          const freq: Record<string,number> = {};
          comps.forEach((r:any)=>{
            const plus: string[] = Array.isArray((r as any)?.__diffs?.features_plus) ? (r as any).__diffs.features_plus : [];
            plus.forEach((f)=>{ const k=String(f).trim(); if(!k) return; freq[k]=(freq[k]||0)+1; });
          });
          const topFeatures = Object.entries(freq).sort((a,b)=> b[1]-a[1]).slice(0,4);
          // 3) Precio transversal (mediana ΔTX cuando comp es más barato)
          const negatives: number[] = comps.map((r:any)=> toNum((r as any)?.__deltas?.precio_transaccion?.delta)).filter((v:any)=> typeof v==='number' && v<0) as number[];
          const pos: number[] = comps.map((r:any)=> toNum((r as any)?.__deltas?.precio_transaccion?.delta)).filter((v:any)=> typeof v==='number' && v>0) as number[];
          const median = (arr:number[]) => { const a=[...arr].sort((x,y)=>x-y); const n=a.length; if(!n) return 0; const m=Math.floor(n/2); return n%2? a[m] : (a[m-1]+a[m])/2; };
          const medNeg = Math.abs(Math.round(median(negatives))); // MXN que nos separa cuando quedamos arriba
          const shareNeg = (negatives.length / Math.max(1,comps.length));
          // 4) $/HP ventaja
          const cphBase = toNum((baseRow as any)?.cost_per_hp_mxn);
          let betterCphCount=0; let totalCph=0;
          if (cphBase!=null && cphBase>0){
            comps.forEach((r:any)=>{ const v=toNum((r as any)?.cost_per_hp_mxn); if(v!=null && v>0){ totalCph++; if (cphBase < v) betterCphCount++; }});
          }
          const bullets: string[] = [];
          // pricing
          if (shareNeg >= 0.5 && medNeg>0) bullets.push(`Bono transversal orientativo: $ ${Intl.NumberFormat('es-MX').format(medNeg)} (mediana del gap vs ${Math.round(shareNeg*100)}% de rivales)`);
          // pillars
          topGaps.forEach(g=> bullets.push(`Cerrar gap en ${g.label} (prom. +${Math.round(g.avg)} pts) • añadir ${ (pillarToFeatures[g.label]||[]).slice(0,2).join(', ') }`));
          // features recurrentes
          if (topFeatures.length) bullets.push(`Paquete rápido: ${topFeatures.map(([f,c])=> `${f} (${c})`).slice(0,3).join(' · ')}`);
          // value message
          if (totalCph>0 && betterCphCount/totalCph >= 0.6) bullets.push(`Mensajería: ventaja en $/HP frente a ${Math.round((betterCphCount/totalCph)*100)}% de competidores`);

          if (!bullets.length) return null;
          return (
            <div style={{ border:'1px solid #e5e7eb', borderRadius:10 }}>
              <div style={{ padding:'8px 10px', borderBottom:'1px solid #e5e7eb', background:'#fafafa', fontWeight:700 }}>Acciones transversales</div>
              <ul style={{ margin:'8px 0 10px 18px' }}>
                {bullets.map((b,i)=>(<li key={i} style={{ fontSize:13 }}>{b}</li>))}
              </ul>
            </div>
          );
        })()}
        {/* Fila 1: Score vs Precio (con tendencia) y MSRP vs HP (con líneas $/HP) */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {(() => {
            const hasScore = chartRows.some(r => Number((r as any)?.equip_score) > 0);
            if (!hasScore) {
              return (
                <div style={{ padding:'12px 10px', border:'1px dashed #e5e7eb', borderRadius:8, color:'#64748b' }}>
                  No hay datos de "score de equipo" para graficar. (campo equip_score)
                </div>
              );
            }
            return (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'0 4px 6px' }}>
                  <div style={{ fontSize:12, color:'#64748b' }}>Score de equipo vs precio</div>
                  <InfoIcon title={'Eje X: precio (TX si hay, si no MSRP). Eje Y: equip_score (0-100) basado en pilares de equipo. Sirve para ver “qué tanto equipo por peso” respecto a competidores.'} />
                </div>
                {EChart ? <EChart echarts={echarts} option={scoreVsPriceOption} opts={{ renderer: 'svg' }} style={{ height: 380 }} /> : null}
              </div>
            );
          })()}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'0 4px 6px' }}>
              <div style={{ fontSize:12, color:'#64748b' }}>MSRP vs HP (líneas de $/HP)</div>
              <InfoIcon title={'Eje X: caballos de fuerza. Eje Y: precio (MSRP y TX). Las líneas punteadas muestran isocostos $/HP para comparar eficiencia de precio por potencia.'} />
            </div>
            {EChart ? <EChart echarts={echarts} option={msrpVsHpWithLinesOption} opts={{ renderer: 'svg' }} style={{ height: 380 }} /> : null}
          </div>
        </div>
        {renderLegend()}
        {/* Fila 2: HP vs Precio y $/HP (detalle) y Waterfall ΔTX */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'0 4px 6px' }}>
              <div style={{ fontSize:12, color:'#64748b' }}>HP vs Precio</div>
              <InfoIcon title={'Relación potencia-precio para comparar tren motriz a mismo rango de precio. Círculo lleno = MSRP; contorno = Precio TX.'} />
            </div>
            {EChart ? <EChart echarts={echarts} option={hpVsPriceOption} opts={{ renderer: 'svg' }} style={{ height: 380 }} /> : null}
          </div>
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'0 4px 6px' }}>
              <div style={{ fontSize:12, color:'#64748b' }}>Waterfall Δ Precio TX</div>
              <InfoIcon title={'Diferencias de Precio TX vs la base. Barras hacia arriba: más caro; hacia abajo: más barato.'} />
            </div>
            {EChart ? <EChart echarts={echarts} option={txWaterfallOption} opts={{ renderer: 'svg' }} style={{ height: 380 }} /> : null}
          </div>
        </div>
        {renderLegend()}

        {/* Δ vs base: HP y Longitud (y aceleración si existe) */}
        <div style={{ display:'grid', gridTemplateColumns: hasDeltaAccel ? '1fr 1fr 1fr' : '1fr 1fr', gap:16 }}>
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'0 4px 6px' }}>
              <div style={{ fontSize:12, color:'#64748b' }}>Δ HP vs base</div>
              <InfoIcon title={'Diferencia de potencia respecto a la versión base (en caballos). Positivo = más potencia que la base.'} />
            </div>
            {EChart ? <EChart echarts={echarts} option={deltaHpOption} opts={{ renderer: 'svg' }} style={{ height: 300 }} /> : null}
          </div>
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'0 4px 6px' }}>
              <div style={{ fontSize:12, color:'#64748b' }}>Δ Longitud vs base</div>
              <InfoIcon title={'Diferencia de largo (mm) respecto a la base. Útil para medir huella dimensional.'} />
            </div>
            {EChart ? <EChart echarts={echarts} option={deltaLenOption} opts={{ renderer: 'svg' }} style={{ height: 300 }} /> : null}
          </div>
          {hasDeltaAccel ? (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'0 4px 6px' }}>
                <div style={{ fontSize:12, color:'#64748b' }}>Δ 0–100 km/h (s)</div>
                <InfoIcon title={'Diferencia en aceleración 0–100 km/h (segundos). Negativo = más rápido que la base.'} />
              </div>
              {EChart ? <EChart echarts={echarts} option={deltaAccelOption} opts={{ renderer: 'svg' }} style={{ height: 300 }} /> : null}
            </div>
          ) : null}
        </div>
        {renderLegend()}

        {(() => {
          // Huella superpuesta: ocultar si falta ancho en base o en todos los competidores
          const baseHas = Number.isFinite(Number((baseRow as any)?.ancho_mm));
          const anyCompHas = comps.some((r:any)=> Number.isFinite(Number((r as any)?.ancho_mm)));
          if (!baseHas || !anyCompHas) return null;
          return (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12, marginBottom:6 }}>
                <div style={{ fontSize:12, color:'#64748b' }}>Huella (ancho × largo)</div>
                <InfoIcon title={'Rectángulos representan ancho y largo de cada versión. La base aparece rellena; competidores en contorno.'} />
              </div>
              <div>{EChart ? <EChart echarts={echarts} option={footprintOption} opts={{ renderer: 'svg' }} style={{ height: 320 }} /> : null}</div>
              {renderLegend()}
            </>
          );
        })()}

        {(() => {
          // Perfil alto x largo: ocultar si falta altura en base o en todos los competidores
          const baseHas = Number.isFinite(Number((baseRow as any)?.altura_mm)) || Number.isFinite(Number((baseRow as any)?.alto_mm));
          const anyCompHas = comps.some((r:any)=> Number.isFinite(Number((r as any)?.altura_mm)) || Number.isFinite(Number((r as any)?.alto_mm)));
          if (!baseHas || !anyCompHas) return null;
          return (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12, marginBottom:6 }}>
                <div style={{ fontSize:12, color:'#64748b' }}>Perfil (alto × largo)</div>
                <InfoIcon title={'Rectángulos representan altura y largo de cada versión. La base aparece rellena; competidores en contorno.'} />
              </div>
              <div>{EChart ? <EChart echarts={echarts} option={profileOption} opts={{ renderer: 'svg' }} style={{ height: 320 }} /> : null}</div>
              {renderLegend()}
            </>
          );
        })()}

        {/* Diferencias de versión (mismo modelo) */}
        {renderVersionDiffs()}

        {(() => {
          // Perfil alto x largo (si hay altura)
          const ok = Number.isFinite(Number((baseRow as any)?.altura_mm)) || Number.isFinite(Number((baseRow as any)?.alto_mm));
          if (!ok) return null;
          return (
            <>
              <div style={{ marginTop:12 }}>{EChart ? <EChart echarts={echarts} option={profileOption} opts={{ renderer: 'svg' }} style={{ height: 320 }} /> : null}</div>
              {renderLegend()}
            </>
          );
        })()}

        {/* Tira de fotos de los vehículos (debajo de la tabla) */}
        <div style={{ marginTop:4, display:'flex', gap:12, flexWrap:'wrap', alignItems:'stretch' }}>
          {[...(baseRow?[baseRow]:[]), ...comps].map((r:any, idx:number) => {
            const src = String((r as any)?.images_default || (r as any)?.image_url || '');
            if (!src) return null;
            const color = colorForVersion(r);
            return (
              <div key={idx} style={{ width:180 }}>
                <div style={{ border:`2px solid ${color}`, borderRadius:8, overflow:'hidden', background:'#f8fafc' }}>
                  <img src={src} alt="foto" style={{ width:'100%', height:108, objectFit:'cover', display:'block' }} onError={(e:any)=>{ e.currentTarget.style.display='none'; }} />
                </div>
                <div style={{ marginTop:6, fontSize:12, color:'#334155', textAlign:'center' }}>{vehLabel(r)}</div>
              </div>
            );
          })}
        </div>
        {renderLegend()}

        {/* Línea: ventas mensuales 2025 (si hay datos) */}
        <div>
          {EChart ? <EChart echarts={echarts} option={salesLineOption} opts={{ renderer: 'svg' }} style={{ height: 340 }} /> : null}
        </div>
        {renderLegend()}

        {/* Gráficas por segmento (pilares principales) */}
        {(() => {
          if (!baseRow) return null;
          const seg = segmentMain(baseRow);
          const tops = bestPillarsForSegment(seg);
          if (!tops || tops.length === 0) return null;
          const opt1 = buildPillarVsPriceOption(tops[0].key, tops[0].label);
          const opt2 = tops[1] ? buildPillarVsPriceOption(tops[1].key, tops[1].label) : null;
          return (
            <>
              <div style={{ marginTop:12, display:'grid', gridTemplateColumns: tops[1] ? '1fr 1fr' : '1fr', gap:16 }}>
                <div>{EChart ? <EChart echarts={echarts} option={opt1} opts={{ renderer: 'svg' }} style={{ height: 360 }} /> : null}</div>
                {tops[1] ? <div>{EChart ? <EChart echarts={echarts} option={opt2 as any} opts={{ renderer: 'svg' }} style={{ height: 360 }} /> : null}</div> : null}
              </div>
              {renderLegend()}
            </>
          );
        })()}

        {/* Radar por segmento (pilares) */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:16 }}>
          {EChart ? <EChart echarts={echarts} option={radarPillarsOption} opts={{ renderer: 'svg' }} style={{ height: 360 }} /> : null}
        </div>
        {renderLegend()}

        {/* Precio — explicación (todos los competidores), colocado ANTES del bloque de insights */}
        {(!loading && priceExplainList && priceExplainList.length>0) && (
              <div style={{ marginTop:16, border:'1px solid #e5e7eb', borderRadius:10, padding:10 }}>
            <div style={{ fontWeight:700, marginBottom:2 }}>Precio — explicación</div>
            <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Ordenado por cercanía de precio (ΔTX). Priorizamos rivales con precio más cercano; en empates, primero apples‑to‑apples ✓ y luego menor ΔHP.</div>
            <div style={{ fontSize:12, color:'#475569', marginBottom:8 }}>Convención de signos: positivo = a favor del propio; negativo = a favor del competidor.</div>
            <div style={{ display:'grid', gap:10 }}>
              {(() => {
                // Orden: |ΔTX| asc, luego apples ✓ primero, luego |ΔHP| asc
                const ownTx = Number((compared?.own||ownRow||{} as any)?.precio_transaccion || (compared?.own||ownRow||{} as any)?.msrp || NaN);
                const ownHp = Number((compared?.own||ownRow||{} as any)?.caballos_fuerza || NaN);
                const arr = [...priceExplainList].map((x:any)=>{
                  const c = x?.comp || {};
                  const tx = Number(c?.precio_transaccion || c?.msrp || NaN);
                  const hp = Number(c?.caballos_fuerza || NaN);
                  const dhpSigned = (Number.isFinite(hp) && Number.isFinite(ownHp)) ? (hp - ownHp) : NaN;
                  const dtxSigned = (Number.isFinite(tx) && Number.isFinite(ownTx)) ? (tx - ownTx) : NaN;
                  const dhp = Number.isFinite(dhpSigned) ? Math.abs(dhpSigned) : Number.POSITIVE_INFINITY;
                  const dtx = Number.isFinite(dtxSigned) ? Math.abs(dtxSigned) : Number.POSITIVE_INFINITY;
                  const ok = !!(x?.explain?.apples_to_apples?.ok);
                  return { ...x, __dtx: dtx, __ok: ok, __dhp: dhp, __dtx_s: dtxSigned, __dhp_s: dhpSigned };
                }).sort((a:any,b:any)=>{
                  const d = (a.__dtx - b.__dtx);
                  if (d !== 0) return d;
                  if (a.__ok !== b.__ok) return (a.__ok? -1: 1);
                  return (a.__dhp - b.__dhp);
                });
                return arr.map((it:any, idx:number)=>{
                  const ex = it.explain||{}; const c = it.comp||{};
                  const name = `${c.make||''} ${c.model||''}${c.version?` – ${c.version}`:''}${c.ano?` (${c.ano})`:''}`;
                  const a2a = ex?.apples_to_apples||{}; const ok = !!a2a.ok;
                  const decomp = Array.isArray(ex?.decomposition)? ex.decomposition: [];
                  const bon = ex?.recommended_bonus?.mxn; const nota = Array.isArray(ex?.notas)? ex.notas.join(' • '): '';
                  const dtxS = it.__dtx_s; const dhpS = it.__dhp_s;
                  const fmtMoney = (v:number)=> Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(v);
                  const sign = (n:number)=> (n>0? '+': (n<0? '−':''));
                  return (
                    <div key={idx} style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:8 }}>
                      <div style={{ fontWeight:600, marginBottom:6 }}>{name}</div>
                      <div style={{ fontSize:12, marginBottom:6 }}>
                        <span style={{ padding:'2px 8px', borderRadius:999, background: ok? '#dcfce7':'#fee2e2', color: ok? '#166534':'#991b1b', fontWeight:700 }}>Apples‑to‑apples: {ok?'✓':'✕'}</span>
                        {(!ok && a2a?.motivos_no?.length)? <span style={{ marginLeft:8, color:'#64748b' }}>{a2a.motivos_no.join(' • ')}</span>: null}
                        {/* Badges ΔTX y ΔHP */}
                        {Number.isFinite(dtxS) ? (
                          <span style={{ marginLeft:8, padding:'2px 8px', borderRadius:999, background: (dtxS as number)<0? '#ecfdf5':'#fef2f2', color: (dtxS as number)<0? '#166534':'#991b1b', border:`1px solid ${(dtxS as number)<0? '#86efac':'#fecaca'}` }}>
                            ΔTX: {sign(dtxS as number)}{fmtMoney(Math.abs(dtxS as number))}
                          </span>
                        ) : null}
                        {Number.isFinite(dhpS) ? (
                          <span style={{ marginLeft:8, padding:'2px 8px', borderRadius:999, background:'#eff6ff', color:'#1e40af', border:'1px solid #bfdbfe' }}>
                            ΔHP: {sign(dhpS as number)}{Math.abs(dhpS as number)}
                          </span>
                        ) : null}
                      </div>
                  {decomp.length? (()=>{
                    // Calcular driver principal (una sola vez) y resaltarlo también en la lista
                    let topLabel: string | null = null; let topVal = 0;
                    try {
                      const drv = (decomp||[]).filter((d:any)=> typeof d?.monto==='number' && String(d?.componente||'').toLowerCase().indexOf('no explicada')===-1);
                      if (drv.length){
                        const best = drv.slice().sort((a:any,b:any)=> Math.abs(b.monto)-Math.abs(a.monto))[0];
                        topLabel = String(best?.componente||'');
                        topVal = Number(best?.monto||0);
                      }
                    } catch {}
                    return (
                      <>
                        <ul style={{ margin:'0 0 6px 18px' }}>
                          {decomp.map((d:any,i:number)=> {
                            const comp = String(d?.componente||'');
                            const amt = (typeof d?.monto==='number') ? Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(d.monto) : 'N/D';
                            const tip = d?.explicacion ? String(d.explicacion) : '';
                            const isTop = (topLabel && comp === topLabel);
                            const isGap = comp.toLowerCase().includes('no explicada');
                            const hint = isGap ? ' (no explicada)' : '';
                            return (
                              <li key={i} style={{ fontSize:13, fontWeight: isTop? 700: 400 }}>
                                {isTop? '★ ': ''}{comp}{hint}: {amt}{isTop? ' (principal)': ''}
                                {tip? <span style={{ marginLeft:6, verticalAlign:'middle' }}><InfoIcon title={tip} /></span> : null}
                              </li>
                            );
                          })}
                        </ul>
                        {topLabel ? (
                          <div style={{ fontSize:12, color:'#334155', marginTop:4 }}>
                            Driver principal: <strong>{topLabel}</strong> ({topVal>0? '+': (topVal<0? '−':'')}{Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Math.abs(topVal))})
                          </div>
                        ) : null}
                      </>
                    );
                  })() : <div style={{ color:'#64748b', fontSize:13 }}>{ex?.error ? `Error al calcular: ${String(ex.error)}` : 'Sin descomposición disponible'}</div>}
                      <div style={{ fontSize:13, color:'#334155' }}>{(bon>0)? `Bono sugerido: ${Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(bon)}`: 'Sin bono sugerido'}</div>
                      {nota? <div style={{ fontSize:12, color:'#64748b' }}>{nota}</div>: null}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Insights (IA) debajo del radar */}
        <div style={{ marginTop:16, border:'1px solid #e5e7eb', borderRadius:10 }}>
          <div style={{ padding:'8px 10px', borderBottom:'1px solid #e5e7eb', background:'#fafafa', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontWeight:700 }}>Insights (IA)</div>
            <div className="no-print" style={{ display:'flex', gap:8 }}>
              <button
                onClick={async()=>{
                  setLoading(true);
                  setPriceExplainList([]);
                  try{
                    const body = { own: (compared?.own || ownRow || {}), competitors: comps, prompt_lang: 'es' } as any;
                    const top = comps;
                    const ownForExplain = (compared?.own || ownRow || {}) as any;
                    // Lanzar cálculo de explicación de precio en paralelo
                    const explPromise = Promise.all((top||[]).map(async (c:any) => {
                      try {
                        const ex = await endpoints.priceExplain({ own: ownForExplain, comp: c, use_regression: true, use_heuristics: true });
                        return { comp: c, explain: ex };
                      } catch (e:any) {
                        return { comp: c, explain: { error: String(e?.message||e) } };
                      }
                    }));
                    // Intentar insights (si falla, seguimos con explicaciones)
                    let r: any = null;
                    try {
                      r = await endpoints.insights(body);
                    } catch(e:any) {
                      r = { ok: false, error: String(e?.message||e), insights: String(e?.message||e) };
                    }
                    const expls = await explPromise;
                    setPriceExplainList(expls);
                    const ok = r?.ok !== false;
                    setInsights(r?.insights || r?.error || '');
                    setInsightsObj(r?.insights_json || null);
                    setInsightsStruct(ok ? (r?.insights_struct || null) : null);
                  } finally {
                    setLoading(false);
                  }
                }}
                style={{ padding:'8px 12px', background:'#111827', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}
              >Generar insights</button>
              <button onClick={()=>{ try{ window.print(); }catch{} }} style={{ padding:'8px 12px', background:'#374151', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}>Exportar PDF</button>
            </div>
          </div>
          <div style={{ padding:10 }}>
            {loading ? <div style={{ color:'#64748b', fontSize:13 }}>Generando…</div> : (
              insightsStruct ? renderStruct(insightsStruct, lang || 'es') :
              (insightsObj ? renderInsightsObj(insightsObj) : (insights ? renderInsights(insights) : <div style={{ color:'#64748b', fontSize:13 }}>Pulsa “Generar insights” para obtener recomendaciones.</div>))
            )}
        </div>
      </div>

      </div>
    </section>
    {/* Integración del porqué del precio se renderiza dentro del bloque de Insights */}
    </>
  );
}

// Render helper: intenta parsear JSON y mostrar secciones en orden; si falla, muestra texto plano
function renderInsights(raw: string) {
  try {
    const obj = JSON.parse(raw as any);
    const header = (s:string) => (<div style={{ fontWeight:700, marginTop:8 }}>{s}</div>);
    const list = (arr:any[]) => (<ul style={{ margin:'4px 0 8px 18px' }}>{(arr||[]).map((x:any,i:number)=>(<li key={i} style={{ fontSize:13 }}>{String(x)}</li>))}</ul>);
    return (
      <div style={{ fontSize:13 }}>
        {obj.introduccion ? (<div style={{ marginBottom:6 }}>{obj.introduccion}</div>) : null}
        {obj.resumen_base ? (<>{header('Resumen del vehículo')}{<div>{obj.resumen_base.resumen}</div>}</>) : null}
        {obj.precio_posicionamiento ? (<>{header('Precio y posicionamiento')}{list(obj.precio_posicionamiento.hallazgos)}{obj.precio_posicionamiento.acciones?.length? (<div><em>Acciones</em>{list(obj.precio_posicionamiento.acciones)}</div>):null}</>) : null}
        {obj.tco_costos ? (<>{header('Costos y TCO 60k')}{list(obj.tco_costos.hallazgos)}{obj.tco_costos.acciones?.length? (<div><em>Acciones</em>{list(obj.tco_costos.acciones)}</div>):null}</>) : null}
        {obj.equipamiento_deltas ? (<>{header('Equipamiento — diferencias')}<div><strong>Ellos sí (nosotros no):</strong>{list(obj.equipamiento_deltas.ellos_tienen)}</div><div><strong>Ellos no (nosotros sí):</strong>{list(obj.equipamiento_deltas.nosotros_tenemos)}</div>{obj.equipamiento_deltas.must_haves?.length? (<div><em>Must‑haves</em>{list(obj.equipamiento_deltas.must_haves)}</div>):null}</>) : null}
        {obj.pilares_segmento ? (<>{header('Pilares por segmento')}{list(obj.pilares_segmento.radar)}{list(obj.pilares_segmento.precio_vs_pilares)}</>) : null}
        {obj.ventas ? (<>{header('Ventas')}{obj.ventas.ytd? <div>{obj.ventas.ytd}</div>:null}{list(obj.ventas.mensual)}{obj.ventas.forecast?.length? (<div><em>Forecast</em>{list(obj.ventas.forecast)}</div>):null}</>) : null}
        {obj.recomendaciones?.length ? (<>{header('Recomendaciones')}{list(obj.recomendaciones)}</>) : null}
        {obj.riesgos?.length ? (<>{header('Riesgos')}{list(obj.riesgos)}</>) : null}
        {obj.siguientes_pasos?.length ? (<>{header('Siguientes pasos')}{list(obj.siguientes_pasos)}</>) : null}
      </div>
    );
  } catch {
    return (<pre style={{ whiteSpace:'pre-wrap', fontSize:13 }}>{raw}</pre>);
  }
}

// Render helper para objeto ya-parsed (insights_json)
function renderInsightsObj(obj: any) {
  try {
    const header = (s:string) => (<div style={{ fontWeight:700, marginTop:8 }}>{s}</div>);
    const list = (arr:any[]) => (<ul style={{ margin:'4px 0 8px 18px' }}>{(arr||[]).map((x:any,i:number)=>(<li key={i} style={{ fontSize:13 }}>{String(x)}</li>))}</ul>);
    return (
      <div style={{ fontSize:13 }}>
        {obj.introduccion ? (<div style={{ marginBottom:6 }}>{obj.introduccion}</div>) : null}
        {obj.resumen_base ? (<>{header('Resumen del vehículo')}{<div>{obj.resumen_base.resumen}</div>}</>) : null}
        {obj.precio_posicionamiento ? (<>{header('Precio y posicionamiento')}{list(obj.precio_posicionamiento.hallazgos)}{obj.precio_posicionamiento.acciones?.length? (<div><em>Acciones</em>{list(obj.precio_posicionamiento.acciones)}</div>):null}</>) : null}
        {obj.tco_costos ? (<>{header('Costos y TCO 60k')}{list(obj.tco_costos.hallazgos)}{obj.tco_costos.acciones?.length? (<div><em>Acciones</em>{list(obj.tco_costos.acciones)}</div>):null}</>) : null}
        {obj.equipamiento_deltas ? (<>{header('Equipamiento — diferencias')}<div><strong>Ellos sí (nosotros no):</strong>{list(obj.equipamiento_deltas.ellos_tienen)}</div><div><strong>Ellos no (nosotros sí):</strong>{list(obj.equipamiento_deltas.nosotros_tenemos)}</div>{obj.equipamiento_deltas.must_haves?.length? (<div><em>Must‑haves</em>{list(obj.equipamiento_deltas.must_haves)}</div>):null}</>) : null}
        {obj.pilares_segmento ? (<>{header('Pilares por segmento')}{list(obj.pilares_segmento.radar)}{list(obj.pilares_segmento.precio_vs_pilares)}</>) : null}
        {obj.ventas ? (<>{header('Ventas')}{obj.ventas.ytd? <div>{obj.ventas.ytd}</div>:null}{list(obj.ventas.mensual)}{obj.ventas.forecast?.length? (<div><em>Forecast</em>{list(obj.ventas.forecast)}</div>):null}</>) : null}
        {obj.recomendaciones?.length ? (<>{header('Recomendaciones')}{list(obj.recomendaciones)}</>) : null}
        {obj.riesgos?.length ? (<>{header('Riesgos')}{list(obj.riesgos)}</>) : null}
        {obj.siguientes_pasos?.length ? (<>{header('Siguientes pasos')}{list(obj.siguientes_pasos)}</>) : null}
      </div>
    );
  } catch {
    return (<pre style={{ whiteSpace:'pre-wrap', fontSize:13 }}>{JSON.stringify(obj, null, 2)}</pre>);
  }
}
