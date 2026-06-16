-- Extra fields for potential_customers (lead tracking)
alter table potential_customers
  add column if not exists ansvarlig         text,
  add column if not exists dato              date,
  add column if not exists navn              text,
  add column if not exists adresse           text,
  add column if not exists postnr_sted       text,
  add column if not exists telefon           text,
  add column if not exists mail              text,
  add column if not exists hva               text,
  add column if not exists naar              text,
  add column if not exists merknad           text,
  add column if not exists status_changed_at timestamptz;
