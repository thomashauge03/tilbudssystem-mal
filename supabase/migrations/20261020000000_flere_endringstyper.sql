-- Seks nye grunner for et krav om endring, ved siden av masseavregning,
-- tilleggsarbeid og prisstigning. Som de tre er hver grunn en egen kolonne, og
-- en melding kan ha flere samtidig.
--
-- Bare add column med default: eksisterende rader får false uten at noen rad
-- oppdateres, så ingen av update-triggerne på amendments (stempling, varsel
-- ved kundesvar, tilbaketrekking av lenker) kjører.

alter table public.amendments
  add column if not exists is_ground_conditions boolean not null default false,
  add column if not exists is_document_error    boolean not null default false,
  add column if not exists is_waiting_time      boolean not null default false,
  add column if not exists is_authority_order   boolean not null default false,
  add column if not exists is_acceleration      boolean not null default false,
  add column if not exists is_schedule_change   boolean not null default false;

comment on column public.amendments.is_ground_conditions is 'Uforutsette grunnforhold';
comment on column public.amendments.is_document_error    is 'Feil i underlag fra byggherren';
comment on column public.amendments.is_waiting_time      is 'Ventetid og stans';
comment on column public.amendments.is_authority_order   is 'Pålegg fra myndigheter';
comment on column public.amendments.is_acceleration      is 'Forsering';
comment on column public.amendments.is_schedule_change   is 'Endret framdrift';
