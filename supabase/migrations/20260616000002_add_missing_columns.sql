-- ─── offers: add invoiced_amount ───────────────────────────────────────────
alter table offers
  add column if not exists invoiced_amount numeric(12,2) not null default 0;

-- ─── amendments: add all extra columns ──────────────────────────────────────
alter table amendments
  add column if not exists amendment_number   int,
  add column if not exists project_ref        text,
  add column if not exists internal_description text,
  add column if not exists notified_date      date,
  add column if not exists revised_date       date,
  add column if not exists project_manager    text,
  add column if not exists is_mass_settlement boolean not null default false,
  add column if not exists is_additional_work boolean not null default false,
  add column if not exists is_price_increase  boolean not null default false,
  add column if not exists customer_email     text,
  add column if not exists change_description text,
  add column if not exists reason             text,
  add column if not exists other_notes        text,
  add column if not exists invoiced_amount    numeric(12,2) not null default 0;

-- auto-increment sequence for amendment_number per tenant
create sequence if not exists amendment_number_seq;

-- ─── payments: add extra columns ────────────────────────────────────────────
alter table payments
  add column if not exists amendment_id  uuid references amendments(id) on delete set null,
  add column if not exists invoice_date  date,
  add column if not exists paid          boolean not null default false,
  add column if not exists paid_date     date,
  add column if not exists description   text;

-- ─── projects: add extra columns ────────────────────────────────────────────
alter table projects
  add column if not exists project_number text,
  add column if not exists customer_name  text,
  add column if not exists start_date     date;

-- ─── customers: add extra columns ───────────────────────────────────────────
alter table customers
  add column if not exists contact_person text,
  add column if not exists notes          text;

-- ─── potential_customers: add extra columns ──────────────────────────────────
alter table potential_customers
  add column if not exists ansvarlig  text,
  add column if not exists dato       date,
  add column if not exists hva        text,
  add column if not exists naar       text,
  add column if not exists merknad    text;
