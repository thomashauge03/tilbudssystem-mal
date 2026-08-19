-- Godkjenning når kunden ikke signerer digitalt.
--
-- Kunden signerer ofte på papir, eller sier bare ja i et møte eller på telefon.
-- Det er like bindende, men systemet hadde ingen vei inn for det: enten signerte
-- kunden via lenken, eller så sto tilbudet som usignert i all evighet.
--
-- Poenget her er ikke bare å sette signaturen. Det er å ikke lyve om den.
-- Hadde vi bare satt customer_signed_at, ville dokumentet i ettertid sett ut som
-- om kunden hadde signert digitalt — og da er det ingen som vet hvor papiret
-- ligger, eller hvem hos oss som bestemte at avtalen var i havn.

-- ─── Kolonner ──────────────────────────────────────────────────────────────
-- Samme tre feltene på begge tabellene. Skrevet som en løkke fordi tilbud og
-- endringsmeldinger skal oppføre seg helt likt her; sklir de fra hverandre,
-- ender vi med to ulike sannheter om hva en signatur er.
do $$
declare
  t text;
begin
  foreach t in array array['offers', 'amendments'] loop
    execute format(
      'alter table public.%I
         add column if not exists signature_method text not null default ''digital''',
      t);
    execute format(
      'alter table public.%I add column if not exists manual_approved_by uuid', t);
    execute format(
      'alter table public.%I add column if not exists manual_approved_note text', t);

    -- Bare de fire verdiene. Uten dette ville feltet blitt en fritekstkolonne
    -- der «papir», «Papir» og «på papir» betydde det samme uten å være det.
    execute format(
      'alter table public.%I drop constraint if exists %I', t, t || '_signature_method_sjekk');
    execute format(
      'alter table public.%I
         add constraint %I check (signature_method in (''digital'', ''papir'', ''muntlig'', ''epost''))',
      t, t || '_signature_method_sjekk');
  end loop;
end $$;

comment on column public.offers.signature_method is
  'digital = kunden signerte via lenken. papir/muntlig/epost = godkjent manuelt av oss.';
comment on column public.amendments.signature_method is
  'digital = kunden signerte via lenken. papir/muntlig/epost = godkjent manuelt av oss.';

-- ─── Hvem som godkjente, bestemt av databasen ──────────────────────────────
-- manual_approved_by settes her, aldri av klienten. Kunne nettleseren sende inn
-- verdien selv, ville feltet vært verdiløst som dokumentasjon — det er nettopp
-- i en uenighet i ettertid det skal kunne stoles på.
create or replace function public.stemple_manuell_godkjenning()
returns trigger
language plpgsql
as $$
begin
  -- Signaturen nullstilles: da skal sporet etter den manuelle godkjenningen bort
  -- også, ellers står det igjen og ser ut som en gyldig godkjenning.
  if new.customer_signed_at is null then
    new.signature_method := 'digital';
    new.manual_approved_by := null;
    new.manual_approved_note := null;
    return new;
  end if;

  if old.customer_signed_at is distinct from new.customer_signed_at then
    if coalesce(new.signature_method, 'digital') = 'digital' then
      -- Kom signaturen fra sign_offer/sign_amendment, er den digital og har
      -- ingen ansvarlig hos oss.
      new.manual_approved_by := null;
    else
      new.manual_approved_by := auth.uid();
    end if;
  else
    -- Ingen ny signatur i denne oppdateringen: da skal ingen kunne skrive om
    -- hvem som godkjente, eller gjøre en digital signatur om til en papirsignatur.
    new.signature_method := old.signature_method;
    new.manual_approved_by := old.manual_approved_by;
    new.manual_approved_note := old.manual_approved_note;
  end if;
  return new;
end;
$$;

drop trigger if exists offers_stemple_godkjenning on public.offers;
create trigger offers_stemple_godkjenning
  before update on public.offers
  for each row execute function public.stemple_manuell_godkjenning();

drop trigger if exists amendments_stemple_godkjenning on public.amendments;
create trigger amendments_stemple_godkjenning
  before update on public.amendments
  for each row execute function public.stemple_manuell_godkjenning();

-- ─── Navnet på den som godkjente ───────────────────────────────────────────
-- auth.users er ikke lesbar for innloggede, så uten dette ville grensesnittet
-- bare hatt en uuid å vise fram.
create or replace function public.manuell_godkjenner(p_id uuid)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(
           u.raw_user_meta_data->>'full_name',
           u.raw_user_meta_data->>'name',
           u.email,
           'Ukjent bruker')
    from auth.users u
   where u.id = p_id;
$$;

revoke all on function public.manuell_godkjenner(uuid) from public;
grant execute on function public.manuell_godkjenner(uuid) to authenticated;
