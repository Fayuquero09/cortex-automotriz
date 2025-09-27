alter table cortex.organizations
    add column if not exists display_name text,
    add column if not exists legal_name text,
    add column if not exists tax_id text,
    add column if not exists billing_email text,
    add column if not exists billing_phone text,
    add column if not exists billing_address jsonb default '{}'::jsonb,
    add column if not exists contact_info jsonb default '{}'::jsonb;

-- Ensure defaults don't override existing rows
update cortex.organizations
set billing_address = coalesce(billing_address, '{}'::jsonb),
    contact_info = coalesce(contact_info, '{}'::jsonb)
where billing_address is null or contact_info is null;
