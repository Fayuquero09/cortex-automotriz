"use client";
import React from 'react';
import dynamic from 'next/dynamic';
import * as echarts from 'echarts';
const EChart = dynamic(() => import('echarts-for-react'), { ssr: false });
import useSWR from 'swr';
import { useAppState } from '@/lib/state';
import { endpoints } from '@/lib/api';

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
            onClick={()=>setBrandAlpha(ch==='Todos'?'':ch)}
            style={{ border:'1px solid #e5e7eb', background: (brandAlpha===ch || (ch==='Todos' && brandAlpha==='')) ? '#eef2ff':'#fff', padding:'2px 6px', borderRadius:6, cursor:'pointer', fontSize:12 }}>
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

function num(x: any): number | null { const v = Number(x); return Number.isFinite(v) ? v : null; }

export default function ComparePanel() {
  const { own, filters, autoGenSeq } = useAppState();
  const ready = !!own.model && !!own.make && !!own.year;
  const { data: cfg } = useSWR<any>('cfg', () => endpoints.config());
  const fuelPrices = cfg?.fuel_prices || {};
  const [hoverRow, setHoverRow] = React.useState<number | null>(null);
  const hoverStyle = (idx: number) => (hoverRow === idx ? { background:'#f8fafc' } : {});

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
    // solo mostrar cuando hay query o una letra seleccionada
    if (q.length >= 1) {
      const nq = norm(q);
      return brandSource.filter(b => norm(String(b)).includes(nq)).slice(0, 24);
    }
    if (brandAlpha) {
      return brandSource.filter(b => String(b).toUpperCase().startsWith(brandAlpha)).slice(0, 48);
    }
    return [];
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
  const comps = (compared?.competitors || []).map((c: any) => ({ ...c.item, __deltas: c.deltas || {} }));
  const headers = [
    { key: 'foto', label: '' },
    { key: 'vehiculo', label: 'Vehículo' },
    { key: 'msrp', label: 'MSRP' },
    { key: 'precio_transaccion', label: 'Precio tx' },
    { key: 'bono', label: 'Bono' },
    { key: 'fuel_cost_60k_mxn', label: 'Comb/Energ 60k' },
    { key: 'service_cost_60k_mxn', label: 'Servicio 60k' },
    { key: 'tco_60k_mxn', label: 'TCO 60k' },
    { key: 'cost_per_hp_mxn', label: 'Precio/HP' },
    { key: 'equip_match_pct', label: 'Match equipo' },
    { key: 'segmento', label: 'Segmento' },
  ];

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

  function fmtMoney(v: any) { const n = num(v); return n==null?'-':Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n); }
  function fmtNum(v: any) { const n = num(v); return n==null?'-':Intl.NumberFormat().format(n); }
  function fmtPct(v: any) { const n = num(v); return n==null?'-':`${Number(n).toFixed(0)}%`; }
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
    const raw = String(row?.segmento_ventas || row?.body_style || '').toString().trim();
    const s = raw.toLowerCase();
    if (!s) return '-';
    if (s.includes('todo terreno') || s.includes('suv') || s.includes('crossover')) return "SUV'S";
    if (s.includes('pick') || s.includes('cab')) return 'Pickup';
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
  // Etiqueta consistente para todas las gráficas
  function vehLabel(r: any): string {
    const mk = String(r.make || '').trim();
    const md = String(r.model || '').trim();
    const vr = String(r.version || '').trim();
    const yr = r.ano || r.year || '';
    return `${mk} ${md}${vr?` – ${vr}`:''}${yr?` (${yr})`:''}`.trim();
  }
  // Etiqueta corta para el punto (sólo versión + año ‘25)
  function versionShortLabel(r: any): string {
    const vr = String(r?.version || '').trim();
    const yr = r?.ano || r?.year || '';
    const yy = yr ? String(yr).slice(-2) : '';
    return vr ? (yy ? `${vr} ’${yy}` : vr) : (yy ? `’${yy}` : '');
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
    const monthlyTotals: number[] = new Array(12).fill(0);
    rows.forEach((r:any, idx:number) => {
      const name = vehLabel(r);
      const color = colorForVersion(r);
      const vals: (number|null)[] = [];
      for (let m=1;m<=12;m++) {
        const k = `ventas_2025_${String(m).padStart(2,'0')}`;
        const v = Number((r as any)?.[k] ?? NaN);
        const num = Number.isFinite(v) ? v : null;
        vals.push(num);
        if (Number.isFinite(v)) monthlyTotals[m-1]+=v;
      }
      if (vals.some(v=> (v??0)>0)) {
        series.push({ type:'line', name, data: vals, smooth: true, showSymbol: false, itemStyle:{ color }, lineStyle:{ color, width: (idx===0?3:2) } });
      }
    });
    if (!series.length) return {} as any;
    return {
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
    } as any;
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
    const baseVals = toVals(baseRow);
    const seriesData: any[] = [];
    seriesData.push({
      value: baseVals,
      name: vehLabel(baseRow),
      areaStyle: { color: 'rgba(30,58,138,0.15)' },
      lineStyle: { color: '#1e3a8a', width: 2 },
      symbol: 'none'
    });
    comps.forEach((r:any) => {
      const vals = toVals(r);
      const color = colorForVersion(r);
      seriesData.push({ value: vals, name: vehLabel(r), areaStyle: { color: 'rgba(0,0,0,0.02)' }, lineStyle: { color, width: 1.5, opacity: 0.85 }, symbol: 'none' });
    });
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
    return {
      title: { text: 'Δ HP vs base', left: 'center', top: 6 },
      grid: { left: 60, right: 20, top: 40, bottom: 40, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p:any)=> {
        const it = Array.isArray(p) ? p[0] : p;
        return `${it.name}<br/>Δ HP: ${it.value>0?'+':''}${it.value}`;
      }},
      xAxis: { type: 'category', data: items.map(i=> i.name), axisLabel: { interval: 0, rotate: 30 } },
      yAxis: { type: 'value', name: 'HP', min: (v:any)=> v.min*1.05, max: (v:any)=> v.max*1.05 },
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
          label: { show: true, position: 'top', formatter: (p:any)=> (p?.data?.base ? (p?.data?.labelStr || p?.data?.name || '') : '') },
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

  // Waterfall ΔTX simple (HP + Equip + Residual)
  const txWaterfallOption = React.useMemo(() => {
    if (!baseRow) return {};
    const baseTx = Number(baseRow?.precio_transaccion ?? NaN);
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
      const tx = Number(r?.precio_transaccion ?? NaN);
      return [s, tx];
    }).filter(([s,t])=>Number.isFinite(s)&&Number.isFinite(t));
    const reg = (()=>{
      if (pairs.length<2) return {a:0,b:0};
      const n=pairs.length; let sx=0,sy=0,sxy=0,sxx=0; for(const [x,y] of pairs){sx+=x;sy+=y;sxy+=x*y;sxx+=x*x;}
      const denom = (n*sxx - sx*sx) || 1; const b=(n*sxy - sx*sy)/denom; const a=(sy - b*sx)/n; return {a,b};
    })();
    const barsByComp = comps.slice(0,5).map((r:any)=>{
      const tx = Number(r?.precio_transaccion ?? NaN);
      const hp = Number(r?.caballos_fuerza ?? NaN);
      const score = Number((r as any)?.equip_score ?? NaN);
      if (!Number.isFinite(tx) || !Number.isFinite(baseTx)) return null;
      const dtx = tx - baseTx;
      const dHp = (Number.isFinite(hp)&&Number.isFinite(baseHp)) ? (hp - baseHp)*refCph : 0;
      const dEq = (Number.isFinite(score)&&Number.isFinite(baseScore)) ? reg.b*(score - baseScore) : 0;
      const resid = dtx - (dHp + dEq);
      return { name: `${r.make||''} ${r.model||''}`.trim(), items: [dHp, dEq, resid], total: dtx };
    }).filter(Boolean) as any[];
    // ECharts waterfall emulado: barras apiladas con baseline acumulativo
    const categories = barsByComp.map((b:any)=>b.name);
    const seriesNames = ['HP','Equipo','Residual'];
    const stackSeries = seriesNames.map((sn, idx)=>({
      name: sn,
      type: 'bar', stack: 's',
      data: barsByComp.map((b:any)=>b.items[idx]),
      label: { show: true, position: 'inside', formatter: (p:any)=> (p.value? (p.value>0?'+':'')+Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(p.value):'') }
    }));
    return {
      title: { text: 'Gap de precio (TX) — Waterfall', left: 'center', top: 6 },
      grid: { left: 80, right: 80, top: 70, bottom: 70, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: seriesNames, bottom: 0, left: 'center' },
      xAxis: { type: 'category', data: categories, axisLabel: { interval: 0, rotate: 15 } },
      yAxis: { name: 'ΔTX (MXN)', type: 'value' },
      series: stackSeries
    } as any;
  }, [chartRows, comps, baseRow]);

  return (
    <section style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff', overflowX:'auto' }}>
      <div style={{ fontWeight:700, marginBottom:8 }}>Comparar versiones</div>
      <div style={{ marginBottom:10, color:'#64748b', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        {ownRow ? (
          <span>Base: <strong>{String(ownRow.make||'')} {String(ownRow.model||'')} {ownRow.ano||''} {ownRow.version?`– ${ownRow.version}`:''}</strong></span>
        ) : <span>Base: —</span>}
        <span style={{ fontSize:12 }}>k = {k}</span>
        <span style={{ opacity:0.8 }}>
          Filtros: {filters.includeSameBrand?'Incluye misma marca':'Sin misma marca'} • {filters.sameSegment?'Mismo segmento':'Cualquier segmento'} • {filters.samePropulsion?'Misma propulsión':'Cualquier propulsión'}
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
      <table style={{ width:'100%', minWidth: 1200, borderCollapse:'collapse' }}>
        <thead>
          <tr>
            {headers.map(h => (<th key={h.key} style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e5e7eb' }}>{h.label}</th>))}
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
              <div style={{ fontWeight:500, fontSize:14 }}>{String(baseRow.version||'')}</div>
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
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600 }}>
              <div>{fmtMoney(baseRow.tco_60k_mxn)}</div>
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600 }}>
              <div>{fmtMoney(cph(baseRow))}</div>
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600 }}>
              <div>100%</div>
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
                  <div style={{ fontWeight:500, fontSize:12.5 }}>{String(r.version||'')}</div>
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
                  <div style={{ fontWeight:600, color: (r.equip_match_pct!=null ? (r.equip_match_pct>=80?'#16a34a':(r.equip_match_pct>=60?'#334155':'#dc2626')):'#64748b') }}>{fmtPct(r.equip_match_pct)}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', minWidth: 160 }}>
                  <div>{segLabel(r)}</div>
                  <div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>
                    {(() => { const u = (r.ventas_ytd_2025!=null?r.ventas_ytd_2025:r.ventas_unidades); return u!=null?`${fmtNum(u)} u YTD`:''; })()}
                    {r.ventas_share_seg_pct!=null?` • ${Number(r.ventas_share_seg_pct).toFixed(1)}% YTD`:''}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Manual list rendered inside ManualBlock */}
      <div style={{ marginTop:16, display:'grid', gap:16 }}>
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
                {EChart ? <EChart echarts={echarts} option={scoreVsPriceOption} style={{ height: 380 }} /> : null}
              </div>
            );
          })()}
          <div>
            {EChart ? <EChart echarts={echarts} option={msrpVsHpWithLinesOption} style={{ height: 380 }} /> : null}
          </div>
        </div>
        {renderLegend()}
        {/* Fila 2: HP vs Precio y $/HP (detalle) y Waterfall ΔTX */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            {EChart ? <EChart echarts={echarts} option={hpVsPriceOption} style={{ height: 380 }} /> : null}
          </div>
          <div>
            {EChart ? <EChart echarts={echarts} option={txWaterfallOption} style={{ height: 380 }} /> : null}
          </div>
        </div>
        {renderLegend()}

        {/* Δ vs base: HP y Longitud (y aceleración si existe) */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
          <div>{EChart ? <EChart echarts={echarts} option={deltaHpOption} style={{ height: 300 }} /> : null}</div>
          <div>{EChart ? <EChart echarts={echarts} option={deltaLenOption} style={{ height: 300 }} /> : null}</div>
          <div>{EChart ? <EChart echarts={echarts} option={deltaAccelOption} style={{ height: 300 }} /> : null}</div>
        </div>
        {renderLegend()}

        {(() => {
          // Huella superpuesta (si hay ancho_mm)
          const ok = Number.isFinite(Number((baseRow as any)?.ancho_mm));
          if (!ok) return null;
          return (
            <>
              <div style={{ marginTop:12 }}>{EChart ? <EChart echarts={echarts} option={footprintOption} style={{ height: 320 }} /> : null}</div>
              {renderLegend()}
            </>
          );
        })()}

        {(() => {
          // Perfil alto x largo (si hay altura)
          const ok = Number.isFinite(Number((baseRow as any)?.altura_mm)) || Number.isFinite(Number((baseRow as any)?.alto_mm));
          if (!ok) return null;
          return (
            <>
              <div style={{ marginTop:12 }}>{EChart ? <EChart echarts={echarts} option={profileOption} style={{ height: 320 }} /> : null}</div>
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
              <div style={{ marginTop:12 }}>{EChart ? <EChart echarts={echarts} option={profileOption} style={{ height: 320 }} /> : null}</div>
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
          {EChart ? <EChart echarts={echarts} option={salesLineOption} style={{ height: 340 }} /> : null}
        </div>
        {renderLegend()}

        {/* Gráficas por segmento (pilares principales) */}
        {(() => {
          if (!baseRow) return null;
          const seg = segmentMain(baseRow);
          const tops = topPillarsForSegment(seg);
          const opt1 = buildPillarVsPriceOption(tops[0].key, tops[0].label);
          const opt2 = buildPillarVsPriceOption(tops[1].key, tops[1].label);
          return (
            <>
              <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                <div>{EChart ? <EChart echarts={echarts} option={opt1} style={{ height: 360 }} /> : null}</div>
                <div>{EChart ? <EChart echarts={echarts} option={opt2} style={{ height: 360 }} /> : null}</div>
              </div>
              {renderLegend()}
            </>
          );
        })()}

        {/* Radar por segmento (pilares) */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:16 }}>
          {EChart ? <EChart echarts={echarts} option={radarPillarsOption} style={{ height: 360 }} /> : null}
        </div>
        {renderLegend()}

        
      </div>
    </section>
  );
}
