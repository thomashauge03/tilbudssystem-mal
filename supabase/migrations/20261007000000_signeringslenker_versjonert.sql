-- Signeringslenkene for tilbud, slik de faktisk står i basen.
--
-- Tabellen offer_signing_tokens og de to oppslagene signeringssiden bruker,
-- get_offer_by_token og get_offer_pdf_by_token, ble laget rett i databasen og
-- har aldri stått i en migrasjon. Det har kostet to ganger:
--
--   1. Endringer har gått forbi dem. Overskriftslinjene (20260915000003) fikk
--      is_heading inn i get_amendment_by_token, men ikke i get_offer_pdf_by_token,
--      fordi ingen så den.
--   2. Policyene på tabellen er aldri blitt gjennomgått. Den ene lot hvem som
--      helst lese alle ubrukte lenker. Den gjenskapes ikke her, og den fjernes
--      fra produksjon i 20261007000001.
--
-- Alt er hentet fra produksjon 7. oktober 2026 med pg_get_functiondef og
-- systemkatalogen. Migrasjonen endrer ingenting der: tabellen, indeksene og
-- policyen lages bare hvis de mangler, og funksjonene har samme logikk, samme
-- meldinger og samme skrivemåte som i basen. get_offer_by_token sto på én linje
-- og har fått linjeskift, ikke ny oppførsel.

-- ─── Tabellen ──────────────────────────────────────────────────────────────
-- Kolonnene i samme rekkefølge som i basen. created_at kan være tom her, til
-- forskjell fra amendment_signing_tokens; det er slik den står.
create table if not exists public.offer_signing_tokens (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  offer_id         uuid not null references public.offers(id) on delete cascade,
  -- 32 tilfeldige byte som 64 heksadesimale tegn, fra pgcrypto i skjemaet
  -- extensions, der Supabase legger den.
  token            text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  used_at          timestamptz,
  signer_name      text,
  signer_ip        text,
  created_at       timestamptz default now(),
  signer_signature text
);

create index if not exists idx_signing_tokens_offer on public.offer_signing_tokens (offer_id);
-- Overflødig ved siden av indeksen bak unique på token, men den finnes i basen.
create index if not exists idx_signing_tokens_token on public.offer_signing_tokens (token);

alter table public.offer_signing_tokens enable row level security;

-- I produksjon står det to policyer. Firmapolicyen gjenskapes slik den er.
-- Den andre, signing_token_public_read, gjaldt alle roller, også anon, med
-- vilkåret «used_at is null», og slapp dermed gjennom alle ubrukte lenker i alle
-- firmaer. Den skrives ikke inn i repoet; neste migrasjon fjerner den.
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'offer_signing_tokens'
                    and policyname = 'signing_token_tenant') then
    create policy signing_token_tenant on public.offer_signing_tokens
      using (tenant_id in (select tenant_users.tenant_id
                             from public.tenant_users
                            where tenant_users.user_id = auth.uid()));
  end if;
end $$;

-- ─── Oppslag for signeringssiden ───────────────────────────────────────────
-- Tilbudet bak lenken. Svarer også for en brukt lenke, slik at siden kan vise
-- hva den ble brukt til.
CREATE OR REPLACE FUNCTION public.get_offer_by_token(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token offer_signing_tokens;
  v_offer offers;
BEGIN
  SELECT * INTO v_token FROM offer_signing_tokens WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ugyldig lenke'; END IF;

  SELECT * INTO v_offer FROM offers WHERE id = v_token.offer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tilbud ikke funnet'; END IF;

  RETURN json_build_object(
    'token_id', v_token.id,
    'used_at', v_token.used_at,
    'offer_id', v_offer.id,
    'offer_number', v_offer.offer_number,
    'title', v_offer.title,
    'customer_name', v_offer.customer_name,
    'offer_date', v_offer.offer_date,
    'valid_until', v_offer.valid_until,
    'offer_text', v_offer.offer_text,
    'status', v_offer.status
  );
END;
$function$;

-- Linjer, tilbud og firmaoppsett til PDF-ene og beløpet på signeringssiden.
-- Gir null for en ukjent eller brukt lenke.
CREATE OR REPLACE FUNCTION public.get_offer_pdf_by_token(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token offer_signing_tokens;
  v_offer offers;
  v_tenant_id uuid;
  v_lines jsonb;
  v_settings jsonb;
BEGIN
  SELECT * INTO v_token FROM offer_signing_tokens WHERE token = p_token;
  IF NOT FOUND OR v_token.used_at IS NOT NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_offer FROM offers WHERE id = v_token.offer_id;
  v_tenant_id := v_offer.tenant_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'description', description,
      'comment', comment,
      'quantity', quantity,
      'unit', unit,
      'unit_price', unit_price,
      'discount_pct', discount_pct,
      'included', included
    ) ORDER BY sort_order, id
  ) INTO v_lines FROM offer_lines WHERE offer_id = v_offer.id;

  SELECT jsonb_build_object(
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
  ) INTO v_settings FROM app_settings WHERE tenant_id = v_tenant_id;

  RETURN json_build_object(
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
    'lines', COALESCE(v_lines, '[]'::jsonb),
    'settings', COALESCE(v_settings, '{}'::jsonb)
  );
END;
$function$;

-- Kunden er ikke innlogget; lenken er tilgangen. Samme rettigheter som i basen.
grant execute on function public.get_offer_by_token(text) to anon, authenticated;
grant execute on function public.get_offer_pdf_by_token(text) to anon, authenticated;
