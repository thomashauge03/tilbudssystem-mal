-- Ingen skal kunne liste opp signeringslenkene.
--
-- Lenken er hele tilgangskontrollen for kunden: den som har den, kan se
-- tilbudet, signere det eller avslå det. Policyen signing_token_public_read
-- gjaldt alle roller, også anon, og slapp gjennom hver rad der used_at var tom.
-- Anon-nøkkelen ligger i nettsiden og er offentlig med vilje, så hvem som helst
-- kunne be REST-grensesnittet om tabellen og få alle ubrukte lenker i alle
-- firmaer i basen. 7. oktober 2026 var det 37 av dem. Med en slik lenke kunne
-- en fremmed lese priser og kundeopplysninger, og signere eller avslå tilbudet
-- på kundens vegne.
--
-- Ingenting i appen trenger policyen. Signeringssiden går gjennom
-- get_offer_by_token, get_offer_pdf_by_token, sign_offer og avslaa_tilbud, som
-- er SECURITY DEFINER og slår opp ett token om gangen. Den innloggede appen
-- leser og lager lenker gjennom firmapolicyen, og varsel-epost bruker
-- service-nøkkelen.

drop policy if exists signing_token_public_read on public.offer_signing_tokens;

-- Firmapolicyen får samme form som på alle andre tabeller med tenant_id, også
-- amendment_signing_tokens. Den gamle slapp gjennom alle firmaer brukeren var
-- medlem av, mens resten av systemet bare ser current_tenant_id(). En bruker med
-- to medlemskap kunne dermed se lenker til tilbud de ikke fikk åpne. Den hadde
-- heller ingen WITH CHECK av sin egen.
drop policy if exists signing_token_tenant on public.offer_signing_tokens;
drop policy if exists offer_signing_tokens_tenant_isolation on public.offer_signing_tokens;
create policy offer_signing_tokens_tenant_isolation on public.offer_signing_tokens
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

-- Og fra den andre siden: anon skal aldri røre tokentabellene direkte. Uten
-- tabellrettigheter hjelper det ikke om noen en dag legger til en policy som
-- slipper for mye gjennom. Funksjonene over kjører som eier og merker ikke dette.
revoke all on public.offer_signing_tokens from anon;
revoke all on public.amendment_signing_tokens from anon;
