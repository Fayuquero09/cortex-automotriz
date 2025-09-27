-- Multitenant base schema for Cortex Automotriz
-- This migration creates core entities, helper functions, and RLS policies.

create schema if not exists cortex;

-- ------------------------- Helper functions -------------------------
create or replace function cortex.current_claims()
returns jsonb
language sql
stable
as
$$
    select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb;
$$;

create or replace function cortex.current_role()
returns text
language sql
stable
as
$$
    select nullif(cortex.current_claims() ->> 'role', '')::text;
$$;

create or replace function cortex.current_org_id()
returns uuid
language sql
stable
as
$$
    select nullif(cortex.current_claims() ->> 'org_id', '')::uuid;
$$;

create or replace function cortex.current_allowed_brand_ids()
returns uuid[]
language plpgsql
stable
as
$$
declare
    result uuid[];
    payload jsonb;
begin
    payload := cortex.current_claims() -> 'allowed_brands';
    if payload is null then
        return array[]::uuid[];
    end if;
    select coalesce(array_agg(value::uuid), array[]::uuid[])
    into result
    from jsonb_array_elements_text(payload) as value;
    return coalesce(result, array[]::uuid[]);
end;
$$;

create or replace function cortex.current_allowed_dealer_ids()
returns uuid[]
language plpgsql
stable
as
$$
declare
    result uuid[];
    payload jsonb;
begin
    payload := cortex.current_claims() -> 'dealer_location_ids';
    if payload is null then
        return array[]::uuid[];
    end if;
    select coalesce(array_agg(value::uuid), array[]::uuid[])
    into result
    from jsonb_array_elements_text(payload) as value;
    return coalesce(result, array[]::uuid[]);
end;
$$;

create or replace function cortex.has_feature(feature_key text)
returns boolean
language sql
stable
as
$$
    select coalesce((cortex.current_claims() -> 'features' ->> feature_key)::boolean, false);
$$;

-- ------------------------- Core tables -------------------------
create table if not exists cortex.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    package text not null check (package in ('marca', 'black_ops')),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists cortex.brands (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references cortex.organizations(id) on delete cascade,
    name text not null,
    slug text not null,
    logo_url text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_brands_org_slug unique (organization_id, slug)
);

create table if not exists cortex.dealer_locations (
    id uuid primary key default gen_random_uuid(),
    brand_id uuid not null references cortex.brands(id) on delete cascade,
    name text not null,
    address text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists cortex.app_users (
    id uuid primary key references auth.users(id) on delete cascade,
    organization_id uuid not null references cortex.organizations(id) on delete cascade,
    brand_id uuid references cortex.brands(id) on delete set null,
    dealer_location_id uuid references cortex.dealer_locations(id) on delete set null,
    role text not null check (role in ('superadmin_global', 'superadmin_oem', 'oem_user', 'dealer_user')),
    feature_flags jsonb not null default '{}'::jsonb,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists cortex.user_compare_templates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references cortex.app_users(id) on delete cascade,
    template_name text not null,
    own_vehicle jsonb not null,
    competitors jsonb not null default '[]'::jsonb,
    dealer_info jsonb,
    sales_rep_info jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_template_per_user unique (user_id, template_name)
);

create table if not exists cortex.prompt_overrides (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references cortex.organizations(id) on delete cascade,
    brand_id uuid references cortex.brands(id) on delete cascade,
    dealer_location_id uuid references cortex.dealer_locations(id) on delete cascade,
    user_id uuid references cortex.app_users(id) on delete cascade,
    payload jsonb not null,
    can_edit_by_oem boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_prompt_scope
        check (
            ((brand_id is not null)::int + (dealer_location_id is not null)::int + (user_id is not null)::int) = 1
        )
);

create table if not exists cortex.body_style_configs (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references cortex.organizations(id) on delete cascade,
    brand_id uuid references cortex.brands(id) on delete cascade,
    config jsonb not null,
    version integer not null default 1,
    created_by uuid references cortex.app_users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_body_style_scope
        check (
            (brand_id is null) or (organization_id is not null)
        )
);

create table if not exists cortex.openai_keys (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references cortex.organizations(id) on delete cascade,
    key_alias text not null,
    key_hash text not null,
    key_salt text,
    last_four text,
    allowed_usage jsonb not null default '{}'::jsonb,
    active boolean not null default true,
    created_by uuid references cortex.app_users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_openai_key_alias unique (organization_id, key_alias)
);

create table if not exists cortex.audit_logs (
    id bigserial primary key,
    organization_id uuid references cortex.organizations(id) on delete set null,
    actor_user_id uuid references cortex.app_users(id) on delete set null,
    action text not null,
    target_type text,
    target_id uuid,
    diff jsonb,
    created_at timestamptz not null default now()
);

-- ------------------------- Indexes -------------------------
create index if not exists idx_brands_org on cortex.brands (organization_id);
create index if not exists idx_dealers_brand on cortex.dealer_locations (brand_id);
create unique index if not exists uq_dealer_brand_name on cortex.dealer_locations (brand_id, lower(name));
create index if not exists idx_app_users_org on cortex.app_users (organization_id);
create index if not exists idx_app_users_brand on cortex.app_users (brand_id);
create index if not exists idx_app_users_dealer on cortex.app_users (dealer_location_id);
create index if not exists idx_templates_user on cortex.user_compare_templates (user_id);
create index if not exists idx_prompt_brand on cortex.prompt_overrides (brand_id);
create index if not exists idx_prompt_dealer on cortex.prompt_overrides (dealer_location_id);
create index if not exists idx_prompt_user on cortex.prompt_overrides (user_id);
create index if not exists idx_body_style_brand on cortex.body_style_configs (brand_id);
create index if not exists idx_body_style_org on cortex.body_style_configs (organization_id);
create index if not exists idx_openai_keys_org on cortex.openai_keys (organization_id);
create index if not exists idx_audit_logs_org on cortex.audit_logs (organization_id);

-- ------------------------- Row Level Security -------------------------
alter table cortex.organizations enable row level security;
alter table cortex.brands enable row level security;
alter table cortex.dealer_locations enable row level security;
alter table cortex.app_users enable row level security;
alter table cortex.user_compare_templates enable row level security;
alter table cortex.prompt_overrides enable row level security;
alter table cortex.body_style_configs enable row level security;
alter table cortex.openai_keys enable row level security;
alter table cortex.audit_logs enable row level security;

-- Organizations policies
drop policy if exists organizations_select on cortex.organizations;
create policy organizations_select on cortex.organizations
for select using (
    cortex.current_role() = 'superadmin_global'
    or cortex.current_org_id() = id
);

drop policy if exists organizations_insert on cortex.organizations;
create policy organizations_insert on cortex.organizations
for insert to authenticated with check (
    cortex.current_role() = 'superadmin_global'
);

drop policy if exists organizations_update on cortex.organizations;
create policy organizations_update on cortex.organizations
for update using (
    cortex.current_role() = 'superadmin_global'
);

drop policy if exists organizations_delete on cortex.organizations;
create policy organizations_delete on cortex.organizations
for delete using (
    cortex.current_role() = 'superadmin_global'
);

-- Brands policies
drop policy if exists brands_select on cortex.brands;
create policy brands_select on cortex.brands
for select using (
    cortex.current_role() = 'superadmin_global'
    or (organization_id = cortex.current_org_id())
);

drop policy if exists brands_insert on cortex.brands;
create policy brands_insert on cortex.brands
for insert to authenticated with check (
    cortex.current_role() = 'superadmin_global'
    or (
        cortex.current_role() = 'superadmin_oem'
        and organization_id = cortex.current_org_id()
    )
);

drop policy if exists brands_update on cortex.brands;
create policy brands_update on cortex.brands
for update using (
    cortex.current_role() = 'superadmin_global'
    or (
        cortex.current_role() = 'superadmin_oem'
        and organization_id = cortex.current_org_id()
    )
);

drop policy if exists brands_delete on cortex.brands;
create policy brands_delete on cortex.brands
for delete using (
    cortex.current_role() = 'superadmin_global'
);

-- Dealer locations policies
drop policy if exists dealer_select on cortex.dealer_locations;
create policy dealer_select on cortex.dealer_locations
for select using (
    cortex.current_role() = 'superadmin_global'
    or brand_id = any(cortex.current_allowed_brand_ids())
);

drop policy if exists dealer_insert on cortex.dealer_locations;
create policy dealer_insert on cortex.dealer_locations
for insert to authenticated with check (
    cortex.current_role() = 'superadmin_global'
    or (
        cortex.current_role() = 'superadmin_oem'
        and brand_id = any(cortex.current_allowed_brand_ids())
    )
);

drop policy if exists dealer_update on cortex.dealer_locations;
create policy dealer_update on cortex.dealer_locations
for update using (
    cortex.current_role() = 'superadmin_global'
    or (
        cortex.current_role() = 'superadmin_oem'
        and brand_id = any(cortex.current_allowed_brand_ids())
    )
);

drop policy if exists dealer_delete on cortex.dealer_locations;
create policy dealer_delete on cortex.dealer_locations
for delete using (
    cortex.current_role() = 'superadmin_global'
);

-- App users policies
drop policy if exists app_users_select on cortex.app_users;
create policy app_users_select on cortex.app_users
for select using (
    cortex.current_role() = 'superadmin_global'
    or (
        organization_id = cortex.current_org_id()
        and (
            cortex.current_role() in ('superadmin_oem')
            or id = auth.uid()
        )
    )
);

drop policy if exists app_users_insert on cortex.app_users;
create policy app_users_insert on cortex.app_users
for insert to authenticated with check (
    cortex.current_role() in ('superadmin_global', 'superadmin_oem')
    and organization_id = cortex.current_org_id()
);

drop policy if exists app_users_update on cortex.app_users;
create policy app_users_update on cortex.app_users
for update using (
    (
        cortex.current_role() = 'superadmin_global'
    )
    or (
        cortex.current_role() = 'superadmin_oem'
        and organization_id = cortex.current_org_id()
        and role <> 'superadmin_global'
    )
);

drop policy if exists app_users_delete on cortex.app_users;
create policy app_users_delete on cortex.app_users
for delete using (
    cortex.current_role() = 'superadmin_global'
);

-- Templates policies
drop policy if exists templates_select on cortex.user_compare_templates;
create policy templates_select on cortex.user_compare_templates
for select using (
    user_id = auth.uid()
);

drop policy if exists templates_allows_mod on cortex.user_compare_templates;
create policy templates_allows_mod on cortex.user_compare_templates
for all using (
    user_id = auth.uid()
);

-- Prompt overrides policies
drop policy if exists prompt_select on cortex.prompt_overrides;
create policy prompt_select on cortex.prompt_overrides
for select using (
    cortex.current_role() = 'superadmin_global'
    or (
        cortex.current_role() = 'superadmin_oem'
        and organization_id = cortex.current_org_id()
    )
    or (
        user_id = auth.uid()
    )
);

drop policy if exists prompt_insert on cortex.prompt_overrides;
create policy prompt_insert on cortex.prompt_overrides
for insert to authenticated with check (
    cortex.current_role() = 'superadmin_global'
    or (
        cortex.current_role() = 'superadmin_oem'
        and organization_id = cortex.current_org_id()
        and can_edit_by_oem
    )
);

drop policy if exists prompt_update on cortex.prompt_overrides;
create policy prompt_update on cortex.prompt_overrides
for update using (
    cortex.current_role() = 'superadmin_global'
    or (
        cortex.current_role() = 'superadmin_oem'
        and organization_id = cortex.current_org_id()
        and can_edit_by_oem
    )
    or (user_id = auth.uid())
);

drop policy if exists prompt_delete on cortex.prompt_overrides;
create policy prompt_delete on cortex.prompt_overrides
for delete using (
    cortex.current_role() = 'superadmin_global'
    or (user_id = auth.uid())
);

-- Body style configs policies
drop policy if exists body_style_select on cortex.body_style_configs;
create policy body_style_select on cortex.body_style_configs
for select using (
    cortex.current_role() = 'superadmin_global'
    or (
        organization_id = cortex.current_org_id()
    )
);

drop policy if exists body_style_insert on cortex.body_style_configs;
create policy body_style_insert on cortex.body_style_configs
for insert to authenticated with check (
    cortex.current_role() in ('superadmin_global', 'superadmin_oem')
    and (
        organization_id = cortex.current_org_id()
        or cortex.current_role() = 'superadmin_global'
    )
);

drop policy if exists body_style_update on cortex.body_style_configs;
create policy body_style_update on cortex.body_style_configs
for update using (
    cortex.current_role() = 'superadmin_global'
    or (
        cortex.current_role() = 'superadmin_oem'
        and organization_id = cortex.current_org_id()
    )
);

drop policy if exists body_style_delete on cortex.body_style_configs;
create policy body_style_delete on cortex.body_style_configs
for delete using (
    cortex.current_role() = 'superadmin_global'
);

-- OpenAI keys policies
drop policy if exists openai_select on cortex.openai_keys;
create policy openai_select on cortex.openai_keys
for select using (
    cortex.current_role() = 'superadmin_global'
    or (
        cortex.current_role() = 'superadmin_oem'
        and organization_id = cortex.current_org_id()
    )
);

drop policy if exists openai_insert on cortex.openai_keys;
create policy openai_insert on cortex.openai_keys
for insert to authenticated with check (
    cortex.current_role() = 'superadmin_global'
);

drop policy if exists openai_update on cortex.openai_keys;
create policy openai_update on cortex.openai_keys
for update using (
    cortex.current_role() = 'superadmin_global'
);

drop policy if exists openai_delete on cortex.openai_keys;
create policy openai_delete on cortex.openai_keys
for delete using (
    cortex.current_role() = 'superadmin_global'
);

-- Audit log policies
drop policy if exists audit_select on cortex.audit_logs;
create policy audit_select on cortex.audit_logs
for select using (
    cortex.current_role() = 'superadmin_global'
    or (
        cortex.current_role() = 'superadmin_oem'
        and organization_id = cortex.current_org_id()
    )
);

drop policy if exists audit_insert on cortex.audit_logs;
create policy audit_insert on cortex.audit_logs
for insert with check (
    auth.role() = 'service_role'
);

drop policy if exists audit_update on cortex.audit_logs;
create policy audit_update on cortex.audit_logs
for update using (false);

drop policy if exists audit_delete on cortex.audit_logs;
create policy audit_delete on cortex.audit_logs
for delete using (false);

-- ------------------------- Triggers (timestamps) -------------------------
create or replace function cortex.set_updated_at()
returns trigger
language plpgsql
as
$$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_timestamp_organizations on cortex.organizations;
create trigger set_timestamp_organizations
before update on cortex.organizations
for each row execute procedure cortex.set_updated_at();

drop trigger if exists set_timestamp_brands on cortex.brands;
create trigger set_timestamp_brands
before update on cortex.brands
for each row execute procedure cortex.set_updated_at();

drop trigger if exists set_timestamp_dealers on cortex.dealer_locations;
create trigger set_timestamp_dealers
before update on cortex.dealer_locations
for each row execute procedure cortex.set_updated_at();

drop trigger if exists set_timestamp_app_users on cortex.app_users;
create trigger set_timestamp_app_users
before update on cortex.app_users
for each row execute procedure cortex.set_updated_at();

drop trigger if exists set_timestamp_templates on cortex.user_compare_templates;
create trigger set_timestamp_templates
before update on cortex.user_compare_templates
for each row execute procedure cortex.set_updated_at();

drop trigger if exists set_timestamp_prompts on cortex.prompt_overrides;
create trigger set_timestamp_prompts
before update on cortex.prompt_overrides
for each row execute procedure cortex.set_updated_at();

drop trigger if exists set_timestamp_body_style on cortex.body_style_configs;
create trigger set_timestamp_body_style
before update on cortex.body_style_configs
for each row execute procedure cortex.set_updated_at();

drop trigger if exists set_timestamp_openai on cortex.openai_keys;
create trigger set_timestamp_openai
before update on cortex.openai_keys
for each row execute procedure cortex.set_updated_at();
