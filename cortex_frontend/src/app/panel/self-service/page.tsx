"use client";

import React from 'react';
import useSWR from 'swr';
import { endpoints } from '@/lib/api';

type StatusFilter = 'all' | 'trial' | 'active' | 'pending' | 'blocked';
type PaidFilter = 'all' | 'paid' | 'free';

type SelfMembershipSummary = {
  id: string;
  phone: string;
  display_name?: string | null;
  brand_label?: string | null;
  status?: string | null;
  paid?: boolean;
  free_limit?: number | null;
  search_count?: number | null;
  last_session_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AdminSelfMembershipListResponse = {
  items: SelfMembershipSummary[];
  limit: number;
  offset: number;
  total: number;
};

type SelfMembershipDetail = {
  membership: {
    id: string;
    phone: string;
    brand_slug?: string | null;
    brand_label?: string | null;
    display_name?: string | null;
    footer_note?: string | null;
    status?: string | null;
    free_limit?: number | null;
    search_count?: number | null;
    paid?: boolean;
    paid_at?: string | null;
    last_session_token?: string | null;
    last_session_at?: string | null;
    last_otp_at?: string | null;
    dealer_profile?: Record<string, any> | null;
    admin_notes?: string | null;
    metadata?: Record<string, any> | null;
    created_at?: string | null;
    updated_at?: string | null;
  } | null;
  sessions: Array<{
    id: string;
    session_token: string;
    issued_at?: string | null;
    expires_at?: string | null;
    last_used_at?: string | null;
    revoked_at?: string | null;
    user_agent?: string | null;
    ip_address?: string | null;
  }>;
  usage?: {
    free_limit?: number | null;
    search_count?: number | null;
    remaining?: number | null;
    paid?: boolean;
    status?: string | null;
    last_session_at?: string | null;
  } | null;
};

type EditState = {
  displayName: string;
  brandLabel: string;
  brandSlug: string;
  footerNote: string;
  freeLimit: string;
  searchCount: string;
  status: string;
  paid: boolean;
  adminNotes: string;
};

const STATUS_LABELS: Record<string, string> = {
  trial: 'Trial',
  active: 'Activa',
  pending: 'Pendiente',
  blocked: 'Bloqueada',
};

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos los estatus' },
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Activa' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'blocked', label: 'Bloqueada' },
];

const PAID_FILTER_OPTIONS: Array<{ value: PaidFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'paid', label: 'Solo pagados' },
  { value: 'free', label: 'Solo gratuitos' },
];

const MEMBERSHIPS_PAGE_SIZE = 40;

function formatDateTime(value?: string | null, includeTime = true): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: includeTime ? 'short' : undefined,
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatStatus(value?: string | null): string {
  if (!value) return '—';
  const normalized = value.toLowerCase();
  return STATUS_LABELS[normalized] || value;
}

function formatPhone(value?: string | null): string {
  if (!value) return '—';
  const digits = value.replace(/\D+/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 12 && digits.startsWith('52')) {
    return `+52 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return value;
}

const fetchSelfMemberships = (
  _key: string,
  searchValue: string,
  statusValue: StatusFilter,
  paidValue: PaidFilter,
  pageIndex: number,
) => {
  const params: Record<string, any> = {
    limit: MEMBERSHIPS_PAGE_SIZE,
  };
  const pageNumberRaw = Number(pageIndex);
  const pageNumber = Number.isFinite(pageNumberRaw) ? Math.max(0, Math.floor(pageNumberRaw)) : 0;
  params.offset = pageNumber * MEMBERSHIPS_PAGE_SIZE;
  if (searchValue) params.search = searchValue;
  if (statusValue !== 'all') params.status = statusValue;
  if (paidValue === 'paid') params.paid = true;
  if (paidValue === 'free') params.paid = false;
  return endpoints.adminSelfMemberships(params);
};

export default function PanelSelfServicePage(): JSX.Element {
  const [searchInput, setSearchInput] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [paidFilter, setPaidFilter] = React.useState<PaidFilter>('all');
  const [page, setPage] = React.useState(0);
  const [memberships, setMemberships] = React.useState<SelfMembershipSummary[]>([]);
  const [total, setTotal] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState('');
  const [editState, setEditState] = React.useState<EditState | null>(null);
  const [initialState, setInitialState] = React.useState<EditState | null>(null);
  const [saveStatus, setSaveStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 350);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  React.useEffect(() => {
    setPage(0);
    setMemberships([]);
    setTotal(0);
    setSelectedId('');
  }, [searchTerm, statusFilter, paidFilter]);

  const { data, error, isLoading, mutate: mutateList } = useSWR<AdminSelfMembershipListResponse>(
    ['admin_self_memberships', searchTerm, statusFilter, paidFilter, page],
    fetchSelfMemberships,
  );

  React.useEffect(() => {
    if (!data) return;
    setTotal(data.total);
    setMemberships((prev) => {
      if (page === 0) {
        return data.items;
      }
      const map = new Map(prev.map((item) => [item.id, item] as const));
      for (const item of data.items) {
        map.set(item.id, item);
      }
      return Array.from(map.values());
    });
  }, [data, page]);

  React.useEffect(() => {
    if (!selectedId) return;
    if (!memberships.some((item) => item.id === selectedId)) {
      setSelectedId('');
    }
  }, [memberships, selectedId]);

  const loadMoreDisabled = (data?.items?.length ?? 0) < MEMBERSHIPS_PAGE_SIZE;
  const hasMore = !loadMoreDisabled && memberships.length < total;

  const {
    data: detail,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useSWR<SelfMembershipDetail>(
    selectedId ? ['admin_self_membership_detail', selectedId] : null,
    () => endpoints.adminSelfMembership(selectedId),
  );

  const membership = detail?.membership;

  React.useEffect(() => {
    if (!membership) {
      setEditState(null);
      setInitialState(null);
      return;
    }
    const next: EditState = {
      displayName: membership.display_name || '',
      brandLabel: membership.brand_label || '',
      brandSlug: membership.brand_slug || '',
      footerNote: membership.footer_note || '',
      freeLimit: membership.free_limit != null ? String(membership.free_limit) : '',
      searchCount: membership.search_count != null ? String(membership.search_count) : '',
      status: (membership.status || 'trial').toLowerCase(),
      paid: Boolean(membership.paid),
      adminNotes: membership.admin_notes || '',
    };
    setEditState(next);
    setInitialState(next);
    setSaveStatus(null);
  }, [membership]);

  const hasChanges = React.useMemo(() => {
    if (!editState || !initialState) return false;
    return (
      editState.displayName !== initialState.displayName ||
      editState.brandLabel !== initialState.brandLabel ||
      editState.brandSlug !== initialState.brandSlug ||
      editState.footerNote !== initialState.footerNote ||
      editState.freeLimit !== initialState.freeLimit ||
      editState.searchCount !== initialState.searchCount ||
      editState.status !== initialState.status ||
      editState.paid !== initialState.paid ||
      editState.adminNotes !== initialState.adminNotes
    );
  }, [editState, initialState]);

  const handleReset = React.useCallback(() => {
    if (!initialState) return;
    setEditState({ ...initialState });
    setSaveStatus(null);
  }, [initialState]);

  const handleSave = React.useCallback(async () => {
    if (!selectedId || !editState || !initialState) return;
    if (!hasChanges) return;

    const payload: Record<string, any> = {};

    if (editState.displayName !== initialState.displayName) {
      payload.display_name = editState.displayName;
    }
    if (editState.brandLabel !== initialState.brandLabel) {
      payload.brand_label = editState.brandLabel;
    }
    if (editState.brandSlug !== initialState.brandSlug) {
      payload.brand_slug = editState.brandSlug;
    }
    if (editState.footerNote !== initialState.footerNote) {
      payload.footer_note = editState.footerNote;
    }
    if (editState.adminNotes !== initialState.adminNotes) {
      payload.admin_notes = editState.adminNotes;
    }
    if (editState.status !== initialState.status) {
      payload.status = editState.status;
    }
    if (editState.paid !== initialState.paid) {
      payload.paid = editState.paid;
    }

    if (editState.freeLimit !== initialState.freeLimit) {
      const raw = editState.freeLimit.trim();
      const value = Number(raw);
      if (!raw) {
        setSaveStatus({ type: 'error', message: 'Define un límite de búsquedas gratuitas.' });
        return;
      }
      if (!Number.isFinite(value) || value < 0) {
        setSaveStatus({ type: 'error', message: 'El límite de búsquedas debe ser un número mayor o igual a cero.' });
        return;
      }
      payload.free_limit = value;
    }

    if (editState.searchCount !== initialState.searchCount) {
      const raw = editState.searchCount.trim();
      const value = Number(raw);
      if (!raw) {
        setSaveStatus({ type: 'error', message: 'Define la cantidad de búsquedas realizadas.' });
        return;
      }
      if (!Number.isFinite(value) || value < 0) {
        setSaveStatus({ type: 'error', message: 'Las búsquedas realizadas deben ser un número mayor o igual a cero.' });
        return;
      }
      payload.search_count = value;
    }

    const normalizedPayload: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      normalizedPayload[key] = typeof value === 'string' ? value.trim() : value;
    }

    setSaving(true);
    setSaveStatus(null);
    try {
      await endpoints.adminUpdateSelfMembership(selectedId, normalizedPayload);
      setSaveStatus({ type: 'success', message: 'Membresía actualizada correctamente.' });
      await Promise.all([mutateDetail(), mutateList()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar la membresía.';
      setSaveStatus({ type: 'error', message });
    } finally {
      setSaving(false);
    }
  }, [editState, initialState, mutateDetail, mutateList, selectedId, hasChanges]);

  const usage = detail?.usage;

  return (
    <main style={{ display: 'grid', gap: 24, padding: 24 }}>
      <section style={{ display: 'grid', gap: 8 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>Panel Self-service</h1>
        <p style={{ margin: 0, color: '#475569', maxWidth: 760 }}>
          Administra las membresías self-service. Busca por teléfono o nombre, revisa el historial de sesiones y
          actualiza el estatus, límites o notas internas de cada usuario.
        </p>
      </section>

      <section style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(280px, 340px) 1fr' }}>
        <aside style={{ display: 'grid', gap: 12 }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Buscar</label>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Teléfono, nombre o marca"
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Estatus</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Tipo</label>
              <select
                value={paidFilter}
                onChange={(event) => setPaidFilter(event.target.value as PaidFilter)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              >
                {PAID_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', padding: 0, display: 'grid', overflow: 'hidden' }}>
            <header style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Usuarios self-service</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{memberships.length} de {total} resultados</div>
              </div>
            </header>
            <div style={{ maxHeight: 420, overflowY: 'auto', display: 'grid', gap: 8, padding: 12 }}>
              {isLoading && memberships.length === 0 ? (
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Cargando membresías…</p>
              ) : error ? (
                <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>No se pudieron cargar las membresías.</p>
              ) : memberships.length === 0 ? (
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>No se encontraron registros con los filtros actuales.</p>
              ) : (
                memberships.map((item) => {
                  const isSelected = item.id === selectedId;
                  const headline = item.display_name || item.brand_label || formatPhone(item.phone);
                  const statusText = formatStatus(item.status);
                  const paidBadge = item.paid ? 'Pagada' : 'Gratuita';
                  const usageText = `${item.search_count ?? 0}/${item.free_limit ?? '—'} consultas`;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      style={{
                        textAlign: 'left',
                        borderRadius: 10,
                        border: `1px solid ${isSelected ? '#4f46e5' : '#e2e8f0'}`,
                        background: isSelected ? '#eef2ff' : '#fff',
                        padding: '10px 12px',
                        display: 'grid',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{headline}</div>
                      <div style={{ fontSize: 11, color: '#475569' }}>{formatPhone(item.phone)}</div>
                      <div style={{ fontSize: 11, color: '#475569', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>Estatus: {statusText}</span>
                        <span>Tipo: {paidBadge}</span>
                        <span>{usageText}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>
                        Última sesión: {formatDateTime(item.last_session_at)}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {memberships.length > 0 ? (
              <footer style={{ padding: 12, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={!hasMore || isLoading}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: hasMore && !isLoading ? '#fff' : '#f1f5f9',
                    color: '#0f172a',
                    cursor: hasMore && !isLoading ? 'pointer' : 'default',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {isLoading ? 'Cargando…' : hasMore ? 'Cargar más' : 'Sin más resultados'}
                </button>
              </footer>
            ) : null}
          </div>
        </aside>

        <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', padding: 20, display: 'grid', gap: 18 }}>
          {selectedId ? null : (
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
              Selecciona un usuario self-service para ver su detalle y actualizar su configuración.
            </p>
          )}

          {detailLoading && selectedId ? (
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Cargando detalle de la membresía…</p>
          ) : detailError ? (
            <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>No se pudo cargar la información de la membresía.</p>
          ) : membership ? (
            <>
              <header style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#0f172a' }}>
                  {membership.display_name || membership.brand_label || formatPhone(membership.phone)}
                </div>
                <div style={{ fontSize: 12, color: '#475569', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <span>Teléfono: {formatPhone(membership.phone)}</span>
                  <span>Estatus: {formatStatus(membership.status)}</span>
                  <span>Tipo: {membership.paid ? 'Pagada' : 'Gratuita'}</span>
                  <span>Alta: {formatDateTime(membership.created_at, false)}</span>
                  <span>Actualización: {formatDateTime(membership.updated_at)}</span>
                </div>
              </header>

              {usage ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#f8fafc', display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: '#334155' }}>
                  <span><strong>Consultas:</strong> {usage.search_count ?? 0}</span>
                  <span><strong>Límite:</strong> {usage.free_limit ?? '—'}</span>
                  <span><strong>Restantes:</strong> {usage.remaining ?? '—'}</span>
                  <span><strong>Última sesión:</strong> {formatDateTime(usage.last_session_at)}</span>
                </div>
              ) : null}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSave();
                }}
                style={{ display: 'grid', gap: 12 }}
              >
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Nombre mostrado
                    <input
                      value={editState?.displayName ?? ''}
                      onChange={(event) => setEditState((prev) => (prev ? { ...prev, displayName: event.target.value } : prev))}
                      placeholder="Nombre en los PDF"
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Marca visible
                    <input
                      value={editState?.brandLabel ?? ''}
                      onChange={(event) => setEditState((prev) => (prev ? { ...prev, brandLabel: event.target.value } : prev))}
                      placeholder="Etiqueta de marca"
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Slug de marca
                    <input
                      value={editState?.brandSlug ?? ''}
                      onChange={(event) => setEditState((prev) => (prev ? { ...prev, brandSlug: event.target.value } : prev))}
                      placeholder="slug-personalizado"
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'monospace' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Notas del pie de página
                    <input
                      value={editState?.footerNote ?? ''}
                      onChange={(event) => setEditState((prev) => (prev ? { ...prev, footerNote: event.target.value } : prev))}
                      placeholder="Leyenda opcional en los PDF"
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Límite gratuito
                    <input
                      type="number"
                      min={0}
                      value={editState?.freeLimit ?? ''}
                      onChange={(event) => setEditState((prev) => (prev ? { ...prev, freeLimit: event.target.value } : prev))}
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Búsquedas realizadas
                    <input
                      type="number"
                      min={0}
                      value={editState?.searchCount ?? ''}
                      onChange={(event) => setEditState((prev) => (prev ? { ...prev, searchCount: event.target.value } : prev))}
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Estatus
                    <select
                      value={editState?.status ?? 'trial'}
                      onChange={(event) => setEditState((prev) => (prev ? { ...prev, status: event.target.value } : prev))}
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                    >
                      <option value="trial">Trial</option>
                      <option value="active">Activa</option>
                      <option value="pending">Pendiente</option>
                      <option value="blocked">Bloqueada</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={editState?.paid ?? false}
                      onChange={(event) => setEditState((prev) => (prev ? { ...prev, paid: event.target.checked } : prev))}
                    />
                    Membresía pagada
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                  Notas internas
                  <textarea
                    value={editState?.adminNotes ?? ''}
                    onChange={(event) => setEditState((prev) => (prev ? { ...prev, adminNotes: event.target.value } : prev))}
                    placeholder="Observaciones administrativas visibles solo en este panel"
                    style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit', minHeight: 72 }}
                  />
                </label>

                {saveStatus ? (
                  <p style={{ fontSize: 12, color: saveStatus.type === 'success' ? '#047857' : '#dc2626', margin: 0 }}>
                    {saveStatus.message}
                  </p>
                ) : null}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <button
                    type="submit"
                    disabled={!hasChanges || saving}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid #2563eb',
                      background: hasChanges && !saving ? '#2563eb' : '#bfdbfe',
                      color: '#fff',
                      fontWeight: 600,
                      cursor: hasChanges && !saving ? 'pointer' : 'default',
                    }}
                  >
                    {saving ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={!hasChanges || saving}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#1f2937',
                      fontWeight: 600,
                      cursor: hasChanges && !saving ? 'pointer' : 'default',
                    }}
                  >
                    Restablecer
                  </button>
                </div>
              </form>

              <section style={{ display: 'grid', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Sesiones recientes</h3>
                {detail?.sessions?.length ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {detail.sessions.slice(0, 6).map((session) => {
                      const expiresTs = session.expires_at ? new Date(session.expires_at).getTime() : null;
                      const revoked = Boolean(session.revoked_at);
                      let state = 'Activa';
                      if (revoked) {
                        state = 'Revocada';
                      } else if (expiresTs && expiresTs < Date.now()) {
                        state = 'Expirada';
                      }
                      return (
                        <div
                          key={session.id}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            padding: 12,
                            background: '#f8fafc',
                            display: 'grid',
                            gap: 4,
                            fontSize: 12,
                            color: '#334155',
                          }}
                        >
                          <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
                            {session.session_token.slice(0, 16)}…
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            <span><strong>Emitida:</strong> {formatDateTime(session.issued_at)}</span>
                            <span><strong>Expira:</strong> {formatDateTime(session.expires_at)}</span>
                            <span><strong>Último uso:</strong> {formatDateTime(session.last_used_at)}</span>
                            <span><strong>Estado:</strong> {state}</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, color: '#64748b' }}>
                            {session.ip_address ? <span>IP {session.ip_address}</span> : null}
                            {session.user_agent ? <span>{session.user_agent.slice(0, 60)}…</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Aún no hay sesiones registradas.</p>
                )}
              </section>
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}
