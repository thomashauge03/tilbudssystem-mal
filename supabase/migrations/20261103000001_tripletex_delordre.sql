-- Delordre fra Status-siden, og status tilbake fra Tripletex.
--
-- Hver ordre appen lager i Tripletex blir en rad i payments, ved siden av
-- fakturaene som er ført for hånd. Raden husker hvor stor andel av hver post
-- som var tatt med etter den ordren, så neste ordre bare tar med økningen.
-- Tripletex er fasiten for hva som har skjedd med ordren etterpå: fakturert,
-- betalt, kreditert eller slettet.

alter table public.payments
  add column if not exists tripletex_ordre_id   bigint,
  add column if not exists tripletex_ordre_nr   text,
  -- ordre → fakturert → delvis_betalt → betalt, eller kreditert.
  add column if not exists tripletex_status     text,
  add column if not exists tripletex_faktura_nr text,
  add column if not exists tripletex_faktura_dato date,
  add column if not exists tripletex_synket     timestamptz,
  -- {offer_line_id: prosent} — andelen av hver post som er tatt med til og
  -- med denne ordren, ikke bare økningen.
  add column if not exists andeler              jsonb;

alter table public.payments
  drop constraint if exists payments_tripletex_status_gyldig;
alter table public.payments
  add constraint payments_tripletex_status_gyldig
  check (tripletex_status is null
         or tripletex_status in ('ordre', 'fakturert', 'delvis_betalt', 'betalt', 'kreditert'));

comment on column public.payments.andeler is
  'Andel (prosent) av hver tilbudslinje som er tatt med til og med denne delordren. Nøkkel: offer_lines.id.';
comment on column public.payments.tripletex_status is
  'Hvor ordren står i Tripletex. Settes av synken i edge functionen tripletex. Null = ført for hånd.';

-- To rader kan ikke peke på samme ordre: da ville en betaling telt dobbelt.
create unique index if not exists payments_tripletex_ordre_unik
  on public.payments (tenant_id, tripletex_ordre_id)
  where tripletex_ordre_id is not null;

-- ─── Integrasjonsnøkkelen er appens, ikke firmaets ──────────────────────────
-- Den ligger nå som secret TRIPLETEX_CONSUMER_TOKEN på edge functionen.
-- Kolonnen blir stående som reserve for et firma med egen integrasjon.
comment on column public.tripletex_oppsett.consumer_token is
  'Valgfri. Tom = bruk appens TRIPLETEX_CONSUMER_TOKEN.';

-- ─── Synk hvert 30. minutt ──────────────────────────────────────────────────
-- Uten den står «betalt» og tallene på dashbordet stille til noen åpner
-- Status-siden.
create table if not exists public.tripletex_drift (
  id           boolean primary key default true check (id),
  funksjon_url text not null default '',
  anon_nokkel  text not null default '',
  synk_nokkel  text not null default encode(extensions.gen_random_bytes(24), 'hex')
);

comment on table public.tripletex_drift is
  'Én rad. Hvor tripletex-funksjonen bor og nøkkelen synkjobben legitimerer seg med.';

insert into public.tripletex_drift (id, funksjon_url, anon_nokkel)
select true,
       replace(funksjon_url, '/varsel-epost', '/tripletex'),
       anon_nokkel
from public.varsel_oppsett
on conflict (id) do nothing;

-- RLS på og ingen policy, som varsel_oppsett.
alter table public.tripletex_drift enable row level security;

create or replace function public.tripletex_synk_alle()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v public.tripletex_drift;
begin
  select * into v from public.tripletex_drift where id limit 1;
  if not found or btrim(v.funksjon_url) = '' then return; end if;
  -- Ingen firmaer koblet til: ingen grunn til å vekke funksjonen.
  if not exists (select 1 from public.tripletex_oppsett where employee_token <> '') then return; end if;
  perform net.http_post(
    url     := v.funksjon_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v.anon_nokkel,
                 'x-synk-nokkel', v.synk_nokkel
               ),
    body    := jsonb_build_object('handling', 'synk-alle')
  );
end;
$$;

revoke all on function public.tripletex_synk_alle() from public, anon, authenticated;

select cron.unschedule('tripletex-synk')
where exists (select 1 from cron.job where jobname = 'tripletex-synk');
select cron.schedule('tripletex-synk', '*/30 * * * *', 'select public.tripletex_synk_alle()');

-- ─── Et firma skal alltid ha en admin ───────────────────────────────────────
-- Admin er den som kan koble firmaet til Tripletex. Gjøres den siste om til
-- vanlig bruker, står firmaet uten — og bare plattformeieren kan rette det.
create or replace function public.admin_set_role(p_tenant_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_tenant uuid;
        v_rolle  text;
begin
  if p_role not in ('admin', 'member') then
    raise exception 'Ugyldig rolle';
  end if;

  select tenant_id, role into v_tenant, v_rolle from tenant_users where id = p_tenant_user_id;
  if v_tenant is null then raise exception 'Ukjent medlem'; end if;

  -- Plattform-eier kan sette rolle hvor som helst. En tenant-admin kan bare
  -- gjøre det innenfor sin egen tenant — ellers var vi like langt.
  if not (
    is_platform_admin()
    or (v_tenant = current_tenant_id()
        and exists (select 1 from tenant_users
                    where user_id = auth.uid()
                      and tenant_id = v_tenant
                      and role = 'admin'))
  ) then
    raise exception 'Access denied';
  end if;

  if v_rolle = 'admin' and p_role <> 'admin'
     and not exists (select 1 from tenant_users
                     where tenant_id = v_tenant and role = 'admin' and id <> p_tenant_user_id) then
    raise exception 'Firmaet må ha minst én admin';
  end if;

  update tenant_users set role = p_role where id = p_tenant_user_id;
end;
$function$;

notify pgrst, 'reload schema';
