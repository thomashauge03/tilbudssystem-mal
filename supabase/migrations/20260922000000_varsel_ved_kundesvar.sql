-- Varsel på e-post når kunden signerer eller avslår.
--
-- Kundens svar kommer i dag ikke til oss — vi må gå og se etter. Et avslag kan
-- bli liggende i «Aktive» og bli fulgt opp av folk som tror tilbudet fortsatt
-- er i spill, og en signatur kan bli liggende et døgn før noen setter i gang.

-- ─── Hvor varselet skal ─────────────────────────────────────────────────────
-- Tom betyr av. Ingen skal få uventet e-post fordi denne migrasjonen ble kjørt;
-- varslene starter først når noen selv fyller ut feltet i Innstillinger.
alter table public.app_settings
  add column if not exists notify_email text not null default '';

comment on column public.app_settings.notify_email is
  'Adressen varsler om kundesvar går til. Tom = varsling er av for dette firmaet.';

-- ─── Hva firmaet vil vite om ────────────────────────────────────────────────
-- Alle står på, men notify_email er tom. Et firma som fyller ut adressen får
-- dermed alt, og skrur av det som viser seg å bli støy — den som nettopp slo
-- på varsling vet ennå ikke hva de kommer til å slutte å lese.
alter table public.app_settings
  add column if not exists notify_offer_signed       boolean not null default true,
  add column if not exists notify_offer_rejected     boolean not null default true,
  add column if not exists notify_amendment_signed   boolean not null default true,
  add column if not exists notify_amendment_rejected boolean not null default true;

comment on column public.app_settings.notify_offer_signed is
  'Varsle når kunden signerer et tilbud.';
comment on column public.app_settings.notify_offer_rejected is
  'Varsle når kunden avslår et tilbud.';
comment on column public.app_settings.notify_amendment_signed is
  'Varsle når kunden signerer et krav om endring.';
comment on column public.app_settings.notify_amendment_rejected is
  'Varsle når kunden avslår et krav om endring.';

-- ─── pg_net ─────────────────────────────────────────────────────────────────
-- Lar basen sende en HTTP-forespørsel uten å vente på svaret.
create extension if not exists pg_net;

-- ─── Hvor edge functionen bor ───────────────────────────────────────────────
-- Global drift, ikke firmadata: ett firma skal ikke kunne lese en hemmelighet
-- som gjelder alle. Derfor egen tabell og ikke en kolonne i app_settings.
create table if not exists public.varsel_oppsett (
  id               boolean primary key default true check (id),
  funksjon_url     text not null default '',
  delt_hemmelighet text not null default ''
);

comment on table public.varsel_oppsett is
  'Én rad. Adressen til varsel-epost-funksjonen og nøkkelen triggeren legitimerer seg med.';

insert into public.varsel_oppsett (id) values (true) on conflict (id) do nothing;

-- RLS på, og med vilje ingen policy: da slipper verken anon eller innloggede
-- til, mens security definer-funksjoner og service-role leser som før.
alter table public.varsel_oppsett enable row level security;

-- ─── Triggeren ──────────────────────────────────────────────────────────────
create or replace function public.varsle_kundesvar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hendelse text;
  v_oppsett  public.varsel_oppsett;
  v_type     text;
begin
  -- Bare kundens egne svar. signature_method er alt satt av
  -- stemple_manuell_godkjenning, som er en before-trigger, så en
  -- papirgodkjenning vi registrerer selv siler seg ut her.
  if new.customer_signed_at is not null
     and old.customer_signed_at is distinct from new.customer_signed_at
     and coalesce(new.signature_method, 'digital') = 'digital' then
    v_hendelse := 'signert';
  elsif new.rejected_at is not null
     and old.rejected_at is distinct from new.rejected_at then
    v_hendelse := 'avslaatt';
  else
    return new;
  end if;

  select * into v_oppsett from public.varsel_oppsett where id limit 1;
  if not found or btrim(coalesce(v_oppsett.funksjon_url, '')) = '' then
    return new;
  end if;

  v_type := case tg_table_name when 'offers' then 'offer' else 'amendment' end;

  -- Bare type, id og hendelse. Funksjonen slår opp resten selv, så den som
  -- måtte få tak i kallet ikke kan diktere hva det står i e-posten.
  begin
    perform net.http_post(
      url     := v_oppsett.funksjon_url,
      headers := jsonb_build_object(
                   'Content-Type',    'application/json',
                   'x-varsel-nokkel', v_oppsett.delt_hemmelighet
                 ),
      body    := jsonb_build_object('type', v_type, 'id', new.id, 'hendelse', v_hendelse)
    );
  exception when others then
    -- En e-post som ikke går skal aldri rulle tilbake en signatur kunden har
    -- avgitt. Signeringen er det viktige; varselet er en tjeneste til oss.
    null;
  end;

  return new;
end;
$$;

drop trigger if exists offers_varsle_kundesvar on public.offers;
create trigger offers_varsle_kundesvar
  after update of customer_signed_at, rejected_at on public.offers
  for each row execute function public.varsle_kundesvar();

drop trigger if exists amendments_varsle_kundesvar on public.amendments;
create trigger amendments_varsle_kundesvar
  after update of customer_signed_at, rejected_at on public.amendments
  for each row execute function public.varsle_kundesvar();
