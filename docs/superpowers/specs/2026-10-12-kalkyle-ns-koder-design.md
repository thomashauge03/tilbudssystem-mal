# Kalkyle med NS 3420-koder

Dato: 2026-10-12
Status: godkjent design, venter på implementeringsplan

## Mål

En egen side i toppmenyen der man regner på tilbud med NS 3420-koder fra en kodebank med egne enhetspriser. En kalkyle lagres og kan åpnes igjen. Fra kalkylen kan man legge linjene inn i et eksisterende tilbud eller et nytt, eller ta den ut som PDF.

## Avgrensning

Med:
- kodebank med startpakke og egne koder og priser
- lagrede kalkyler: mengde × enhetspris, overskrifter og påslag i %
- overføring til tilbud (eksisterende eller nytt)
- NS-kode som egen kolonne på tilbudslinjer, i tilbudsskjemaet og i PDF-ene
- PDF av kalkylen

Ikke med (kan komme senere):
- enhetspris bygd av ressurser (timer, maskin, materiell)
- import fra Excel eller ISY
- NS-koder på endringsmeldinger (`amendment_lines`)

## Opphavsrett

NS 3420 eies av Standard Norge. Appen lagrer bare koder, enheter og våre egne korte titler. Standardens beskrivelsestekst legges aldri inn.

## Startpakken

Kilden er [docs/ns3420-startliste.md](../../ns3420-startliste.md): 148 koderøtter hentet fra 21 offentlige anbudsgrunnlag fra 13 byggherrer, med kildelenker.
- 146 er VERIFISERT, det vil si at de finnes hos minst 2 ulike byggherrer. 2 er UVERIFISERT.
- Ingen kilde bruker NS 3420:2024. Den nyeste er databaseversjon 202201.
- Noen røtter betyr noe annet i eldre utgaver (≤2015), for eksempel UP1.11, UB1/UB2, KD2.31, CD3.1x og KM1.11.

Regler for seeding:
- Bare røtter merket «2017+» eller «begge utg.» legges inn. Røtter som bare gjelder «≤2015», tas ikke med.
- `utgave` settes til `2017–2022` på alle startpakkekoder.
- UVERIFISERT-koder får `maa_kontrolleres = true` og vises med et merke i kodebanken til noen fjerner det.
- Enhetspris er tom (null). Bedriften fyller inn sine egne priser.
- Startpakken legges inn per tenant med en intern SQL-funksjon `seed_ns_codes_for(tenant uuid)`, som ikke kan kalles fra klienten. Migrasjonen kaller den for alle eksisterende tenants. Den kan kjøres på nytt uten å lage duplikater (`on conflict (tenant_id, code) do nothing`).
- Nye tenants: kodebanken viser knappen «Legg inn startpakken» når den er tom. Knappen kaller RPC-en `seed_ns_codes()`, som bruker innlogget brukers tenant og aldri en tenant sendt inn fra klienten.

## Datamodell (ny migrasjon)

Alle tabellene har `tenant_id`, RLS per tenant (samme mønster som `offer_lines`) og `created_at`.

`ns_codes`
| kolonne | type | merknad |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| part | text | del, f.eks. `F`, `U`, `CD` |
| code | text | koderot, f.eks. `FD2.13` |
| title | text | vår egen korte tittel |
| unit | text | |
| unit_price | numeric(12,2) null | |
| edition | text null | f.eks. `2017–2022` |
| note | text null | |
| maa_kontrolleres | bool default false | |
| active | bool default true | inaktive skjules i søk |

Unik på `(tenant_id, code)`.

`calculations`
| kolonne | type | merknad |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| name | text | f.eks. «VA Storgata» |
| customer_text | text null | fritekst kunde eller prosjekt |
| markup_pct | numeric(5,2) | standard: adm.kost for året fra `admin_costs` |
| created_by | uuid | |
| updated_at | timestamptz | |

`calculation_lines`: samme form som `offer_lines`, så overføringen blir rett fram.
| kolonne | type | merknad |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| calculation_id | uuid fk cascade | |
| sort_order | int | |
| ns_code | text null | kopi av koden, ikke fk. Kalkylen skal ikke endre seg når kodebanken endres |
| description | text | |
| unit | text | |
| quantity | numeric(12,2) | |
| unit_price | numeric(12,2) | |
| is_heading | bool default false | samme CHECK som `offer_lines`: en overskrift har ikke mengde eller pris |

Endring på `offer_lines`: ny kolonne `ns_code text null`.

Lagring av kalkylelinjer skjer på samme måte som tilbudslinjer: slett alle linjer og sett dem inn på nytt med `sort_order` = indeks.

`src/integrations/supabase/types.ts` er utdatert. De nye tabellene får egne TS-typer i `src/lib/kalkyle.ts` i stedet for å bygge videre på de genererte typene.

## Sider og navigasjon

Toppmenyen: ny lenke `{ to: "/kalkyle", label: "Kalkyle" }` i `BASE_LINKS` i `src/components/app-nav.tsx`.

Ruter (filbaserte, `src/routes/`):
- `kalkyle.index.tsx`: liste over kalkyler (navn, kunde/prosjekt, sum, sist endret), med knappene «Ny kalkyle» og «Kodebank».
- `kalkyle.ny.tsx` og `kalkyle.$id.tsx`: regnearket, med en felles komponent `src/components/calculation-form.tsx`.
- `kalkyle.kodebank.tsx`: kodebanken.

### Regnearket
- Øverst: navn, kunde/prosjekt og påslag i %.
- Kodesøket er et felt som søker i kode og tittel blant aktive koder. Treff vises gruppert på del. Et klikk eller Enter legger til en linje med kode, tittel, enhet og enhetspris, og flytter fokus til mengdefeltet.
- Tabellen har kolonnene Kode, Beskrivelse, Mengde, Enhet, Enhetspris og Sum. Alt kan redigeres. Linjer kan dras for å endre rekkefølge og slettes. «Legg til overskrift» og «Legg til fritekstlinje» finnes som knapper.
- Mobil: kort per linje, som i tilbudsskjemaet.
- Bunnen viser sum, påslag, sum eks. mva, mva (`app_settings.vat_pct`) og total inkl. mva.
- Knapper: Lagre, PDF og «Legg til i tilbud».
- En linje med enhetspris tom eller 0 markeres. Ved lagring kommer samme bekreftelse som `bekreftNullinjer` i tilbudsskjemaet.

### Kodebanken
- Tabell gruppert på del, med søk og et filter for «vis inaktive».
- Radredigering av tittel, enhet, enhetspris, utgave, merknad og aktiv. Merket «Må kontrolleres» kan slås av.
- «Ny kode»-knapp. Koder slettes ikke, de settes inaktive, slik at gamle kalkyler fortsatt gir mening.
- En tekst øverst sier at kodene er hentet fra offentlige anbudsgrunnlag og bør kontrolleres mot gjeldende utgave av NS 3420, med lenke til kildelisten.

## Beregning

Ren funksjon i `src/lib/kalkyle.ts`, testet:
- linjesum = mengde × enhetspris. Overskrifter gir 0.
- sum = summen av linjene
- påslag = sum × markup_pct / 100
- eks. mva = sum + påslag
- mva = eks. mva × vat_pct / 100
- total = eks. mva + mva

Avrunding til øre skjer bare ved visning, på samme måte som `lineNet` og `offerTotal` i `src/lib/format.ts`.

## Legg til i tilbud

Dialogen har to valg:
1. **Eksisterende tilbud.** Listen viser bare tilbud uten `customer_signed_at`, sortert med de siste først og med søk.
2. **Nytt tilbud.**

Overføringen (ren funksjon `kalkyleTilTilbudslinjer` i `src/lib/kalkyle.ts`, testet):
- Først legges det inn én overskriftslinje med kalkylens navn. Deretter følger kalkylelinjene i samme rekkefølge, sist i tilbudet.
- Feltene kopieres: `ns_code`, `description`, `unit`, `quantity`, `unit_price`, `is_heading`. `discount_pct` = 0 og `included` = true.
- Prisene overføres **uten** kalkylepåslaget. Tilbudet bruker sin egen adm.kost (`admin_cost_pct`), så påslaget blir ikke regnet to ganger.
- Nytt tilbud: tilbudet opprettes med `admin_cost_pct` = kalkylens `markup_pct` og `customer_name` = kalkylens kunde/prosjekt. Deretter åpnes `/tilbud/$id`.
- Eksisterende tilbud: linjene settes inn med `sort_order` etter den høyeste som finnes. Deretter åpnes `/tilbud/$id`, og en toast viser hvor mange linjer som ble lagt til.
- Hvis tilbudet blir signert mellom dialogen og lagringen, sjekkes `customer_signed_at` på nytt rett før innsettingen. Er tilbudet signert, avbrytes overføringen med en feilmelding.

Ingen kobling lagres mellom kalkyle og tilbud. Kalkylen kan overføres flere ganger.

## NS-kode i tilbudet

- `offer-form.tsx`: `Line` får `ns_code`. Tabellen på skrivebord får en smal «Kode»-kolonne foran Beskrivelse. Den kan redigeres og vises bare når minst én linje har kode eller brukeren slår den på. Mobilkortene viser koden foran beskrivelsen.
- Lagring av tilbudet tar med `ns_code`.
- `src/lib/pdf.ts`: `OfferLine` får `ns_code`. Tilbuds- og kontrakts-PDF-en får kolonnen «Kode» bare når minst én linje har kode.
- RPC `get_offer_pdf_by_token` (siste definisjon i `20261007000003_kundens_pdf_som_i_appen.sql`) gjenopprettes i den nye migrasjonen med `ns_code` i linjelisten. Da ser kunden det samme på signeringssiden. Endringsmeldingene berøres ikke.

## PDF av kalkylen

`openCalculationPdf` i `src/lib/pdf.ts`, med samme mønster som `openOfferPdf`: HTML i et popup-vindu og `window.print()`. Popupen åpnes inne i klikkhandleren.
- Toppen har logo og firmainfo fra innstillingene, kalkylens navn, kunde/prosjekt og dato.
- Tabellen har kolonnene Kode, Beskrivelse, Mengde, Enhet, Enhetspris og Sum. Overskrifter vises som gruppetitler med delsum.
- Bunnen viser sum, påslag, sum eks. mva, mva og total inkl. mva.
- Påslaget vises som egen linje, ikke fordelt på postene.

## Feilhåndtering

- Feil ved lagring vises med en sonner-toast med Supabase-feilmeldingen. Skjemaet beholder det som er skrevet.
- Navnet på kalkylen er påkrevd. Er det tomt, sier lagreknappen fra.
- Kodebanken avviser en ny kode som allerede finnes, med en tydelig melding.

## Testing

- Nye tester i `src/lib/kalkyle.test.ts` (samme stil som `anbud.test.ts`, legges til i `bun run test`):
  - beregning med og uten overskrifter, påslag og mva
  - `kalkyleTilTilbudslinjer`: overskrift først, rekkefølge, ingen påslag i prisene og `sort_order` etter eksisterende linjer
- Migrasjonen kjøres mot basen. Etterpå sjekkes det via PostgREST med service-role-nøkkelen at startpakken er lagt inn for hver tenant, og at `get_offer_pdf_by_token` returnerer `ns_code`.
- Sidene sjekkes i forhåndsvisningen: `?tsr-split=component` og bygging uten feil (`bun run build`), siden panelet er utlogget lokalt.
