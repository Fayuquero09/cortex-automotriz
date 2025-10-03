-- Self-service memberships persistence

set search_path to cortex, public;

create table if not exists cortex.self_memberships (
    id uuid primary key default gen_random_uuid(),
    phone text not null unique,
    brand_slug text,
    brand_label text,
    display_name text,
    footer_note text,
    status text not null default 'trial' check (status in ('trial','active','pending','blocked')),
    search_count integer not null default 0,
    free_limit integer not null default 5 check (free_limit >= 0),
    paid boolean not null default false,
    paid_at timestamptz,
    stripe_customer_id text,
    last_checkout_session text,
    last_otp_at timestamptz,
    last_session_token text,
    last_session_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_self_memberships_status on cortex.self_memberships(status);
create index if not exists idx_self_memberships_paid on cortex.self_memberships(paid);

create table if not exists cortex.self_membership_sessions (
    id uuid primary key default gen_random_uuid(),
    membership_id uuid not null references cortex.self_memberships(id) on delete cascade,
    session_token text not null unique,
    issued_at timestamptz not null default now(),
    expires_at timestamptz not null,
    last_used_at timestamptz,
    revoked_at timestamptz,
    user_agent text,
    ip_address text,
    metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_self_membership_sessions_membership on cortex.self_membership_sessions(membership_id);

-- timestamps trigger
drop trigger if exists set_timestamp_self_memberships on cortex.self_memberships;
create trigger set_timestamp_self_memberships
before update on cortex.self_memberships
for each row execute procedure cortex.set_updated_at();

-- Shared read/write access is only through the backend (service role).
alter table cortex.self_memberships enable row level security;
alter table cortex.self_membership_sessions enable row level security;

drop policy if exists self_memberships_service_role on cortex.self_memberships;
create policy self_memberships_service_role on cortex.self_memberships
for all using (cortex.current_role() = 'service_role')
with check (cortex.current_role() = 'service_role');

drop policy if exists self_membership_sessions_service_role on cortex.self_membership_sessions;
create policy self_membership_sessions_service_role on cortex.self_membership_sessions
for all using (cortex.current_role() = 'service_role')
with check (cortex.current_role() = 'service_role');
