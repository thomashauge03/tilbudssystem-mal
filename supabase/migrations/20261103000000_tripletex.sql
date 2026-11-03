-- Kobling til Tripletex: tilbud sendes over som ordre, og kunderegisteret
-- hentes derfra.
--
-- All trafikk mot Tripletex går gjennom edge functionen `tripletex`. Nøklene
-- gir full tilgang til regnskapet til firmaet, så nettleseren skal aldri se
-- dem — heller ikke den som la dem inn.

-- ─── Nøklene, per firma ─────────────────────────────────────────────────────
-- Egen tabell og ikke kolonner i app_settings: app_settings leses av alle i
-- firmaet, og RLS kan ikke skjule enkeltkolonner.
create table if not exists public.tripletex_oppsett (
  tenant_id       uuid primary key references public.tenants(id) on delete cascade,
  consumer_token  text not null default '',
  employee_token  text not null default '',
  -- Test går mot api-test.tripletex.tech, som har sine egne nøkler.
  miljo           text not null default 'produksjon' check (miljo in ('produksjon', 'test')),
  -- Øktnøkkelen Tripletex gir for de to over. Den gjelder ut en dato, og
  -- gjenbrukes til da i stedet for å lage en ny ved hvert kall.
  session_token   text,
  session_utloper date,
  sist_hentet_kunder timestamptz,
  oppdatert       timestamptz not null default now()
);

comment on table public.tripletex_oppsett is
  'Tripletex-nøkler per firma. Leses bare av edge functionen tripletex (service role).';

-- RLS på, og med vilje ingen policy: verken anon eller innloggede slipper til.
-- Edge functionen sjekker hvem som spør og leser med service role.
alter table public.tripletex_oppsett enable row level security;

-- ─── Hvem kunden er i Tripletex ─────────────────────────────────────────────
alter table public.customers
  add column if not exists tripletex_id bigint;

comment on column public.customers.tripletex_id is
  'Kundens id i Tripletex. Satt når kunden er hentet derfra eller opprettet der av appen.';

-- Én Tripletex-kunde kan bare høre til én kunde i appen, ellers vet ikke neste
-- henting hvilken av dem den skal oppdatere.
create unique index if not exists customers_tripletex_id_unik
  on public.customers (tenant_id, tripletex_id)
  where tripletex_id is not null;

-- ─── Hvilken ordre tilbudet ble ─────────────────────────────────────────────
alter table public.offers
  add column if not exists tripletex_ordre_id bigint,
  add column if not exists tripletex_ordre_nr text,
  add column if not exists tripletex_sendt_at timestamptz;

comment on column public.offers.tripletex_ordre_id is
  'Ordren tilbudet ble sendt over som i Tripletex. Null = ikke sendt.';

notify pgrst, 'reload schema';
