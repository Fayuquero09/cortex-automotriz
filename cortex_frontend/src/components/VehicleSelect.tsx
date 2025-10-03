"use client";
import React from 'react';
import useSWR from 'swr';
import useSWRImmutable from 'swr/immutable';
import { endpoints } from '@/lib/api';
import { useAppState } from '@/lib/state';

type OptionsPayload = {
  models?: string[];
  models_all?: string[];
  makes?: string[];
  brands?: string[];
  makes_for_model?: string[];
  models_for_make?: string[];
  years?: number[];
  versions?: string[];
  selected?: { make?: string | null; model?: string | null; year?: number | null };
  autofill?: { make_from_model?: string | null; default_year?: number | null };
};

export default function VehicleSelect() {
  // Años permitidos en la UI
  const ALLOWED_YEARS = React.useMemo(() => new Set<number>([2024, 2025, 2026]), []);
  const { own, setOwn } = useAppState();
  const brand = own.make;
  const model = own.model;
  const year = own.year;
  const version = own.version;
  const [allowedBrand, setAllowedBrand] = React.useState('');
  const [allowedBrandList, setAllowedBrandList] = React.useState<string[]>([]);
  const [isSuperadmin, setIsSuperadmin] = React.useState(false);
  const modelRef = React.useRef<HTMLInputElement>(null);
  const brandRef = React.useRef<HTMLInputElement>(null);
  const [openModelSugg, setOpenModelSugg] = React.useState(false);
  const [hiModel, setHiModel] = React.useState(-1);
  const [openBrandSugg, setOpenBrandSugg] = React.useState(false);
  const [hiBrand, setHiBrand] = React.useState(-1);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const read = () => {
      try {
        const raw = window.localStorage.getItem('CORTEX_SUPERADMIN_USER_ID') || '';
        setIsSuperadmin(Boolean(raw.trim()));
      } catch {
        setIsSuperadmin(false);
      }
    };
    read();
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'CORTEX_SUPERADMIN_USER_ID') read();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isSuperadmin) {
      setAllowedBrand('');
      return;
    }
    const read = () => {
      try {
        const stored = window.localStorage.getItem('CORTEX_DEALER_ALLOWED_BRAND') || '';
        setAllowedBrand(stored.trim());
      } catch {
        setAllowedBrand('');
      }
    };
    read();
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === 'string') {
        setAllowedBrand(detail.trim());
      } else {
        read();
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'CORTEX_DEALER_ALLOWED_BRAND') read();
    };
    window.addEventListener('cortex:dealer_brand', onCustom as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('cortex:dealer_brand', onCustom as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [isSuperadmin]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const normalizeList = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return Array.from(new Set(
          value
            .map((item) => String(item || '').trim())
            .filter((item) => item.length > 0)
        ));
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
      }
      return [];
    };

    const read = () => {
      if (isSuperadmin) {
        setAllowedBrandList([]);
        return;
      }
      try {
        const dealerContext = window.localStorage.getItem('CORTEX_DEALER_ID');
        const orgContext = window.localStorage.getItem('CORTEX_SUPERADMIN_ORG_ID');
        if (!dealerContext && !orgContext) {
          setAllowedBrandList([]);
          return;
        }
        const raw = window.localStorage.getItem('CORTEX_ALLOWED_BRANDS');
        if (!raw || !raw.length) {
          setAllowedBrandList([]);
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          setAllowedBrandList(normalizeList(parsed));
        } catch {
          setAllowedBrandList(normalizeList(raw));
        }
      } catch {
        setAllowedBrandList([]);
      }
    };

    const onCustom = (event: Event) => {
      try {
        const detail = (event as CustomEvent).detail;
        setAllowedBrandList(normalizeList(detail));
      } catch {
        read();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'CORTEX_ALLOWED_BRANDS' || event.key === 'CORTEX_DEALER_ALLOWED_BRAND') {
        read();
      }
    };

    read();
    window.addEventListener('cortex:allowed_brands', onCustom as EventListener);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('cortex:allowed_brands', onCustom as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [isSuperadmin]);

  const { data: base } = useSWR<OptionsPayload>('options_base', () => endpoints.options());
  const baseReady = base !== undefined;
  const hasBaseModels = React.useMemo(() => {
    if (!base) return false;
    if (Array.isArray(base.models_all) && base.models_all.length) return true;
    if (Array.isArray(base.models) && base.models.length) return true;
    return false;
  }, [base]);
  const hasBaseBrands = React.useMemo(() => {
    if (!base) return false;
    if (Array.isArray(base.brands) && base.brands.length) return true;
    if (Array.isArray(base.makes) && base.makes.length) return true;
    return false;
  }, [base]);

  // Base models from /options, plus fallback from /catalog
  const allModelsBase = React.useMemo(() => (base?.models_all || base?.models || []) as string[], [base]);
  const { data: modelsFallback } = useSWRImmutable<string[]>('models_fallback', async () => {
    try {
      const list = await endpoints.catalog({ limit: 5000 });
      const rows: any[] = Array.isArray(list) ? list : (Array.isArray((list as any)?.items) ? (list as any).items : []);
      const set = new Set<string>();
      rows.forEach(r => { const md = String(r?.model || '').trim().toUpperCase(); if (md) set.add(md); });
      return Array.from(set).sort();
    } catch { return []; }
  });
  const allModels = React.useMemo(() => {
    const a = allModelsBase || [];
    const b = (modelsFallback || []) as string[];
    const push = (out: string[], seen: Set<string>, val: any) => {
      const label = String(val || '').trim();
      if (!label) return;
      const key = label.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(label);
    };
    const out: string[] = [];
    const seen = new Set<string>();
    a.forEach(x => push(out, seen, x));
    b.forEach(x => push(out, seen, x));
    return out;
  }, [allModelsBase, modelsFallback]);
  // Fallback: derivar SIEMPRE de /catalog en paralelo (evita estados vacíos si /options tarda)
  // Bugfix: antes solo corría si base existía y venía vacío; ahora también corre mientras base aún no llega.
  const { data: brandsFallback } = useSWRImmutable<string[]>('brands_fallback', async () => {
    // Límite reducido: solo como red de seguridad si /options viene vacío
    const list = await endpoints.catalog({ limit: 5000 });
    const rows: any[] = Array.isArray(list) ? list : (Array.isArray((list as any)?.items) ? (list as any).items : []);
    const set = new Set<string>();
    rows.forEach(r => { const mk = String(r?.make || '').trim().toUpperCase(); if (mk) set.add(mk); });
    return Array.from(set).sort();
  });
  const brandNorm = (s: string) => {
    try { return s.normalize('NFD').replace(/\p{Diacritic}+/gu,'').toLowerCase(); } catch { return s.toLowerCase(); }
  };
  const allowedBrandSet = React.useMemo(() => {
    if (isSuperadmin || !allowedBrandList.length) return null;
    const set = new Set<string>();
    allowedBrandList.forEach((item) => {
      const key = brandNorm(String(item || ''));
      if (key) set.add(key);
    });
    return set.size ? set : null;
  }, [allowedBrandList, isSuperadmin]);
  const allBrands = React.useMemo(() => {
    if (isSuperadmin) {
      const out: string[] = [];
      const seen = new Set<string>();
      const push = (label: string) => {
        const cleanLabel = String(label || '').trim();
        if (!cleanLabel) return;
        const normalized = brandNorm(cleanLabel);
        if (seen.has(normalized)) return;
        seen.add(normalized);
        out.push(cleanLabel);
      };
      (base?.brands || base?.makes || []).forEach((item) => push(item));
      (brandsFallback || []).forEach((item) => push(item));
      return out;
    }
    if (allowedBrand) return [allowedBrand];
    const allowedSet = allowedBrandSet;
    const a = (base?.brands || base?.makes || []) as string[];
    const b = (brandsFallback || []) as string[];
    const push = (out: string[], seen: Set<string>, val: any) => {
      const label = String(val || '').trim();
      if (!label) return;
      const normalized = brandNorm(label);
      if (allowedSet && !allowedSet.has(normalized)) return;
      const key = label.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(label);
    };
    const out: string[] = [];
    const seen = new Set<string>();
    a.forEach((x) => push(out, seen, x));
    b.forEach((x) => push(out, seen, x));
    if (allowedSet && allowedBrandList.length) {
      const haveSet = new Set(out.map((item) => brandNorm(item)));
      allowedBrandList.forEach((value) => {
        const normalized = brandNorm(value);
        if (!haveSet.has(normalized)) {
          out.push(value);
          haveSet.add(normalized);
        }
      });
    }
    return out;
  }, [base, brandsFallback, allowedBrand, allowedBrandSet, allowedBrandList, isSuperadmin]);
  const brandSuggest = React.useMemo(() => {
    if (isSuperadmin) return (allBrands || []).slice(0, 18);
    if (allowedBrand) return [allowedBrand];
    const q = (brand || '').trim();
    const src = (allBrands || []) as string[];
    if (!q) return src.slice(0, 18);
    const nq = brandNorm(q);
    return src.filter(b => brandNorm(String(b)).includes(nq)).slice(0, 18);
  }, [brand, allBrands, allowedBrand, isSuperadmin]);
  const brandApi = React.useMemo(() => {
    if (isSuperadmin) {
      const raw = (brand || '').trim();
      if (!raw) return '';
      const needle = brandNorm(raw);
      const brands = (allBrands || []) as string[];
      const exact = brands.find((m) => brandNorm(String(m)) === needle);
      if (exact) return exact;
      const matches = brands.filter((m) => brandNorm(String(m)).startsWith(needle));
      return matches.length === 1 ? matches[0] : raw;
    }
    if (allowedBrand) {
      const brands = (allBrands || []) as string[];
      const needle = brandNorm(allowedBrand);
      const match = brands.find((m) => brandNorm(String(m)) === needle);
      return match || allowedBrand;
    }
    const raw = (brand || '').trim();
    if (!raw) return '';
    const needle = brandNorm(raw);
    const brands = (allBrands || []) as string[];
    const exact = brands.find((m) => brandNorm(String(m)) === needle);
    if (exact) return exact;
    const matches = brands.filter((m) => brandNorm(String(m)).startsWith(needle));
    return matches.length === 1 ? matches[0] : '';
  }, [brand, allBrands, allowedBrand, isSuperadmin]);

  React.useEffect(() => {
    if (isSuperadmin) return;
    if (allowedBrand) return;
    if (!allowedBrandList.length) return;
    if (!allowedBrandSet) return;
    const current = String(brand || '').trim();
    const normalizedCurrent = current ? brandNorm(current) : '';
    const singleAllowed = allowedBrandList.length === 1 ? String(allowedBrandList[0] || '').trim() : '';

    if (current) {
      const isAllowed = allowedBrandSet.has(normalizedCurrent);
      if (!isAllowed) {
        if (singleAllowed) {
          const normalizedTarget = brandNorm(singleAllowed);
          if (normalizedTarget !== normalizedCurrent || current !== singleAllowed) {
            setOwn({ ...own, make: singleAllowed });
          }
        } else if (current || own.model || own.year || own.version) {
          setOwn({ make: '', model: '', year: '', version: '' });
        }
      }
    } else if (singleAllowed) {
      const normalizedTarget = brandNorm(singleAllowed);
      if (normalizedTarget !== normalizedCurrent || own.make !== singleAllowed) {
        setOwn({ ...own, make: singleAllowed });
      }
    }
  }, [allowedBrand, allowedBrandList, allowedBrandSet, brand, isSuperadmin, own.model, own.version, own.year, setOwn]);
  // Models filtered by selected brand (if any)
  const { data: forBrand } = useSWR<OptionsPayload>(brandApi ? ['options_brand', brandApi] : null, () => endpoints.options({ make: brandApi }));
  const { data: catalogBrandAllowed } = useSWR<any[]>(brandApi ? ['catalog_brand_allowed', brandApi] : null, async () => {
    try {
      const list = await endpoints.catalog({ make: brandApi, limit: 5000 });
      const rows: any[] = Array.isArray(list)
        ? list
        : Array.isArray((list as any)?.items)
          ? (list as any).items
          : [];
      return rows;
    } catch {
      return [];
    }
  });
  const brandModelsAllowedSet = React.useMemo(() => {
    if (!Array.isArray(catalogBrandAllowed) || !catalogBrandAllowed.length) return null;
    const set = new Set<string>();
    for (const row of catalogBrandAllowed) {
      const rawYear = Number.parseInt(String(row?.ano ?? row?.year ?? row?.model_year ?? ''));
      if (!Number.isFinite(rawYear) || !ALLOWED_YEARS.has(rawYear)) continue;
      const label = String(row?.model || '').trim();
      if (!label) continue;
      set.add(norm(label));
    }
    return set.size ? set : null;
  }, [catalogBrandAllowed, ALLOWED_YEARS]);
  const brandLocked = !isSuperadmin && (Boolean(allowedBrand) || (allowedBrandList.length === 1 && allowedBrandSet !== null));
  const brandTyping = false;
  const brandDisplay = brandLocked ? (allowedBrand || allowedBrandList[0] || '') : brand;
  // Mostrar modelos mientras se escribe la marca; filtrar solo cuando haya match único (brandApi)
  const modelsForBrand = React.useMemo(() => {
    if (brandApi) {
      const list = ((forBrand?.models_for_make || []) as string[]) || [];
      if (!list.length && brandModelsAllowedSet && brandModelsAllowedSet.size) {
        return Array.from(brandModelsAllowedSet).map((key) => {
          const entry = (catalogBrandAllowed || []).find((row) => norm(String(row?.model || '')) === key);
          return entry ? String(entry.model || '').trim() : key;
        });
      }
      if (brandModelsAllowedSet && brandModelsAllowedSet.size) {
        const filtered = list.filter((item) => brandModelsAllowedSet.has(norm(String(item || ''))));
        if (filtered.length) return filtered;
      }
      return list.length ? list : [];
    }
    return (allModels as string[]) || [];
  }, [brandApi, forBrand, allModels, brandModelsAllowedSet, catalogBrandAllowed]);
  // Years available for current model (even if year not selected yet)
  // Evita golpear /options?model con 1 solo carácter (ruido en backend)
  const modelQueryKey = (model && model.trim().length >= 2) ? ['options_model', model] : null;
  const { data: forModel } = useSWR<OptionsPayload>(modelQueryKey, () => endpoints.options({ model }));
  // Fallback: si /options?model no trae años aún, derivar de /catalog
  const { data: catalogForModel } = useSWR<any[]>(model ? ['catalog_model_fb', model] : null, async () => {
    try {
      const list = await endpoints.catalog({ q: model, limit: 1000 });
      const rows: any[] = Array.isArray(list) ? list : (Array.isArray((list as any)?.items) ? (list as any).items : []);
      return rows;
    } catch { return []; }
  });

  // When model changes, infer brand and load years — use SWR data instead of firing another request
  React.useEffect(() => {
    if (!model) return;
    const p = forModel;
    // Derivar marca y año por prioridad: /options?model → /catalog fallback
    let mk = '';
    let autoYear: number | undefined = undefined;
    if (p) {
      mk = (
        p.autofill?.make_from_model
        || p.selected?.make
        || ((Array.isArray(p.makes_for_model) && p.makes_for_model.length===1) ? p.makes_for_model[0] : '')
      )?.toString() || '';
      const yrs = (p.years || []) as number[];
      const mostRecent = yrs.length ? Math.max(...yrs) : undefined;
      autoYear = (p.autofill?.default_year as number | undefined) ?? mostRecent;
    }
    if ((!mk || !autoYear) && Array.isArray(catalogForModel) && catalogForModel.length) {
      try {
        // Marca única del catálogo
        if (!mk) {
          let canonical = '';
          const seen = new Set<string>();
          catalogForModel.forEach((r) => {
            const raw = String(r?.make || r?.brand || '').trim();
            if (!raw) return;
            if (!canonical) canonical = raw;
            seen.add(raw.toUpperCase());
          });
          if (canonical) {
            if (seen.size === 1) {
              mk = canonical;
            } else if (!mk) {
              // Aunque existan variaciones (mayúsculas, espacios), toma la primera coincidencia.
              mk = canonical;
            }
          }
        }
        // Años del catálogo (filtrar a permitidos 2024–2026)
        const years: number[] = [];
        catalogForModel.forEach(r => {
          const y = parseInt(String(r?.ano || r?.year || ''));
          if (Number.isFinite(y) && ALLOWED_YEARS.has(y)) years.push(y);
        });
        if (!autoYear && years.length) autoYear = Math.max(...years);
      } catch {}
    }
    const next = { ...own, make: (mk || own.make) } as any;
    if (autoYear) next.year = autoYear;
    // Evita ciclos si ya está seteado
    if (next.make !== own.make || next.year !== own.year) setOwn(next);
  }, [model, forModel, catalogForModel]);

  React.useEffect(() => {
    if (isSuperadmin) return;
    if (!allowedBrand) return;
    if (!brand || brand.toLowerCase() !== allowedBrand.toLowerCase()) {
      setOwn({ make: allowedBrand, model: '', year: '', version: '' });
    }
  }, [allowedBrand, brand, setOwn, isSuperadmin]);

  // When brand changes, set most recent year using SWR brand options (no extra request)
  React.useEffect(() => {
    if (!brandApi || !forBrand) return;
    const yrs = (forBrand.years || []) as number[];
    const mostRecent = yrs.length ? Math.max(...yrs) : undefined;
    if (mostRecent && !model && mostRecent !== own.year) setOwn({ ...own, year: mostRecent });
  }, [brandApi, forBrand, model]);

  // Load versions once model+year ready
  const { data: forMY } = useSWR<OptionsPayload>(model && year ? ['options_my', model, year, brandApi] : null, () => endpoints.options({ model, year, make: (brandApi || undefined) }));
  const versionsRaw = (forMY?.versions || []) as string[];
  const versions = React.useMemo(() => (
    Array.isArray(versionsRaw)
      ? versionsRaw.map(v => String(v ?? '').trim()).filter(Boolean)
      : []
  ), [versionsRaw.join('|')]);
  const yearsOptions: number[] = React.useMemo(() => {
    const a = (forMY?.years as number[] | undefined) || [];
    const b = (forModel?.years as number[] | undefined) || [];
    const c = (forBrand?.years as number[] | undefined) || [];
    const d = Array.isArray(catalogForModel) ? Array.from(new Set(
      catalogForModel.map(r => parseInt(String(r?.ano || r?.year || ''))).filter((y:number)=> Number.isFinite(y) && ALLOWED_YEARS.has(y))
    )) : [];
    const merged = [...a, ...b, ...c, ...d].filter((y:number)=> ALLOWED_YEARS.has(y));
    return Array.from(new Set(merged)).sort();
  }, [forMY, forModel, forBrand, catalogForModel]);

  // Safety net: si ya hay modelo y hay años disponibles pero own.year sigue vacío,
  // selecciona automáticamente el más reciente. Evita que el usuario se quede en "—".
  React.useEffect(() => {
    try {
      const hasYear = typeof year === 'number' && Number.isFinite(year);
      if (model && !hasYear && yearsOptions && yearsOptions.length) {
        const pick = Math.max(...yearsOptions);
        setOwn({ ...own, year: pick as number });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, yearsOptions && yearsOptions.join('|')]);

  const onYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    setOwn({ ...own, year: v ? parseInt(v) : '', version: '' });
  };

  // Auto‑seleccionar versión si solo hay una para el modelo+año
  React.useEffect(() => {
    if (model && year && Array.isArray(versions) && versions.length === 1) {
      const only = String(versions[0] || '');
      if (only && version !== only) setOwn({ ...own, version: only });
    }
  }, [model, year, versions && versions.join('|')]);

  // Predictive suggestions for Modelo (contains match, not only prefix)
  function norm(s: string){
    try { return s.normalize('NFD').replace(/\p{Diacritic}+/gu,'').toLowerCase().replace(/[^a-z0-9]/g,''); } catch { return s.toLowerCase().replace(/[^a-z0-9]/g,''); }
  }
  const modelSuggest = React.useMemo(() => {
    // Si el usuario está escribiendo una marca pero aún no hay match único,
    // no mostramos modelos para evitar "lista global" no sincronizada.
    if (brandTyping) return [] as string[];
    const q = (model || '').trim();
    const src = (modelsForBrand || []) as string[];
    if (!q) return src.slice(0, 12);
    const nq = norm(q);
    return src.filter(m => norm(String(m)).includes(nq)).slice(0, 12);
  }, [model, modelsForBrand, brandTyping]);
  const modelsLoading = !baseReady || (!hasBaseModels && modelsFallback === undefined);

  // Reset/prime highlight when suggestions change
  React.useEffect(() => { setHiModel(modelSuggest.length ? 0 : -1); }, [modelSuggest.join('|')]);

  // When brand is selected and no model typed, open suggestions automatically
  React.useEffect(() => {
    if (brand && !model) setOpenModelSugg(true);
  }, [brand, model]);

  const tryApplyBrand = React.useCallback(
    (candidate: string | null | undefined) => {
      const trimmed = String(candidate || '').trim();
      if (!trimmed) return false;
      const normalized = brandNorm(trimmed);
      setOwn((prev) => {
        const current = String(prev.make || '').trim();
        if (brandNorm(current) === normalized) return prev;
        return { ...prev, make: trimmed };
      });
      return true;
    },
    [allowedBrandSet, setOwn],
  );

  const inferBrandForModel = React.useCallback(
    async (modelValue: string) => {
      if (!modelValue || brandLocked) return;
      try {
        const detail = await endpoints.options({ model: modelValue });
        const autofill = detail?.autofill || {};
        const selected = detail?.selected || {};
        const candidate =
          (typeof autofill.make_from_model === 'string' && autofill.make_from_model.trim())
            || (typeof selected.make === 'string' && selected.make.trim())
            || (Array.isArray(detail?.makes_for_model) && detail?.makes_for_model.length === 1
              ? String(detail.makes_for_model[0] || '')
              : '');
        if (candidate && tryApplyBrand(candidate)) return;
      } catch {
        /* ignore */
      }
      try {
        const catalog = await endpoints.catalog({ q: modelValue, limit: 500 });
        const rows: any[] = Array.isArray(catalog)
          ? catalog
          : Array.isArray((catalog as any)?.items)
            ? (catalog as any).items
            : [];
        let canonical = '';
        const seen = new Set<string>();
        rows.forEach((row) => {
          const raw = String(row?.make || row?.brand || '').trim();
          if (!raw) return;
          if (!canonical) canonical = raw;
          seen.add(raw.toUpperCase());
        });
        if (canonical) tryApplyBrand(canonical);
      } catch {
        /* ignore */
      }
    },
    [brandLocked, tryApplyBrand],
  );

  function selectModel(m: string){
    setOwn({ ...own, model: m });
    setOpenModelSugg(false);
    // keep focus on input for quick year/version next
    setTimeout(()=>modelRef.current?.focus(), 0);
    void inferBrandForModel(m);
  }

  React.useEffect(() => {
    if (!model) return;
    if (!brandApi) return;
    const current = String(brand || '').trim();
    const normalizedCurrent = brandNorm(current);
    const normalizedCandidate = brandNorm(brandApi);
    if (normalizedCurrent === normalizedCandidate) return;
    if (allowedBrandSet && !allowedBrandSet.has(normalizedCandidate)) return;
    tryApplyBrand(brandApi);
  }, [model, brandApi, brand, allowedBrandSet, tryApplyBrand]);

  React.useEffect(() => {
    if (!model || brandLocked) return;
    const candidate =
      (typeof forModel?.autofill?.make_from_model === 'string' && forModel?.autofill?.make_from_model.trim())
      || (typeof forModel?.selected?.make === 'string' && forModel?.selected?.make.trim())
      || (Array.isArray(forModel?.makes_for_model) && forModel?.makes_for_model.length === 1
        ? String(forModel.makes_for_model[0] || '')
        : '');
    if (candidate && tryApplyBrand(candidate)) return;
    if (brandApi) tryApplyBrand(brandApi);
  }, [model, brandLocked, forModel?.autofill?.make_from_model, forModel?.selected?.make, forModel?.makes_for_model, brandApi, tryApplyBrand]);

  function onModelKeyDown(e: React.KeyboardEvent<HTMLInputElement>){
    const N = modelSuggest.length;
    if (!N) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpenModelSugg(true); setHiModel(h => (h+1>=N?0:h+1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpenModelSugg(true); setHiModel(h => (h<=0?N-1:h-1)); }
    else if (e.key === 'Enter') { if (hiModel>=0 && hiModel<N) { e.preventDefault(); selectModel(modelSuggest[hiModel]); } }
    else if (e.key === 'Escape') { setOpenModelSugg(false); }
  }

  React.useEffect(() => {
    if (brandLocked) setOpenBrandSugg(false);
  }, [brandLocked]);

  return (
    <section suppressHydrationWarning style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff' }}>
      <div style={{ display:'grid', gridTemplateColumns:'auto minmax(180px,1fr) minmax(140px,1fr) minmax(180px,1fr) minmax(180px,1fr)', gap:12, alignItems:'end' }}>
        <div style={{ alignSelf:'end' }}>
          <button suppressHydrationWarning type="button" onClick={()=>setOwn({ make:'', model:'', year:'', version:'' })} style={{ border:'1px solid #e5e7eb', background:'#fff', padding:'6px 10px', borderRadius:8, cursor:'pointer' }}>Borrar</button>
        </div>
        <div style={{ position:'relative' }}>
          <div style={{ display:'block', fontSize:12, opacity:0.8, marginBottom:4 }}>Marca</div>
          <input
            ref={brandRef}
            placeholder="Marca"
            value={brandDisplay}
            onChange={e=>{
              if (brandLocked) return;
              setOwn({ ...own, make: e.target.value, model: '', year: '', version: '' });
              setOpenBrandSugg(true);
            }}
            onFocus={()=> { if (!brandLocked) setOpenBrandSugg(true); }}
            onBlur={()=> setTimeout(()=>setOpenBrandSugg(false), 120)}
            onKeyDown={(e)=>{
              if (brandLocked) return;
              const N = brandSuggest.length;
              if (!N) return;
              if (e.key === 'ArrowDown') { e.preventDefault(); setOpenBrandSugg(true); setHiBrand(h => (h+1>=N?0:h+1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setOpenBrandSugg(true); setHiBrand(h => (h<=0?N-1:h-1)); }
              else if (e.key === 'Enter') { if (hiBrand>=0 && hiBrand<N) { e.preventDefault(); const v=brandSuggest[hiBrand]; setOwn({ ...own, make: v, model:'', year:'', version:'' }); setOpenBrandSugg(false); setTimeout(()=>brandRef.current?.blur(), 0);} }
              else if (e.key === 'Escape') { setOpenBrandSugg(false); }
            }}
            style={{ width:'100%' }}
            disabled={brandLocked}
            suppressHydrationWarning
          />
          {(openBrandSugg && !brandLocked) && (
            <div style={{ position:'absolute', left:0, right:0, zIndex:10, background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, marginTop:4, boxShadow:'0 4px 10px rgba(0,0,0,0.06)', maxHeight:220, overflowY:'auto' }}>
              {brandSuggest.length>0 ? brandSuggest.map((m, idx) => (
                <button
                  suppressHydrationWarning
                  key={m}
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(ev)=>{ ev.preventDefault(); setOwn({ ...own, make: m, model:'', year:'', version:'' }); setOpenBrandSugg(false); }}
                  style={{ display:'block', width:'100%', textAlign:'left', background: (idx===hiBrand?'#eef2ff':'#fff'), border:'none', padding:'6px 8px', cursor:'pointer' }}
                >{m}</button>
              )) : (
                <div style={{ padding:'8px', color:'#64748b', fontSize:12 }}>{(allBrands||[]).length? 'Escribe para filtrar marcas' : 'Cargando marcas…'}</div>
              )}
            </div>
          )}
        </div>
        <div style={{ position:'relative' }}>
          <div style={{ display:'block', fontSize:12, opacity:0.8, marginBottom:4 }}>Modelo</div>
          <input
            ref={modelRef}
            placeholder={brandTyping ? "Selecciona marca primero" : "Modelo"}
            value={model}
            onChange={e=>{ setOwn({ ...own, model: e.target.value }); setOpenModelSugg(true); }}
            onFocus={()=> setOpenModelSugg(true)}
            onBlur={()=> {
              setTimeout(()=>setOpenModelSugg(false), 120);
              const trimmed = model.trim();
              if (trimmed && !brandLocked) void inferBrandForModel(trimmed);
            }}
            onKeyDown={onModelKeyDown}
            style={{ width:'100%' }}
            disabled={brandTyping}
            suppressHydrationWarning
          />
          {(openModelSugg) && (
            <div style={{ position:'absolute', left:0, right:0, zIndex:10, background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, marginTop:4, boxShadow:'0 4px 10px rgba(0,0,0,0.06)', maxHeight:220, overflowY:'auto' }}>
              {modelSuggest.length>0 ? modelSuggest.map((m, idx) => (
                <button
                  suppressHydrationWarning
                  key={m}
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(ev)=>{ ev.preventDefault(); selectModel(m); }}
                  style={{ display:'block', width:'100%', textAlign:'left', background: (idx===hiModel?'#eef2ff':'#fff'), border:'none', padding:'6px 8px', cursor:'pointer' }}
                >{m}</button>
              )) : (
                <div style={{ padding:'8px', color:'#64748b', fontSize:12 }}>
                  {modelsLoading ? 'Cargando modelos…' : (brandApi ? 'Sin modelos 2024+ para esta marca' : 'Escribe para filtrar modelos')}
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          <div style={{ display:'block', fontSize:12, opacity:0.8, marginBottom:4 }}>Año</div>
          <select value={year} onChange={onYearChange} style={{ width:'100%' }} suppressHydrationWarning>
            <option value="">—</option>
            {yearsOptions.map(y => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>
        
        <div>
          <div style={{ display:'block', fontSize:12, opacity:0.8, marginBottom:4 }}>Versión</div>
          <select value={version} onChange={e=>setOwn({ ...own, version: e.target.value })} disabled={!model || !year} style={{ width:'100%' }} suppressHydrationWarning>
            <option value="">—</option>
            {versions.map(v => (<option key={v} value={v}>{v}</option>))}
          </select>
        </div>
      </div>
    </section>
  );
}
