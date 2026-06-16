-- Add missing columns to offers table
alter table offers
  add column if not exists offer_text      text,
  add column if not exists offer_date      date not null default current_date,
  add column if not exists admin_cost_pct  numeric(5,2) not null default 0,
  add column if not exists project_number  text,
  add column if not exists customer_name   text,
  add column if not exists customer_email  text,
  add column if not exists their_ref       text;

-- Add included flag to offer_lines
alter table offer_lines
  add column if not exists included boolean not null default true;
