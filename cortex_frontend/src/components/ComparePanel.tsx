"use client";
import React from 'react';
import dynamic from 'next/dynamic';
import * as echarts from 'echarts';
const EChart = dynamic(() => import('echarts-for-react'), { ssr: false });
import useSWR from 'swr';

import { useAppState } from '@/lib/state';
import { useI18n } from '@/lib/i18n';
import { endpoints } from '@/lib/api';
import { brandLabel, vehicleLabel, fuelCategory } from '@/lib/vehicleLabels';
import { AdvantageMode, AdvantageSection, buildAdvantageOption, computeAdvantageSections } from '@/lib/advantage';
import { energyConsumptionLabel, isElectric, kmlFromRow, kwhPer100FromRow, parseNumberLike } from '@/lib/consumption';
import { VehicleThumb } from '@/components/VehicleThumb';
import { renderStruct } from '@/lib/insightsTemplates';

type Row = Record<string, any>;

const THUMB_WIDTH = 116;
const THUMB_HEIGHT = 72;

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
          suppressHydrationWarning
        />
        <button
          type="button"
          suppressHydrationWarning
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
            type="button"
            suppressHydrationWarning
            onClick={()=>setBrandAlpha(ch==='Todos'?'*':ch)}
            style={{ border:'1px solid #e5e7eb', background: (brandAlpha===ch || (ch==='Todos' && brandAlpha==='*')) ? '#eef2ff':'#fff', padding:'2px 6px', borderRadius:6, cursor:'pointer', fontSize:12 }}>
            {ch}
          </button>
        ))}
      </div>
      {brandSugg.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:4 }}>
          {brandSugg.map((b: string) => (
            <button key={b} type="button" suppressHydrationWarning tabIndex={-1} onClick={()=>setManMake(b)} style={{ border:'1px solid #e5e7eb', background:'#fff', padding:'2px 6px', borderRadius:6, cursor:'pointer' }}>{b}</button>
          ))}
        </div>
      )}
      {/* Modelos de la marca seleccionada */}
      {manMake && (modelsForMake || []).length > 0 && !manModel && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
          {(modelsForMake || []).slice(0, 80).map((m: string) => (
            <button key={m} type="button" suppressHydrationWarning tabIndex={-1} onClick={()=>setManModel(m)} style={{ border:'1px solid #e5e7eb', background:'#fff', padding:'2px 6px', borderRadius:6, cursor:'pointer' }}>{m}</button>
          ))}
        </div>
      )}
      {/* Sugerencias por texto (si escribe) */}
      {modelSugg.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
          {modelSugg.map((s: string) => (
            <button key={s} type="button" suppressHydrationWarning tabIndex={-1} onClick={()=>setManModel(s)} style={{ border:'1px solid #e5e7eb', background:'#fff', padding:'2px 6px', borderRadius:6, cursor:'pointer' }}>{s}</button>
          ))}
        </div>
      )}
      {(() => { const q = manModel.trim(); return (list && list.length>0 && q.length>=2); })() && (
        <div style={{ display:'grid', gap:4, marginBottom:6 }}>
          {list.map((r: any, idx: number) => (
            <button key={idx} type="button" suppressHydrationWarning tabIndex={-1} onMouseDown={(ev)=>{ ev.preventDefault(); addManual(undefined, r); }} onClick={(ev)=>ev.preventDefault()} title="Agregar" style={{ textAlign:'left', border:'1px solid #e5e7eb', background:(idx===hi?'#eef2ff':'#f8fafc'), padding:'6px 8px', borderRadius:8, cursor:'pointer' }}>
              {vehicleLabel(r)}
            </button>
          ))}
        </div>
      )}
      {manVersions.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:6 }}>
          {manVersions.map((v: string) => (
            <button key={v} type="button" suppressHydrationWarning onClick={()=>addManual(v)} style={{ border:'1px solid #e5e7eb', background:'#f8fafc', padding:'4px 8px', borderRadius:14, cursor:'pointer' }}>{v}</button>
          ))}
        </div>
      )}
      {manual.length > 0 && (
        <div style={{ marginTop:4, color:'#64748b' }}>Manuales: {manual.map((m: any,i: number)=> (
          <span key={i} style={{ marginRight:8 }}>
            {vehicleLabel(m)} <button type="button" suppressHydrationWarning onClick={()=>removeManual(i)} title="Quitar">×</button>
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

const FALSE_STRINGS = new Set([
  '0','false','no','none','n/a','na','-','null','no disponible','ninguno','sin dato','sin datos'
]);
const TRUE_STRINGS = new Set([
  'true','1','si','sí','estandar','estándar','incluido','standard','std','present','x','y','yes','serie','incluida','incluido'
]);

function normalizeBoolean(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.some(normalizeBoolean);
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  const str = String(value).trim().toLowerCase();
  if (!str) return false;
  if (FALSE_STRINGS.has(str)) return false;
  if (TRUE_STRINGS.has(str)) return true;
  const numeric = Number(str);
  if (Number.isFinite(numeric)) return numeric > 0;
  return true;
}

function textIncludes(value: any, token: string): boolean {
  if (value == null) return false;
  const str = String(value).toLowerCase();
  return str.includes(token.toLowerCase());
}

function augmentFeatureFlags(row: any): void {
  if (!row || typeof row !== 'object') return;
  const has = (...keys: string[]) => keys.some((key) => normalizeBoolean(row?.[key]));
  const fromText = (key: string, token: string) => textIncludes(row?.[key], token);
  const assign = (key: string, value: boolean) => {
    if (value) row[key] = true;
    else if (key in row) delete row[key];
  };

  assign('feature_aeb', has('adas_aeb', 'alerta_colision', 'alerta_colision_original'));
  assign('feature_hill_assist', has('adas_hill_assist'));
  assign('feature_lane_keep', has('adas_lane_mode', 'adas_lka', 'asistente_mantenimiento_carril') || fromText('header_description', 'lane') || fromText('header_description', 'carril'));
  assign('feature_blind_spot', has('adas_blind_spot', 'sensor_punto_ciego', 'sensor_punto_ciego_original', 'tiene_camara_punto_ciego'));
  assign('feature_acc', has('control_crucero_adaptativo', 'crucero_adaptativo') || fromText('control_crucero_original', 'adapt'));
  assign('feature_cam_360', has('adas_360_camera', 'camara_360'));
  assign('feature_rain_sensor', has('limpiaparabrisas_lluvia', 'sensor_lluvia', 'exterior_rain_sensing_wipers'));
  assign('feature_park_sensors_front', has('adas_front_parking_sensors', 'asistente_estac_frontal', 'comfort_parking_sensors', 'comfort_parking_assist_auto'));
  assign('feature_park_sensors_rear', has('adas_rear_parking_sensors', 'asistente_estac_trasero', 'comfort_parking_sensors', 'comfort_parking_assist_auto'));
  assign('feature_park_sensors_side', has('adas_side_parking_sensors', 'comfort_parking_space_info'));
  assign('feature_power_tailgate', has('cierre_automatico_maletero', 'comfort_power_tailgate'));
  assign('feature_auto_door_close', has('comfort_auto_door_close'));
  assign('feature_memory', has('comfort_memory_settings'));
  assign('feature_wireless_charging', has('comfort_wireless_charging'));
}

const FEATURE_FIELD_DEFS: Array<{ key: string; label: string; group?: string }> = [
  { key: 'feature_aeb', label: 'Frenado autónomo (AEB)', group: 'ADAS' },
  { key: 'feature_hill_assist', label: 'Asistente en pendientes (HSA)', group: 'ADAS' },
  { key: 'feature_lane_keep', label: 'Mantenimiento de carril (LKA)', group: 'ADAS' },
  { key: 'feature_blind_spot', label: 'Alerta de punto ciego (BSM)', group: 'ADAS' },
  { key: 'feature_acc', label: 'Control crucero adaptativo', group: 'ADAS' },
  { key: 'feature_cam_360', label: 'Cámara 360°', group: 'ADAS' },
  { key: 'feature_rain_sensor', label: 'Sensor de lluvia', group: 'ADAS' },
  { key: 'feature_park_sensors_front', label: 'Sensores de estacionamiento frontales', group: 'ADAS' },
  { key: 'feature_park_sensors_rear', label: 'Sensores de estacionamiento traseros', group: 'ADAS' },
  { key: 'feature_park_sensors_side', label: 'Sensores de estacionamiento laterales', group: 'ADAS' },
  { key: 'feature_power_tailgate', label: 'Cierre eléctrico de portón', group: 'Confort' },
  { key: 'feature_auto_door_close', label: 'Cierre automático de puertas', group: 'Confort' },
  { key: 'feature_memory', label: 'Memorias asiento/volante', group: 'Confort' },
  { key: 'feature_wireless_charging', label: 'Cargador inalámbrico', group: 'Confort' },
  { key: 'comfort_parking_assist_auto', label: 'Estacionamiento automático', group: 'ADAS' },
  { key: 'asistente_estac_frontal', label: 'Asistente de estacionamiento frontal', group: 'ADAS' },
  { key: 'asistente_estac_trasero', label: 'Asistente de estacionamiento trasero', group: 'ADAS' },
  { key: 'llave_inteligente', label: 'Llave inteligente', group: 'Confort' },
  { key: 'tiene_pantalla_tactil', label: 'Pantalla táctil', group: 'Info' },
  { key: 'android_auto', label: 'Android Auto', group: 'Info' },
  { key: 'apple_carplay', label: 'Apple CarPlay', group: 'Info' },
  { key: 'techo_corredizo', label: 'Techo corredizo', group: 'Confort' },
  { key: 'control_frenado_curvas', label: 'Frenado en curvas', group: 'ADAS' },
  { key: 'apertura_remota_maletero', label: 'Apertura remota maletero', group: 'Utilidad' },
  { key: 'rieles_techo', label: 'Rieles de techo', group: 'Utilidad' },
  { key: 'tercera_fila', label: 'Tercera fila de asientos', group: 'Utilidad' },
  { key: 'enganche_remolque', label: 'Enganche para remolque', group: 'Utilidad' },
  { key: 'preparacion_remolque', label: 'Preparación para remolque', group: 'Utilidad' },
];

const FEATURE_LABELS: Record<string, string> = FEATURE_FIELD_DEFS.reduce((acc, def) => {
  acc[def.key] = def.label;
  return acc;
}, {} as Record<string, string>);

const ADAS_FEATURE_DEFS = FEATURE_FIELD_DEFS.filter((def) => def.group === 'ADAS');

type PaywallState = {
  message: string;
  limit?: number;
  used?: number;
  checkoutEndpoint?: string;
  checkoutAvailable?: boolean;
  status?: number;
  raw?: any;
};

export default function ComparePanel() {
  const { t } = useI18n() as any;
  const { own, filters, autoGenSeq, autoGenerate, triggerAutoGen, setComparison } = useAppState();
  const ready = !!own.model && !!own.make && !!own.year;
  const { data: cfg } = useSWR<any>('cfg', () => endpoints.config());
  const fuelPrices = cfg?.fuel_prices || {};
  const PILLAR_LABELS: Record<string, string> = {
    audio_y_entretenimiento: 'Audio & entretenimiento',
    climatizacion: 'Climatización',
    confort: 'Confort',
    seguridad: 'Seguridad',
    adas: 'ADAS',
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
    seguridad: ['equip_p_safety'],
    adas: ['equip_p_adas'],
    motor: ['equip_p_performance'],
    dimensiones: ['equip_p_utility'],
    transmision: ['equip_p_traction'],
    suspension: ['equip_p_traction', 'equip_p_utility'],
    frenos: ['equip_p_safety'],
    exterior: ['equip_p_value', 'equip_p_utility'],
    energia: ['equip_p_electrification', 'equip_p_efficiency'],
    llantas_y_rines: ['equip_p_utility'],
  };
  const autoFilterLabels: Record<string, string> = {
    k: 'Cantidad',
    same_segment: 'Segmento idéntico',
    same_propulsion: 'Propulsión idéntica',
    include_same_brand: 'Incluye misma marca',
    include_different_years: 'Incluye años distintos',
    max_length_pct: 'Longitud ±%',
    max_length_mm: 'Longitud ±mm',
    score_diff_pct: 'Score ±%',
    min_match_pct: 'Coincidencia mínima %',
    base_segment: 'Segmento base',
    base_year: 'Año base',
  };
  const [hoverRow, setHoverRow] = React.useState<number | null>(null);
  const hoverStyle = (idx: number) => (hoverRow === idx ? { background:'#f8fafc' } : {});
  const [paywall, setPaywall] = React.useState<PaywallState | null>(null);
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);

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

  const triggerCheckout = React.useCallback(async () => {
    if (checkoutLoading) return;
    setCheckoutError(null);
    try {
      setCheckoutLoading(true);
      const resp = await endpoints.membershipCheckout();
      if (resp?.checkout_url) {
        window.location.href = resp.checkout_url;
        return;
      }
      setCheckoutError('No recibimos el enlace de pago de Stripe.');
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'No se pudo iniciar el pago.');
    } finally {
      setCheckoutLoading(false);
    }
  }, [checkoutLoading]);

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
  const [manualNotice, setManualNotice] = React.useState<string>('');
  const [autoGenerateNotice, setAutoGenerateNotice] = React.useState<string>('Pulsa “Generar competidores (IA)” para iniciar la auto-selección.');
  const autoGenTriggeredRef = React.useRef<boolean>(false);
  const [dismissedKeys, setDismissedKeys] = React.useState<Set<string>>(() => new Set());
  const [insightsStruct, setInsightsStruct] = React.useState<any | null>(null);
  const [insightsNotice, setInsightsNotice] = React.useState<string>('Pulsa “Generar insights” para ver highlights del vehículo.');
  const [advantageMode, setAdvantageMode] = React.useState<AdvantageMode>('upsides');
  const [insightsLoading, setInsightsLoading] = React.useState<boolean>(false);

  const keyForRow = React.useCallback((row: any) => {
    if (!row) return '';
    const mk = String(row?.make ?? row?.brand ?? '').trim().toUpperCase();
    const md = String(row?.model ?? '').trim().toUpperCase();
    const vr = String(row?.version ?? '').trim().toUpperCase();
    const yrRaw = row?.ano ?? row?.year ?? '';
    const yr = typeof yrRaw === 'number' ? String(yrRaw) : String(yrRaw || '').trim();
    return `${mk}|${md}|${vr}|${yr}`;
  }, []);

  const restoreDismissed = React.useCallback((key: string) => {
    setDismissedKeys(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const removeCompetitor = React.useCallback((row: any) => {
    const key = keyForRow(row);
    setDismissedKeys(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setManual(prev => prev.filter(r => keyForRow(r) !== key));
  }, [keyForRow]);

  const resetDismissed = React.useCallback(() => {
    setDismissedKeys(() => new Set());
  }, []);

  React.useEffect(() => {
    // Reset descartados cuando cambia el vehículo base
    setDismissedKeys(() => new Set());
  }, [own.make, own.model, own.year, own.version]);

  React.useEffect(() => {
    setInsightsStruct(null);
    setInsightsNotice('Pulsa “Generar insights” para ver highlights del vehículo.');
  }, [own.make, own.model, own.year, own.version]);

  const truthyFeature = React.useCallback((value: any): boolean => normalizeBoolean(value), []);

  const hasManualFor = React.useCallback((mk?: string, md?: string, yr?: number | string) => {
    const mkNorm = norm(String(mk || ''));
    const mdNorm = norm(String(md || ''));
    const yrNorm = String(yr ?? '').trim();
    return manual.some((row) => {
      const rowMk = norm(String(row?.make || ''));
      const rowMd = norm(String(row?.model || ''));
      const rowYr = String(row?.ano || row?.year || '').trim();
      if (mkNorm && rowMk !== mkNorm) return false;
      if (mdNorm && rowMd !== mdNorm) return false;
      if (yrNorm && rowYr !== yrNorm) return false;
      return true;
    });
  }, [manual]);

  const noBreakStyle: React.CSSProperties = React.useMemo(() => ({
    breakInside: 'avoid',
    pageBreakInside: 'avoid',
  }), []);

  const renderNoData = (message: string) => (
    <div style={{ ...noBreakStyle, padding:'12px 10px', border:'1px dashed #e5e7eb', borderRadius:8, color:'#64748b', fontSize:12, textAlign:'center' }}>{message}</div>
  );

  const renderChart = (option: any | null, height: number, emptyMessage: string) => {
    if (!option || (Array.isArray(option?.series) && option.series.length === 0)) {
      return renderNoData(emptyMessage);
    }
    if (!EChart) return null;
    return (
      <div style={{ ...noBreakStyle }}>
        <EChart echarts={echarts} option={option} opts={{ renderer: 'svg' }} style={{ height, position: 'relative' }} />
      </div>
    );
  };

  const exportPdf = React.useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.print();
      }
    } catch (err) {
      // ignorar errores de print
    }
  }, []);

  React.useEffect(() => {
    if (filters.includeDifferentYears) setManualNotice('');
  }, [filters.includeDifferentYears]);

  // When model changes, fetch makes and years
  const { data: manOpts } = useSWR<any>(manModel ? ['man_opts', manModel] : null, () => endpoints.options({ model: manModel }));
  const { data: makeOpts } = useSWR<any>(manMake ? ['man_make', manMake] : null, () => endpoints.options({ make: manMake }));
  React.useEffect(() => {
    if (!manOpts) return;
    let cancelled = false;
    const mk = (manOpts.autofill?.make_from_model || manOpts.selected?.make || '') as string;
    if (mk && !manMake) setManMake(mk);
    const baseYears: number[] = Array.isArray(manOpts.years)
      ? (manOpts.years as number[]).map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];
    const baseSorted = Array.from(new Set(baseYears)).sort((a, b) => b - a);

    const fetchCatalogYears = async (): Promise<number[]> => {
      try {
        const params: Record<string, any> = {
          limit: 500,
          model: manModel || undefined,
          make: manMake || mk || undefined,
        };
        const catalog = await endpoints.catalog(params);
        const rows: Row[] = Array.isArray(catalog)
          ? catalog
          : Array.isArray((catalog as any)?.items)
            ? (catalog as any).items
            : [];
        const set = new Set<number>();
        rows.forEach((row) => {
          const candidate = Number(row?.ano ?? row?.year ?? row?.modelo ?? row?.model_year);
          if (Number.isFinite(candidate)) set.add(candidate);
        });
        return Array.from(set);
      } catch {
        return [];
      }
    };

    const pickYear = async () => {
      const candidateSet = new Set<number>(baseSorted);
      const needsFallback = (filters.includeDifferentYears || (own.year && !candidateSet.has(Number(own.year))));
      if (needsFallback && (manModel || mk || manMake)) {
        try {
          const extraYears = await fetchCatalogYears();
          extraYears.forEach((year) => {
            if (Number.isFinite(year)) candidateSet.add(year);
          });
        } catch {
          // ignore fallback errors
        }
      }

      const candidates = Array.from(candidateSet)
        .map((year) => Number(year))
        .filter((year) => Number.isFinite(year))
        .sort((a, b) => b - a);

      if (!candidates.length) {
        if (!filters.includeDifferentYears && own.year && !hasManualFor(mk, manModel, own.year)) {
          setManualNotice(`No encontramos ${own.year} para ${manModel || mk}.`);
        }
        if (!cancelled) setManYear('');
        return;
      }

      if (!filters.includeDifferentYears && own.year) {
        const target = Number(own.year);
        if (candidates.includes(target)) {
          if (!cancelled) {
            setManYear(target);
            setManualNotice('');
          }
        } else if (!cancelled) {
          setManYear('');
          if (!hasManualFor(mk, manModel, target)) {
            setManualNotice(`No encontramos ${own.year} para ${manModel || mk}. Habilita "Incluir años modelo diferentes" o elige otro modelo.`);
          }
        }
        return;
      }

      for (const y of candidates) {
        try {
          const res = await endpoints.catalog({ make: manMake || mk || undefined, model: manModel || undefined, year: y, limit: 20 });
          const rows: Row[] = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);
          if (rows.some(isRowAvailable)) {
            if (!cancelled) {
              setManYear(y);
              setManualNotice('');
            }
            return;
          }
        } catch {}
      }

      if (!cancelled) {
        setManYear(candidates[0]);
        setManualNotice('');
      }
    };

    pickYear();
    setManVersion('');
    return () => { cancelled = true; };
  }, [manOpts, manMake, manModel, filters.includeDifferentYears, own.year, hasManualFor]);

  React.useEffect(() => {
    if (!makeOpts || manModel) return;
    let cancelled = false;
    const baseYears: number[] = Array.isArray(makeOpts.years)
      ? (makeOpts.years as number[]).map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];
    const baseSorted = Array.from(new Set(baseYears)).sort((a, b) => b - a);

    const fetchCatalogYears = async (): Promise<number[]> => {
      try {
        const params: Record<string, any> = {
          limit: 500,
          make: manMake || undefined,
        };
        const catalog = await endpoints.catalog(params);
        const rows: Row[] = Array.isArray(catalog)
          ? catalog
          : Array.isArray((catalog as any)?.items)
            ? (catalog as any).items
            : [];
        const set = new Set<number>();
        rows.forEach((row) => {
          const candidate = Number(row?.ano ?? row?.year ?? row?.modelo ?? row?.model_year);
          if (Number.isFinite(candidate)) set.add(candidate);
        });
        return Array.from(set);
      } catch {
        return [];
      }
    };

    const pickYear = async () => {
      const candidateSet = new Set<number>(baseSorted);
      const needsFallback = (filters.includeDifferentYears || (own.year && !candidateSet.has(Number(own.year))));
      if (needsFallback && manMake) {
        try {
          const extraYears = await fetchCatalogYears();
          extraYears.forEach((year) => {
            if (Number.isFinite(year)) candidateSet.add(year);
          });
        } catch {
          // ignore fallback errors
        }
      }

      const candidates = Array.from(candidateSet)
        .map((year) => Number(year))
        .filter((year) => Number.isFinite(year))
        .sort((a, b) => b - a);

      if (!candidates.length) {
        if (!filters.includeDifferentYears && own.year && !hasManualFor(manMake, undefined, own.year)) {
          setManualNotice(`No encontramos ${own.year} para ${manMake || 'esta marca'}.`);
        }
        if (!cancelled) setManYear('');
        return;
      }

      if (!filters.includeDifferentYears && own.year) {
        const target = Number(own.year);
        if (candidates.includes(target)) {
          if (!cancelled) {
            setManYear(target);
            setManualNotice('');
          }
        } else if (!cancelled) {
          setManYear('');
          if (!hasManualFor(manMake, undefined, target)) {
            setManualNotice(`No encontramos ${own.year} para ${manMake || 'esta marca'}.`);
          }
        }
        return;
      }

      for (const y of candidates) {
        try {
          const res = await endpoints.catalog({ make: manMake || undefined, year: y, limit: 20 });
          const rows: Row[] = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);
          if (rows.some(isRowAvailable)) {
            if (!cancelled) {
              setManYear(y);
              setManualNotice('');
            }
            return;
          }
        } catch {}
      }

      if (!cancelled) {
        setManYear(candidates[0]);
        setManualNotice('');
      }
    };

    pickYear();
    return () => { cancelled = true; };
  }, [makeOpts, manModel, manMake, filters.includeDifferentYears, own.year, hasManualFor]);

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
    setManualNotice('');
    // Si recibimos el renglón directo (de sugerencias), agregamos sin consultar
    if (directRow) {
      const cand = { ...directRow, __allow_zero_sales: true } as Row;
      const candYear = Number(cand?.ano ?? cand?.year ?? NaN);
      if (!filters.includeDifferentYears && own.year && Number(own.year) !== candYear) {
        setManualNotice(`Tu base es ${own.year}; habilita "Incluir años modelo diferentes" para comparar con ${candYear || 'otro año'}.`);
        return;
      }
      const key = keyForRow(cand);
      const exists = manual.some(r => keyForRow(r) === key);
      if (!exists) {
        setManual(prev => [...prev, cand]);
        restoreDismissed(key);
      }
      return;
    }
    if (!filters.includeDifferentYears && own.year && manYear === '') {
      setManualNotice(`No hay ${own.year} disponible para este modelo.`);
      return;
    }
    const params: any = { limit: 100 };
    if (manMake) params.make = manMake;
    if (manModel) params.model = manModel;
    if (manYear !== '') params.year = manYear;
    const list = await endpoints.catalog(params);
    const rows: Row[] = (Array.isArray(list) ? list : (Array.isArray(list?.items) ? list.items : [])) as Row[];
    const available = rows.filter(isRowAvailable);
    if (!available.length) {
      setManualNotice('No hay versiones disponibles para ese año/modelo.');
      return;
    }
    let cand = available[0];
    const pickVer = (selVersion || manVersion || '').toUpperCase();
    if (pickVer) {
      const found = available.find(r => String(r.version||'').toUpperCase() === pickVer);
      if (found) cand = found;
    }
    const candYear = Number(cand?.ano ?? cand?.year ?? NaN);
    if (!filters.includeDifferentYears && own.year && Number(own.year) !== candYear) {
      setManualNotice(`Tu base es ${own.year}; habilita "Incluir años modelo diferentes" para traer ${candYear || 'otro año'}.`);
      return;
    }
    const withFlag = { ...cand, __allow_zero_sales: true } as Row;
    const key = keyForRow(withFlag);
    const exists = manual.some(r => keyForRow(r) === key);
    if (!exists) {
      setManual(prev => [...prev, withFlag]);
      restoreDismissed(key);
    }
  };
  const removeManual = (idx: number) => setManual(prev => prev.filter((_,i)=>i!==idx));

  // Predictive suggestions for model
  function norm(s: string){
    try { return s.normalize('NFD').replace(/\p{Diacritic}+/gu,'').toLowerCase().replace(/[^a-z0-9]/g,''); } catch { return s.toLowerCase().replace(/[^a-z0-9]/g,''); }
  }

  function isRowAvailable(row: any): boolean {
    const status = String(row?.metadata_dataStatus || row?.metadata?.dataStatus || '').toLowerCase();
    if (!status) return true;
    return status.includes('complet');
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
    if (!brandAlpha) return [];
    if (brandAlpha === '*') return brandSource.slice(0, 80);
    return brandSource.filter(b => String(b).toUpperCase().startsWith(String(brandAlpha).toUpperCase())).slice(0, 80);
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
    return rows.filter(isRowAvailable);
  });

  

  const k = filters.autoK || 3;
  // Solo generar cuando el botón sea presionado (autoGenSeq>0)
  // Importante: no re-disparar por cambios en filtros; solo por autoGenSeq
  const { data: auto, error: autoError, isValidating: autoLoading } = useSWR(ownRow && autoGenSeq > 0 ? ['auto_comp', ownRow.id || ownRow.model, ownRow.ano, autoGenSeq] : null, async () => {
    const payload: any = {
      own: {
        make: own.make,
        model: own.model,
        ano: own.year,
        precio_transaccion: ownRow?.precio_transaccion,
        msrp: ownRow?.msrp,
        longitud_mm: ownRow?.longitud_mm,
        equip_score: ownRow?.equip_score,
        segment: baseRow ? segmentMain(baseRow) : undefined,
        segmento_ventas: baseRow?.segmento_ventas,
        body_style: baseRow?.body_style,
        categoria_combustible_final: baseRow?.categoria_combustible_final,
        tipo_de_combustible_original: baseRow?.tipo_de_combustible_original,
      },
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
  const autoItems: Row[] = React.useMemo(() => {
    if (!auto) return [];
    if (Array.isArray(auto)) return auto as Row[];
    if (Array.isArray(auto?.items)) return auto.items as Row[];
    return [];
  }, [auto]);
  const autoVisibleItems: Row[] = React.useMemo(() => {
    const seen = new Set<string>();
    return autoItems.filter((row) => {
      const key = keyForRow(row);
      if (dismissedKeys.has(key)) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [autoItems, dismissedKeys, keyForRow]);
  const usedFilters = auto?.used_filters || null;

  // Nota: competidores automáticos solo se generan al pulsar el botón.
  // No disparamos auto‑gen al cargar para que el usuario decida manual/automático.

  React.useEffect(() => {
    if (autoGenSeq === 0) {
      setAutoGenerateNotice(autoGenerate ? 'Pulsa “Generar competidores (IA)” para iniciar la auto-selección.' : '');
      autoGenTriggeredRef.current = false;
      return;
    }
    if (autoLoading) {
      setAutoGenerateNotice('Generando competidores con IA…');
      return;
    }
    if (autoError) {
      const msg = String((autoError as any)?.message || autoError || 'Error desconocido');
      setAutoGenerateNotice(`Error al generar competidores: ${msg}`);
      autoGenTriggeredRef.current = true;
      return;
    }
    if (autoItems.length) {
      const baseMsg = `IA seleccionó ${autoItems.length} competidor${autoItems.length === 1 ? '' : 'es'}.`;
      setAutoGenerateNotice(auto?.notice ? `${baseMsg} ${auto.notice}` : baseMsg);
      autoGenTriggeredRef.current = true;
    } else if (autoGenTriggeredRef.current || auto?.notice) {
      setAutoGenerateNotice(auto?.notice || 'IA no encontró competidores con los filtros actuales.');
    }
  }, [autoGenerate, autoGenSeq, autoItems.length, autoLoading, autoError, auto?.notice]);

  const sig = (rows: Row[]) => rows.map(r => `${r.make}|${r.model}|${r.version||''}|${r.ano||''}`).join(',');
  // Helpers numéricos para consumo energético/combustible (ver lib/consumption)
  function featureNumber(row: any, category: string, keyword: string): number | null {
    const list = (row?.features && row.features[category]) || [];
    if (!Array.isArray(list)) return null;
    const kw = keyword.toLowerCase();
    for (const item of list) {
      const label = String(item?.feature || item?.name || '').toLowerCase();
      if (!label.includes(kw)) continue;
      const raw = item?.content ?? item?.value ?? '';
      const v = parseNumberLike(raw);
      if (Number.isFinite(v)) return Number(v);
    }
    return null;
  }

  function lengthMm(row: any): number | null {
    if (!row) return null;
    const directFields = [
      row?.longitud_mm,
      row?.dim_largo_mm,
      row?.length_mm,
      row?.longitud,
      row?.length,
    ];
    for (const value of directFields) {
      const parsed = parseNumberLike(value);
      if (Number.isFinite(parsed) && parsed as number > 0) return Number(parsed);
    }
    const specs = row?.specs;
    if (specs && typeof specs === 'object') {
      for (const key of ['longitud_mm','length_mm','dim_largo_mm','longitud']) {
        const parsed = parseNumberLike(specs[key]);
        if (Number.isFinite(parsed) && parsed as number > 0) return Number(parsed);
      }
    }
    const featureLen = featureNumber(row, 'Dimensiones', 'longitud');
    if (Number.isFinite(featureLen) && featureLen as number > 0) return Number(featureLen);
    return null;
  }

  function ensureFuel60(row: any): any {
    if (row == null) return row;
    const out = { ...row } as any;
    const electric = isElectric(out);
    if (out.fuel_cost_60k_mxn == null) {
      const price = fuelPriceFor(out);
      if (electric) {
        const kwh100 = kwhPer100FromRow(out);
        if (Number.isFinite(kwh100) && price != null) {
          out.fuel_cost_60k_mxn = Math.round((kwh100 as number) * 600 * price);
        }
      } else {
        const kml = kmlFromRow(out);
        if (kml && price != null) {
          out.fuel_cost_60k_mxn = Math.round((60000 / kml) * price);
        }
      }
    }
    if (electric) {
      const kwh100 = kwhPer100FromRow(out);
      if (Number.isFinite(kwh100)) {
        if (out.consumo_kwh_100km == null) out.consumo_kwh_100km = Number(kwh100);
        out.__calc_kwh_100km = Number(kwh100);
      }
    }
    const len = lengthMm(out);
    if (len != null) out.longitud_mm = len;

    // Ajustar equip_score si el valor crudo es inconsistente con los pilares disponibles
    const pillarKeys = ['equip_p_adas','equip_p_safety','equip_p_comfort','equip_p_infotainment','equip_p_traction','equip_p_utility'] as const;
    const pillarVals = pillarKeys
      .map((key) => parseNumberLike((out as any)[key]))
      .filter((v): v is number => Number.isFinite(v) && v > 0);
    if (pillarVals.length) {
      const avg = pillarVals.reduce((acc, v) => acc + v, 0) / pillarVals.length;
      const raw = parseNumberLike(out.equip_score);
      if (!Number.isFinite(raw) || raw <= 0 || raw > 100 || Math.abs(raw - avg) >= 5) {
        out.equip_score = Number(avg.toFixed(1));
      }
    }

    augmentFeatureFlags(out);
    return out;
  }

  const dismissedSignature = React.useMemo(() => Array.from(dismissedKeys).sort().join(','), [dismissedKeys]);
  const { data: compared, error: compareError } = useSWR(ownRow ? ['compare', ownRow?.id || ownRow?.model, ownRow?.ano, sig((auto?.items||[]) as Row[]), sig(manual), dismissedSignature, !!cfg] : null, async () => {
    const autoRows: Row[] = (auto?.items || []) as Row[];
    // merge unique (auto + manual)
    const seen = new Set<string>();
    const items: Row[] = [];
    for (const r of [...autoRows, ...manual]){
      const key = keyForRow(r);
      if (dismissedKeys.has(key)) continue;
      if (!seen.has(key)) { seen.add(key); items.push(r); }
    }
    // Incluir fuel_cost_60k si falta (se usa para deltas en /compare)
    const ownW = ensureFuel60(ownRow);
    const itemsW = items.map(ensureFuel60);
    return endpoints.compare({ own: ownW, competitors: itemsW });
  });

  React.useEffect(() => {
    if (!compareError) {
      setPaywall(null);
      setCheckoutError(null);
      return;
    }
    const status = (compareError as any)?.status;
    const data = (compareError as any)?.data;
    if (status === 402 && data) {
      setPaywall({
        message: data.message || 'Alcanzaste el límite gratuito de la membresía.',
        limit: typeof data.limit === 'number' ? data.limit : undefined,
        used: typeof data.used === 'number' ? data.used : undefined,
        checkoutEndpoint: data.checkout_endpoint,
        checkoutAvailable: data.checkout_available !== false,
        status,
        raw: data,
      });
      return;
    }
    if (status === 401 && data?.error === 'membership_session_invalid') {
      setPaywall({
        message: 'Tu sesión de membresía expiró. Vuelve a verificar tu teléfono desde la página de membresía.',
        checkoutAvailable: false,
        status,
        raw: data,
      });
      return;
    }
    setPaywall({
      message: compareError instanceof Error ? compareError.message : 'No pudimos ejecutar la comparación.',
      checkoutAvailable: false,
      status,
      raw: data,
    });
  }, [compareError]);

  // Evitar returns tempranos que cambian el orden de hooks.
  // Usar valores de respaldo cuando aún no hay base/ownRow listo.
  const baseRow = React.useMemo(() => {
    if (!ownRow) return null;
    const src = (compared?.own || ownRow) as Row;
    return ensureFuel60(src);
  }, [compared, ownRow]);
  const rawComps = React.useMemo(() => (compared?.competitors || []).map((c: any) => {
    const enriched = ensureFuel60(c.item || {});
    return {
      ...enriched,
      __deltas: c.deltas || {},
      __diffs: c.diffs || {},
      __pillar_deltas: c.pillar_deltas || {},
      __segment_delta: c.segment_delta || null,
    };
  }), [compared]);
  const comps = React.useMemo(() => rawComps.filter((r:any) => !dismissedKeys.has(keyForRow(r))), [rawComps, dismissedKeys, keyForRow]);
  const compsCount = comps.length;
  const brandNameForSales = React.useMemo(() => {
    if (!baseRow) return '';
    const cleanLabel = brandLabel(baseRow, '');
    if (cleanLabel && cleanLabel.trim()) return cleanLabel.trim();
    const make = String((baseRow as any)?.make || (baseRow as any)?.marca || '').trim();
    if (make) return make;
    const brand = String((baseRow as any)?.brand || (baseRow as any)?.brand_label || (baseRow as any)?.brand_name || '').trim();
    return brand;
  }, [baseRow]);
  const brandSalesKey = brandNameForSales ? ['brand_sales_compare', brandNameForSales] : null;
  const { data: brandSalesData, error: brandSalesError } = useSWR<any>(
    brandSalesKey,
    async ([, make]) => endpoints.brandSalesMonthly(make, [2025, 2024]),
  );
  const brandSalesLoading = Boolean(brandSalesKey && !brandSalesData && !brandSalesError);
  const brandSalesOption = React.useMemo(() => {
    if (!brandSalesData) return null;
    const months = Array.isArray(brandSalesData?.months) && brandSalesData.months.length === 12
      ? brandSalesData.months
      : ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const rawSeries = Array.isArray(brandSalesData?.series) ? brandSalesData.series : [];
    const palette = ['#2563eb', '#94a3b8', '#f97316', '#10b981'];
    const series = rawSeries
      .map((entry: any, idx: number) => {
        const monthly = Array.isArray(entry?.monthly)
          ? entry.monthly.map((value: any) => (Number.isFinite(Number(value)) ? Number(value) : 0))
          : [];
        return {
          name: String(entry?.year || '').trim() || `Serie ${idx + 1}`,
          data: monthly,
          itemStyle: { color: palette[idx % palette.length] },
          lineStyle: { color: palette[idx % palette.length], width: idx === 0 ? 3 : 2 },
        };
      })
      .filter((entry) => Array.isArray(entry.data) && entry.data.some((value: number) => Number(value) > 0));
    if (!series.length) return null;
    return {
      grid: { left: 60, right: 16, top: 30, bottom: 32, containLabel: true },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: number) => Intl.NumberFormat('es-MX').format(Math.round(value)),
      },
      legend: { top: 0, left: 'center', data: series.map((entry) => entry.name) },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value', min: 0, name: 'Unidades' },
      series: series.map((entry) => ({
        name: entry.name,
        type: 'line',
        smooth: true,
        data: entry.data,
        itemStyle: entry.itemStyle,
        lineStyle: entry.lineStyle,
        symbolSize: 6,
      })),
    } as any;
  }, [brandSalesData]);
  const advantageSections: AdvantageSection[] = React.useMemo(() => {
    if (!baseRow || !comps.length) return [];
    return computeAdvantageSections(baseRow, comps, advantageMode);
  }, [baseRow, comps, advantageMode]);
  const limitedAdvantageSections = React.useMemo(
    () => advantageSections.slice(0, 3),
    [advantageSections],
  );
  const advantageNotice = React.useMemo(() => {
    if (!baseRow) return 'Selecciona un vehículo propio para visualizar comparativos.';
    if (!compsCount) return 'Selecciona competidores en el panel de comparación para ver esta gráfica.';
    if (!advantageSections.length) return 'No encontramos diferencias claras con los competidores seleccionados.';
    return '';
  }, [baseRow, compsCount, advantageSections]);
  const showAdvantageChart = Boolean(advantageSections.length);
  const comparisonPayload = React.useMemo(() => {
    if (!baseRow) {
      return { base: null as Row | null, competitors: [] as Row[] };
    }
    return { base: baseRow as Row, competitors: comps as Row[] };
  }, [baseRow, comps]);

  React.useEffect(() => {
    setComparison(comparisonPayload);
  }, [comparisonPayload, setComparison]);

  const generateInsights = React.useCallback(async () => {
    if (!baseRow) {
      setInsightsNotice('Selecciona un vehículo base para generar insights.');
      return;
    }
    if (!compared) {
      setInsightsNotice('Espera a que se cargue la comparación antes de generar insights.');
      return;
    }
    try {
      setInsightsLoading(true);
      setInsightsNotice('Generando insights…');
      const payload: Record<string, any> = {
        compare: {
          own: compared.own || baseRow,
          competitors: compared.competitors || [],
        },
        prompt_lang: 'es',
        refresh: Date.now(),
      };
      const resp = await endpoints.insights(payload);
      if (resp?.ok === false) {
        setInsightsStruct(null);
        setInsightsNotice(resp?.error ? String(resp.error) : 'No se pudieron generar insights.');
      } else {
        setInsightsStruct(resp?.insights_struct || null);
        const note = resp?.notice ? String(resp.notice) : '';
        setInsightsNotice(resp?.insights_struct ? (note || 'Insights generados.') : (note || 'Sin datos suficientes para insights.'));
      }
    } catch (error) {
      setInsightsStruct(null);
      setInsightsNotice(`Error al generar insights: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setInsightsLoading(false);
    }
  }, [baseRow, compared]);

  const getFeatureDiffs = React.useCallback((comp: any) => {
    const diffs = comp?.__diffs || {};
    const normalize = (arr: any[]): string[] => {
      if (!Array.isArray(arr)) return [];
      const out = arr
        .map((item) => String(item || '').trim())
        .filter((item) => item.length > 0);
      return Array.from(new Set(out));
    };
    let plus = normalize(diffs.features_plus || []);
    let minus = normalize(diffs.features_minus || []);
    if (baseRow) {
      const fallbackPlus = new Set<string>();
      const fallbackMinus = new Set<string>();
      FEATURE_FIELD_DEFS.forEach((def) => {
        const baseHas = truthyFeature((baseRow as any)?.[def.key]);
        const compHas = truthyFeature((comp as any)?.[def.key]);
        const label = FEATURE_LABELS[def.key] || def.label || def.key;
        if (compHas && !baseHas) fallbackPlus.add(label);
        if (baseHas && !compHas) fallbackMinus.add(label);
      });
      if (fallbackPlus.size) {
        const merged = new Set<string>(plus);
        fallbackPlus.forEach((item) => merged.add(item));
        plus = Array.from(merged);
      }
      if (fallbackMinus.size) {
        const merged = new Set<string>(minus);
        fallbackMinus.forEach((item) => merged.add(item));
        minus = Array.from(merged);
      }
    }
    return {
      plus,
      minus,
    };
  }, [baseRow, truthyFeature]);
  const headers = [
    { key: 'veh_img', label: '', minWidth: THUMB_WIDTH + 24 },
    { key: 'vehiculo', label: t('vehicle'), minWidth: 240 },
    { key: 'msrp', label: t('msrp'), minWidth: 120, align: 'center' as const },
    { key: 'precio_transaccion', label: t('tx_price'), minWidth: 120, align: 'center' as const },
    { key: 'bono', label: t('bonus'), minWidth: 110, align: 'center' as const },
    { key: 'fuel_cost_60k_mxn', label: t('energy60k'), minWidth: 150 },
    { key: 'service_cost_60k_mxn', label: t('service60k'), minWidth: 150, align: 'center' as const },
    { key: 'tco_60k_mxn', label: t('tco60k'), minWidth: 130, align: 'center' as const },
  ];

  // Small info icon with tooltip
  function InfoIcon({ title }: { title: string }) {
    return (
      <span title={title} style={{ display:'inline-block', marginLeft:6, width:16, height:16, border:'1px solid #cbd5e1', borderRadius:16, textAlign:'center', lineHeight:'14px', fontSize:12, color:'#475569', cursor:'help' }}>i</span>
    );
  }

  function getPillarValue(row: any, key: string): number | null {
    if (!row) return null;
    const direct = num(row?.pillar_scores?.[key]);
    if (direct != null && direct > 0) return direct;
    const raw = num(row?.pillar_scores_raw?.[key]);
    if (raw != null && raw > 0) return raw;
    const sameKey = num((row as any)?.[key]);
    if (sameKey != null && sameKey > 0) return sameKey;
    const legacyList = PILLAR_LEGACY_FIELDS[key] || [];
    for (const legacyKey of legacyList) {
      const legacyVal = num((row as any)?.[legacyKey]);
      if (legacyVal != null && legacyVal > 0) return legacyVal;
    }
    return null;
  }

  // -------- Price Explain Modal & actions --------
  // Eliminados estados del modal de explicación; se integrará a Insights

  // ExplainModal eliminado: la explicación de precio se integrará a Insights

  function fmtMoney(v: any) { const n = num(v); return n==null?'-':Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n); }
  function fmtNum(v: any) { const n = num(v); return n==null?'-':Intl.NumberFormat().format(n); }
  function fmtPct(v: any) { const n = num(v); return n==null?'-':`${Number(n).toFixed(0)}%`; }
  function fmtDeltaPct(v: any) { const n = num(v); if (n==null) return '-'; const s = n>0?'+':''; return `${s}${Number(n).toFixed(0)}%`; }
  const tri = (n: number) => (n >= 0 ? '▲' : '▼');

  function fuelLabel(row: any): string {
    const label = fuelCategory(row).label;
    if (label) return label;
    if (kwhPer100FromRow(row) != null) return 'Eléctrico';
    if (kmlFromRow(row) != null) return 'Gasolina Magna';
    return '';
  }
  function fuelPriceLabel(row: any): string {
    let key = fuelCategory(row).key;
    if (key === 'unknown') {
      if (kwhPer100FromRow(row) != null) key = 'bev';
      else if (kmlFromRow(row) != null) key = 'gasolina_magna';
    }
    if (!key || key === 'unknown') return '';
    const asOf = cfg?.fuel_prices_meta?.as_of ? ` • ${cfg.fuel_prices_meta.as_of}` : '';
    const src = cfg?.fuel_prices_meta?.source ? ' • CRE' : '';
    if (key === 'diesel') {
      const v = fuelPrices?.diesel_litro;
      return v ? `• $${Number(v).toFixed(2)}/L${asOf}${src}` : '';
    }
    if (key === 'gasolina_premium') {
      const v = fuelPrices?.gasolina_premium_litro ?? fuelPrices?.gasolina_magna_litro;
      return v ? `• $${Number(v).toFixed(2)}/L${asOf}${src}` : '';
    }
    if (['gasolina_magna', 'gasolina', 'hev', 'mhev', 'phev'].includes(key as any)) {
      const v = fuelPrices?.gasolina_magna_litro ?? fuelPrices?.gasolina_premium_litro;
      return v ? `• $${Number(v).toFixed(2)}/L${asOf}${src}` : '';
    }
    if (key === 'bev') {
      const v = fuelPrices?.electricidad_kwh;
      return v ? `• $${Number(v).toFixed(2)}/kWh${asOf}${src}` : '';
    }
    const fallback = fuelPrices?.gasolina_magna_litro ?? fuelPrices?.gasolina_premium_litro ?? fuelPrices?.diesel_litro;
    return fallback ? `• $${Number(fallback).toFixed(2)}/L${asOf}${src}` : '';
  }
  function fuelPriceFor(row: any): number | null {
    const info = fuelCategory(row);
    const raw = info.raw.toLowerCase();
    let key = info.key;
    if (key === 'unknown') {
      if (/bev|eléctr|elect/.test(raw) && !/phev|hibrid/.test(raw)) key = 'bev';
      else if (/phev|enchuf/.test(raw)) key = 'gasolina_premium';
      else if (/diesel|dsl/.test(raw)) key = 'diesel';
      else if (/gasolina|petrol|nafta|magna|gasolin/.test(raw)) key = 'gasolina_magna';
    }
    const pick = (value: any) => {
      const numVal = Number(value ?? NaN);
      return Number.isFinite(numVal) ? numVal : null;
    };
    if (key === 'bev') return pick(fuelPrices?.electricidad_kwh);
    if (key === 'diesel') return pick(fuelPrices?.diesel_litro);
    if (key === 'gasolina_premium') return pick(fuelPrices?.gasolina_premium_litro ?? fuelPrices?.gasolina_magna_litro);
    if (['gasolina_magna', 'gasolina', 'hev', 'mhev', 'phev'].includes(key as any)) {
      return pick(fuelPrices?.gasolina_magna_litro ?? fuelPrices?.gasolina_premium_litro);
    }
    return pick(fuelPrices?.gasolina_magna_litro ?? fuelPrices?.gasolina_premium_litro ?? fuelPrices?.diesel_litro ?? fuelPrices?.electricidad_kwh);
  }
  function energyConsumptionKwh100(row: any): number | null {
    if (!row) return null;
    const cached = parseNumberLike((row as any)?.__calc_kwh_100km);
    if (Number.isFinite(cached) && (cached as number) > 0) return Number(cached);
    const direct = parseNumberLike((row as any)?.consumo_kwh_100km);
    if (Number.isFinite(direct) && (direct as number) > 0) return Number(direct);
    const deduced = kwhPer100FromRow(row);
    return Number.isFinite(deduced) && (deduced as number) > 0 ? Number(deduced) : null;
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
    const mk = brandLabel(r);
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
                     '#3b82f6','#16a34a','#f59e0b','#ef4444','#8b5cf6','#a855f7','#22c55e','#f97316','#14b8a6','#e11d48'];
    const vers = Array.from(new Set(chartRows.map((r:any)=> String(r?.version||'').toUpperCase())));
    const map: Record<string,string> = {};
    vers.forEach((v, i)=> { map[v] = palette[i % palette.length]; });
    return map;
  }, [chartRows]);
  const colorForVersion = (r: any) => versionColorMap[String(r?.version||'').toUpperCase()] || '#6b7280';

  // Ventas mensuales 2025 (líneas) — depende de colorForVersion
  salesLineOption = React.useMemo(() => {
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const rows = [ ...(baseRow ? [baseRow] : []), ...comps ];
    const series: any[] = [];
    const ytdByName: Record<string, number | null> = {};
    let usedForecast = false;
    const monthlyTotals: number[] = new Array(12).fill(0);
    const yearRef = 2025;
    const formatInt = (value: number) => Intl.NumberFormat('es-MX').format(Math.round(value));

    rows.forEach((r: any, idx: number) => {
      const name = vehLabel(r);
      const color = colorForVersion(r);
      const vals: (number | null)[] = [];
      for (let m = 1; m <= 12; m++) {
        const k = `ventas_${yearRef}_${String(m).padStart(2,'0')}`;
        const v = Number((r as any)?.[k] ?? NaN);
        vals.push(Number.isFinite(v) ? v : null);
      }
      const observed = vals.slice(0, 9).some(v => (v ?? 0) > 0);
      const valsWithForecast = (() => {
        if (!observed) return vals;
        const out = [...vals];
        let last: number | null = null;
        for (let i = 0; i < 9; i++) {
          const v = out[i];
          if (typeof v === 'number' && isFinite(v) && v > 0) last = v;
        }
        for (let i = 8; i < 12; i++) {
          const v = out[i];
          if ((v == null || v === 0) && last != null) {
            out[i] = last;
            usedForecast = true;
          }
        }
        return out;
      })();

      const manualYtd = Number((r as any)?.ventas_model_ytd ?? NaN);
      const ytdComputed = Number.isFinite(manualYtd) ? manualYtd : ytdUnits(r, yearRef);
      ytdByName[name] = (ytdComputed != null && Number.isFinite(ytdComputed)) ? Number(ytdComputed) : null;

      const dataPoints = valsWithForecast.map((val, dataIdx) => ({ value: val, original: vals[dataIdx] }));
      for (let i = 0; i < 12; i++) {
        const pointVal = dataPoints[i].value;
        if (typeof pointVal === 'number' && isFinite(pointVal)) {
          monthlyTotals[i] += pointVal;
        }
      }

      const hasAny = vals.some(v => (v ?? 0) > 0);
      if (hasAny) {
        series.push({
          type: 'line',
          name,
          data: dataPoints,
          smooth: true,
          showSymbol: true,
          symbolSize: 6,
          itemStyle: { color },
          lineStyle: { color, width: (idx === 0 ? 3 : 2) },
          label: {
            show: true,
            position: 'top',
            color,
            fontSize: 10,
            formatter: (params: any) => {
              const dataObj = (params?.data && typeof params.data === 'object') ? params.data : { value: params.value };
              const val = Number(dataObj?.value ?? NaN);
              if (!Number.isFinite(val)) return '';
              return formatInt(val);
            }
          },
          emphasis: { focus: 'series' },
        });
      }

      if (ytdByName[name] == null) {
        const sumYtd = dataPoints.reduce((acc: number, point: any) => {
          const rawVal = Number(point.original ?? point.value ?? NaN);
          if (Number.isFinite(rawVal)) return acc + rawVal;
          return acc;
        }, 0);
        ytdByName[name] = sumYtd > 0 ? sumYtd : null;
      }
    });

    if (!series.length) return null;

    const legendFormatter = (seriesName: string) => {
      const ytd = ytdByName[seriesName];
      return ytd != null ? `${seriesName} · YTD ${formatInt(ytd)} u` : seriesName;
    };

    const option: any = {
      title: { text: `Ventas mensuales ${yearRef} (unidades)`, left: 'center', top: 6 },
      grid: { left: 60, right: 20, top: 50, bottom: 50, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        formatter: (p: any) => {
          const idx = Array.isArray(p) && p.length ? p[0].dataIndex : 0;
          const tot = monthlyTotals[idx] || 0;
          const lines = (Array.isArray(p) ? p : []).map((it: any) => {
            const dataObj = (it.data && typeof it.data === 'object') ? it.data : { value: it.data };
            const u = Number(dataObj?.value ?? NaN);
            const safeU = Number.isFinite(u) ? u : 0;
            const share = tot > 0 ? ((safeU / tot) * 100).toFixed(1) : '0.0';
            const ytd = ytdByName[it.seriesName];
            const ytdText = ytd != null ? ` — YTD ${formatInt(ytd)} u` : '';
            return `${it.marker} ${it.seriesName}: ${formatInt(safeU)} u (${share}%)${ytdText}`;
          });
          return `<strong>${months[idx]}</strong><br/>${lines.join('<br/>')}`;
        }
      },
      legend: { bottom: 0, left: 'center', formatter: legendFormatter },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value', name: 'Unidades', min: 0 },
      series
    };

    if (usedForecast && option.series && option.series.length) {
      option.series[0].markArea = {
        silent: true,
        itemStyle: { color: 'rgba(148,163,184,0.12)' },
        label: { show: true, formatter: 'Trabajo en progreso — pronóstico Sep–Dic', position: 'insideTop', color: '#64748b', fontSize: 12, fontWeight: 'bold' },
        data: [[{ xAxis: 'Sep' }, { xAxis: 'Dic' }]]
      };
    }

    return option as any;
  }, [baseRow, comps, versionColorMap]);

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
        return { type: 'line', shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }, style: { stroke: '#94a3b8', lineWidth: 1, lineDash: [4,4], fill: 'none' } } as any;
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
    if (!msrpData.length && !txData.length) return null;
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

  // ΔHP vs base (barras)
  const deltaHpOption = React.useMemo(() => {
    if (!baseRow) return null;
    const base = Number(baseRow?.caballos_fuerza ?? NaN);
    const items: Array<{name:string, val:number, color:string}> = [];
    comps.forEach((r:any) => {
      const hp = Number(r?.caballos_fuerza ?? NaN);
      if (!Number.isFinite(hp) || !Number.isFinite(base)) return;
      items.push({ name: versionShortLabel(r), val: hp - base, color: colorForVersion(r) });
    });
    if (!Number.isFinite(base) || !items.length) return null;
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
    if (!baseRow) return null;
    const base = lengthMm(baseRow);
    const items: Array<{name:string, val:number, color:string}> = [];
    comps.forEach((r:any) => {
      const L = lengthMm(r);
      if (L == null || base == null) return;
      items.push({ name: versionShortLabel(r), val: Math.round(L - base), color: colorForVersion(r) });
    });
    if (base == null || !items.length) return null;
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
    if (!baseRow) return null;
    const base = Number(baseRow?.accel_0_100_s ?? NaN);
    if (!Number.isFinite(base)) return null;
    const items: Array<{name:string, val:number, color:string}> = [];
    comps.forEach((r:any) => {
      const t = Number(r?.accel_0_100_s ?? NaN);
      if (!Number.isFinite(t)) return;
      const dv = Number((t - base).toFixed(2));
      const color = dv < 0 ? '#16a34a' : (dv>0 ? '#dc2626' : '#64748b');
      items.push({ name: versionShortLabel(r), val: dv, color });
    });
    if (!items.length) return null;
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
    const xMinVal = xMin;
    const yMinVal = yMin;
    const series = items.map((r:any, idx:number) => {
      const w = Number(widthMM(r)), l = Number(lengthMM(r));
      const color = colorForVersion(r);
      const isBase = idx===0;
      return {
        type: 'custom', name: versionShortLabel(r),
        renderItem: function(params:any, api:any) {
          const x0 = api.coord([xMinVal, yMinVal]);
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
          style: { stroke: '#94a3b8', lineWidth: 1, lineDash: [4,4], fill: 'none' }
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
    if (!msrpData.length && !txData.length) return null;
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

  const costPerHpBarOption = React.useMemo(() => {
    if (!chartRows.length) return null;
    const entries = chartRows.map((row: any) => {
      const hp = Number(row?.caballos_fuerza ?? NaN);
      const priceTx = Number(row?.precio_transaccion ?? NaN);
      const priceMsrp = Number(row?.msrp ?? NaN);
      const price = Number.isFinite(priceTx) ? priceTx : priceMsrp;
      if (!Number.isFinite(hp) || hp <= 0 || !Number.isFinite(price) || price <= 0) return null;
      const value = Number((price / hp).toFixed(0));
      return {
        label: vehLabel(row),
        value,
        base: !!row.__isBase,
        color: colorForVersion(row),
      };
    }).filter(Boolean) as Array<{ label: string; value: number; base: boolean; color: string }>;
    if (!entries.length) return null;
    const maxVal = Math.max(...entries.map((entry) => entry.value));
    return {
      title: { text: 'Costo por HP (precio / HP)', left: 'center', top: 6 },
      grid: { left: 140, right: 60, top: 60, bottom: 60, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => `${p.name}<br/>$ ${Intl.NumberFormat('es-MX').format(Number(p.value))} por HP`,
      },
      xAxis: { type: 'value', min: 0, max: Math.max(1000, Math.ceil(maxVal / 100) * 100), name: '$/HP', axisLabel: { formatter: (v:any) => `$ ${Intl.NumberFormat('es-MX').format(v)}` } },
      yAxis: { type: 'category', data: entries.map((entry) => entry.label), axisLabel: { interval: 0 } },
      series: [{
        type: 'bar',
        data: entries.map((entry) => ({ value: entry.value, name: entry.label, itemStyle: { color: entry.base ? '#2563eb' : entry.color } })),
        label: { show: true, position: 'right', formatter: (p:any) => `$ ${Intl.NumberFormat('es-MX').format(Number(p.value))}` },
      }],
    } as any;
  }, [chartRows, versionColorMap]);

  const equipScoreBarOption = React.useMemo(() => {
    if (!chartRows.length) return null;
    const entries = chartRows.map((row: any) => {
      const score = Number((row as any)?.equip_score ?? NaN);
      if (!Number.isFinite(score)) return null;
      return {
        label: vehLabel(row),
        value: Number(score.toFixed(1)),
        base: !!row.__isBase,
        color: colorForVersion(row),
      };
    }).filter(Boolean) as Array<{ label: string; value: number; base: boolean; color: string }>;
    if (!entries.length) return null;
    const maxVal = Math.max(...entries.map((entry) => entry.value));
    return {
      title: { text: 'Score de equipamiento (0-100)', left: 'center', top: 6 },
      grid: { left: 140, right: 60, top: 60, bottom: 60, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => `${p.name}<br/>Score: ${Number(p.value).toFixed(1)}`,
      },
      xAxis: { type: 'value', min: 0, max: Math.max(50, Math.ceil(maxVal / 5) * 5), name: 'Score', axisLabel: { formatter: (v:any) => Number(v).toFixed(0) } },
      yAxis: { type: 'category', data: entries.map((entry) => entry.label), axisLabel: { interval: 0 } },
      series: [{
        type: 'bar',
        data: entries.map((entry) => ({ value: entry.value, name: entry.label, itemStyle: { color: entry.base ? '#1d4ed8' : entry.color } })),
        label: { show: true, position: 'right', formatter: (p:any) => `${Number(p.value).toFixed(1)}` },
      }],
    } as any;
  }, [chartRows, versionColorMap]);

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
        return { type: 'line', shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }, style: { stroke: '#94a3b8', lineWidth: 1, lineDash: [4,4], fill: 'none' } } as any;
      }, data: segData, tooltip: { show: false }
    }] : [];
    if (!pts.length && !ptsTx.length) return null;
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
          style: { stroke: '#94a3b8', lineWidth: 1, lineDash: [4,4], fill: 'none' }
        } as any;
      }, data: segData, tooltip: { show: false }
    }] : [];
    // Rango Y dinámico para mantener proporciones
    const yVals = [...pointsMsrp.map(p=>p[1]), ...pointsTx.map(p=>p[1])];
    const yMin = yVals.length? Math.max(0, Math.floor(Math.min(...yVals)*0.95)) : 0;
    const yMax = yVals.length? Math.ceil(Math.max(...yVals)*1.05) : 1;
    if (!pointsMsrp.length && !pointsTx.length) return null;
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

  // ADAS (0-100)
  const adasScoreOption = React.useMemo(() => {
    if (!chartRows.length) return null;
    const list = chartRows.map((r:any) => {
      const direct = num((r as any)?.adas_score);
      const fallback = getPillarValue(r, 'adas');
      const val = direct != null ? direct : fallback;
      if (val == null) return null;
      return {
        label: vehLabel(r),
        value: Number(val.toFixed(1)),
        isBase: !!r.__isBase,
        color: colorForVersion(r),
      };
    }).filter(Boolean) as Array<{ label: string; value: number; isBase: boolean; color: string }>;
    if (!list.length) return null;
    const maxVal = Math.max(...list.map((d) => d.value), 0);
    return {
      title: { text: `${PILLAR_LABELS['adas']} (0-100)`, left: 'center', top: 6 },
      grid: { left: 140, right: 40, top: 60, bottom: 60, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => `${p.name}<br/>${PILLAR_LABELS['adas']}: ${Number(p.value).toFixed(1)}`,
      },
      xAxis: { type: 'value', min: 0, max: Math.max(50, Math.ceil(maxVal / 5) * 5), name: 'Score', axisLabel: { formatter: (v:any) => Number(v).toFixed(0) } },
      yAxis: { type: 'category', data: list.map((d) => d.label), axisLabel: { interval: 0 } },
      series: [{
        type: 'bar',
        data: list.map((d) => ({ value: d.value, name: d.label, itemStyle: { color: d.isBase ? '#1d4ed8' : d.color } })),
        label: { show: true, position: 'right', formatter: (p:any) => `${Number(p.value).toFixed(1)}` },
      }],
    } as any;
  }, [chartRows, versionColorMap]);

  const preparedChartsCount = React.useMemo(() => {
    const chartSources = [
      adasScoreOption,
      hpVsPriceOption,
      costPerHpBarOption,
      equipScoreBarOption,
      footprintOption,
    ];
    return chartSources.filter(Boolean).length;
  }, [adasScoreOption, hpVsPriceOption, costPerHpBarOption, equipScoreBarOption, footprintOption]);

  if (paywall) {
    const usedCount = typeof paywall.used === 'number' ? paywall.used : undefined;
    const limitCount = typeof paywall.limit === 'number' ? paywall.limit : undefined;
    return (
      <section style={{ maxWidth: 560, margin: '40px auto', padding: '24px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', display: 'grid', gap: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1f2937' }}>Activa tu membresía</h2>
        <p style={{ color: '#334155', fontSize: 15 }}>{paywall.message}</p>
        {limitCount !== undefined && (
          <p style={{ color: '#475569', fontSize: 14 }}>
            {usedCount !== undefined ? `Usaste ${usedCount} de ${limitCount} búsquedas gratuitas.` : `Límite gratuito: ${limitCount} búsquedas.`}
          </p>
        )}
        {checkoutError ? (
          <p style={{ color: '#dc2626', fontSize: 13 }}>{checkoutError}</p>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {paywall.checkoutAvailable ? (
            <button
              type="button"
              onClick={triggerCheckout}
              disabled={checkoutLoading}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                border: 'none',
                background: checkoutLoading ? '#818cf8' : '#4f46e5',
                color: '#fff',
                fontWeight: 600,
                cursor: checkoutLoading ? 'wait' : 'pointer',
              }}
            >
              {checkoutLoading ? 'Abriendo Stripe…' : 'Pagar con Stripe'}
            </button>
          ) : (
            <span style={{ fontSize: 12, color: '#64748b' }}>Stripe no está disponible, contacta a soporte.</span>
          )}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/membership';
              }
            }}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#1f2937',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Volver a Membresía
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
    <section suppressHydrationWarning style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff', overflowX:'auto' }}>
      <div style={{ fontWeight:700, marginBottom:8 }}>Comparar versiones</div>
      <div style={{ marginBottom:10, color:'#64748b', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        {ownRow ? (
          <span>Base: <strong>{vehicleLabel(ownRow)}</strong></span>
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
    {manualNotice ? (
      <div style={{ margin:'6px 0 10px', padding:'6px 8px', border:'1px solid #fca5a5', borderRadius:8, background:'#fef2f2', color:'#b91c1c', fontSize:12 }}>{manualNotice}</div>
    ) : null}
    <div className="no-print" style={{ margin:'6px 0 12px', display:'flex', justifyContent:'flex-end', gap:8, flexWrap:'wrap' }}>
      <button
        type="button"
        suppressHydrationWarning
        onClick={exportPdf}
        style={{ padding:'8px 12px', background:'#111827', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}
      >
        Exportar PDF
      </button>
      <button
        type="button"
        suppressHydrationWarning
        onClick={generateInsights}
        disabled={insightsLoading || !baseRow}
        style={{ padding:'8px 12px', background:'#1d4ed8', color:'#fff', border:'none', borderRadius:8, cursor:(insightsLoading||!baseRow)?'not-allowed':'pointer', opacity:(insightsLoading||!baseRow)?0.6:1 }}
      >
        {insightsLoading ? 'Generando…' : 'Generar insights'}
      </button>
    </div>
    {(autoGenSeq > 0 || autoGenerate || autoGenerateNotice) ? (
      <div style={{ margin:'6px 0 12px', padding:'8px 10px', border:'1px solid #cbd5e1', borderRadius:8, background:'#f8fafc', color:'#1f2937', fontSize:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontWeight:600 }}>Competidores (IA)</span>
          {autoLoading ? <span style={{ color:'#2563eb' }}>Generando…</span> : null}
        </div>
        {autoGenerateNotice ? (
          <div style={{ marginTop:4 }}>{autoGenerateNotice}</div>
        ) : null}
        {!autoLoading && autoVisibleItems.length ? (
          <div style={{ marginTop:6, display:'flex', flexWrap:'wrap', gap:6 }}>
            {autoVisibleItems.slice(0, 6).map((r:any, idx:number) => (
              <span key={`${r.make}|${r.model}|${r.version||''}|${idx}`} style={{ padding:'4px 8px', borderRadius:999, background:'#e0f2fe', color:'#0369a1', fontSize:11 }}>
                {vehLabel(r)}</span>
            ))}
            {autoVisibleItems.length > 6 ? (
              <span style={{ padding:'4px 8px', borderRadius:999, background:'#e2e8f0', color:'#475569', fontSize:11 }}>+{autoVisibleItems.length - 6}</span>
            ) : null}
          </div>
        ) : null}
        {auto?.used_filters ? (() => {
          const entries = Object.entries(auto.used_filters as Record<string, any>).filter(([_, value]) => value !== null && value !== '' && value !== false);
          if (!entries.length) return null;
          return (
            <div style={{ marginTop:6, fontSize:11, color:'#64748b' }}>
              Filtros aplicados:{' '}
              {entries.map(([key, value], idx) => {
                const label = autoFilterLabels[key] || key;
                const formatted = typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value;
                const suffix = idx < entries.length - 1 ? ' • ' : '';
                return <span key={key}>{label}: {formatted}{suffix}</span>;
              })}
            </div>
          );
        })() : null}
      </div>
    ) : null}
    {dismissedKeys.size > 0 ? (
      <div className="no-print" style={{ margin:'8px 0', display:'flex', justifyContent:'flex-end' }}>
        <button
          type="button"
          suppressHydrationWarning
          onClick={resetDismissed}
          style={{ border:'1px solid #cbd5e1', background:'#fff', color:'#334155', borderRadius:8, padding:'6px 10px', fontSize:12, cursor:'pointer' }}
        >
          Restaurar competidores quitados ({dismissedKeys.size})
        </button>
      </div>
    ) : null}
    <table style={{ width:'100%', minWidth: 1120, borderCollapse:'collapse' }}>
        <thead>
          <tr>
            {headers.map(h => {
              const thStyle: React.CSSProperties = {
                textAlign: (h as any).align || 'left',
                padding:'6px 8px',
                borderBottom:'1px solid #e5e7eb',
                whiteSpace:'normal',
                lineHeight:1.2,
                wordBreak:'break-word'
              };
              if (h.minWidth) thStyle.minWidth = h.minWidth;
              return (
              <th key={h.key} style={thStyle}>
                {h.label}
              </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {/* Fila base (vehículo propio) */}
          {baseRow && (<tr>
            <td style={{ padding:'8px', borderBottom:'1px solid #f1f5f9', width: THUMB_WIDTH + 24 }}>
              <VehicleThumb row={baseRow} width={THUMB_WIDTH} height={THUMB_HEIGHT} />
            </td>
            <td style={{ padding:'12px 12px 12px 6px', borderBottom:'1px solid #f1f5f9', minWidth: 320, maxWidth: 520, whiteSpace:'normal', wordBreak:'normal', overflowWrap:'break-word' }}>
              <div style={{ display:'grid', gap:8, lineHeight:1.4 }}>
                <div style={{ fontWeight:700, fontSize:16 }}>{String(baseRow.make||'')}</div>
                <div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>{baseRow.ano || ''}</div>
                <div style={{ fontWeight:500, fontSize:15 }}>{String(baseRow.model||'')}</div>
                <div style={{ fontWeight:500, fontSize:14 }}>{normalizeVersion(String(baseRow.version||''))}</div>
              </div>
            </td>
            {/* Fila base: sin deltas (es la referencia) */}
            <td style={{ padding:'10px 14px 10px 22px', borderBottom:'1px solid #f1f5f9', fontWeight:600, verticalAlign:'middle', textAlign:'center' }}>
              <div>{fmtMoney(baseRow.msrp)}</div>
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600, textAlign:'center', verticalAlign:'middle' }}>
              <div>{fmtMoney(baseRow.precio_transaccion)}</div>
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600, textAlign:'center', verticalAlign:'middle' }}>
              <div>{fmtMoney(baseRow.bono ?? baseRow.bono_mxn)}</div>
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600, textAlign:'left', verticalAlign:'middle' }}>
              <div>{fmtMoney(baseRow.fuel_cost_60k_mxn)}</div>
              {(() => {
                const label = energyConsumptionLabel(baseRow);
                return label ? <div style={{ fontSize:12, color:'#475569' }}>{label}</div> : null;
              })()}
              <div style={{ fontSize:12, opacity:0.75 }}>{fuelLabel(baseRow) || 'Combustible N/D'} {fuelPriceLabel(baseRow)}</div>
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600, textAlign:'center', verticalAlign:'middle' }}>
              <div>{fmtMoney(baseRow.service_cost_60k_mxn)}</div>
              {(() => { const s = serviceSourceLabel(baseRow); return s? <div style={{ fontSize:12, color:'#64748b' }}>{s}</div> : null; })()}
            </td>
            <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontWeight:600, textAlign:'center', verticalAlign:'middle' }}>
              <div>{fmtMoney(baseRow.tco_60k_mxn)}</div>
            </td>
          </tr>)}
          {comps.map((r: any, i: number) => {
            const dMsrp = r.__deltas?.msrp || r.__deltas?.msrp_mxn || null;
            const dTx   = r.__deltas?.precio_transaccion || null;
            const dB    = r.__deltas?.bono || r.__deltas?.bono_mxn || null;
            const dFuel = r.__deltas?.fuel_cost_60k_mxn || null;
            const dSvc  = r.__deltas?.service_cost_60k_mxn || null;
            const dTco  = r.__deltas?.tco_60k_mxn || null;
            // Mostrar delta desde la perspectiva de nuestro vehículo (own - competitor)
            const inv = (d:any) => (d && typeof d.delta === 'number') ? -d.delta : null;
            const d_msrp = inv(dMsrp);
            const d_tx   = inv(dTx);
            const d_b    = inv(dB);
            const d_fuel = inv(dFuel);
            const d_svc  = inv(dSvc);
            const d_tco  = inv(dTco);
            const rowBg = i % 2 === 0 ? '#ffffff' : '#fafafa';
            return (
              <tr key={i} style={{ background: rowBg, ...hoverStyle(i) }} onMouseEnter={()=>setHoverRow(i)} onMouseLeave={()=>setHoverRow(null)}>
                <td style={{ padding:'8px', borderBottom:'1px solid #f1f5f9', width: THUMB_WIDTH + 24 }}>
                  <VehicleThumb row={r} width={THUMB_WIDTH} height={THUMB_HEIGHT} />
                </td>
                <td style={{ padding:'12px 12px 12px 6px', borderBottom:'1px solid #f1f5f9', minWidth: 320, maxWidth: 520, whiteSpace:'normal', wordBreak:'normal', overflowWrap:'break-word' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                    <div style={{ minWidth:0, display:'grid', gap:8, lineHeight:1.4 }}>
                      <div style={{ fontWeight:600, fontSize:14 }}>{String(r.make||'')}</div>
                      <div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>{r.ano || ''}</div>
                      <div style={{ fontWeight:500, fontSize:13.5 }}>{String(r.model||'')}</div>
                      <div style={{ fontWeight:500, fontSize:12.5 }}>{normalizeVersion(String(r.version||''))}</div>
                    </div>
                    <button
                      type="button"
                      suppressHydrationWarning
                      onClick={()=>removeCompetitor(r)}
                      title="Quitar competidor"
                      style={{ border:'1px solid #e2e8f0', background:'#fff', color:'#475569', borderRadius:999, width:24, height:24, lineHeight:'21px', textAlign:'center', cursor:'pointer' }}
                    >
                      ×
                    </button>
                  </div>
                </td>

                <td style={{ padding:'10px 12px 10px 22px', borderBottom:'1px solid #f1f5f9', verticalAlign:'middle', textAlign:'center' }}>
                  <div>{fmtMoney(r.msrp)}</div>
                  <div style={{ fontSize:12, opacity:0.9, color: d_msrp!=null ? (d_msrp<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_msrp==null?'-':`${tri(d_msrp)} ${fmtMoney(Math.abs(d_msrp))}`}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', textAlign:'center', verticalAlign:'middle' }}>
                  <div>{fmtMoney(r.precio_transaccion)}</div>
                  <div style={{ fontSize:12, opacity:0.9, color: d_tx!=null ? (d_tx<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_tx==null?'-':`${tri(d_tx)} ${fmtMoney(Math.abs(d_tx))}`}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', textAlign:'center', verticalAlign:'middle' }}>
                  <div>{fmtMoney(r.bono ?? r.bono_mxn)}</div>
                  <div style={{ fontSize:12, opacity:0.9, color:'#64748b' }}>{d_b==null?'-':`${tri(d_b)} ${fmtMoney(Math.abs(d_b))}`}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', textAlign:'left', verticalAlign:'middle' }}>
                  <div>{fmtMoney(r.fuel_cost_60k_mxn)}</div>
                  {(() => {
                    const label = energyConsumptionLabel(r);
                    return label ? <div style={{ fontSize:12, color:'#475569' }}>{label}</div> : null;
                  })()}
                  <div style={{ fontSize:12, opacity:0.75 }}>{fuelLabel(r) || 'Combustible N/D'} {fuelPriceLabel(r)}</div>
                  <div style={{ fontSize:12, opacity:0.9, color: d_fuel!=null ? (d_fuel<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_fuel==null?'-':`${tri(d_fuel)} ${fmtMoney(Math.abs(d_fuel))}`}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', textAlign:'center', verticalAlign:'middle' }}>
                  <div>{fmtMoney(r.service_cost_60k_mxn)}</div>
                  {(() => { const s = serviceSourceLabel(r); return s? <div style={{ fontSize:12, color: s==='Incluido'? '#16a34a':'#64748b' }}>{s}</div> : null; })()}
                  <div style={{ fontSize:12, opacity:0.9, color: d_svc!=null ? (d_svc<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_svc==null?'-':`${tri(d_svc)} ${fmtMoney(Math.abs(d_svc))}`}</div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', textAlign:'center', verticalAlign:'middle' }}>
                  <div>{fmtMoney(r.tco_60k_mxn)}</div>
                  <div style={{ fontSize:12, opacity:0.9, color: d_tco!=null ? (d_tco<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_tco==null?'-':`${tri(d_tco)} ${fmtMoney(Math.abs(d_tco))}`}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section style={{ marginTop:16, border:'1px solid #e5e7eb', borderRadius:10, padding:12, background:'#fff' }}>
        <div style={{ paddingBottom:8, borderBottom:'1px solid #e5e7eb', marginBottom:12, background:'#f8fafc', fontWeight:600 }}>
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
              const name = vehicleLabel(section.comp, { includeYear: true, marker: '' });
              const key = keyForRow(section.comp) || `${idx}`;
              return (
                <div key={key} style={{ border:'1px solid #f1f5f9', borderRadius:10, padding:12, background:'#fff' }}>
                  <div style={{ fontWeight:600, marginBottom:8 }}>{name || `Competidor ${idx + 1}`}</div>
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
            {advantageNotice}
          </div>
        )}
      </section>

      {brandNameForSales ? (
        <section style={{ marginTop:16, border:'1px solid #e5e7eb', borderRadius:10, padding:12, background:'#fff' }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>Ventas mensuales de {brandNameForSales} (2025 vs 2024)</div>
          {brandSalesLoading ? (
            <div style={{ fontSize:12, color:'#64748b' }}>Cargando ventas de la marca…</div>
          ) : brandSalesError ? (
            <div style={{ fontSize:12, color:'#dc2626' }}>No pudimos cargar las ventas de la marca.</div>
          ) : brandSalesOption ? (
            <EChart option={brandSalesOption} style={{ height:200 }} />
          ) : (
            <div style={{ fontSize:12, color:'#64748b' }}>{brandSalesData?.warning || 'No hay ventas reportadas para esta marca en 2024–2025.'}</div>
          )}
        </section>
      ) : null}

      {/* Manual list rendered inside ManualBlock */}
      <div style={{ marginTop:16, display:'grid', gap:16 }}>
        {/* Diferencias de equipo vs base (lista simple) */}
        {(() => {
          if (!baseRow || !comps.length) return null;
          const baseHasAny = FEATURE_FIELD_DEFS.some(({ key }) => truthyFeature((baseRow as any)?.[key]));
          return (
            <div style={{ border:'1px solid #e5e7eb', borderRadius:10 }}>
              <div style={{ padding:'8px 10px', borderBottom:'1px solid #e5e7eb', background:'#fafafa', fontWeight:600 }}>Equipo: diferencias vs base</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:12, padding:10 }}>
                {comps.map((r:any, idx:number) => {
          const { plus: rawPlus, minus: rawMinus } = getFeatureDiffs(r);
          const plus = rawPlus.slice(0, 12);
          const minus = rawMinus.slice(0, 12);
          const baseLabel = vehLabel(baseRow);
          const color = colorForVersion(r);
          return (
            <div key={idx} style={{ border:'1px solid #f1f5f9', borderRadius:8, padding:10 }}>
              <div style={{ fontWeight:600, marginBottom:6, color:'#334155' }}>{vehLabel(r)}</div>
              <div style={{ display:'flex', gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:'#16a34a', marginBottom:4 }}>Ellos no tienen (nosotros sí)</div>
                  {minus.length ? (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {minus.map((p,i)=>(<span key={i} style={{ fontSize:11, background:'rgba(22,163,74,0.08)', color:'#166534', border:`1px solid rgba(22,163,74,0.25)`, borderRadius:6, padding:'2px 6px' }}>{p}</span>))}
                    </div>
                  ) : (
                    <div style={{ fontSize:11, color:'#15803d', background:'rgba(22,163,74,0.08)', border:'1px solid rgba(22,163,74,0.25)', borderRadius:6, padding:'4px 6px' }}>
                      No encontramos gaps verdes relevantes; {baseLabel} ya cubre los features priorizados.
                    </div>
                  )}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:'#dc2626', marginBottom:4 }}>Ellos sí tienen (nosotros no)</div>
                  {plus.length ? (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {plus.map((p,i)=>(<span key={i} style={{ fontSize:11, background:'rgba(220,38,38,0.06)', color:'#991b1b', border:`1px solid rgba(220,38,38,0.25)`, borderRadius:6, padding:'2px 6px' }}>{p}</span>))}
                    </div>
                  ) : (
                    <div style={{ fontSize:11, color:'#991b1b', background:'rgba(220,38,38,0.06)', border:'1px solid rgba(220,38,38,0.25)', borderRadius:6, padding:'4px 6px' }}>
                      No detectamos equipamiento rojo prioritario; {vehLabel(r)} no añade features clave frente a {baseLabel}.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
              </div>
            </div>
          );
        })()}

        <section style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12, background:'#fff', display:'grid', gap:16 }}>
          <div style={{ fontWeight:700 }}>Visualizaciones comparativas</div>
          <div style={{ display:'grid', gap:16 }}>
            {renderChart(adasScoreOption, 320, 'No encontramos datos de ADAS para estos vehículos.')}
            {renderChart(hpVsPriceOption, 340, 'No pudimos graficar HP vs precio con la información disponible.')}
            {renderChart(costPerHpBarOption, 320, 'No pudimos calcular el costo por HP.')}
            {renderChart(equipScoreBarOption, 320, 'Sin datos de score de equipamiento.')}
            {renderChart(footprintOption, 360, 'Faltan dimensiones de largo/ancho para los vehículos seleccionados.')}
          </div>
        </section>

        {preparedChartsCount === 0 ? (
          <div
            style={{
              border: '1px dashed #e2e8f0',
              borderRadius: 10,
              padding: '12px 14px',
              marginTop: 12,
              color: '#64748b',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            No contamos con datos suficientes para generar las gráficas comparativas.
          </div>
        ) : null}

        <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12, marginTop:16 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>Insights</div>
          {insightsStruct ? (
            <>
              <div style={{ display:'grid', gap:12 }}>
                {renderStruct(insightsStruct, 'es' as any)}
              </div>
              {insightsNotice ? (<div style={{ marginTop:10, color:'#475569', fontSize:12 }}>{insightsNotice}</div>) : null}
            </>
          ) : (
            <div style={{ color:'#64748b', fontSize:13 }}>{insightsNotice}</div>
          )}
        </div>


      </div>
    </section>
    </>
  );
}
