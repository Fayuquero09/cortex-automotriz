"use client";
import React from 'react';
import type { Lang } from '@/lib/i18n';

type InsightArgs = Record<string, any> | undefined;
type InsightItem = {
  key?: string;
  title?: string;
  heading?: string;
  text?: string;
  description?: string;
  items?: InsightItem[];
  args?: InsightArgs;
};

type InsightSection = {
  id?: string;
  title?: string;
  heading?: string;
  items?: InsightItem[];
};

type InsightStruct = {
  title?: string;
  sections?: InsightSection[];
};

const SECTION_TITLES: Record<string, Partial<Record<Lang, string>>> = {
  hallazgos_clave: {
    es: 'Hallazgos clave',
    en: 'Key findings',
    zh: '关键发现',
  },
  oportunidades: {
    es: 'Oportunidades',
    en: 'Opportunities',
    zh: '机会',
  },
  riesgos_y_contramedidas: {
    es: 'Riesgos y contramedidas',
    en: 'Risks & mitigations',
    zh: '风险与对策',
  },
  acciones_priorizadas: {
    es: 'Acciones priorizadas',
    en: 'Prioritised actions',
    zh: '优先行动',
  },
  preguntas_para_el_equipo: {
    es: 'Preguntas para el equipo',
    en: 'Team questions',
    zh: '团队问题',
  },
  supuestos_y_datos_faltantes: {
    es: 'Supuestos y datos pendientes',
    en: 'Assumptions & missing data',
    zh: '假设与缺失信息',
  },
};

const badge = (label: string, tone: 'info' | 'success' | 'warning' | 'danger' = 'info') => {
  const colors: Record<typeof tone, string> = {
    info: '#1d4ed8',
    success: '#047857',
    warning: '#b45309',
    danger: '#b91c1c',
  };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      backgroundColor: `${colors[tone]}14`,
      color: colors[tone],
    }}>
      {label}
    </span>
  );
};

const fmt = (value: any): string => {
  if (value == null) return '';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k}: ${fmt(v)}`).join(', ');
  return String(value).trim();
};

const renderList = (items: (string | InsightItem | undefined)[], lang: Lang) => {
  const ok = items.filter(Boolean) as (string | InsightItem)[];
  if (!ok.length) return null;
  return (
    <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#1f2937' }}>
      {ok.map((item, idx) => (
        <li key={idx} style={{ marginBottom: 6 }}>
          {typeof item === 'string' ? item : renderItem(item, lang)}
        </li>
      ))}
    </ul>
  );
};

const renderItem = (item: InsightItem, lang: Lang): React.ReactNode => {
  if (!item) return null;
  if (typeof item === 'string') return item;
  const key = (item.key || '').toLowerCase();
  const args = item.args ?? {};
  const text = fmt(item.text ?? args.text);
  if (key === 'hallazgo') {
    return <span>{text}</span>;
  }
  if (key === 'pregunta') {
    return <span style={{ fontWeight: 500 }}>{text}</span>;
  }
  if (key === 'supuesto') {
    return <span>{text}</span>;
  }
  if (key.startsWith('accion_')) {
    return (
      <div style={cardStyle('#0f172a')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <strong>{text}</strong>
          {args.urgencia ? badge(fmt(args.urgencia), 'warning') : null}
        </div>
        <div style={{ fontSize: 13, color: '#475569', display: 'grid', gap: 4 }}>
          {args.owner ? <span><strong>Owner:</strong> {fmt(args.owner)}</span> : null}
          {args.cuando ? <span><strong>Cuándo:</strong> {fmt(args.cuando)}</span> : null}
          {args.kpi ? <span><strong>KPI:</strong> {fmt(args.kpi)}</span> : null}
        </div>
      </div>
    );
  }
  if (key === 'oportunidad') {
    return (
      <div style={cardStyle('#1d4ed8')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <strong>{fmt(args.palanca) || text}</strong>
          {args.impacto ? badge(fmt(args.impacto), 'success') : null}
        </div>
        {args.accion ? <p style={cardParagraph}>{fmt(args.accion)}</p> : null}
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
          {args.urgencia ? `${fmt(args.urgencia)} • ` : ''}{text && text !== fmt(args.palanca) ? text : ''}
        </div>
      </div>
    );
  }
  if (key === 'riesgo') {
    return (
      <div style={cardStyle('#b91c1c')}>
        <strong style={{ display: 'block', marginBottom: 6 }}>{text}</strong>
        {args.mitigacion ? <p style={cardParagraph}>{fmt(args.mitigacion)}</p> : null}
      </div>
    );
  }
  if (key === 'bloque' && Array.isArray(item.items)) {
    return renderList(item.items, lang);
  }
  if (item.items && Array.isArray(item.items)) {
    return renderList(item.items, lang);
  }
  if (text) {
    return <span>{text}</span>;
  }
  if (Object.keys(args).length) {
    return (
      <div style={cardStyle('#0f172a')}>
        {Object.entries(args).map(([k, v]) => (
          <div key={k} style={{ fontSize: 13, color: '#334155' }}>
            <strong>{k}:</strong> {fmt(v)}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const cardStyle = (color: string): React.CSSProperties => ({
  border: `1px solid ${color}22`,
  background: '#ffffff',
  borderRadius: 12,
  padding: '12px 16px',
  boxShadow: '0 8px 18px -12px rgba(15, 23, 42, 0.6)',
  display: 'grid',
  gap: 6,
});

const cardParagraph: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: '#1f2937',
  lineHeight: 1.5,
};

const sectionHeading = (section: InsightSection, lang: Lang): string => {
  const id = section.id || '';
  const label = SECTION_TITLES[id]?.[lang] || SECTION_TITLES[id]?.es;
  return section.title || section.heading || label || id || 'Sección';
};

export function renderStruct(struct: InsightStruct | null | undefined, lang: Lang = 'es'): React.ReactNode {
  if (!struct || typeof struct !== 'object') return null;
  const sections = Array.isArray(struct.sections) ? struct.sections : [];
  if (!sections.length) return null;
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {sections.map((section, idx) => (
        <section key={section.id || idx} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>{sectionHeading(section, lang)}</h3>
            <span style={{ height: 1, flex: 1, background: '#e2e8f0' }} />
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {Array.isArray(section.items) && section.items.length
              ? section.items.map((item, itemIdx) => (
                  <div key={itemIdx}>
                    {renderItem(item, lang) || <span style={{ color: '#94a3b8' }}>Sin datos</span>}
                  </div>
                ))
              : <span style={{ color: '#94a3b8' }}>Sin datos</span>}
          </div>
        </section>
      ))}
    </div>
  );
}

export default renderStruct;
