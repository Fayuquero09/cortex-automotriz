"use client";
import React from 'react';
import dynamic from 'next/dynamic';
import * as echarts from 'echarts';
const EChart = dynamic(() => import('echarts-for-react'), { ssr: false });
import useSWR from 'swr';
import { useAppState } from '@/lib/state';
import { endpoints } from '@/lib/api';
import { renderStruct } from '@/lib/insightsTemplates';
import { brandLabel, vehicleLabel, fuelCategory } from '@/lib/vehicleLabels';
import { energyConsumptionLabel } from '@/lib/consumption';
import { VehicleThumb } from '@/components/VehicleThumb';

type Row = Record<string, any>;

const THUMB_WIDTH = 116;
const THUMB_HEIGHT = 72;
const RADAR_PILLARS = ['seguridad', 'confort', 'audio_y_entretenimiento', 'transmision', 'energia'] as const;
const RADAR_MAX_SCORE = 100;
const KPI_ADVANTAGE_FIELDS: Array<{ key: string; label: string; formatter?: (value: any) => string }> = [
  { key: 'equip_score', label: 'Score de equipamiento', formatter: (value) => (num(value) ?? null) != null ? `${Number(value).toFixed(1)} pts` : 'N/D' },
  { key: 'infotainment_score', label: 'Infotenimiento', formatter: (value) => (num(value) ?? null) != null ? `${Number(value).toFixed(1)} pts` : 'N/D' },
  { key: 'convenience_score', label: 'Confort & conveniencia', formatter: (value) => (num(value) ?? null) != null ? `${Number(value).toFixed(1)} pts` : 'N/D' },
  { key: 'hvac_score', label: 'Climatización', formatter: (value) => (num(value) ?? null) != null ? `${Number(value).toFixed(1)} pts` : 'N/D' },
  { key: 'adas_score', label: 'ADAS', formatter: (value) => (num(value) ?? null) != null ? `${Number(value).toFixed(1)} pts` : 'N/D' },
  { key: 'safety_score', label: 'Seguridad', formatter: (value) => (num(value) ?? null) != null ? `${Number(value).toFixed(1)} pts` : 'N/D' },
  { key: 'warranty_score', label: 'Cobertura de garantía', formatter: (value) => (num(value) ?? null) != null ? `${Number(value).toFixed(1)} pts` : 'N/D' },
  { key: 'traction_offroad_score', label: 'Capacidad off-road', formatter: (value) => (num(value) ?? null) != null ? `${Number(value).toFixed(0)} pts` : 'N/D' },
  { key: 'lighting_score', label: 'Iluminación', formatter: (value) => (num(value) ?? null) != null ? `${Number(value).toFixed(0)} pts` : 'N/D' },
];

const vehicleDisplayName = (row: Row | null | undefined): string => {
  if (!row) return '';
  const brand = brandLabel(row);
  const model = String(row?.model ?? '').trim();
  const version = String(row?.version ?? '').trim();
  const parts = [brand, model, version ? `– ${version}` : ''].filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

type DealerContextInfo = {
  id?: string;
  name?: string;
  location?: string;
  contactName?: string;
  contactPhone?: string;
};

type DealerStatusInfo = {
  status?: string;
  organization_status?: string;
  blocked?: boolean;
  dealer_name?: string | null;
  organization_name?: string | null;
  brand_name?: string | null;
};

type DealerTemplate = {
  id: string;
  template_name: string;
  own_vehicle: Record<string, any>;
  competitors: Record<string, any>[];
  dealer_info?: Record<string, any> | null;
  sales_rep_info?: Record<string, any> | null;
  created_at?: string;
  updated_at?: string;
};

type DealerPanelProps = {
  dealerContext?: DealerContextInfo;
  dealerStatus?: DealerStatusInfo;
  dealerUserId?: string;
  dealerUserEmail?: string;
  previewMode?: boolean;
};

type AdvantageRow = {
  key: string;
  label: string;
  delta: number;
  ownValue: string;
  compValue: string;
};

type AdvantageSection = {
  comp: Row;
  rows: AdvantageRow[];
};

function num(x: any): number | null {
  if (x === null || x === undefined || (typeof x === 'string' && x.trim() === '')) return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const formatCurrency = (value: any, options?: { fallback?: string }): string => {
  const fallback = options?.fallback ?? 'N/D';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return currencyFormatter.format(numeric);
};

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
          {list.map((r:Row, i:number)=> {
            const price = formatCurrency(r?.precio_transaccion ?? r?.msrp, { fallback: 'N/D' });
            const fuelLabel = fuelCategory(r).label;
            return (
              <button
                key={i}
                onClick={()=> onAdd(r)}
                style={{ border:'1px solid #e5e7eb', background:'#fff', padding:'4px 8px', borderRadius:6, cursor:'pointer', fontSize:12, textAlign:'left' }}
              >
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', lineHeight:1.35 }}>
                  <span>{vehicleLabel(r)}</span>
                  <span style={{ fontSize:11, color:'#475569' }}>
                    {price}{fuelLabel ? ` · ${fuelLabel}` : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ): null}
    </div>
  );
}

const cleanVehicleRow = (row: Row | null | undefined): Row => {
  if (!row || typeof row !== 'object') return {};
  const cleaned: Row = { ...row };
  delete cleaned.__deltas;
  delete cleaned.__diffs;
  return cleaned;
};

const formatTemplateDate = (value?: string | null): string => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return String(value);
  }
};

export default function DealerPanel({ dealerContext, dealerStatus, dealerUserId, dealerUserEmail, previewMode }: DealerPanelProps = {}) {
  const { own, setOwn } = useAppState();
  const { data: cfg } = useSWR<any>('cfg', () => endpoints.config());
  const fuelPrices = cfg?.fuel_prices || {};
  const blocked = previewMode ? false : Boolean(dealerStatus?.blocked);
  const hasDealerId = Boolean(dealerContext?.id && dealerContext.id.trim());
  const unlocked = previewMode || hasDealerId;
  const ready = !blocked && unlocked && !!own.model && !!own.year && (!!own.make || true);
  const dealerNameLabel = dealerContext?.name?.trim() || dealerStatus?.dealer_name || 'Dealer configurado';
  const dealerLocationLabel = dealerContext?.location?.trim() || '';
  const dealerContactLabel = dealerContext?.contactName?.trim();
  const dealerContactPhone = dealerContext?.contactPhone?.trim();
  const allowedBrand = previewMode
    ? ''
    : ((dealerStatus?.brand_name && typeof dealerStatus.brand_name === 'string')
      ? dealerStatus.brand_name.trim()
      : '');
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
  const [templateName, setTemplateName] = React.useState('');
  const [templateError, setTemplateError] = React.useState('');
  const [templateSuccess, setTemplateSuccess] = React.useState('');
  const [templateSaving, setTemplateSaving] = React.useState(false);
  const [templateDeleting, setTemplateDeleting] = React.useState<string | null>(null);
  const [advantageMode, setAdvantageMode] = React.useState<'upsides' | 'gaps'>('upsides');
  const canUseTemplates = Boolean(dealerUserId && dealerUserId.trim());
  const {
    data: templateData,
    error: templateFetchError,
    isLoading: templateLoading,
    mutate: mutateTemplates,
  } = useSWR<{ templates: DealerTemplate[] }>(
    canUseTemplates ? ['dealer_templates', dealerUserId] : null,
    endpoints.dealerTemplates,
  );
  const templates = templateData?.templates ?? [];
  const addComp = async (r: Row) => {
    if (blocked) {
      setManualNotice('El acceso del dealer está pausado. Solicita reactivación al superadmin para agregar comparativos.');
      return;
    }
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

  const saveTemplate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canUseTemplates) {
      setTemplateError('Captura tu UUID de Supabase para guardar plantillas.');
      return;
    }
    if (!templateName.trim()) {
      setTemplateError('El nombre de la plantilla es obligatorio.');
      return;
    }
    if (!ownRow) {
      setTemplateError('Selecciona un vehículo propio antes de guardar la plantilla.');
      return;
    }
    setTemplateSaving(true);
    setTemplateError('');
    setTemplateSuccess('');
    try {
      const payload: Record<string, any> = {
        template_name: templateName.trim(),
        own_vehicle: cleanVehicleRow(ownRow),
        competitors: manual.map((item) => cleanVehicleRow(item)),
        dealer_info: {
          id: dealerContext?.id,
          name: dealerContext?.name,
          location: dealerContext?.location,
          brand_name: dealerStatus?.brand_name,
        },
        sales_rep_info: {
          user_id: dealerUserId,
          email: dealerUserEmail,
        },
      };
      await endpoints.dealerSaveTemplate(payload);
      await mutateTemplates();
      setTemplateSuccess('Plantilla guardada correctamente.');
      setTemplateName('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar la plantilla';
      setTemplateError(message);
    } finally {
      setTemplateSaving(false);
    }
  };

  const applyTemplate = (template: DealerTemplate) => {
    if (!template?.own_vehicle) {
      setTemplateError('La plantilla no tiene vehículo propio guardado.');
      return;
    }
    if (blocked) {
      setTemplateError('El dealer está pausado; solicita reactivación para aplicar plantillas.');
      return;
    }
    const templateBrand = String(template.own_vehicle?.make || template.own_vehicle?.brand || '').trim();
    if (allowedBrand && templateBrand && templateBrand.toLowerCase() !== allowedBrand.toLowerCase()) {
      setTemplateError('La plantilla pertenece a otra marca.');
      return;
    }
    const nextOwn = {
      make: templateBrand || own.make,
      model: String(template.own_vehicle?.model || '').trim(),
      year: template.own_vehicle?.ano ?? template.own_vehicle?.year ?? '',
      version: String(template.own_vehicle?.version || '').trim(),
    };
    const parsedYear = Number(nextOwn.year);
    setOwn({
      make: nextOwn.make,
      model: nextOwn.model,
      year: Number.isFinite(parsedYear) ? parsedYear : '',
      version: nextOwn.version,
    });
    const competitors = Array.isArray(template.competitors)
      ? template.competitors.map((item) => cleanVehicleRow(item))
      : [];
    setManual(competitors);
    setManualNotice('');
    setTemplateError('');
    setTemplateSuccess(`Plantilla "${template.template_name}" aplicada.`);
  };

  const handleDeleteTemplate = async (template: DealerTemplate) => {
    if (!template?.id) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`¿Eliminar la plantilla "${template.template_name}"? Esta acción no se puede deshacer.`);
      if (!ok) return;
    }
    setTemplateError('');
    setTemplateSuccess('');
    setTemplateDeleting(template.id);
    try {
      await endpoints.dealerDeleteTemplate(template.id);
      await mutateTemplates();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar la plantilla';
      setTemplateError(message);
    } finally {
      setTemplateDeleting(null);
    }
  };

  React.useEffect(() => {
    if (!templateSuccess) return;
    const timer = window.setTimeout(() => setTemplateSuccess(''), 4000);
    return () => window.clearTimeout(timer);
  }, [templateSuccess]);

  const sig = (rows: Row[]) => rows.map(r => `${r.make}|${r.model}|${r.version||''}|${r.ano||''}`).join(',');
  const { data: compared } = useSWR(ownRow ? ['dealer_compare', ownRow?.id || ownRow?.model, ownRow?.ano, sig(manual)] : null, async () => {
    return endpoints.compare({ own: ownRow, competitors: manual });
  });
  const baseRow = (compared?.own || ownRow) as Row | null;
  const comps = ((compared?.competitors || []) as any[]).map(c => ({ ...c.item, __deltas: c.deltas || {}, __diffs: c.diffs || {} }));

  function fuelLabel(row: any): string {
    const label = fuelCategory(row).label;
    return label || '';
  }

  function fuelPriceLabel(row: any): string {
    const info = fuelCategory(row);
    const key = info.key;
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
    if (['gasolina_magna', 'gasolina', 'hev', 'mhev', 'phev'].includes(key)) {
      const v = fuelPrices?.gasolina_magna_litro ?? fuelPrices?.gasolina_premium_litro;
      return v ? `• $${Number(v).toFixed(2)}/L${asOf}${src}` : '';
    }
    if (key === 'bev') {
      const v = fuelPrices?.electricidad_kwh;
      return v ? `• $${Number(v).toFixed(2)}/kWh${asOf}${src}` : '';
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
    return formatCurrency(val);
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

  const radarSummary = React.useMemo(() => {
    if (!baseRow) return null;
    const baseName = vehicleDisplayName(baseRow) || 'Vehículo propio';
    const baseSegment = segLabel(baseRow);
    const candidateRows = [{ row: baseRow, name: baseName }, ...comps.map((row: Row, idx: number) => ({ row, name: vehicleDisplayName(row) || `Competidor ${idx + 1}` }))];
    const available = candidateRows.filter((item) => item.row);
    if (!available.length) return null;

    const sample = baseSegment !== '-' ? available.filter((item) => segLabel(item.row) === baseSegment) : available;
    const radarSource = sample.length ? sample : available;

    const computeValue = (row: Row | null | undefined, pillar: (typeof RADAR_PILLARS)[number]): number | null => {
      const rawVal = getPillarValue(row, pillar);
      if (rawVal == null) return null;
      const numVal = Number(rawVal);
      if (!Number.isFinite(numVal) || numVal <= 0) return null;
      return Math.min(RADAR_MAX_SCORE, Math.max(0, Number(numVal.toFixed(1))));
    };

    const baseValuesRaw = RADAR_PILLARS.map((pillar) => computeValue(baseRow, pillar));
    const hasAny = baseValuesRaw.some((val) => val != null);
    if (!hasAny) return null;
    const baseValues = baseValuesRaw.map((val) => (val == null ? 0 : val));

    const benchmarkValues = RADAR_PILLARS.map((pillar) => {
      let sum = 0;
      let count = 0;
      radarSource.forEach((entry) => {
        const val = computeValue(entry.row, pillar);
        if (val != null) {
          sum += val;
          count += 1;
        }
      });
      return count ? Number((sum / count).toFixed(1)) : 0;
    });

    const bestByPillar: Record<string, { value: number; vehicle: string }> = {};
    RADAR_PILLARS.forEach((pillar) => {
      let bestVal: number | null = null;
      let bestVehicle = '';
      radarSource.forEach((entry) => {
        const val = computeValue(entry.row, pillar);
        if (val != null && (bestVal == null || val > bestVal)) {
          bestVal = val;
          bestVehicle = vehicleDisplayName(entry.row) || entry.name;
        }
      });
      if (bestVal != null) {
        bestByPillar[pillar] = { value: Number(bestVal.toFixed(1)), vehicle: bestVehicle };
      }
    });
    const bestValues = RADAR_PILLARS.map((pillar) => bestByPillar[pillar]?.value ?? 0);

    const benchmarkLabel = baseSegment && baseSegment !== '-' ? `Benchmark ${baseSegment}` : 'Benchmark segmento';
    const bestLabel = 'Best in class';
    const indicator = RADAR_PILLARS.map((pillar) => ({ name: PILLAR_LABELS[pillar] || pillar, max: RADAR_MAX_SCORE }));

    const option: echarts.EChartsOption = {
      color: ['#2563eb', '#64748b', '#16a34a'],
      legend: {
        bottom: 0,
        data: [baseName, benchmarkLabel, bestLabel],
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0f172a',
        borderRadius: 8,
        borderWidth: 0,
        textStyle: { color: '#f8fafc' },
        formatter: (params: any) => {
          const values: number[] = Array.isArray(params?.value) ? params.value : [];
          const title = `<strong>${params?.name || ''}</strong>`;
          const rows = RADAR_PILLARS.map((pillar, idx) => {
            const label = PILLAR_LABELS[pillar] || pillar;
            const val = values[idx] != null ? Number(values[idx]).toFixed(1) : '0.0';
            const extra = params?.name === bestLabel && bestByPillar[pillar]?.vehicle
              ? ` — ${bestByPillar[pillar].vehicle}`
              : '';
            return `${label}: ${val} pts${extra}`;
          });
          return [title, ...rows].join('<br />');
        },
      },
      radar: {
        indicator,
        radius: '65%',
        splitNumber: 5,
        axisName: { color: '#0f172a', fontSize: 11 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
        splitArea: { areaStyle: { color: ['#ffffff', '#f8fafc'] } },
        axisLine: { lineStyle: { color: '#cbd5f5' } },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: baseValues,
              name: baseName,
              areaStyle: { color: 'rgba(37, 99, 235, 0.18)' },
              lineStyle: { color: '#2563eb', width: 2 },
              symbol: 'circle',
              symbolSize: 4,
            },
            {
              value: benchmarkValues,
              name: benchmarkLabel,
              areaStyle: { color: 'rgba(100, 116, 139, 0.12)' },
              lineStyle: { color: '#64748b', type: 'dashed', width: 2 },
              symbol: 'none',
            },
            {
              value: bestValues,
              name: bestLabel,
              areaStyle: { color: 'rgba(22, 163, 74, 0.12)' },
              lineStyle: { color: '#16a34a', width: 2 },
              symbol: 'circle',
              symbolSize: 6,
            },
          ],
        },
      ],
    };

    const highlights = RADAR_PILLARS.map((pillar) => {
      const info = bestByPillar[pillar];
      if (!info) return null;
      return `${PILLAR_LABELS[pillar] || pillar}: ${info.value.toFixed(1)} pts — ${info.vehicle}`;
    }).filter(Boolean) as string[];

    return {
      option,
      highlights,
      benchmarkLabel,
      bestLabel,
      baseName,
      segmentLabel: baseSegment,
      sampleSize: radarSource.length,
    };
  }, [baseRow, comps]);

  const radarBenchmarkLabel = radarSummary?.benchmarkLabel ?? 'Benchmark segmento';
  const radarSegmentLabel = radarSummary?.segmentLabel && radarSummary.segmentLabel !== '-' ? radarSummary.segmentLabel : 'segmento seleccionado';

  const formatKpiValue = React.useCallback((cfg: { formatter?: (value: any) => string }, value: any) => {
    if (typeof cfg?.formatter === 'function') {
      return cfg.formatter(value);
    }
    return fmtNum(value);
  }, []);

  const advantageData = React.useMemo<AdvantageSection[]>(() => {
    if (!baseRow) return [];
    return comps
      .map((comp) => {
        const rows: AdvantageRow[] = KPI_ADVANTAGE_FIELDS.map((cfg) => {
          const deltaRaw = (comp as any)?.__deltas?.[cfg.key]?.delta;
          const delta = typeof deltaRaw === 'number' ? deltaRaw : Number(deltaRaw);
          if (!Number.isFinite(delta) || delta === 0) return null;
          const ownIsBetter = delta < 0;
          const shouldDisplay = advantageMode === 'upsides' ? ownIsBetter : !ownIsBetter;
          if (!shouldDisplay) return null;
          const ownValue = formatKpiValue(cfg, (baseRow as any)?.[cfg.key]);
          const compValue = formatKpiValue(cfg, (comp as any)?.[cfg.key]);
          return {
            key: cfg.key,
            label: cfg.label,
            delta,
            ownValue,
            compValue,
          };
        }).filter((item): item is AdvantageRow => Boolean(item));
        if (!rows.length) return null;
        return { comp, rows } as AdvantageSection;
      })
      .filter((item): item is AdvantageSection => Boolean(item));
  }, [baseRow, comps, advantageMode, formatKpiValue]);

  const buildAdvantageOption = React.useCallback(
    (rows: AdvantageRow[]): echarts.EChartsOption => {
      const color = advantageMode === 'upsides' ? '#16a34a' : '#dc2626';
      return {
        color: [color],
        grid: { left: 140, right: 24, top: 24, bottom: 36, containLabel: true },
        tooltip: {
          trigger: 'item',
          backgroundColor: '#0f172a',
          borderWidth: 0,
          borderRadius: 10,
          textStyle: { color: '#f8fafc' },
          formatter: (params: any) => {
            const data = params?.data || {};
            const direction = data?.delta < 0 ? 'Nosotros' : 'Competidor';
            const deltaText = `${data?.delta < 0 ? '-' : '+'}${Math.abs(Number(data?.delta || 0)).toFixed(1)}`;
            const ownLine = `<span style="color:#38bdf8">Nosotros:</span> ${data?.ownValue ?? '-'}`;
            const compLine = `<span style="color:#fbbf24">Competidor:</span> ${data?.compValue ?? '-'}`;
            return `<strong>${data?.label || ''}</strong><br/>Δ (competidor - nosotros): ${deltaText}<br/>${ownLine}<br/>${compLine}`;
          },
        },
        xAxis: {
          type: 'value',
          axisLabel: { color: '#475569' },
          splitLine: { lineStyle: { color: '#e2e8f0' } },
        },
        yAxis: {
          type: 'category',
          data: rows.map((row) => row.label),
          axisLabel: { color: '#1e293b', fontSize: 12 },
        },
      series: [
        {
          type: 'bar',
          barWidth: 22,
          data: rows.map((row) => ({
            value: Number(Math.abs(row.delta).toFixed(2)),
            delta: row.delta,
            label: row.label,
            ownValue: row.ownValue,
            compValue: row.compValue,
          })) as any,
        },
      ],
    };
  },
    [advantageMode],
  );

  const salesChart = React.useMemo<
    | {
        year: number;
        option: echarts.EChartsOption;
      }
    | null
  >(() => {
    const participants = [{ name: vehicleDisplayName(baseRow) || 'Propio', row: baseRow }, ...comps.map((comp) => ({ name: vehicleDisplayName(comp) || brandLabel(comp), row: comp }))];
    const yearSet = new Set<number>();
    const SALES_REGEX = /^ventas_(\d{4})_(\d{2})$/;
    participants.forEach((entry) => {
      if (!entry.row) return;
      Object.keys(entry.row).forEach((key) => {
        const match = key.match(SALES_REGEX);
        if (match) yearSet.add(Number(match[1]));
      });
    });
    if (yearSet.size === 0) return null;
    const years = Array.from(yearSet).sort();
    const year = years[years.length - 1];
    const monthCodes = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const series = participants
      .map((entry) => {
        const data = monthCodes.map((code) => {
          const key = `ventas_${year}_${code}`;
          const val = num((entry.row as any)?.[key]);
          return val ?? 0;
        });
        const total = data.reduce((acc, val) => acc + val, 0);
        if (total <= 0) return null;
        return {
          name: entry.name,
          type: 'line' as const,
          smooth: true,
          data,
        };
      })
      .filter((item): item is { name: string; type: 'line'; smooth: true; data: number[] } => Boolean(item));
    if (!series.length) return null;
    return {
      year,
      option: {
        tooltip: { trigger: 'axis' },
        legend: { top: 0, data: series.map((s) => s.name) },
        grid: { left: 60, right: 20, top: 40, bottom: 32 },
        xAxis: { type: 'category', data: monthLabels },
        yAxis: { type: 'value', name: 'Unidades', minInterval: 1 },
        series,
      },
    };
  }, [baseRow, comps]);

  const buildFallbackScript = React.useCallback(() => {
    if (!baseRow) return { sections: [] };
    const baseName = `${brandLabel(baseRow)} ${baseRow.model || ''}${baseRow.version ? ` – ${baseRow.version}` : ''}`.trim();
    const basePrice = num(baseRow?.precio_transaccion) ?? num(baseRow?.msrp);
    const baseEquip = equipScoreFor(baseRow);
    const baseFuel = num(baseRow?.fuel_cost_60k_mxn);
    const baseFuelLabel = fuelCategory(baseRow).label || 'combustible tradicional';

    const saludo = `Saluda al cliente, presenta ${baseName} y pregunta para qué lo necesita (familia, viajes, carga).`;
    const valor = `Menciona que ofrece ${baseRow.caballos_fuerza ? `${fmtNum(baseRow.caballos_fuerza)} hp` : 'potencia destacada'}, combustible ${baseFuelLabel} y precio ${basePrice != null ? formatMoney(basePrice) : 'competitivo'}.`;

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
  function fmtMoney(v:any){ return formatCurrency(v, { fallback: '-' }); }
  function fmtNum(v:any){ const n=Number(v); return Number.isFinite(n)? Intl.NumberFormat('es-MX').format(n):'-'; }
  function tri(n:number){ return n>0?'↑':(n<0?'↓':'='); }

  return (
    <section style={{ display:'grid', gap:16 }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:12, alignItems:'center', padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:10, background:'#f8fafc' }}>
        <span style={{ fontWeight:700 }}>{dealerNameLabel}{dealerLocationLabel ? ` · ${dealerLocationLabel}` : ''}</span>
        {dealerStatus?.brand_name ? (
          <span style={{ fontSize:12, color:'#475569' }}>Marca asignada: {dealerStatus.brand_name}</span>
        ) : null}
        {dealerStatus?.organization_name ? (
          <span style={{ fontSize:12, color:'#475569' }}>Organización: {dealerStatus.organization_name}</span>
        ) : null}
        {dealerContactLabel ? (
          <span style={{ fontSize:12, color:'#475569' }}>Asesor: {dealerContactLabel}{dealerContactPhone ? ` · ${dealerContactPhone}` : ''}</span>
        ) : null}
        {blocked ? (
          <span style={{ fontSize:12, color:'#b91c1c', background:'#fee2e2', padding:'2px 8px', borderRadius:999 }}>Acceso pausado</span>
        ) : hasDealerId ? (
          <span style={{ fontSize:12, color:'#166534', background:'#dcfce7', padding:'2px 8px', borderRadius:999 }}>Acceso activo</span>
        ) : null}
      </div>

      {!hasDealerId && !previewMode ? (
        <div style={{ border:'1px solid #fca5a5', borderRadius:10, padding:16, background:'#fef2f2', color:'#991b1b' }}>
          Ingresa y guarda el UUID del dealer para habilitar los comparativos y registrar historial.
        </div>
      ) : blocked ? (
        <div style={{ border:'1px solid #f97316', borderRadius:10, padding:16, background:'#fff7ed', color:'#9a3412' }}>
          El superadmin pausó este dealer u organización. Contacta a tu marca para reactivar el acceso.
        </div>
      ) : (
        <>
          <div className="no-print" style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12, background:'#f8fafc' }}>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Vehículo propio</div>
              {baseRow ? (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  <div style={{ fontWeight:700, fontSize:16 }}>{brandLabel(baseRow)} {String(baseRow.model||'')}</div>
                  <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:12, color:'#475569' }}>
                    <span>{baseRow.version || 'Versión N/D'}</span>
                    <span>{baseRow.ano ? `MY ${baseRow.ano}` : 'Año N/D'}</span>
                    <span>{fuelLabel(baseRow) || 'Combustible N/D'}</span>
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
            <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12, background:'#ffffff' }}>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>Plantillas de comparativos</div>
              {!canUseTemplates ? (
                <div style={{ fontSize:12, color:'#475569', lineHeight:1.4 }}>
                  Captura el UUID del superusuario del dealer para habilitar el guardado automático de plantillas.
                </div>
              ) : (
                <>
                  {templateError ? (
                    <div style={{ marginBottom:8, fontSize:12, color:'#b91c1c', background:'#fee2e2', padding:'6px 8px', borderRadius:8 }}>
                      {templateError}
                    </div>
                  ) : null}
                  {templateSuccess ? (
                    <div style={{ marginBottom:8, fontSize:12, color:'#166534', background:'#dcfce7', padding:'6px 8px', borderRadius:8 }}>
                      {templateSuccess}
                    </div>
                  ) : null}
                  {templateFetchError ? (
                    <div style={{ marginBottom:8, fontSize:12, color:'#9a3412', background:'#ffedd5', padding:'6px 8px', borderRadius:8 }}>
                      Ocurrió un error al cargar tus plantillas. Intenta refrescar la página.
                    </div>
                  ) : null}
                  <form onSubmit={saveTemplate} style={{ display:'grid', gap:8, marginBottom:12 }}>
                    <input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Nombre de la plantilla (ej. Demo SUV Norte)"
                      style={{ padding:'8px 10px', borderRadius:8, border:'1px solid #cbd5f5', fontSize:13 }}
                      maxLength={120}
                    />
                    <button
                      type="submit"
                      disabled={templateSaving}
                      style={{
                        padding:'8px 10px',
                        background: templateSaving ? '#475569' : '#111827',
                        color:'#fff',
                        border:'none',
                        borderRadius:8,
                        cursor: templateSaving ? 'not-allowed' : 'pointer',
                        opacity: templateSaving ? 0.7 : 1,
                      }}
                    >
                      {templateSaving ? 'Guardando…' : 'Guardar plantilla'}
                    </button>
                    <div style={{ fontSize:11, color:'#64748b' }}>
                      Se guardará el vehículo propio seleccionado y los competidores actuales ({manual.length}).
                    </div>
                  </form>
                  {templateLoading && templates.length === 0 ? (
                    <div style={{ fontSize:12, color:'#64748b' }}>Cargando plantillas guardadas…</div>
                  ) : null}
                  {templates.length > 0 ? (
                    <div style={{ display:'grid', gap:10 }}>
                      {templates.map((template) => (
                        <div key={template.id} style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', display:'grid', gap:6 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                            <strong style={{ fontSize:13 }}>{template.template_name}</strong>
                            <span style={{ fontSize:11, color:'#64748b' }}>
                              Actualizado {formatTemplateDate(template.updated_at || template.created_at)}
                            </span>
                          </div>
                          <div style={{ fontSize:12, color:'#475569', display:'flex', gap:12, flexWrap:'wrap' }}>
                            <span>{brandLabel(template.own_vehicle)} {String(template.own_vehicle?.model || '')}</span>
                            <span>{template.competitors?.length || 0} competidores guardados</span>
                          </div>
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                            <button
                              type="button"
                              onClick={() => applyTemplate(template)}
                              style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #0f172a', background:'#0f172a', color:'#fff', cursor:'pointer', fontSize:12 }}
                            >
                              Aplicar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(template)}
                              disabled={templateDeleting === template.id}
                              style={{
                                padding:'6px 10px',
                                borderRadius:8,
                                border:'1px solid #dc2626',
                                background: templateDeleting === template.id ? '#fee2e2' : '#ffffff',
                                color:'#b91c1c',
                                cursor: templateDeleting === template.id ? 'not-allowed' : 'pointer',
                                fontSize:12,
                                opacity: templateDeleting === template.id ? 0.7 : 1,
                              }}
                            >
                              {templateDeleting === template.id ? 'Eliminando…' : 'Eliminar'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize:12, color:'#64748b' }}>Todavía no guardas plantillas.</div>
                  )}
                </>
              )}
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
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', minWidth: 260, maxWidth: 360, whiteSpace:'normal', wordBreak:'normal', overflowWrap:'anywhere' }}>
                  <div style={{ display:'grid', gridTemplateColumns: `${THUMB_WIDTH}px minmax(160px, 1fr)`, gap:8, alignItems:'flex-start' }}>
                    <div><VehicleThumb row={baseRow} width={THUMB_WIDTH} height={THUMB_HEIGHT} /></div>
                    <div>
                      <div style={{ fontWeight:700 }}>{brandLabel(baseRow)} {String(baseRow.model||'')}</div>
                      <div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>{baseRow.ano || ''}</div>
                      <div style={{ fontWeight:500 }}>{String(baseRow.version||'')}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtMoney(baseRow.msrp)}</td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtMoney(baseRow.precio_transaccion)}</td>
                <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                  {fmtMoney(baseRow.fuel_cost_60k_mxn)}
                  {(() => {
                    const fuelInfo = `${fuelLabel(baseRow) || 'Combustible N/D'} ${fuelPriceLabel(baseRow)}`.trim();
                    const label = energyConsumptionLabel(baseRow);
                    return (
                      <div style={{ fontSize:12, opacity:0.75 }}>
                        Rendimiento combinado: {label || 'N/D'}
                        {fuelInfo ? <span>{` • ${fuelInfo}`}</span> : null}
                      </div>
                    );
                  })()}
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
                    <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', minWidth: 260, maxWidth: 360, whiteSpace:'normal', wordBreak:'normal', overflowWrap:'anywhere' }}>
                      <div style={{ display:'grid', gridTemplateColumns: `${THUMB_WIDTH}px minmax(160px, 1fr)`, gap:8, alignItems:'flex-start' }}>
                        <div><VehicleThumb row={r} width={THUMB_WIDTH} height={THUMB_HEIGHT} /></div>
                        <div>
                          <div style={{ fontWeight:600 }}>{brandLabel(r)} {String(r.model||'')}</div>
                          <div style={{ fontSize:12, opacity:0.8, color:'#475569' }}>{r.ano||''}</div>
                          <div style={{ fontWeight:500 }}>{String(r.version||'')}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtMoney(r.msrp)}<div style={{ fontSize:12, opacity:0.9, color: d_m!=null ? (d_m<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_m==null?'-':`${tri(d_m)} ${fmtMoney(Math.abs(d_m))}`}</div></td>
                    <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>{fmtMoney(r.precio_transaccion)}<div style={{ fontSize:12, opacity:0.9, color: d_tx!=null ? (d_tx<0?'#16a34a':'#dc2626'):'#64748b' }}>{d_tx==null?'-':`${tri(d_tx)} ${fmtMoney(Math.abs(d_tx))}`}</div></td>
                    <td style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9' }}>
                      {fmtMoney(r.fuel_cost_60k_mxn)}
                      {(() => {
                        const fuelInfo = `${fuelLabel(r) || 'Combustible N/D'} ${fuelPriceLabel(r)}`.trim();
                        const label = energyConsumptionLabel(r);
                        return (
                          <div style={{ fontSize:12, opacity:0.75 }}>
                            Rendimiento combinado: {label || 'N/D'}
                            {fuelInfo ? <span>{` • ${fuelInfo}`}</span> : null}
                          </div>
                        );
                      })()}
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

      {/* Radar de pilares */}
      {baseRow ? (
        <div className="print-block" style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12 }}>
          <div style={{ paddingBottom:8, borderBottom:'1px solid #e5e7eb', marginBottom:12, background:'#fafafa', fontWeight:600 }}>Radar de pilares — propio vs segmento</div>
          {EChart && radarSummary?.option ? (
            <EChart echarts={echarts} option={radarSummary.option} opts={{ renderer: 'svg' }} style={{ height: 320 }} />
          ) : (
            <div style={{ color:'#64748b', fontSize:12, padding:12 }}>Sin datos suficientes de pilares para graficar.</div>
          )}
          {radarSummary?.highlights?.length ? (
            <div style={{ marginTop:12, display:'grid', gap:6, fontSize:12, color:'#475569' }}>
              <div style={{ fontWeight:600 }}>{radarSummary.bestLabel} por pilar:</div>
              <ul style={{ margin:0, paddingLeft:18, display:'grid', gap:4 }}>
                {radarSummary.highlights.map((text, idx) => (
                  <li key={idx}>{text}</li>
                ))}
              </ul>
              <div style={{ color:'#64748b' }}>
                {radarBenchmarkLabel} calculado con {radarSummary.sampleSize} vehículo{radarSummary.sampleSize === 1 ? '' : 's'} ({radarSegmentLabel}).
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {baseRow ? (
        <div className="print-block" style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12 }}>
          <div style={{ paddingBottom:8, borderBottom:'1px solid #e5e7eb', marginBottom:12, background:'#fafafa', fontWeight:600 }}>Ventajas vs brechas (equipamiento & prestaciones)</div>
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
          {advantageData.length ? (
            <div style={{ display:'grid', gap:12 }}>
              {advantageData.map((section, idx) => {
                const name = vehicleDisplayName(section.comp) || brandLabel(section.comp) || `Competidor ${idx + 1}`;
                const key = String((section.comp as any)?.vehicle_id || `${name}-${idx}`);
                return (
                  <div key={key} style={{ border:'1px solid #f1f5f9', borderRadius:10, padding:12, background:'#fff' }}>
                    <div style={{ fontWeight:600, marginBottom:8 }}>{name}</div>
                    {EChart ? (
                      <EChart
                        echarts={echarts}
                        option={buildAdvantageOption(section.rows)}
                        opts={{ renderer: 'svg' }}
                        style={{ height: Math.max(section.rows.length * 36, 180) }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color:'#64748b', fontSize:12, padding:12 }}>Sin diferencias claras para mostrar en esta selección.</div>
          )}
        </div>
      ) : null}

      {salesChart ? (
        <div className="print-block" style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12 }}>
          <div style={{ paddingBottom:8, borderBottom:'1px solid #e5e7eb', marginBottom:12, background:'#fafafa', fontWeight:600 }}>
            Ventas mensuales {salesChart.year}
          </div>
          {EChart ? (
            <EChart echarts={echarts} option={salesChart.option} opts={{ renderer: 'svg' }} style={{ height: 320 }} />
          ) : null}
        </div>
      ) : null}

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
        </>
      )}

    </section>
  );
}
