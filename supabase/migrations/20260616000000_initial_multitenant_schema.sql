-- Multi-tenant schema for tilbudssystem-mal
-- Each customer (client) of ours gets a row in `tenants`.
-- All business data rows carry tenant_id referencing tenants.id.

create extension if not exists "uuid-ossp";

-- ─── Tenants ───────────────────────────────────────────────────────────────
create table tenants (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  slug         text not null unique,        -- e.g. "hauge-maskin"
  created_at   timestamptz not null default now()
);

-- ─── Tenant users (maps Supabase auth users to a tenant) ───────────────────
create table tenant_users (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  user_id      uuid not null,               -- supabase auth.users.id
  role         text not null default 'member', -- 'admin' | 'member'
  created_at   timestamptz not null default now(),
  unique(tenant_id, user_id)
);

-- ─── App settings (one row per tenant) ─────────────────────────────────────
create table app_settings (
  id                     uuid primary key default uuid_generate_v4(),
  tenant_id              uuid not null references tenants(id) on delete cascade unique,
  company_name           text not null default '',
  company_address        text not null default '',
  company_email          text not null default '',
  company_phone          text not null default '',
  offer_validity_days    int  not null default 30,
  vat_rate               numeric(5,2) not null default 25,
  currency               text not null default 'NOK',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ─── Customers ─────────────────────────────────────────────────────────────
create table customers (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  email        text,
  phone        text,
  address      text,
  org_number   text,
  created_at   timestamptz not null default now()
);

-- ─── Potential customers ───────────────────────────────────────────────────
create table potential_customers (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  email        text,
  phone        text,
  address      text,
  notes        text,
  status       text not null default 'ny',
  created_at   timestamptz not null default now()
);

-- ─── Projects ──────────────────────────────────────────────────────────────
create table projects (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  customer_id  uuid references customers(id) on delete set null,
  name         text not null,
  description  text,
  status       text not null default 'aktiv',
  created_at   timestamptz not null default now()
);

-- ─── Offers ────────────────────────────────────────────────────────────────
create sequence if not exists offer_number_seq start 1000;

create table offers (
  id             uuid primary key default uuid_generate_v4(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  offer_number   int  not null default nextval('offer_number_seq'),
  customer_id    uuid references customers(id) on delete set null,
  project_id     uuid references projects(id) on delete set null,
  title          text not null,
  status         text not null default 'utkast',
  valid_until    date,
  forbehold      text,
  our_ref        text,
  customer_ref   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─── Offer lines ───────────────────────────────────────────────────────────
create table offer_lines (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  offer_id     uuid not null references offers(id) on delete cascade,
  sort_order   int  not null default 0,
  description  text not null,
  unit         text,
  quantity     numeric(12,2) not null default 1,
  unit_price   numeric(12,2) not null default 0,
  discount_pct numeric(5,2)  not null default 0,
  comment      text,
  created_at   timestamptz not null default now()
);

-- ─── Amendments ────────────────────────────────────────────────────────────
create table amendments (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  offer_id        uuid references offers(id) on delete set null,
  project_id      uuid references projects(id) on delete set null,
  title           text not null,
  status          text not null default 'utkast',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table amendment_lines (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  amendment_id uuid not null references amendments(id) on delete cascade,
  sort_order   int  not null default 0,
  description  text not null,
  unit         text,
  quantity     numeric(12,2) not null default 1,
  unit_price   numeric(12,2) not null default 0,
  discount_pct numeric(5,2)  not null default 0,
  comment      text,
  created_at   timestamptz not null default now()
);

-- ─── Payments ──────────────────────────────────────────────────────────────
create table payments (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  offer_id     uuid references offers(id) on delete set null,
  amount       numeric(12,2) not null,
  paid_at      date not null,
  notes        text,
  created_at   timestamptz not null default now()
);

-- ─── Admin costs ───────────────────────────────────────────────────────────
create table admin_costs (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  year         int  not null,
  pct          numeric(5,2) not null,
  created_at   timestamptz not null default now(),
  unique(tenant_id, year)
);

-- ─── Row Level Security ────────────────────────────────────────────────────
alter table tenants            enable row level security;
alter table tenant_users       enable row level security;
alter table app_settings       enable row level security;
alter table customers          enable row level security;
alter table potential_customers enable row level security;
alter table projects           enable row level security;
alter table offers             enable row level security;
alter table offer_lines        enable row level security;
alter table amendments         enable row level security;
alter table amendment_lines    enable row level security;
alter table payments           enable row level security;
alter table admin_costs        enable row level security;

-- Helper: get tenant_id for the current authenticated user
create or replace function current_tenant_id()
returns uuid language sql stable security definer as $$
  select tenant_id from tenant_users where user_id = auth.uid() limit 1;
$$;

-- RLS policies: users can only see/modify rows belonging to their tenant
do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings','customers','potential_customers','projects',
    'offers','offer_lines','amendments','amendment_lines','payments','admin_costs'
  ] loop
    execute format(
      'create policy "%s_tenant_isolation" on %I
       using (tenant_id = current_tenant_id())
       with check (tenant_id = current_tenant_id());',
      t, t
    );
  end loop;
end$$;

-- tenant_users: users see only their own row(s)
create policy "tenant_users_self" on tenant_users
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- tenants: users see only their own tenant
create policy "tenants_self" on tenants
  using (id = current_tenant_id());
