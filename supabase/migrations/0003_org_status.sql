alter table cortex.organizations
    add column if not exists status text not null default 'active',
    add column if not exists paused_at timestamptz;

create index if not exists idx_org_status on cortex.organizations(status);
