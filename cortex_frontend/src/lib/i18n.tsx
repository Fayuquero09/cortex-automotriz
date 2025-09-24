"use client";
import React from 'react';

export type Lang = 'es' | 'en' | 'zh';

type Dict = Record<string, string>;
const dicts: Record<Lang, Dict> = {
  es: {
    app_title: 'Cortex Automotriz',
    nav_compare: 'Comparador',
    vehicle: 'Vehículo',
    msrp: 'MSRP',
    tx_price: 'Precio tx',
    bonus: 'Bono',
    energy60k: 'Energía/Combustible 60k',
    service60k: 'Servicio 60k',
    tco60k: 'TCO 60k',
    price_per_hp: 'Precio/HP',
    equip_rel: 'Equipo ±%',
    segment: 'Segmento',
    why_price: '¿Por qué este precio?',
    apples_ok: 'Apples‑to‑apples',
    bonus_suggested: 'Bono sugerido',
    add_equipment: 'Alternativa: añadir equipo',
    key_messages: 'Mensajes clave',
    close: 'Cerrar',
    use_heur: 'Usar heurísticos si no hay suficientes comparables',
    calculating: 'Calculando…',
  },
  en: {
    app_title: 'Cortex Automotriz',
    nav_compare: 'Comparator',
    vehicle: 'Vehicle',
    msrp: 'MSRP',
    tx_price: 'Trans. price',
    bonus: 'Rebate',
    energy60k: 'Energy/Fuel 60k',
    service60k: 'Service 60k',
    tco60k: 'TCO 60k',
    price_per_hp: 'Price/HP',
    equip_rel: 'Equipment ±%',
    segment: 'Segment',
    why_price: 'Why this price?',
    apples_ok: 'Apples‑to‑apples',
    bonus_suggested: 'Suggested rebate',
    add_equipment: 'Alternative: add equipment',
    key_messages: 'Key messages',
    close: 'Close',
    use_heur: 'Use heuristics if few comparables',
    calculating: 'Calculating…',
  },
  zh: {
    app_title: 'Cortex 汽车',
    nav_compare: '对比器',
    vehicle: '车型',
    msrp: '建议零售价',
    tx_price: '成交价',
    bonus: '优惠',
    energy60k: '能源/燃料 6万公里',
    service60k: '保养 6万公里',
    tco60k: '总拥有成本 6万公里',
    price_per_hp: '价格/马力',
    equip_rel: '配置 ±%',
    segment: '细分市场',
    why_price: '为什么是这个价格？',
    apples_ok: '同类可比',
    bonus_suggested: '建议优惠',
    add_equipment: '替代方案：增加配置',
    key_messages: '关键信息',
    close: '关闭',
    use_heur: '可比样本不足时使用启发式',
    calculating: '计算中…',
  }
};

type I18nState = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: string) => string;
};

const I18nCtx = React.createContext<I18nState | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }){
  const [lang, setLangState] = React.useState<Lang>('es');
  React.useEffect(()=>{
    try { const saved = localStorage.getItem('CORTEX_LANG') as Lang | null; if (saved) setLangState(saved); } catch {}
  },[]);
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem('CORTEX_LANG', l); } catch {} };
  const t = (k: string) => (dicts[lang]?.[k] ?? dicts['es'][k] ?? k);
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export function useI18n(){
  const v = React.useContext(I18nCtx);
  if (!v) throw new Error('useI18n must be used within I18nProvider');
  return v;
}
