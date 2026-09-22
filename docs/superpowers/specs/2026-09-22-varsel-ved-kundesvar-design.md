# Varsel på e-post når kunden svarer

**Dato:** 22.09.2026
**Status:** til gjennomgang

## Problemet

Når byggherren signerer eller avslår via signeringslenken, skjer det uten at
noen hos oss er til stede. I dag oppdages det først når noen åpner appen og ser
etter. Et avslag kan bli liggende i «Aktive» og bli fulgt opp av folk som tror
tilbudet fortsatt er i spill, og en signatur kan bli liggende et døgn før noen
setter i gang.

Varselet skal lukke det gapet: kundens svar skal komme til oss, ikke ventes på.

## Omfang

Fire hendelser utløser varsel:

| Hendelse | Utløser |
|---|---|
| Tilbud signert | `offers.customer_signed_at` settes, `signature_method = 'digital'` |
| Tilbud avslått | `offers.rejected_at` settes |
| Krav om endring signert | `amendments.customer_signed_at` settes, `signature_method = 'digital'` |
| Krav om endring avslått | `amendments.rejected_at` settes |

**Utenfor omfanget:** manuelle godkjenninger (`signature_method` = `papir`,
`muntlig` eller `epost`). Registrerer vi en papirgodkjenning selv, vet vi det
allerede, og en e-post om det er støy som gjør at man slutter å lese varslene.
Kravet er at varselet betyr «noe har skjedd uten deg».

Varselet går bare til oss. Kunden får ingenting nytt.

## Arkitektur

```
kunden signerer/avslår
  → RPC (sign_offer / avslaa_tilbud / sign_amendment / avslaa_endring)
    → rad oppdateres i offers eller amendments
      → AFTER UPDATE-trigger: varsle_kundesvar()
        → net.http_post (pg_net, asynkront)
          → edge function: varsel-epost
            → Resend API
              → innboksen til app_settings.notify_email
```

Utløseren ligger i en trigger, ikke i de fire RPC-ene. Det er samme valg som
`set_offer_approved_on_signature` allerede bygger på, og av samme grunn:
statusen — og nå varselet — skal følge signaturen uansett hvilken vei den blir
satt. Alternativet, et kall i hver RPC, gir fire steder å holde i takt og et
varsel som uteblir den dagen en status settes en annen vei.

`net.http_post` er asynkront. Signeringen fullfører uavhengig av om e-posten
går gjennom. Det er med vilje: en kunde skal aldri få en feilmelding i
signeringslenken fordi en e-posttjeneste er nede.

## Datamodell

### `app_settings.notify_email text`

Adressen varslene går til, per firma.

**Tom streng betyr av.** Funksjonen er slått av til noen fyller ut feltet, så
ingen får uventet e-post den dagen migrasjonen kjøres. Edge functionen
returnerer uten å sende når feltet er tomt.

### `varsel_oppsett` (ny tabell, én rad)

Triggeren trenger å vite hvor edge functionen bor og hvordan den skal
legitimere seg.

| Kolonne | Type | Innhold |
|---|---|---|
| `id` | `boolean primary key default true` med `check (id)` | Låser tabellen til én rad |
| `funksjon_url` | `text not null` | `https://<prosjekt>.supabase.co/functions/v1/varsel-epost` |
| `delt_hemmelighet` | `text not null` | Tilfeldig streng, sendes som header |

RLS er på og **ingen policy er definert**. Da kommer verken anon eller
innloggede brukere til, mens `security definer`-funksjoner og service-role
leser som før. Dette er global drift, ikke firmadata, og hører derfor ikke
hjemme i `app_settings` — en tenant skal ikke kunne lese en hemmelighet som
gjelder alle.

## Triggerfunksjonen

`public.varsle_kundesvar()`, `after update` på `offers` og `amendments`,
`security definer`.

Den avgjør hendelsen:

- `customer_signed_at` gikk fra null til en verdi **og**
  `coalesce(signature_method, 'digital') = 'digital'` → `signert`
- `rejected_at` gikk fra null til en verdi → `avslaatt`
- ellers: `return new` uten å gjøre noe

`stemple_manuell_godkjenning` er en `before`-trigger og har allerede satt
`signature_method` når vår leser den. Papirgodkjenninger siler seg dermed ut av
seg selv.

Kroppen som sendes:

```json
{ "type": "offer" | "amendment", "id": "<uuid>", "hendelse": "signert" | "avslaatt" }
```

Ikke mer. Edge functionen slår opp resten selv, så en som skulle få tak i
kallet ikke kan diktere hva det står i e-posten.

Feiler `net.http_post`, fanges det og svelges. En e-post som ikke går skal
aldri rulle tilbake en signatur kunden har avgitt.

## Edge function `varsel-epost`

Deployes med `verify_jwt = false`, som `sms-inn`. Triggeren har ingen
Supabase-innlogging.

1. Sjekker `x-varsel-nokkel` mot `Deno.env.get("VARSEL_NOKKEL")`. Feil eller
   manglende nøkkel gir 401 med samme svar i begge tilfeller, så endepunktet
   ikke kan brukes til å gjette nøkler — samme resonnement som i `sms-inn`.
2. Slår opp saken med service-role og henter tenant, nummer, tittel, kunde,
   beløp og eventuell begrunnelse.
3. Henter `notify_email` for den tenanten. Tom → 200 og ingen utsending.
4. Sender via `POST https://api.resend.com/emails` med
   `Authorization: Bearer ${RESEND_API_KEY}`.

Hemmeligheter: `RESEND_API_KEY`, `VARSEL_NOKKEL`, `VARSEL_FRA` (avsender) og
`APP_URL` (til lenken i mailen). Alle settes i Supabase, ingen i repoet.

`VARSEL_FRA` er en egen hemmelighet nettopp for at overgangen fra
`onboarding@resend.dev` til `varsel@haugemaskin.no` skal være én verdi å endre,
ikke en kodeendring.

## E-postens innhold

```
Emne:  Tilbud #1010 avslått av Åseral Kommune

Åseral Kommune avslo tilbud #1010 «VA Skardheie»
den 22.09.2026 kl. 14:54.

Avslått av:   Hilde Stuestøl Berg
Beløp:        6 521 080,00 kr eks. mva
Begrunnelse:  «Vi går for et annet tilbud på delkontrakt 2.»

Åpne tilbudet: https://tilbudssystem-mal.vercel.app/tilbud/4c28d2c8-…
```

Ved signering utgår begrunnelseslinjen. For krav om endring står
prosjektreferansen der tittelen ellers står:
`Krav om endring #3 signert — 2026118`.

Sendes som ren tekst. Varselet skal leses på en telefon i en gravemaskin, ikke
beundres.

## Sikkerhet

- Kroppen fra triggeren inneholder bare type, id og hendelse. Avsender kan ikke
  bestemme mottaker eller tekst.
- Endepunktet er åpent (`verify_jwt = false`), men verdiløst uten
  `VARSEL_NOKKEL`. Verste utfall ved en lekket nøkkel er uønskede varsler til
  firmaets egen adresse — ingen data ut.
- `varsel_oppsett` er utilgjengelig for anon og innloggede.
- Ingen kundedata forlater systemet utover det som står i e-posten, og den går
  til firmaets egen adresse.

## Feilhåndtering

`pg_net` er «send og glem». Svarer Resend med en feil, ser vi det i
`net._http_response`, ikke i appen. Det er den bevisste prisen for at
signeringen aldri skal kunne feile på grunn av en e-post.

Edge functionen logger avvisninger fra Resend, så de er synlige i
funksjonsloggen i Supabase.

## Utrulling

Alt kjøres fra Supabase-dashboardet. Filene ligger i repoet for sporing, men
limes inn manuelt.

1. `create extension if not exists pg_net;`
2. Migrasjon: `notify_email`, `varsel_oppsett`, triggerfunksjon, triggere
3. Fyll `varsel_oppsett` med URL og en tilfeldig hemmelighet
4. Opprett edge function `varsel-epost`, `verify_jwt = false`
5. Sett hemmelighetene `RESEND_API_KEY`, `VARSEL_NOKKEL`, `VARSEL_FRA`, `APP_URL`
6. Fyll ut «Varsel-e-post» i Innstillinger

## Verifisering

Emne og brødtekst legges i `supabase/functions/varsel-epost/tekst.ts` som en ren
funksjon uten Deno-API. Da kan edge functionen importere den som nabofil, mens
`node --experimental-strip-types` kjører den samme filen i en test — uten at
koden finnes to steder. Testen legges inn i `bun test` ved siden av de andre.

Det er i teksten feilene faktisk blir synlige for deg: et beløp med feil antall
desimaler, en dato i amerikansk format, eller en begrunnelseslinje som står der
tom fordi kunden ikke skrev noe.

- **Tekstbyggingen:** enhetstestet — begge hendelser, begge dokumenttyper,
  manglende begrunnelse, manglende beløp, norsk tall- og datoformat
- **Innstillingsfeltet:** lagres og leses tilbake
- **Ende til ende:** avslå et testtilbud via en ekte signeringslenke og bekreft
  at mailen kommer fram

Resten av edge functionen — nøkkelsjekk, oppslag, kallet til Resend — får ikke
enhetstester; den delen er I/O mot tjenester som ikke finnes i testmiljøet,
samme grunn til at `sms-inn` er uten. Den verifiseres med en ekte utsending.

## Kjente forbehold

**Testdomenet.** Så lenge avsenderen er `onboarding@resend.dev`, er det etter
alt å dømme bare kontoens egen adresse som kan motta. Det er ikke bekreftet i
Resend sin dokumentasjon, så det avgjøres av den første testutsendingen. Blir
den avvist, er neste steg å verifisere `haugemaskin.no` med tre DNS-oppføringer
— og da er det `VARSEL_FRA` som endres, ingenting annet.

**Én adresse per firma.** Skal flere personer varsles, må det løses med en
distribusjonsliste i e-postsystemet. Å gjøre feltet til en liste er en liten
endring senere, men står utenfor dette.
