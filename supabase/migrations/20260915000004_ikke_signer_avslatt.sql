-- Et avslått dokument skal ikke kunne signeres.
--
-- Avslaget ble innført med en sperre i grensesnittet: knappen «Signeringslenke»
-- forsvinner når kunden har sagt nei. Det holder ikke. «Send på e-post» lager
-- sin egen lenke, og en lenke som ble sendt FØR avslaget ligger fortsatt i
-- kundens innboks. Signerte de med den, satte triggeren status til «godkjent»
-- eller «endringsmelding», mens avslaget ble liggende i de samme radene — og
-- da sa dokumentet to ting samtidig, uten at noen fikk vite det.
--
-- Vakten hører hjemme her, der begge veier inn må innom.
--
-- Samtidig får sign_offer den sjekken sign_amendment alt hadde: et tilbud som
-- er signert, skal ikke kunne signeres en gang til. Den lå bare på tokenet, og
-- et nytt token ga en ny signatur oppå den gamle.

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
  t record;
  a record;
begin
  if p_signer_name is null or btrim(p_signer_name) = '' then
    raise exception 'Navn er påkrevd';
  end if;

  -- for update låser raden, så to samtidige signeringer ikke begge slipper gjennom
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
  if a.rejected_at is not null or a.status = 'avslått' then
    raise exception 'Dette kravet er avslått. Ta kontakt med entreprenøren hvis dere har ombestemt dere.';
  end if;

  update amendment_signing_tokens
     set used_at = now(),
         signer_name = btrim(p_signer_name),
         signer_signature = p_signer_signature
   where id = t.id;

  -- Triggeren setter status til 'endringsmelding'
  update amendments
     set customer_signed_at = now()
   where id = t.amendment_id
  returning * into a;

  return json_build_object(
    'amendment_number', a.amendment_number,
    'project_ref',      a.project_ref,
    'status',           a.status
  );
end;
$$;

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
begin
  select * into v_token from offer_signing_tokens where token = p_token for update;
  if not found then
    raise exception 'Ugyldig lenke';
  end if;
  if v_token.used_at is not null then
    raise exception 'Denne lenken er allerede brukt';
  end if;

  select * into v_offer from offers where id = v_token.offer_id for update;
  if not found then
    raise exception 'Tilbud ikke funnet';
  end if;
  if v_offer.customer_signed_at is not null then
    raise exception 'Tilbudet er allerede signert';
  end if;
  if v_offer.rejected_at is not null or v_offer.status = 'avslått' then
    raise exception 'Dette tilbudet er avslått. Ta kontakt med entreprenøren hvis dere har ombestemt dere.';
  end if;

  update offer_signing_tokens
     set used_at = now(),
         signer_name = p_signer_name,
         signer_signature = p_signer_signature
   where id = v_token.id;

  update offers
     set customer_signed_at = now(),
         updated_at = now()
   where id = v_token.offer_id;

  return json_build_object(
    'offer_number',  v_offer.offer_number,
    'title',         v_offer.title,
    'customer_name', v_offer.customer_name
  );
end;
$$;

-- Den gamle to-argumenters utgaven finnes fortsatt i basen. Den skal ikke være
-- en bakvei rundt de samme sjekkene, så den sender bare videre.
create or replace function public.sign_offer(
  p_token text,
  p_signer_name text
) returns json
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return public.sign_offer(p_token, p_signer_name, null::text);
end;
$$;

grant execute on function public.sign_offer(text, text, text) to anon, authenticated;
grant execute on function public.sign_offer(text, text) to anon, authenticated;
grant execute on function public.sign_amendment(text, text, text) to anon, authenticated;
