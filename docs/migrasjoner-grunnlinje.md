# Migrasjonskjeden: grunnlinje og historikk

Kartlagt 7. oktober 2026, skrivebeskyttet mot produksjon (`rmlczuhipndlvfvkpznm`).

## Kort fortalt

- Kjeden i `supabase/migrations` kunne ikke bygge en tom base. Flere ting var laget
  rett i produksjonsbasen og sto ikke i noen migrasjon.
- Løsningen er én ny migrasjon, `20260708000001_grunnlinje_laget_rett_i_basen.sql`,
  med alt som manglet. Nå bygger kjeden fra tom base, og resultatet er likt
  produksjonen.
- Historikken i produksjon (`supabase_migrations.schema_migrations`) har bare de åtte
  første versjonene. Den bør fylles ut med de 28 som er kjørt, men ikke registrert.
  Det skriver til produksjon og venter på Thomas' ja. Til det er gjort, må
  `supabase db push` ikke brukes.

## Hva som manglet i migrasjonene

Funnet ved å bygge kjeden i PGlite og sammenligne systemkatalogen med produksjonens,
objekt for objekt: tabeller, kolonner, begrensninger, indekser, funksjoner,
triggere, policyer, sekvenser, typer, visninger, rettigheter og lagringsbøtter.

Laget rett i basen, aldri i en migrasjon:

| Hva | Antall | Navn |
| --- | --- | --- |
| Kolonner i `app_settings` | 12 | logo_url, primary_color, company_tagline, our_refs, units, forbehold, payment_terms, default_offer_text, email_subject_template, vat_pct, closing_page_offset_mm, company_org_nr |
| Kolonner i `offers` | 3 | customer_signed_at, contract_signed, attachment_urls |
| Standardverdi fjernet | 1 | offers.offer_number bruker ikke lenger offer_number_seq |
| Funksjoner | 7 | set_offer_number, list_tenants, list_tenant_users, list_auth_users, confirm_user_email, delete_auth_user, delete_tenant_user |
| Triggere | 1 | trg_set_offer_number på offers |
| Policyer i public | 4 | admin_all_tenants, admin_all_tenant_users, tenant_users_self_read, admin_all_settings |
| Indekser | 8 | offers_tenant_offer_number_uniq, idx_amendments_tenant_id, idx_offers_tenant_status, idx_offers_valid_until_godkjent, idx_payments_amendment_id, idx_payments_offer_id, idx_potential_customers_tenant_status, idx_tenant_users_user_id |
| Lagringsbøtter | 2 | logos, offer-attachments |
| Policyer på storage.objects | 7 | public read logos, admin upload/update/delete logos, public read offer-attachments, auth upload/delete offer-attachments |

Ingen tabeller, visninger, typer, sekvenser eller publikasjoner i public mangler
utover dette.

To feil i rekkefølgen i kjeden kom av det samme:

- `20260810000000` bruker `offers.customer_signed_at`, som ingen migrasjon lager.
  Kjeden stoppet her, før funnet fra i dag.
- `20260915000001` og `20260915000004` deklarerer variabler av typen
  `offer_signing_tokens`, men tabellen lages først i `20261007000000`.

Forskjeller som står igjen, og som er ufarlige:

- 23 funksjoner har CRLF som linjeskift i basen og LF i filene. Samme tekst ellers.
- `logg_linjeendring` har samme kode, men fila har to kommentarlinjer som basen ikke har.
- Utvidelsene `pg_stat_statements` og `supabase_vault` har Supabase selv. `pg_net`
  finnes ikke i PGlite og etterlignes i testen.

## Valget: grunnlinjen ligger rett etter de åtte registrerte

Forslaget var en grunnlinje før `20260616000000`. Det går ikke uten å kopiere
tabellene: alt som manglet henger på tabellene `20260616000000` lager (tenants,
tenant_users, app_settings, offers). Før den finnes det ingenting å legge kolonner,
policyer eller triggere på, og grunnlinjen måtte da ha egne kopier av tabellene,
som ville tatt over for definisjonene i `20260616000000` uten at noen så det.

`20260708000001` ligger rett etter de åtte versjonene produksjonen har registrert,
og før den første migrasjonen som trenger noe herfra (`20260810000000`). Der finnes
tabellene, og kolonnene havner i samme rekkefølge som i produksjon.

Fila lager bare det som mangler: kolonner og indekser med `if not exists`, policyer
og triggeren bak en sjekk, og funksjonene med samme tekst som i basen. Kjørt mot en
base der alt finnes, endrer den ingenting (testet).

Vurdert og forkastet: å slå hele kjeden sammen til én fil med hele skjemaet
(«squash»). Det ville kastet de 35 filene med begrunnelsene ut av byggingen, og
krevd at historikken i produksjon skrives om (de åtte radene slettes og én ny inn).
Med grunnlinjen trengs bare nye rader.

Grunnlinjen gjengir produksjonen slik den er, også det som bør rettes (se under).
Rettelsene hører hjemme i egne migrasjoner, så kjeden og produksjonen fortsatt er like.

## Funn som bør rettes i egne migrasjoner

Ikke gjort her, fordi det endrer produksjon.

1. `delete_tenant_user` er SECURITY DEFINER, sjekker ikke `is_system_admin()` slik
   søsterfunksjonene gjør, og kan kjøres av anon. Den som har den offentlige nøkkelen
   og en `tenant_users`-id, kan fjerne en bruker fra et firma.
2. Lagringspolicyene skiller ikke mellom firmaer. En admin i ett firma kan endre og
   slette alle firmaers logoer, enhver innlogget bruker kan slette alle vedlegg, og
   alle (også anon) kan liste filene i begge bøttene. Bøttene er offentlige.
3. Standardverdiene for `units` og `email_subject_template` inneholder
   erstatningstegnet U+FFFD der det skulle stått m², m³ og et skilletegn i emnet.
   Én av tre rader i `app_settings` har arvet det.
4. Adminfunksjonene fra adminsiden er SECURITY DEFINER uten `set search_path`.

## Historikken og `supabase db push`

I dag: produksjonen har registrert 8 versjoner, repoet har 37. Den ekte CLI-en
(2.119.0), kjørt mot en lokal kopi av produksjonen i PGlite, viser hva som ville skjedd:

- `db push --dry-run` vil kjøre 29 filer, 28 av dem på nytt.
- En ekte `db push` kjører grunnlinjen og 14 filer til, og stopper på `20260831000000`
  (policyen `tenant_users_self_les` finnes fra før). Da står `sign_amendment` og
  `get_amendment_by_token` igjen i augustversjonen, altså uten dagens strammere
  signeringsregler for krav om endring. Historikken får 15 nye rader og blir halvveis.
- Tilbakefyllene i filene ville endret 0 rader i dag (talt skrivebeskyttet), men det
  kan endre seg når dataene gjør det.

Derfor bør historikken fylles ut. Det gjøres med

    node scripts/migrasjonstest/produksjon.mjs historikk --til 20261007000002 --utfor

som

- bygger kjeden til og med `--til` i PGlite og nekter hvis den ikke gir nøyaktig det
  produksjonen har,
- registrerer bare versjonene som mangler, med setningene delt opp slik CLI-en gjør,
- skriver 28 rader i én transaksjon og ingenting annet.

Testet mot en lokal kopi med 8 versjoner: etterpå har historikken 36 versjoner, en
ny kjøring legger ikke til noe, radene er identiske med dem CLI-en selv ville
lagret, og `db push --dry-run` vil bare kjøre `20261007000003`.

Uten `--utfor` er det en tørrkjøring som viser planen. Er `20261007000003` kjørt i
produksjon før registreringen, brukes `--til 20261007000003`; kontrollen avgjør
hvilken som stemmer.

Videre: en migrasjon som kjøres via Management API, må registreres etterpå med
`historikk --til <versjonen> --utfor`, ellers glir historikken fra hverandre igjen.

## Verktøyet

    cd scripts/migrasjonstest && npm install       (første gang)
    node scripts/migrasjonstest/kjede.mjs          hele kjeden fra tom base
    node scripts/migrasjonstest/kjede.mjs --igjen 20260708000001
    node scripts/migrasjonstest/produksjon.mjs avvik [--til <versjon>]
    node scripts/migrasjonstest/produksjon.mjs historikk --til <versjon> [--utfor]

`kjede.mjs` kjører hver fil som én transaksjon, som CLI-en, med Supabase-oppsettet
fra `supabase-oppsett.sql` (roller, skjemaer, standardrettigheter og søkesti som i
produksjon). `produksjon.mjs` henter tokenet med `tokenFor` fra Varslingskontroll og
sender `set transaction read only` først i alle spørringer, unntatt registreringen.
