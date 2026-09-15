-- To ting som manglet da «sendt»-merket ble innført.
--
-- 1) Historikken. Kolonnene kom tomme, og appen tegner tomt som «Ikke sendt».
--    For en endring kunden har signert digitalt, er det en påstand vi vet er
--    usann: de åpnet en signeringslenke de må ha fått. Da ville hele den
--    eksisterende porteføljen stått med et falskt varselmerke — akkurat på den
--    opplysningen merket ble laget for å gjøre til å stole på.
--
-- 2) Opptellingen. Antallet ble regnet ut i nettleseren og skrevet tilbake som
--    et absolutt tall. To faner, eller to personer, som sendte hver sin gang,
--    overskrev hverandre. Tallet regnes nå i basen, der det bare finnes én
--    utgave av sannheten.

-- ─── Tilbakefyll ───────────────────────────────────────────────────────────
-- Beviset ligger alt i basen: et brukt signeringstoken. Tidspunktet lenken ble
-- laget, er nettopp da e-posten ble klargjort — altså det sent_at beskriver.
-- Finnes ikke tokenet, brukes signaturtidspunktet: kunden kan ikke ha signert
-- noe de aldri fikk.
--
-- Bare rader som er signert røres. Et usignert krav vet vi ingenting om, og da
-- skal det stå «Ikke sendt» — det er hele poenget med merket.
update public.amendments a
   set sent_at = coalesce(
         (select max(t.created_at)
            from public.amendment_signing_tokens t
           where t.amendment_id = a.id and t.used_at is not null),
         a.customer_signed_at),
       sent_to = coalesce(a.sent_to, a.customer_email),
       sent_count = greatest(coalesce(a.sent_count, 0), 1)
 where a.sent_at is null
   and a.customer_signed_at is not null;

-- ─── Opptelling i basen ────────────────────────────────────────────────────
-- Ingen SECURITY DEFINER her: dette er en innlogget bruker som skriver på sin
-- egen rad, og da skal RLS gjelde som ellers. Hadde funksjonen kjørt som eier,
-- kunne den merket en melding i et annet firma.
create or replace function public.merk_endring_sendt(
  p_id uuid,
  p_epost text default null
) returns json
language plpgsql
as $$
declare
  a public.amendments;
begin
  update public.amendments
     set sent_at = now(),
         sent_to = nullif(btrim(coalesce(p_epost, '')), ''),
         -- + 1 på verdien som står i basen, ikke på den nettleseren husket
         sent_count = coalesce(sent_count, 0) + 1,
         updated_at = now()
   where id = p_id
  returning * into a;

  if not found then
    raise exception 'Fant ikke endringsmeldingen';
  end if;

  return json_build_object('sent_at', a.sent_at, 'sent_to', a.sent_to, 'sent_count', a.sent_count);
end;
$$;

-- Angrer man, er det den siste sendingen som trekkes fra — ikke hele
-- historikken. Er en melding sendt tre ganger og den fjerde avbrutt, er den
-- fortsatt sendt tre ganger.
create or replace function public.merk_endring_ikke_sendt(p_id uuid)
returns json
language plpgsql
as $$
declare
  a public.amendments;
begin
  update public.amendments
     set sent_at = null,
         sent_to = null,
         sent_count = greatest(coalesce(sent_count, 0) - 1, 0),
         updated_at = now()
   where id = p_id
  returning * into a;

  if not found then
    raise exception 'Fant ikke endringsmeldingen';
  end if;

  return json_build_object('sent_at', a.sent_at, 'sent_count', a.sent_count);
end;
$$;

grant execute on function public.merk_endring_sendt(uuid, text) to authenticated;
grant execute on function public.merk_endring_ikke_sendt(uuid) to authenticated;
