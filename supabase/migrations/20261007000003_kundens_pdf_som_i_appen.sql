-- Kunden skal se samme tilbud og samme kontrakt via lenken som appen lager.
--
-- get_offer_pdf_by_token gir signeringssiden innholdet i tilbuds-PDF-en, i
-- kontrakten og i beløpet. Tre ting manglet, så det kunden leste og signerte,
-- var ikke det samme som entreprenøren hadde sendt:
--
--   1. is_heading på linjene. Overskriftene fra 20260915000003 kom ut som
--      vanlige poster med 0 i antall og 0,00 kr i pris. get_amendment_by_token
--      fikk feltet den gangen, men denne funksjonen sto ikke i noen migrasjon
--      før 7. oktober 2026 og ble glemt.
--   2. Tilbudets egne forbehold. Signeringssiden falt tilbake på firmaets
--      standardliste, så kunden kunne signere en kontrakt med andre forbehold
--      enn tilbudet de hadde fått. 7. oktober 2026 gjaldt det alle de 12
--      tilbudene med en lenke som virket.
--   3. Kundens adresse og telefon. Kontrakten viser dem på forsiden og i §1
--      Partene, og tilbuds-PDF-en viser dem i kundeblokken.
--
-- Forbeholdene kommer alltid som en liste, også når tilbudet ikke har noen.
-- Appen leser null som tom liste, men signeringssiden faller tilbake på
-- firmaets liste når verdien er null. Alt annet som ikke er en liste, blir
-- også tom liste, fordi siden kaller .map() på verdien.
--
-- Adresse og telefon hentes fra kunderegisteret, slik appen gjør, og bare når
-- kunden hører til samme firma som tilbudet. Fremmednøkkelen på customer_id
-- sjekker ikke firmaet, og funksjonen er åpen for alle med lenken. Uten den
-- sjekken kunne et tilbud vist et annet firmas kunde. Bare de to feltene går
-- ut; e-posten kommer fra tilbudet som før, og notat, org.nr. og kontaktperson
-- blir i basen.
--
-- Vakten er uendret: null når lenken er brukt eller trukket tilbake, eller når
-- tilbudet ikke venter på svar (sperregrunn_tilbud).

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
  v_customer_address text;
  v_customer_phone text;
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

  -- Ingen rad (ingen kunde, eller en kunde i et annet firma) gir null i begge.
  select c.address, c.phone
    into v_customer_address, v_customer_phone
    from customers c
   where c.id = v_offer.customer_id
     and c.tenant_id = v_tenant_id;

  select jsonb_agg(
    jsonb_build_object(
      'description', description,
      'comment', comment,
      'quantity', quantity,
      'unit', unit,
      'unit_price', unit_price,
      'discount_pct', discount_pct,
      'included', included,
      'is_heading', is_heading
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
      'customer_address', v_customer_address,
      'customer_phone', v_customer_phone,
      'their_ref', v_offer.their_ref,
      'our_ref', v_offer.our_ref,
      'project_number', v_offer.project_number,
      'offer_text', v_offer.offer_text,
      'admin_cost_pct', v_offer.admin_cost_pct,
      'forbehold', case when jsonb_typeof(v_offer.forbehold) = 'array'
                        then v_offer.forbehold
                        else '[]'::jsonb
                   end
    ),
    'lines', coalesce(v_lines, '[]'::jsonb),
    'settings', coalesce(v_settings, '{}'::jsonb)
  );
end;
$$;

-- Rettighetene står som før. Gjentatt her så en ny base får dem også.
grant execute on function public.get_offer_pdf_by_token(text) to anon, authenticated;
