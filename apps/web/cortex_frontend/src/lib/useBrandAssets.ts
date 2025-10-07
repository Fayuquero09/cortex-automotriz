'use client';

import React from 'react';

type BrandMeta = {
  name: string;
  slug?: string | null;
  logo_url?: string | null;
};

type BrandAssetsState = {
  allowed: string[];
  meta: BrandMeta[];
  primary: string;
  logos: Record<string, string>;
};

export type BrandAssets = BrandAssetsState & {
  resolveLogo: (label: string) => string;
};

const KEY_ALLOWED = 'CORTEX_ALLOWED_BRANDS';
const KEY_ALLOWED_META = 'CORTEX_ALLOWED_BRAND_META';
const KEY_PRIMARY = 'CORTEX_DEALER_ALLOWED_BRAND';
const KEY_MEMBERSHIP_BRAND = 'CORTEX_MEMBERSHIP_BRAND';

function parseAllowed(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
          .filter((item) => item.length > 0),
      ),
    );
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return parseAllowed(parsed);
    } catch {
      return [trimmed];
    }
  }
  return [];
}

function readAllowedFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY_ALLOWED);
    if (!raw) return [];
    return parseAllowed(JSON.parse(raw));
  } catch {
    try {
      const raw = window.localStorage.getItem(KEY_ALLOWED);
      return parseAllowed(raw);
    } catch {
      return [];
    }
  }
}

function readMetaFromStorage(): BrandMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY_ALLOWED_META);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const name = String((item as any).name || '').trim();
        const slug = String((item as any).slug || '').trim();
        const logo = String((item as any).logo_url || '').trim();
        if (!name && !slug && !logo) return null;
        return {
          name: name || slug,
          slug: slug || undefined,
          logo_url: logo || undefined,
        } as BrandMeta;
      })
      .filter((item): item is BrandMeta => item !== null);
  } catch {
    return [];
  }
}

function buildLogoMap(meta: BrandMeta[]): Record<string, string> {
  const logos: Record<string, string> = {};
  const setLogo = (key: string | null | undefined, url: string) => {
    if (!key) return;
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    logos[trimmedKey] = url;
    logos[trimmedKey.toLowerCase()] = url;
  };
  meta.forEach((item) => {
    const url = typeof item.logo_url === 'string' ? item.logo_url.trim() : '';
    if (!url) return;
    setLogo(item.name, url);
    setLogo(item.slug, url);
  });
  return logos;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readPrimaryBrand(allowed: string[]): string {
  if (typeof window === 'undefined') return allowed[0] || '';
  const sources = [
    window.localStorage.getItem(KEY_PRIMARY),
    window.localStorage.getItem(KEY_MEMBERSHIP_BRAND),
  ];
  for (const source of sources) {
    const value = String(source || '').trim();
    if (value) return value;
  }
  return allowed[0] || '';
}

function readState(): BrandAssetsState {
  const allowed = readAllowedFromStorage();
  const meta = readMetaFromStorage();
  const logos = buildLogoMap(meta);
  const primary = readPrimaryBrand(allowed);
  return { allowed, meta, logos, primary };
}

function pickLogoFromMeta(label: string, meta: BrandMeta | undefined, logos: Record<string, string>): string {
  if (!meta) return '';
  const attempts = [meta.name, meta.slug, label];
  for (const candidate of attempts) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const direct = logos[trimmed] || logos[trimmed.toLowerCase()];
    if (direct) return direct;
  }
  if (meta.logo_url && meta.logo_url.trim()) return meta.logo_url.trim();
  const base = meta.slug?.trim() || meta.name?.trim() || label.trim();
  const slug = slugify(base);
  if (!slug) return '';
  const candidates = [
    `/logos/${slug}-logo.png`,
    `/logos/${slug}.png`,
    `/logos/${slug}-logo.svg`,
    `/logos/${slug}.svg`,
    `/logos/${slug}-logo.webp`,
    `/logos/${slug}.webp`,
  ];
  return candidates[0] || '';
}

export function useBrandAssets(): BrandAssets {
  const [state, setState] = React.useState<BrandAssetsState>(() => readState());

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const read = () => setState(readState());
    const onStorage = (event: StorageEvent) => {
      if (!event.key) {
        read();
        return;
      }
      if ([KEY_ALLOWED, KEY_ALLOWED_META, KEY_PRIMARY, KEY_MEMBERSHIP_BRAND].includes(event.key)) {
        read();
      }
    };
    const onCustom = () => read();
    window.addEventListener('storage', onStorage);
    window.addEventListener('cortex:allowed_brands', onCustom as EventListener);
    window.addEventListener('cortex:allowed_brand_meta', onCustom as EventListener);
    window.addEventListener('cortex:dealer_brand', onCustom as EventListener);
    read();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('cortex:allowed_brands', onCustom as EventListener);
      window.removeEventListener('cortex:allowed_brand_meta', onCustom as EventListener);
      window.removeEventListener('cortex:dealer_brand', onCustom as EventListener);
    };
  }, []);

  const resolveLogo = React.useCallback(
    (label: string): string => {
      const trimmed = String(label || '').trim();
      if (!trimmed) {
        const fallbackMeta = state.meta[0];
        return pickLogoFromMeta('', fallbackMeta, state.logos);
      }
      const direct = state.logos[trimmed] || state.logos[trimmed.toLowerCase()];
      if (direct) return direct;
      const lower = trimmed.toLowerCase();
      const meta = state.meta.find((item) => {
        const name = String(item.name || '').trim().toLowerCase();
        const slug = String(item.slug || '').trim().toLowerCase();
        return (name && name === lower) || (slug && slug === lower);
      });
      const resolved = pickLogoFromMeta(trimmed, meta, state.logos);
      if (resolved) return resolved;
      const slugged = slugify(trimmed);
      if (!slugged) return '';
      const candidates = [
        `/logos/${slugged}-logo.png`,
        `/logos/${slugged}.png`,
        `/logos/${slugged}-logo.svg`,
        `/logos/${slugged}.svg`,
        `/logos/${slugged}-logo.webp`,
        `/logos/${slugged}.webp`,
      ];
      return candidates[0] || '';
    },
    [state.logos, state.meta],
  );

  return React.useMemo(() => ({ ...state, resolveLogo }), [state, resolveLogo]);
}
