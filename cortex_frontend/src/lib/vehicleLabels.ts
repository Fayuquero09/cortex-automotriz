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
