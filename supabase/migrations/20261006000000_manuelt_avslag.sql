-- Avslag når kunden ikke svarer via lenken.
--
-- Ikke alle svarer på signeringsskjemaet. Sa byggherren nei i et møte, på
-- telefon eller i en e-post, fantes det ingen vei inn for det: et krav om
-- endring kunne ikke avslås av oss i det hele tatt, og et tilbud bare ved å
-- sette statusen for hånd — uten dato, uten begrunnelse og uten spor av hvem
-- som gjorde det.
--
-- Dette er speilbildet av godkjenning uten digital signatur (20260819000004):
-- de samme tre måtene, og hvem hos oss som registrerte avslaget settes av
-- databasen, aldri av klienten.

-- ─── Kolonner ──────────────────────────────────────────────────────────────
-- Samme to feltene på begge tabellene, av samme grunn som ved godkjenning:
-- tilbud og endringsmeldinger skal ha én felles idé om hva et avslag er.
do $$
declare
  t text;
begin
  foreach t in array array['offers', 'amendments'] loop
    execute format(
      'alter table public.%I
         add column if not exists rejection_method text not null default ''digital''',
      t);
    execute format(
      'alter table public.%I add column if not exists manual_rejected_by uuid', t);

    execute format(
      'alter table public.%I drop constraint if exists %I', t, t || '_rejection_method_sjekk');
    execute format(
      'alter table public.%I
         add constraint %I check (rejection_method in (''digital'', ''papir'', ''muntlig'', ''epost''))',
      t, t || '_rejection_method_sjekk');
  end loop;
end $$;

comment on column public.offers.rejection_method is
  'digital = kunden avslo via lenken. papir/muntlig/epost = registrert manuelt av oss.';
comment on column public.amendments.rejection_method is
  'digital = kunden avslo via lenken. papir/muntlig/epost = registrert manuelt av oss.';
comment on column public.offers.manual_rejected_by is
  'Hvem hos oss som registrerte et manuelt avslag. Settes av stemple_manuelt_avslag.';
comment on column public.amendments.manual_rejected_by is
  'Hvem hos oss som registrerte et manuelt avslag. Settes av stemple_manuelt_avslag.';

-- ─── Hvem som registrerte avslaget, bestemt av databasen ───────────────────
create or replace function public.stemple_manuelt_avslag()
returns trigger
language plpgsql
as $$
begin
  -- Avslaget fjernes: da skal sporet etter hvem som registrerte det bort også,
  -- ellers står det igjen og ser ut som et gyldig avslag.
  if new.rejected_at is null then
    new.rejection_method := 'digital';
    new.manual_rejected_by := null;
    return new;
  end if;

  if old.rejected_at is distinct from new.rejected_at then
    -- Et signert dokument er en inngått avtale. Ble det avslått likevel, sa
    -- raden to ting på én gang. Lenken stopper dette allerede; vakten her
    -- gjelder alle veier inn.
    if new.customer_signed_at is not null then
      raise exception 'Kunden har alt godkjent dette. Nullstill signaturen før det kan avslås.';
    end if;

    -- Avslag via lenken kommer fra en som ikke er logget inn hos oss. Da er
    -- det kundens eget svar, uansett hva som sto i feltet fra før.
    if auth.uid() is null or coalesce(new.rejection_method, 'digital') = 'digital' then
      new.rejection_method := 'digital';
      new.manual_rejected_by := null;
    else
      new.manual_rejected_by := auth.uid();
    end if;
  else
    -- Ikke noe nytt avslag i denne oppdateringen: da skal ingen kunne skrive
    -- om hvem som registrerte det, eller gjøre kundens eget avslag om til et
    -- manuelt.
    new.rejection_method := old.rejection_method;
    new.manual_rejected_by := old.manual_rejected_by;
  end if;
  return new;
end;
$$;

drop trigger if exists offers_stemple_avslag on public.offers;
create trigger offers_stemple_avslag
  before update on public.offers
  for each row execute function public.stemple_manuelt_avslag();

drop trigger if exists amendments_stemple_avslag on public.amendments;
create trigger amendments_stemple_avslag
  before update on public.amendments
  for each row execute function public.stemple_manuelt_avslag();

-- ─── Varselet gjelder fortsatt bare kundens egne svar ─────────────────────
-- varsle_kundesvar siler bort godkjenninger vi registrerer selv. Avslag hadde
-- ingen slik sil, for de kunne bare komme fra kunden. Nå kan vi registrere
-- dem også, og da skal ingen få e-post om at kunden har sagt nei til noe en
-- kollega nettopp skrev inn. Ellers lik utgaven i 20260922000001.
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
  -- Bare kundens egne svar. signature_method og rejection_method er alt satt
  -- av stemple_manuell_godkjenning og stemple_manuelt_avslag, som er
  -- before-triggere, så det vi registrerer selv siler seg ut her.
  if new.customer_signed_at is not null
     and old.customer_signed_at is distinct from new.customer_signed_at
     and coalesce(new.signature_method, 'digital') = 'digital' then
    v_hendelse := 'signert';
  elsif new.rejected_at is not null
     and old.rejected_at is distinct from new.rejected_at
     and coalesce(new.rejection_method, 'digital') = 'digital' then
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
                   'Authorization',   'Bearer ' || v_oppsett.anon_nokkel,
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
