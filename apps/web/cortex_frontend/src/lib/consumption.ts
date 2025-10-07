import { fuelCategory } from '@/lib/vehicleLabels';

type AnyRow = Record<string, any> | null | undefined;

export type ConsumptionInfo =
  | { type: 'electric'; kwhPer100: number }
  | { type: 'combustion'; kml: number; lPer100: number | null };

export function parseNumberLike(value: any): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const str = String(value).trim();
  if (!str) return null;
  const match = str.match(/-?\d+[.,]?\d*/);
  if (!match) return null;
  let token = match[0];
  const hasComma = token.includes(',');
  const hasDot = token.includes('.');
  if (hasComma && hasDot) {
    if (token.lastIndexOf(',') > token.lastIndexOf('.')) {
      token = token.replace(/\./g, '').replace(/,/g, '.');
    } else {
      token = token.replace(/,/g, '');
    }
  } else if (hasComma) {
    token = token.replace(/,/g, '.');
  }
  const numVal = Number(token);
  return Number.isFinite(numVal) ? numVal : null;
}

export function isElectric(row: AnyRow): boolean {
  if (!row) return false;
  const info = fuelCategory(row);
  if (info.key === 'phev') return false;
  if (info.key === 'bev') return true;
  const raw = info.raw.toLowerCase();
  if (!raw) return false;
  if (/phev|enchuf/.test(raw)) return false;
  return /bev|eléctr|electr/.test(raw);
}

export function kwhPer100FromRow(row: AnyRow): number | null {
  if (!row) return null;
  const directFields = [
    'consumo_kwh_100km',
    'consumo_electrico_kwh_100km',
    'kwh_100km',
    'kwh_por_100km',
    'kwh/100km',
    'consumo_ev_kwh_100km',
  ];
  for (const key of directFields) {
    const v = parseNumberLike((row as any)?.[key]);
    if (Number.isFinite(v) && (v as number) > 0) return v as number;
  }
  const perKmFields = ['consumo_kwh_km', 'kwh_por_km', 'kwh_km', 'consumo_electrico_kwh_km'];
  for (const key of perKmFields) {
    const v = parseNumberLike((row as any)?.[key]);
    if (Number.isFinite(v) && (v as number) > 0) return (v as number) * 100;
  }
  const economyObj = ((row as any)?.fuelEconomy || (row as any)?.fuel_economy) as Record<string, any> | undefined;
  if (economyObj && typeof economyObj === 'object') {
    const per100 = parseNumberLike(economyObj?.kwh_per_100km ?? economyObj?.kwh100 ?? economyObj?.kwh_100km);
    if (Number.isFinite(per100) && (per100 as number) > 0) return Number(per100);
    const perKm = parseNumberLike(economyObj?.kwh_per_km ?? economyObj?.kwh_km);
    if (Number.isFinite(perKm) && (perKm as number) > 0) return Number(perKm) * 100;
  }
  const batteryFields = ['battery_kwh', 'bateria_kwh', 'battery_capacity_kwh', 'capacidad_bateria_kwh', 'ev_battery_kwh'];
  const rangeFields = ['ev_range_km', 'autonomia_ev_km', 'autonomia_electrica_km', 'range_electrico_km', 'autonomia_electrica'];
  for (const batKey of batteryFields) {
    const bat = parseNumberLike((row as any)?.[batKey]);
    if (!Number.isFinite(bat) || (bat as number) <= 0) continue;
    for (const rangeKey of rangeFields) {
      const range = parseNumberLike((row as any)?.[rangeKey]);
      if (Number.isFinite(range) && (range as number) > 0) {
        return ((bat as number) / (range as number)) * 100;
      }
    }
  }
  return null;
}

export function kmlFromRow(row: AnyRow): number | null {
  if (!row) return null;
  const directKeys = [
    'combinado_kml',
    'kml_mixto',
    'mixto_kml',
    'rendimiento_mixto_kml',
    'consumo_mixto_kml',
    'consumo_combinado_kml',
    'combinado_km_l',
    'km_l_mixto',
    'mixto_km_l',
    'rendimiento_mixto_km_l',
    'rendimiento_combinado_km_l',
    'consumo_combinado_km_l',
  ];
  for (const key of directKeys) {
    const v = parseNumberLike((row as any)?.[key]);
    if (Number.isFinite(v) && (v as number) > 0) return v as number;
  }
  const camelSources = [
    (row as any)?.fuel_economy_combined,
    (row as any)?.fuel_economy_combined_kml,
    (row as any)?.fuelEconomy?.combined,
    (row as any)?.fuelEconomy?.combined_kml,
    (row as any)?.fuelEconomy?.combinedKmL,
    (row as any)?.fuel_economy?.combined,
    (row as any)?.fuel_economy?.combined_kml,
    (row as any)?.fuel_economy?.mixto,
    (row as any)?.fuel_economy?.km_l_mixto,
    (row as any)?.fuelEconomy?.avg,
    (row as any)?.fuelEconomy?.average,
    (row as any)?.fuelEfficiency?.combined,
    (row as any)?.fuelEfficiency?.combined_kml,
  ];
  for (const value of camelSources) {
    const parsed = parseNumberLike(value);
    if (Number.isFinite(parsed) && (parsed as number) > 0) return Number(parsed);
  }
  const economyObj = ((row as any)?.fuelEconomy || (row as any)?.fuel_economy) as Record<string, any> | undefined;
  if (economyObj && typeof economyObj === 'object') {
    const combined = parseNumberLike(economyObj?.combined);
    if (Number.isFinite(combined) && (combined as number) > 0) return Number(combined);
  }
  const l100cand = [
    'mixto_l_100km',
    'consumo_mixto_l_100km',
    'l_100km_mixto',
    'l100km_mixto',
    'litros_100km_mixto',
    'l_100km',
    'litros_100km',
    'consumo_l_100km',
    'fuel_economy_combined_l_100km',
    'fuel_economy_mixto_l_100km',
    'fuel_consumption_combined_l_100km',
  ];
  for (const key of l100cand) {
    const v = parseNumberLike((row as any)?.[key]);
    if (Number.isFinite(v) && (v as number) > 0) return 100 / (v as number);
  }
  if (economyObj && typeof economyObj === 'object') {
    const value = parseNumberLike(
      economyObj?.combined_l100km ?? economyObj?.combinedL100km ?? economyObj?.liters_per_100km,
    );
    if (Number.isFinite(value) && (value as number) > 0) return 100 / (value as number);
  }
  return null;
}

export function consumptionInfo(row: AnyRow): ConsumptionInfo | null {
  if (!row) return null;
  if (isElectric(row)) {
    const kwhPer100 = kwhPer100FromRow(row);
    if (Number.isFinite(kwhPer100) && (kwhPer100 as number) > 0) {
      return { type: 'electric', kwhPer100: Number(kwhPer100) };
    }
    return null;
  }
  const kml = kmlFromRow(row);
  if (Number.isFinite(kml) && (kml as number) > 0) {
    const value = Number(kml);
    const lPer100 = value > 0 ? 100 / value : null;
    return { type: 'combustion', kml: value, lPer100: lPer100 != null ? Number(lPer100.toFixed(3)) : null };
  }
  return null;
}

export function energyConsumptionLabel(row: AnyRow): string {
  const info = consumptionInfo(row);
  if (!info) return '';
  if (info.type === 'electric') {
    return `${info.kwhPer100.toFixed(1)} kWh/100 km`;
  }
  const base = `${info.kml.toFixed(1)} km/L`;
  return info.lPer100 != null ? `${base} • ${info.lPer100.toFixed(1)} L/100 km` : base;
}
