-- Dealer billing & status controls
alter table cortex.dealer_locations
    add column if not exists status text not null default 'active',
    add column if not exists paused_at timestamptz,
    add column if not exists billing_notes text,
    add column if not exists service_started_at timestamptz;

-- Ensure new timestamps populated with existing creation dates
update cortex.dealer_locations
set service_started_at = coalesce(service_started_at, created_at)
where service_started_at is null;

alter table cortex.dealer_locations
    alter column service_started_at set default now();
alter table cortex.dealer_locations
    alter column service_started_at set not null;

-- Enforce allowed statuses and index for quick filtering
alter table cortex.dealer_locations
    add constraint chk_dealer_status check (status in ('active', 'paused'));

create index if not exists idx_dealers_status on cortex.dealer_locations(status);

create table if not exists cortex.dealer_billing_events (
    id uuid primary key default gen_random_uuid(),
    dealer_id uuid not null references cortex.dealer_locations(id) on delete cascade,
    recorded_by uuid references cortex.app_users(id) on delete set null,
    event_type text not null check (event_type in ('payment', 'charge', 'pause', 'resume', 'note', 'activation')),
    amount numeric(12,2),
    currency text default 'MXN',
    notes text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_billing_events_dealer on cortex.dealer_billing_events(dealer_id, created_at desc);
