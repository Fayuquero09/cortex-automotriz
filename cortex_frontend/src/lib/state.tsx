"use client";
import React from 'react';

export type FiltersState = {
  sameSegment: boolean;
  samePropulsion: boolean;
  includeSameBrand: boolean;
  includeDifferentYears: boolean;
  maxLengthPct: number | '';
  maxLengthMm: number | '';
  scoreDiffPct: number | '';
  autoK: number;
  minMatchPct: number | '';
};

export type OwnState = { make: string; model: string; year: number | ''; version: string };

export type AppState = {
  own: OwnState;
  setOwn: (v: OwnState | ((prev: OwnState) => OwnState)) => void;
  filters: FiltersState;
  setFilters: (f: FiltersState) => void;
  autoGenSeq: number;
  triggerAutoGen: () => void;
  autoGenerate: boolean;
  setAutoGenerate: (v: boolean) => void;
  comparison: {
    base: Record<string, any> | null;
    competitors: Array<Record<string, any>>;
  };
  setComparison: (payload: { base: Record<string, any> | null; competitors: Array<Record<string, any>> }) => void;
};

const defaultFilters: FiltersState = {
  sameSegment: true,
  samePropulsion: true,
  includeSameBrand: false,
  includeDifferentYears: false,
  maxLengthPct: '',
  maxLengthMm: '',
  scoreDiffPct: '',
  autoK: 3,
  minMatchPct: '',
};

const Ctx = React.createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [own, _setOwn] = React.useState<OwnState>({ make: '', model: '', year: '', version: '' });
  const [filters, _setFilters] = React.useState<FiltersState>(defaultFilters);
  const [autoGenSeq, setAutoGenSeq] = React.useState<number>(0);
  const [autoGenerate, setAutoGenerate] = React.useState<boolean>(false);
  const [comparison, _setComparison] = React.useState<{ base: Record<string, any> | null; competitors: Array<Record<string, any>> }>({ base: null, competitors: [] });
  const previewHandledRef = React.useRef(false);

  React.useEffect(() => {
    try {
      const f = localStorage.getItem("CORTEX_FILTERS");
      if (f) _setFilters({ ...defaultFilters, ...JSON.parse(f) });
      // Siempre iniciar en blanco
      try { localStorage.removeItem("CORTEX_OWN"); } catch {}
      const ag = localStorage.getItem("CORTEX_AUTO_GEN");
      if (ag != null) setAutoGenerate(ag === '1');
    } catch {}

    try {
      const params = new URLSearchParams(window.location.search);
      const make = params.get('make')?.trim() ?? '';
      const model = params.get('model')?.trim() ?? '';
      const versionParam = params.get('version')?.trim() ?? '';
      const yearParam = params.get('year')?.trim() ?? '';
      const yearVal = yearParam ? (Number.isFinite(Number(yearParam)) ? Number(yearParam) : '') : '';
      if (make || model || yearParam || versionParam) {
        _setOwn({ make, model, year: yearVal as number | '', version: versionParam });
      }

      const filtersFromParams = { ...defaultFilters };
      let filtersOverride = false;
      const boolFromParam = (value: string | null, fallback: boolean) => {
        if (value == null) return fallback;
        const v = value.toLowerCase();
        return !(v === '0' || v === 'false' || v === 'no');
      };
      const numFromParam = (value: string | null) => {
        if (value == null || value.trim() === '') return '';
        const n = Number(value);
        return Number.isFinite(n) ? n : '';
      };
      const sameSegmentParam = params.get('same_segment');
      if (sameSegmentParam != null) { filtersFromParams.sameSegment = boolFromParam(sameSegmentParam, filtersFromParams.sameSegment); filtersOverride = true; }
      const samePropulsionParam = params.get('same_propulsion');
      if (samePropulsionParam != null) { filtersFromParams.samePropulsion = boolFromParam(samePropulsionParam, filtersFromParams.samePropulsion); filtersOverride = true; }
      const includeSameBrandParam = params.get('include_same_brand');
      if (includeSameBrandParam != null) { filtersFromParams.includeSameBrand = boolFromParam(includeSameBrandParam, filtersFromParams.includeSameBrand); filtersOverride = true; }
      const includeDifferentYearsParam = params.get('include_different_years');
      if (includeDifferentYearsParam != null) { filtersFromParams.includeDifferentYears = boolFromParam(includeDifferentYearsParam, filtersFromParams.includeDifferentYears); filtersOverride = true; }
      const maxLengthPctParam = params.get('max_length_pct');
      if (maxLengthPctParam != null) { filtersFromParams.maxLengthPct = numFromParam(maxLengthPctParam); filtersOverride = true; }
      const maxLengthMmParam = params.get('max_length_mm');
      if (maxLengthMmParam != null) { filtersFromParams.maxLengthMm = numFromParam(maxLengthMmParam); filtersOverride = true; }
      const scoreDiffParam = params.get('score_diff_pct');
      if (scoreDiffParam != null) { filtersFromParams.scoreDiffPct = numFromParam(scoreDiffParam); filtersOverride = true; }
      const autoKParam = params.get('auto_k');
      if (autoKParam != null && autoKParam.trim() !== '') {
        const kVal = Number(autoKParam);
        if (Number.isFinite(kVal) && kVal > 0) { filtersFromParams.autoK = Math.max(1, Math.floor(kVal)); filtersOverride = true; }
      }
      const minMatchParam = params.get('min_match_pct');
      if (minMatchParam != null) { filtersFromParams.minMatchPct = numFromParam(minMatchParam); filtersOverride = true; }
      if (filtersOverride) {
        _setFilters(filtersFromParams);
        try { localStorage.setItem("CORTEX_FILTERS", JSON.stringify(filtersFromParams)); } catch {}
      }

      const autoGenerateParam = params.get('auto_generate');
      if (autoGenerateParam != null) {
        const nextAuto = !['0','false','no'].includes(autoGenerateParam.toLowerCase());
        setAutoGenerate(nextAuto);
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    if (previewHandledRef.current) return;
    if (typeof window === 'undefined') return;
    const parseFlag = (value: string | null) => {
      if (!value) return false;
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'preview';
    };
    let preview = false;
    try {
      preview = parseFlag(localStorage.getItem('CORTEX_DEALER_PREVIEW'));
      if (!preview) {
        const params = new URLSearchParams(window.location.search);
        preview = parseFlag(params.get('preview'));
      }
    } catch {}
    previewHandledRef.current = true;
    if (!preview) return;
    if (filters.includeDifferentYears) return;
    const nextFilters: FiltersState = { ...filters, includeDifferentYears: true };
    _setFilters(nextFilters);
    try { localStorage.setItem('CORTEX_FILTERS', JSON.stringify(nextFilters)); } catch {}
  }, [filters]);

  const setFilters = (f: FiltersState) => {
    _setFilters(f);
    try { localStorage.setItem("CORTEX_FILTERS", JSON.stringify(f)); } catch {}
  };
  const setOwn = (value: OwnState | ((prev: OwnState) => OwnState)) => {
    _setOwn((prev) => (typeof value === 'function' ? (value as (p: OwnState) => OwnState)(prev) : value));
    // No persistimos selección de vehículo propio para comenzar siempre en blanco
  };
  const setComparison = React.useCallback((payload: { base: Record<string, any> | null; competitors: Array<Record<string, any>> }) => {
    _setComparison(payload);
  }, []);

  return (
    <Ctx.Provider value={{
      own,
      setOwn,
      filters,
      setFilters,
      autoGenSeq,
      triggerAutoGen: () => setAutoGenSeq((s) => s + 1),
      autoGenerate,
      setAutoGenerate: (v: boolean) => {
        setAutoGenerate(v);
        try { localStorage.setItem('CORTEX_AUTO_GEN', v ? '1' : '0'); } catch {}
      },
      comparison,
      setComparison,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppState(): AppState {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAppState must be used within AppProvider");
  return v;
}
