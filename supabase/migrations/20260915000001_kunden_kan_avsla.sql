-- Kunden skal kunne si nei.
--
-- Signeringslenken hadde bare én vei ut: signere. Sa byggherren nei, skjedde
-- det på telefon eller e-post, og tilbudet ble liggende som «sendt» til noen
-- husket å endre statusen for hånd. I mellomtiden lå det i «Aktive» og i
-- «utløper snart», og ble fulgt opp av folk som trodde det fortsatt var i spill.
--
-- Et avslag er informasjon på linje med en signatur, og skal registreres på
-- samme måte: hvem som avslo, når, og hvorfor — med kundens egne ord, for det
-- er nettopp begrunnelsen man leser neste gang man priser noe for den kunden.

-- ─── Kolonner ──────────────────────────────────────────────────────────────
-- Samme tre feltene på begge tabellene. Tilbud og endringsmeldinger skal
-- oppføre seg likt her; sklir de fra hverandre, ender vi med to ulike ideer om
-- hva et avslag er.
do $$
declare
  t text;
begin
  foreach t in array array['offers', 'amendments'] loop
    execute format('alter table public.%I add column if not exists rejected_at timestamptz', t);
    execute format('alter table public.%I add column if not exists rejected_by text', t);
    execute format('alter table public.%I add column if not exists rejected_note text', t);
  end loop;
end $$;

comment on column public.offers.rejected_at is
  'Når kunden avslo tilbudet via signeringslenken. Statusen sier «avslått»; denne sier når.';
comment on column public.offers.rejected_by is
  'Navnet kunden skrev inn da de avslo. Et avslag uten avsender er ikke til å stole på i ettertid.';
comment on column public.offers.rejected_note is
  'Kundens egen begrunnelse. Frivillig — men det er den man leser neste gang man priser noe for denne kunden.';
comment on column public.amendments.rejected_at is 'Når kunden avslo kravet via signeringslenken.';
comment on column public.amendments.rejected_by is 'Navnet kunden skrev inn da de avslo.';
comment on column public.amendments.rejected_note is 'Kundens egen begrunnelse for avslaget.';

-- ─── Avslag på tilbud ──────────────────────────────────────────────────────
-- Speiler sign_offer: samme lås, samme sjekker, samme måte å bruke opp lenken
-- på. Den som har lenken kan gjøre nøyaktig én ting med den — signere eller
-- avslå — og det er hele poenget med at det er en engangslenke.
create or replace function public.avslaa_tilbud(
  p_token text,
  p_navn text,
  p_grunn text default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token offer_signing_tokens;
  v_offer offers;
begin
  if p_navn is null or btrim(p_navn) = '' then
    raise exception 'Navn er påkrevd';
  end if;

  -- for update låser raden, så et avslag og en signering ikke kan slippe
  -- gjennom samtidig og etterlate tilbudet i to tilstander på én gang
  select * into v_token from offer_signing_tokens where token = p_token for update;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;
  if v_token.used_at is not null then
    raise exception 'Denne lenken er allerede brukt';
  end if;

  select * into v_offer from offers where id = v_token.offer_id for update;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;
  -- Er tilbudet alt signert, er avtalen inngått. Da er det ikke lenger et
  -- avslag kunden kan gi her; det må tas opp med entreprenøren.
  if v_offer.customer_signed_at is not null then
    raise exception 'Tilbudet er allerede signert';
  end if;

  update offer_signing_tokens
     set used_at = now(),
         signer_name = btrim(p_navn)
   where id = v_token.id;

  update offers
     set status = 'avslått',
         rejected_at = now(),
         rejected_by = btrim(p_navn),
         rejected_note = nullif(btrim(coalesce(p_grunn, '')), ''),
         updated_at = now()
   where id = v_offer.id
  returning * into v_offer;

  return json_build_object(
    'offer_number', v_offer.offer_number,
    'title',        v_offer.title,
    'status',       v_offer.status
  );
end;
$$;

-- ─── Avslag på krav om endring ─────────────────────────────────────────────
create or replace function public.avslaa_endring(
  p_token text,
  p_navn text,
  p_grunn text default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t record;
  a record;
begin
  if p_navn is null or btrim(p_navn) = '' then
    raise exception 'Navn er påkrevd';
  end if;

  select * into t from amendment_signing_tokens where token = p_token for update;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;
  if t.used_at is not null then
    raise exception 'Denne lenken er allerede brukt';
  end if;

  select * into a from amendments where id = t.amendment_id for update;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;
  if a.customer_signed_at is not null then
    raise exception 'Denne endringen er allerede signert';
  end if;

  update amendment_signing_tokens
     set used_at = now(),
         signer_name = btrim(p_navn)
   where id = t.id;

  -- Statusen blir 'avslått'. Kravet blir liggende som det er — et avslått krav
  -- er ikke et slettet krav: det er dokumentasjon på at endringen ble varslet
  -- og hva byggherren svarte.
  update amendments
     set status = 'avslått',
         rejected_at = now(),
         rejected_by = btrim(p_navn),
         rejected_note = nullif(btrim(coalesce(p_grunn, '')), ''),
         updated_at = now()
   where id = a.id
  returning * into a;

  return json_build_object(
    'amendment_number', a.amendment_number,
    'project_ref',      a.project_ref,
    'status',           a.status
  );
end;
$$;

-- Den som avslår er ikke innlogget hos oss — de har bare lenken. Samme
-- rettigheter som signeringsfunksjonene de speiler.
grant execute on function public.avslaa_tilbud(text, text, text) to anon, authenticated;
grant execute on function public.avslaa_endring(text, text, text) to anon, authenticated;
