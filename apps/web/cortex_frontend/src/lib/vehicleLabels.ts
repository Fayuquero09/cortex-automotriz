export type RowLike = Record<string, any>;

const asString = (input: any): string => {
  if (input == null) return '';
  if (typeof input === 'string') return input.trim();
  if (typeof input === 'number') return String(input).trim();
  if (typeof input === 'object' && typeof input.name === 'string') {
    return input.name.trim();
  }
  return String(input ?? '').trim();
};

const extractYear = (row: RowLike | null | undefined): string => {
  if (!row) return '';
  const direct = row.ano ?? row.year;
  if (direct != null && direct !== '') return String(direct).trim();
  const version = row.version;
  if (version && typeof version === 'object' && version.year != null) {
    return String(version.year).trim();
  }
  return '';
};

const isTruthy = (value: any): boolean => {
  if (!value) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (!text) return false;
    return !['false', '0', 'no', 'n', 'off', 'null', 'undefined'].includes(text);
  }
  return true;
};

export const isCsvFallback = (row: RowLike | null | undefined): boolean => {
  if (!row || typeof row !== 'object') return false;
  if (isTruthy((row as any).fallback_csv)) return true;
  if (isTruthy((row as any)['metadata_fallback_csv'])) return true;
  if (String((row as any)['metadata_source'] || '').toLowerCase() === 'csv_fallback') return true;
  const meta = row.metadata;
  if (meta && typeof meta === 'object') {
    if (isTruthy(meta.fallback_csv)) return true;
    if (String(meta.source || '').toLowerCase() === 'csv_fallback') return true;
  }
  return false;
};

export const brandLabel = (row: RowLike | null | undefined, marker = '*'): string => {
  const base = asString(row?.make ?? row?.make_name ?? row?.manufacturer?.name ?? row?.manufacturer_name ?? '');
  if (!base) return base;
  return isCsvFallback(row) ? `${base}${marker}` : base;
};

export const vehicleLabel = (
  row: RowLike | null | undefined,
  options?: { includeYear?: boolean; marker?: string; fallbackModel?: string }
): string => {
  const marker = options?.marker ?? '*';
  const mk = brandLabel(row, marker);
  const model = asString(row?.model ?? row?.model_name ?? options?.fallbackModel ?? '');
  let version = '';
  if (row?.version && typeof row.version === 'object') {
    version = asString(row.version.name);
  } else {
    version = asString(row?.version ?? row?.version_name ?? '');
  }
  const includeYear = options?.includeYear !== false;
  const year = includeYear ? extractYear(row) : '';
  const baseParts = [mk, model].filter(Boolean);
  const base = baseParts.join(' ').trim();
  const versionPart = version ? ` – ${version}` : '';
  const yearPart = year ? ` (${year})` : '';
  return `${base}${versionPart}${yearPart}`.trim();
};

const stripDiacritics = (value: string): string => {
  try {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return value;
  }
};

export type FuelCategoryKey =
  | 'bev'
  | 'phev'
  | 'hev'
  | 'mhev'
  | 'diesel'
  | 'gasolina_premium'
  | 'gasolina_magna'
  | 'gasolina'
  | 'unknown';

export type FuelCategoryMeta = {
  key: FuelCategoryKey;
  label: string;
  raw: string;
};

const FUEL_LABELS: Record<FuelCategoryKey, string> = {
  bev: 'Eléctrico',
  phev: 'PHEV',
  hev: 'HEV',
  mhev: 'MHEV',
  diesel: 'Diésel',
  gasolina_premium: 'Gasolina Premium',
  gasolina_magna: 'Gasolina Magna',
  gasolina: 'Gasolina',
  unknown: 'Combustible N/D',
};

const INVALID_FUEL_TOKENS = ['no disponible', 'no_disponible', 'none', 'null', 'na', 'n/a', 'otro', 'other', 'serie', 'sin dato', 'nd'];

const rawFuelValue = (row: RowLike | null | undefined): string => {
  if (!row || typeof row !== 'object') return '';
  const candidates = [
    row?.categoria_combustible_final,
    row?.tipo_de_combustible_original,
    row?.tipo_combustible,
    row?.combustible,
  ];
  for (const candidate of candidates) {
    const value = asString(candidate);
    if (value) return value;
  }
  return '';
};

export const fuelCategory = (row: RowLike | null | undefined): FuelCategoryMeta => {
  const raw = rawFuelValue(row);
  const normalized = stripDiacritics(raw).toLowerCase();
  const contains = (needle: string) => normalized.includes(needle);
  const isInvalid = !normalized || INVALID_FUEL_TOKENS.some((token) => token && normalized.includes(token));

  let key: FuelCategoryKey;
  if (contains('bev') || contains('electric')) {
    key = 'bev';
  } else if (contains('phev') || contains('enchuf')) {
    key = 'phev';
  } else if (contains('mhev') || contains('mild')) {
    key = 'mhev';
  } else if (contains('hev') || contains('hibrid') || contains('hybrid')) {
    key = 'hev';
  } else if (contains('diesel') || contains('dsl')) {
    key = 'diesel';
  } else if (contains('premium')) {
    key = 'gasolina_premium';
  } else if (contains('magna')) {
    key = 'gasolina_magna';
  } else if (contains('gasoline') || contains('gasolina') || contains('petrol') || contains('nafta')) {
    key = 'gasolina_magna';
  } else if (isInvalid) {
    key = 'gasolina_magna';
  } else {
    key = 'unknown';
  }

  const label = FUEL_LABELS[key] ?? (raw ? raw : FUEL_LABELS.unknown);
  return { key, label, raw };
};
