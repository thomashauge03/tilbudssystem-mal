-- Strammere regler for signeringslenkene.
--
-- Til nå spurte sign_offer bare om lenken var ubrukt, om tilbudet manglet
-- signatur og om det var avslått. Statusen så den ikke på. Ble et tilbud
-- godkjent for hånd eller merket som fullført, lå lenken fortsatt i kundens
-- innboks og virket. 7. oktober 2026 kunne ni ubrukte lenker signere tilbud som
-- sto som «godkjent» eller «fullført». avslaa_tilbud så ikke på statusen i det
-- hele tatt, og kunne gjort et fullført tilbud om til et avslått.
--
-- Reglene fra nå:
--
--   1. En lenke kan bare brukes mens dokumentet venter på svar: et tilbud med
--      status «sendt», et krav med status «krav», uten signatur og uten avslag.
--      Det gjelder signering, avslag og visning.
--   2. «Gyldig til» stenger ikke lenken. Thomas, 7. oktober 2026: kunden skal
--      kunne signere etter fristen, som før.
--   3. Når et dokument er avsluttet, trekkes de ubrukte lenkene tilbake for godt
--      (revoked_at). Avsluttet betyr signert, godkjent manuelt, avslått, eller
--      satt til «godkjent», «fullført» eller «avslått» for hånd. Åpnes dokumentet
--      igjen, for eksempel når et avslag fjernes, må det sendes en ny lenke. Den
--      gamle kan ha ligget i en innboks i månedsvis.
--   4. Et utkast er ikke avsluttet, bare ikke sendt. Lenken trekkes ikke tilbake,
--      men virker ikke før tilbudet står som «sendt». Appen setter «sendt» selv
--      når den lager en lenke fra et utkast. Settes tilbudet tilbake til utkast
--      for å endres, virker lenken igjen når det er sendt på nytt.
--   5. Det lages ingen nye lenker til et avsluttet dokument.
--   6. En brukt lenke viser bare utfallet, ikke innholdet. Den kan ligge i en
--      videresendt e-post i årevis, og signeringssiden trenger bare statusen for
--      å si om dokumentet ble signert eller avslått.
--
-- Tilbaketrekkingen står i egne kolonner i stedet for at radene slettes, slik
-- «Nullstill signatur» gjør. Raden er dokumentasjon: den viser når lenken ble
-- laget og hvorfor den sluttet å virke. used_at kan heller ikke brukes, for den
-- betyr «kunden brukte lenken», og både kontrakten og varselet henter signaturen
-- fra den sist brukte lenken.

-- ─── Kolonner ──────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['offer_signing_tokens', 'amendment_signing_tokens'] loop
    execute format('alter table public.%I add column if not exists revoked_at timestamptz', t);
    execute format('alter table public.%I add column if not exists revoked_reason text', t);
  end loop;
end $$;

comment on column public.offer_signing_tokens.revoked_at is
  'Når lenken ble trukket tilbake fordi tilbudet ble avsluttet. En tilbaketrukket lenke virker aldri igjen.';
comment on column public.offer_signing_tokens.revoked_reason is
  'Hvorfor lenken ble trukket tilbake, for eksempel «godkjent manuelt (papir)». Satt av databasen.';
comment on column public.amendment_signing_tokens.revoked_at is
  'Når lenken ble trukket tilbake fordi kravet ble avsluttet. En tilbaketrukket lenke virker aldri igjen.';
comment on column public.amendment_signing_tokens.revoked_reason is
  'Hvorfor lenken ble trukket tilbake, for eksempel «avslått manuelt (epost)». Satt av databasen.';

-- ─── Én definisjon av hva som er åpent og hva som er avsluttet ─────────────
-- Seks funksjoner tar stilling til lenkene. Skrev hver sin utgave av reglene,
-- ville de sklidd fra hverandre, slik get_offer_pdf_by_token gjorde da ingen
-- visste at den fantes. Her står reglene én gang.

/** Hvorfor kunden ikke kan svare på tilbudet nå. null = tilbudet venter på svar. */
create or replace function public.sperregrunn_tilbud(o public.offers)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when o.customer_signed_at is not null and o.signature_method = 'digital'
      then 'Tilbudet er allerede signert'
    when o.customer_signed_at is not null
      then 'Tilbudet er allerede godkjent. Ta kontakt med entreprenøren hvis du har spørsmål.'
    when o.rejected_at is not null or o.status = 'avslått'
      then 'Dette tilbudet er avslått. Ta kontakt med entreprenøren hvis dere har ombestemt dere.'
    when o.status in ('godkjent', 'fullført')
      then 'Tilbudet er allerede godkjent. Ta kontakt med entreprenøren hvis du har spørsmål.'
    when o.status is distinct from 'sendt'
      then 'Tilbudet er ikke åpent for signering nå. Ta kontakt med entreprenøren.'
  end;
$$;

/** Hvorfor byggherren ikke kan svare på kravet nå. null = kravet venter på svar. */
create or replace function public.sperregrunn_endring(a public.amendments)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when a.customer_signed_at is not null and a.signature_method = 'digital'
      then 'Denne endringen er allerede signert'
    when a.customer_signed_at is not null or a.status = 'endringsmelding'
      then 'Denne endringen er allerede godkjent. Ta kontakt med entreprenøren hvis du har spørsmål.'
    when a.rejected_at is not null or a.status = 'avslått'
      then 'Dette kravet er avslått. Ta kontakt med entreprenøren hvis dere har ombestemt dere.'
    when a.status is distinct from 'krav'
      then 'Kravet er ikke åpent for signering nå. Ta kontakt med entreprenøren.'
  end;
$$;

-- Avsluttet er strengere enn «ikke åpent»: et utkast er ikke åpent, men heller
-- ikke avsluttet, og lenkene til det skal ikke trekkes tilbake (regel 4).

/** Hvorfor tilbudet er avsluttet, slik det skrives i revoked_reason. null = ikke avsluttet. */
create or replace function public.avslutningsgrunn_tilbud(o public.offers)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when o.customer_signed_at is not null and o.signature_method = 'digital'
      then 'signert via en annen lenke'
    when o.customer_signed_at is not null
      then 'godkjent manuelt (' || o.signature_method || ')'
    when o.rejected_at is not null and o.rejection_method = 'digital'
      then 'avslått via en annen lenke'
    when o.rejected_at is not null
      then 'avslått manuelt (' || o.rejection_method || ')'
    when o.status in ('godkjent', 'fullført', 'avslått')
      then 'status satt til «' || o.status || '»'
  end;
$$;

/** Hvorfor kravet er avsluttet, slik det skrives i revoked_reason. null = ikke avsluttet. */
create or replace function public.avslutningsgrunn_endring(a public.amendments)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when a.customer_signed_at is not null and a.signature_method = 'digital'
      then 'signert via en annen lenke'
    when a.customer_signed_at is not null
      then 'godkjent manuelt (' || a.signature_method || ')'
    when a.rejected_at is not null and a.rejection_method = 'digital'
      then 'avslått via en annen lenke'
    when a.rejected_at is not null
      then 'avslått manuelt (' || a.rejection_method || ')'
    when a.status in ('endringsmelding', 'avslått')
      then 'status satt til «' || a.status || '»'
  end;
$$;

-- ─── Tilbud: visning ───────────────────────────────────────────────────────
create or replace function public.get_offer_by_token(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token offer_signing_tokens;
  v_offer offers;
  v_sperre text;
begin
  select * into v_token from offer_signing_tokens where token = p_token;
  if not found then
    raise exception 'Ugyldig lenke';
  end if;

  select * into v_offer from offers where id = v_token.offer_id;
  if not found then
    raise exception 'Tilbud ikke funnet';
  end if;

  -- Brukt lenke: bare utfallet (regel 6). Signeringssiden leser used_at og
  -- status og sier «signert» eller «avslått».
  if v_token.used_at is not null then
    return json_build_object(
      'token_id', v_token.id,
      'used_at',  v_token.used_at,
      'status',   v_offer.status
    );
  end if;

  -- Sier tilbudet selv hvorfor det ikke kan besvares, er det den beste
  -- beskjeden, også for en tilbaketrukket lenke. Er tilbudet åpnet igjen, er
  -- lenken likevel død, og da er det en ny lenke kunden trenger.
  v_sperre := sperregrunn_tilbud(v_offer);
  if v_token.revoked_at is not null then
    raise exception '%', coalesce(v_sperre,
      'Denne lenken gjelder ikke lenger. Be entreprenøren om en ny lenke hvis dere fortsatt vil svare på tilbudet.');
  end if;
  if v_sperre is not null then
    raise exception '%', v_sperre;
  end if;

  return json_build_object(
    'token_id',      v_token.id,
    'used_at',       v_token.used_at,
    'offer_id',      v_offer.id,
    'offer_number',  v_offer.offer_number,
    'title',         v_offer.title,
    'customer_name', v_offer.customer_name,
    'offer_date',    v_offer.offer_date,
    'valid_until',   v_offer.valid_until,
    'offer_text',    v_offer.offer_text,
    'status',        v_offer.status
  );
end;
$$;

-- Innholdet i PDF-ene og beløpet. Uendret bortsett fra vakten: null når lenken
-- ikke kan brukes, slik den alt var for en brukt lenke.
create or replace function public.get_offer_pdf_by_token(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token offer_signing_tokens;
  v_offer offers;
  v_tenant_id uuid;
  v_lines jsonb;
  v_settings jsonb;
begin
  select * into v_token from offer_signing_tokens where token = p_token;
  if not found or v_token.used_at is not null or v_token.revoked_at is not null then
    return null;
  end if;

  select * into v_offer from offers where id = v_token.offer_id;
  if not found or sperregrunn_tilbud(v_offer) is not null then
    return null;
  end if;
  v_tenant_id := v_offer.tenant_id;

  select jsonb_agg(
    jsonb_build_object(
      'description', description,
      'comment', comment,
      'quantity', quantity,
      'unit', unit,
      'unit_price', unit_price,
      'discount_pct', discount_pct,
      'included', included
    ) order by sort_order, id
  ) into v_lines from offer_lines where offer_id = v_offer.id;

  select jsonb_build_object(
    'company_name', company_name,
    'company_org_nr', company_org_nr,
    'company_tagline', company_tagline,
    'company_address', company_address,
    'company_phone', company_phone,
    'logo_url', logo_url,
    'payment_terms', payment_terms,
    'vat_pct', vat_pct,
    'forbehold', forbehold,
    'our_refs', our_refs
  ) into v_settings from app_settings where tenant_id = v_tenant_id;

  return json_build_object(
    'offer', json_build_object(
      'offer_number', v_offer.offer_number,
      'title', v_offer.title,
      'offer_date', v_offer.offer_date,
      'valid_until', v_offer.valid_until,
      'customer_name', v_offer.customer_name,
      'customer_email', v_offer.customer_email,
      'their_ref', v_offer.their_ref,
      'our_ref', v_offer.our_ref,
      'project_number', v_offer.project_number,
      'offer_text', v_offer.offer_text,
      'admin_cost_pct', v_offer.admin_cost_pct
    ),
    'lines', coalesce(v_lines, '[]'::jsonb),
    'settings', coalesce(v_settings, '{}'::jsonb)
  );
end;
$$;

-- ─── Tilbud: signering og avslag ───────────────────────────────────────────
-- Låsene tas i samme rekkefølge som når vi godkjenner eller avslår for hånd:
-- først tilbudet, så lenken. Der låser oppdateringen tilbudet, og triggeren
-- nederst låser lenkene etterpå. Tok signeringen lenken først, kunne de to
-- vente på hverandre til basen avbrøt den ene med en vranglås.

create or replace function public.sign_offer(
  p_token text,
  p_signer_name text,
  p_signer_signature text default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token offer_signing_tokens;
  v_offer offers;
  v_sperre text;
begin
  -- Navnet er det eneste som sier hvem som signerte. Skjemaet krever det, men
  -- funksjonen er åpen for alle med lenken, så kravet må stå her også, slik det
  -- alt gjør i sign_amendment og avslaa_tilbud.
  if p_signer_name is null or btrim(p_signer_name) = '' then
    raise exception 'Navn er påkrevd';
  end if;

  select * into v_token from offer_signing_tokens where token = p_token;
  if not found then
    raise exception 'Ugyldig lenke';
  end if;

  select * into v_offer from offers where id = v_token.offer_id for update;
  if not found then
    raise exception 'Tilbud ikke funnet';
  end if;

  -- Lest på nytt under lås: lenken kan være brukt eller trukket tilbake mens
  -- vi ventet på tilbudet.
  select * into v_token from offer_signing_tokens where id = v_token.id for update;
  if v_token.used_at is not null then
    raise exception 'Denne lenken er allerede brukt';
  end if;

  v_sperre := sperregrunn_tilbud(v_offer);
  if v_token.revoked_at is not null then
    raise exception '%', coalesce(v_sperre,
      'Denne lenken gjelder ikke lenger. Be entreprenøren om en ny lenke hvis dere fortsatt vil svare på tilbudet.');
  end if;
  if v_sperre is not null then
    raise exception '%', v_sperre;
  end if;

  update offer_signing_tokens
     set used_at = now(),
         signer_name = btrim(p_signer_name),
         signer_signature = p_signer_signature
   where id = v_token.id;

  -- Triggerne setter status til 'godkjent' og trekker tilbake de andre
  -- lenkene til tilbudet.
  update offers
     set customer_signed_at = now(),
         updated_at = now()
   where id = v_offer.id;

  return json_build_object(
    'offer_number',  v_offer.offer_number,
    'title',         v_offer.title,
    'customer_name', v_offer.customer_name
  );
end;
$$;

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
  v_sperre text;
begin
  if p_navn is null or btrim(p_navn) = '' then
    raise exception 'Navn er påkrevd';
  end if;

  select * into v_token from offer_signing_tokens where token = p_token;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;

  select * into v_offer from offers where id = v_token.offer_id for update;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;

  select * into v_token from offer_signing_tokens where id = v_token.id for update;
  if v_token.used_at is not null then
    raise exception 'Denne lenken er allerede brukt';
  end if;

  -- Samme regel som for signering. Før sjekket avslaget bare signaturen, så et
  -- tilbud som var godkjent eller fullført for hånd, kunne avslås via en gammel
  -- lenke.
  v_sperre := sperregrunn_tilbud(v_offer);
  if v_token.revoked_at is not null then
    raise exception '%', coalesce(v_sperre,
      'Denne lenken gjelder ikke lenger. Be entreprenøren om en ny lenke hvis dere fortsatt vil svare på tilbudet.');
  end if;
  if v_sperre is not null then
    raise exception '%', v_sperre;
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

-- ─── Krav om endring: visning, signering og avslag ─────────────────────────
-- Samme regler og samme låserekkefølge som for tilbud.

create or replace function public.get_amendment_by_token(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t amendment_signing_tokens;
  a amendments;
  v_sperre text;
begin
  select * into t from amendment_signing_tokens where token = p_token;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;

  select * into a from amendments where id = t.amendment_id;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;

  if t.used_at is not null then
    return json_build_object(
      'token_id', t.id,
      'used_at',  t.used_at,
      'status',   a.status
    );
  end if;

  v_sperre := sperregrunn_endring(a);
  if t.revoked_at is not null then
    raise exception '%', coalesce(v_sperre,
      'Denne lenken gjelder ikke lenger. Be entreprenøren om en ny lenke hvis dere fortsatt vil svare på kravet.');
  end if;
  if v_sperre is not null then
    raise exception '%', v_sperre;
  end if;

  return json_build_object(
    'token_id',             t.id,
    'used_at',              t.used_at,
    'amendment_id',         a.id,
    'amendment_number',     a.amendment_number,
    'project_ref',          a.project_ref,
    'internal_description', a.internal_description,
    'change_description',   a.change_description,
    'reason',               a.reason,
    'other_notes',          a.other_notes,
    'notified_date',        a.notified_date,
    'status',               a.status,
    'company_name',         (select company_name from app_settings where tenant_id = a.tenant_id),
    'lines', coalesce(
      (select json_agg(json_build_object(
                'description', l.description,
                'quantity',    l.quantity,
                'unit',        l.unit,
                'unit_price',  l.unit_price,
                'is_heading',  coalesce(l.is_heading, false))
              order by l.sort_order)
         from amendment_lines l where l.amendment_id = a.id),
      '[]'::json)
  );
end;
$$;

create or replace function public.sign_amendment(
  p_token text,
  p_signer_name text,
  p_signer_signature text
) returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t amendment_signing_tokens;
  a amendments;
  v_sperre text;
begin
  if p_signer_name is null or btrim(p_signer_name) = '' then
    raise exception 'Navn er påkrevd';
  end if;

  select * into t from amendment_signing_tokens where token = p_token;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;

  select * into a from amendments where id = t.amendment_id for update;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;

  select * into t from amendment_signing_tokens where id = t.id for update;
  if t.used_at is not null then
    raise exception 'Denne lenken er allerede brukt';
  end if;

  v_sperre := sperregrunn_endring(a);
  if t.revoked_at is not null then
    raise exception '%', coalesce(v_sperre,
      'Denne lenken gjelder ikke lenger. Be entreprenøren om en ny lenke hvis dere fortsatt vil svare på kravet.');
  end if;
  if v_sperre is not null then
    raise exception '%', v_sperre;
  end if;

  update amendment_signing_tokens
     set used_at = now(),
         signer_name = btrim(p_signer_name),
         signer_signature = p_signer_signature
   where id = t.id;

  -- Triggerne setter status til 'endringsmelding' og trekker tilbake de andre
  -- lenkene til kravet.
  update amendments
     set customer_signed_at = now()
   where id = a.id
  returning * into a;

  return json_build_object(
    'amendment_number', a.amendment_number,
    'project_ref',      a.project_ref,
    'status',           a.status
  );
end;
$$;

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
  t amendment_signing_tokens;
  a amendments;
  v_sperre text;
begin
  if p_navn is null or btrim(p_navn) = '' then
    raise exception 'Navn er påkrevd';
  end if;
  -- Begrunnelsen er påkrevd på et krav om endring, se 20260915000001.
  if p_grunn is null or btrim(p_grunn) = '' then
    raise exception 'Begrunnelse er påkrevd når du avslår et krav om endring';
  end if;

  select * into t from amendment_signing_tokens where token = p_token;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;

  select * into a from amendments where id = t.amendment_id for update;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;

  select * into t from amendment_signing_tokens where id = t.id for update;
  if t.used_at is not null then
    raise exception 'Denne lenken er allerede brukt';
  end if;

  v_sperre := sperregrunn_endring(a);
  if t.revoked_at is not null then
    raise exception '%', coalesce(v_sperre,
      'Denne lenken gjelder ikke lenger. Be entreprenøren om en ny lenke hvis dere fortsatt vil svare på kravet.');
  end if;
  if v_sperre is not null then
    raise exception '%', v_sperre;
  end if;

  update amendment_signing_tokens
     set used_at = now(),
         signer_name = btrim(p_navn)
   where id = t.id;

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

-- ─── Tilbaketrekking når dokumentet avsluttes (regel 3) ────────────────────
-- En trigger og ikke kode i hver funksjon: et tilbud avsluttes fra lenken, fra
-- knappene for manuell godkjenning og manuelt avslag, og fra statusfeltet i
-- skjemaet. Alle veiene går gjennom en oppdatering av raden. SECURITY DEFINER
-- fordi den skal virke uansett hvem som oppdaterer; den rører bare lenkene til
-- raden som ble endret.
create or replace function public.trekk_tilbake_ubrukte_lenker()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_grunn text;
begin
  if tg_table_name = 'offers' then
    v_grunn := avslutningsgrunn_tilbud(new);
    if v_grunn is not null then
      update offer_signing_tokens
         set revoked_at = now(),
             revoked_reason = v_grunn
       where offer_id = new.id
         and used_at is null
         and revoked_at is null;
    end if;
  else
    v_grunn := avslutningsgrunn_endring(new);
    if v_grunn is not null then
      update amendment_signing_tokens
         set revoked_at = now(),
             revoked_reason = v_grunn
       where amendment_id = new.id
         and used_at is null
         and revoked_at is null;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists offers_trekk_tilbake_lenker on public.offers;
create trigger offers_trekk_tilbake_lenker
  after update of status, customer_signed_at, rejected_at on public.offers
  for each row execute function public.trekk_tilbake_ubrukte_lenker();

drop trigger if exists amendments_trekk_tilbake_lenker on public.amendments;
create trigger amendments_trekk_tilbake_lenker
  after update of status, customer_signed_at, rejected_at on public.amendments
  for each row execute function public.trekk_tilbake_ubrukte_lenker();

-- ─── Ingen nye lenker til avsluttede dokumenter (regel 5) ──────────────────
-- «Send på e-post» lager eller gjenbruker en lenke for alt som ikke er signert
-- eller avslått, også et tilbud som er godkjent for hånd. En slik lenke ville
-- vært død fra første stund. Bedre at den som sender, får beskjed med en gang
-- enn at kunden får den.
create or replace function public.hindre_lenke_til_avsluttet()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_grunn text;
begin
  -- Bare nye lenker. En rad som alt er brukt eller trukket tilbake, er
  -- historikk, for eksempel fra en gjenoppretting.
  if new.used_at is not null or new.revoked_at is not null then
    return new;
  end if;

  if tg_table_name = 'offer_signing_tokens' then
    select avslutningsgrunn_tilbud(o) into v_grunn from offers o where o.id = new.offer_id;
    if v_grunn is not null then
      raise exception 'Tilbudet er allerede besvart eller avsluttet, så det lages ingen ny signeringslenke.';
    end if;
  else
    select avslutningsgrunn_endring(a) into v_grunn from amendments a where a.id = new.amendment_id;
    if v_grunn is not null then
      raise exception 'Kravet er allerede besvart, så det lages ingen ny signeringslenke.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists offer_signing_tokens_ikke_til_avsluttet on public.offer_signing_tokens;
create trigger offer_signing_tokens_ikke_til_avsluttet
  before insert on public.offer_signing_tokens
  for each row execute function public.hindre_lenke_til_avsluttet();

drop trigger if exists amendment_signing_tokens_ikke_til_avsluttet on public.amendment_signing_tokens;
create trigger amendment_signing_tokens_ikke_til_avsluttet
  before insert on public.amendment_signing_tokens
  for each row execute function public.hindre_lenke_til_avsluttet();

-- ─── Lenkene som alt ligger ute ────────────────────────────────────────────
-- Samme regel bakover i tid. 7. oktober 2026 gjaldt det 22 lenker til tilbud
-- og 3 til krav om endring. Lenker til tilbud som fortsatt står som «sendt»,
-- røres ikke, heller ikke der fristen har gått ut (regel 2).
update public.offer_signing_tokens t
   set revoked_at = now(),
       revoked_reason = public.avslutningsgrunn_tilbud(o)
  from public.offers o
 where o.id = t.offer_id
   and t.used_at is null
   and t.revoked_at is null
   and public.avslutningsgrunn_tilbud(o) is not null;

update public.amendment_signing_tokens t
   set revoked_at = now(),
       revoked_reason = public.avslutningsgrunn_endring(a)
  from public.amendments a
 where a.id = t.amendment_id
   and t.used_at is null
   and t.revoked_at is null
   and public.avslutningsgrunn_endring(a) is not null;

-- ─── Rettigheter ───────────────────────────────────────────────────────────
-- Hjelpefunksjonene brukes bare innenfra. De lekker ingenting, men det er ingen
-- grunn til at de skal kunne kalles over REST-grensesnittet.
revoke all on function public.sperregrunn_tilbud(public.offers) from public, anon, authenticated;
revoke all on function public.sperregrunn_endring(public.amendments) from public, anon, authenticated;
revoke all on function public.avslutningsgrunn_tilbud(public.offers) from public, anon, authenticated;
revoke all on function public.avslutningsgrunn_endring(public.amendments) from public, anon, authenticated;

-- Funksjonene kunden bruker, beholder rettighetene de hadde. Gjentatt her så en
-- ny base får dem også.
grant execute on function public.get_offer_by_token(text) to anon, authenticated;
grant execute on function public.get_offer_pdf_by_token(text) to anon, authenticated;
grant execute on function public.sign_offer(text, text, text) to anon, authenticated;
grant execute on function public.avslaa_tilbud(text, text, text) to anon, authenticated;
grant execute on function public.get_amendment_by_token(text) to anon, authenticated;
grant execute on function public.sign_amendment(text, text, text) to anon, authenticated;
grant execute on function public.avslaa_endring(text, text, text) to anon, authenticated;
