import type { EChartsOption } from 'echarts';
import { brandLabel, vehicleLabel } from '@/lib/vehicleLabels';

export type AdvantageMode = 'upsides' | 'gaps';

export type AdvantageRow = {
  key: string;
  label: string;
  delta: number;
  ownValue: string;
  compValue: string;
};

export type AdvantageSection = {
  comp: Record<string, any>;
  rows: AdvantageRow[];
};

export function num(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export const KPI_ADVANTAGE_FIELDS: Array<{
  key: string;
  label: string;
  formatter?: (value: any) => string;
}> = [
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

export function vehicleDisplayName(row: Record<string, any> | null | undefined): string {
  if (!row) return '';
  const brand = brandLabel(row);
  const model = String(row?.model ?? '').trim();
  const version = String(row?.version ?? '').trim();
  const parts = [brand, model, version ? `– ${version}` : ''].filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function cleanVehicleRow<T extends Record<string, any> | null | undefined>(row: T): Record<string, any> {
  if (!row || typeof row !== 'object') return {};
  const cleaned: Record<string, any> = { ...row };
  delete cleaned.__deltas;
  delete cleaned.__diffs;
  return cleaned;
}

export function formatKpiValue(cfg: { formatter?: (value: any) => string }, value: any): string {
  if (typeof cfg?.formatter === 'function') {
    return cfg.formatter(value);
  }
  const numeric = num(value);
  if (numeric == null) return 'N/D';
  return `${numeric}`;
}

export function computeAdvantageSections(
  baseRow: Record<string, any> | null | undefined,
  comps: Array<Record<string, any>>,
  mode: AdvantageMode,
  valueFormatter: (cfg: { formatter?: (value: any) => string }, value: any) => string = formatKpiValue,
): AdvantageSection[] {
  if (!baseRow) return [];
  return comps
    .map((comp) => {
      const rows: AdvantageRow[] = KPI_ADVANTAGE_FIELDS.map((cfg) => {
        const deltaRaw = (comp as any)?.__deltas?.[cfg.key]?.delta;
        const delta = typeof deltaRaw === 'number' ? deltaRaw : Number(deltaRaw);
        if (!Number.isFinite(delta) || delta === 0) return null;
        const ownIsBetter = delta < 0; // delta = competitor - own
        const shouldDisplay = mode === 'upsides' ? ownIsBetter : !ownIsBetter;
        if (!shouldDisplay) return null;
        const ownValue = valueFormatter(cfg, (baseRow as any)?.[cfg.key]);
        const compValue = valueFormatter(cfg, (comp as any)?.[cfg.key]);
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
}

export function buildAdvantageOption(rows: AdvantageRow[], mode: AdvantageMode): EChartsOption {
  const color = mode === 'upsides' ? '#16a34a' : '#dc2626';
  return {
    color: [color],
    grid: { left: 140, right: 24, top: 24, bottom: 36, containLabel: true },
    legend: { show: false },
    toolbox: {
      show: true,
      orient: 'horizontal',
      itemSize: 16,
      itemGap: 10,
      top: 10,
      right: 10,
      feature: {
        dataView: { show: true, readOnly: true, title: 'Datos', lang: ['Tabla de ventajas', 'Cerrar', 'Actualizar'] },
        saveAsImage: { show: typeof window !== 'undefined', title: 'Descargar' },
      },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0f172a',
      borderWidth: 0,
      borderRadius: 10,
      textStyle: { color: '#f8fafc' },
      formatter: (params: any) => {
        const data = params?.data || {};
        const deltaText = `${data?.delta < 0 ? '-' : '+'}${Math.abs(Number(data?.delta || 0)).toFixed(1)}`;
        const ownLine = `<span style=\"color:#38bdf8\">Nosotros:</span> ${data?.ownValue ?? '-'}`;
        const compLine = `<span style=\"color:#fbbf24\">Competidor:</span> ${data?.compValue ?? '-'}`;
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
        })),
        label: {
          show: true,
          position: 'right',
          formatter: (params: any) => {
            const val = Number(params?.value ?? 0);
            const delta = Number(params?.data?.delta ?? 0);
            const sign = delta < 0 ? '+' : '-';
            return `${sign}${val.toFixed(1)}`;
          },
          color: '#0f172a',
          fontSize: 11,
        },
      },
    ],
  };
}

export function keyForRow(row: Record<string, any> | null | undefined): string {
  if (!row) return '';
  const make = String(row.make || row.marca || '').trim().toUpperCase();
  const model = String(row.model || row.modelo || '').trim().toUpperCase();
  const version = String(row.version || '').trim().toUpperCase();
  const year = row.ano ?? row.year ?? '';
  return `${make}|${model}|${version}|${year}`;
}
