# Varsel ved kundesvar — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sende e-post til firmaets varseladresse når en kunde signerer eller avslår et tilbud eller et krav om endring via signeringslenken.

**Architecture:** En `after update`-trigger på `offers` og `amendments` oppdager kundens svar og sender `{type, id, hendelse}` videre med `pg_net` til edge functionen `varsel-epost`, som slår opp resten selv og sender via Resend. Utløseren ligger i en trigger og ikke i de fire RPC-ene, slik at varselet følger signaturen uansett hvilken vei den blir satt.

**Tech Stack:** Postgres (pg_net, plpgsql), Supabase Edge Functions (Deno), Resend HTTP-API, React + TanStack Router, node `--experimental-strip-types` for tester.

**Spec:** `docs/superpowers/specs/2026-09-22-varsel-ved-kundesvar-design.md`

## Global Constraints

- **Språk:** all tekst, alle kommentarer og alle commit-meldinger på **bokmål**.
- **Pakkehandterer:** `bun`, aldri `npm i` — `bun.lock` er sporet.
- **Utrulling:** alt SQL og alle edge functions rulles ut fra **Supabase-dashboardet** i nettleseren. Filene ligger i repoet for sporing, men kjøres ikke herfra.
- **Prosjekt-id i Supabase:** `rmlczuhipndlvfvkpznm`
- **Hemmeligheter ligger i Supabase, aldri i repoet eller i `.env`:** `RESEND_API_KEY` (satt), `VARSEL_NOKKEL`, `VARSEL_FRA`, `APP_URL`.
- **Avsender inntil videre:** `onboarding@resend.dev` via `VARSEL_FRA`.
- **Tom `notify_email` betyr av.** Ingen skal få uventet e-post fordi en migrasjon ble kjørt.
- **Manuelle godkjenninger varsles ikke** (`signature_method` = `papir`/`muntlig`/`epost`).
- **Tidssone:** all dato og klokkeslett i e-post formateres i `Europe/Oslo`. Edge functionen kjører i UTC; uten dette viser mailen feil klokkeslett.

---

## Filstruktur

| Fil | Ansvar |
|---|---|
| `supabase/functions/varsel-epost/tekst.ts` | **Ny.** Ren funksjon: data inn → emne og brødtekst ut. Ingen Deno-API, så node kan kjøre den i test. |
| `supabase/functions/varsel-epost/tekst.test.ts` | **Ny.** Tester for formatering, begge hendelser, begge dokumenttyper. |
| `supabase/functions/varsel-epost/index.ts` | **Ny.** Nøkkelsjekk, oppslag i basen, kall til Resend. All I/O. |
| `supabase/migrations/20260922000000_varsel_ved_kundesvar.sql` | **Ny.** `notify_email`, `varsel_oppsett`, triggerfunksjon, triggere. |
| `supabase/config.toml` | **Endres.** `verify_jwt = false` for `varsel-epost`. |
| `src/hooks/use-app-settings.ts` | **Endres.** `notify_email` i `AppSettings` og `DEFAULT_SETTINGS`. |
| `src/routes/settings.tsx` | **Endres.** Feltet «Varsel-e-post» i en ny «Varsler»-seksjon. |
| `package.json` | **Endres.** `tekst.test.ts` inn i `test`-scriptet. |

Tekstbyggingen skilles fra I/O nettopp fordi det er i teksten feilene blir synlige for brukeren — feil tallformat, feil klokkeslett, en tom begrunnelseslinje. Den delen skal kunne testes uten nett, uten base og uten Deno.

---

### Task 1: Tekstbyggingen

**Files:**
- Create: `supabase/functions/varsel-epost/tekst.ts`
- Test: `supabase/functions/varsel-epost/tekst.test.ts`
- Modify: `package.json` (test-scriptet)

**Interfaces:**
- Consumes: ingenting — første oppgave.
- Produces: `byggVarsel(d: VarselData): Varselmelding`, typene `VarselData`, `Varselmelding`, `Hendelse = "signert" | "avslaatt"`, `DokumentType = "offer" | "amendment"`. Task 4 importerer disse fra `./tekst.ts`.

- [ ] **Steg 1: Skriv den feilende testen**

Opprett `supabase/functions/varsel-epost/tekst.test.ts`:

```ts
// Tester for teksten i varselmailen. Kjøres av `bun test`.
//
// Dette er den delen brukeren faktisk ser. Et beløp med feil antall desimaler
// eller et klokkeslett i UTC er ikke en teknisk detalj — det er en mail som
// sier at kunden svarte klokka 12:54 når hun svarte 14:54.

import { byggVarsel, type VarselData } from "./tekst.ts";

let feil = 0;
let ok = 0;
function sjekk(navn: string, faktisk: unknown, forventet: unknown) {
  const a = JSON.stringify(faktisk);
  const b = JSON.stringify(forventet);
  if (a === b) ok++;
  else {
    feil++;
    console.log(`  FEIL  ${navn}\n        fikk:      ${a}\n        forventet: ${b}`);
  }
}

const grunnlag: VarselData = {
  type: "offer",
  hendelse: "avslaatt",
  nummer: "1010",
  tittel: "VA Skardheie",
  kunde: "Åseral Kommune",
  svartAv: "Hilde Stuestøl Berg",
  tidspunkt: "2026-09-22T12:54:00Z", // 14:54 norsk sommertid
  belop: 6521080,
  begrunnelse: "Vi går for et annet tilbud på delkontrakt 2.",
  prosjektRef: null,
  lenke: "https://tilbudssystem-mal.vercel.app/tilbud/4c28d2c8",
};

console.log("\n--- Emnefeltet ---");

sjekk("tilbud avslått", byggVarsel(grunnlag).emne,
  "Tilbud #1010 avslått av Åseral Kommune");
sjekk("tilbud signert", byggVarsel({ ...grunnlag, hendelse: "signert" }).emne,
  "Tilbud #1010 signert av Åseral Kommune");
sjekk("krav avslått", byggVarsel({ ...grunnlag, type: "amendment", nummer: "3" }).emne,
  "Krav om endring #3 avslått av Åseral Kommune");
sjekk("krav signert", byggVarsel({ ...grunnlag, type: "amendment", nummer: "3", hendelse: "signert" }).emne,
  "Krav om endring #3 signert av Åseral Kommune");

console.log("\n--- Norsk tid, ikke UTC ---");

// Serveren kjører UTC. 12:54Z er 14:54 i Norge om sommeren og 13:54 om vinteren.
sjekk("sommertid", byggVarsel(grunnlag).tekst.includes("22.09.2026 kl. 14:54"), true);
sjekk("vintertid", byggVarsel({ ...grunnlag, tidspunkt: "2026-01-15T12:54:00Z" })
  .tekst.includes("15.01.2026 kl. 13:54"), true);

console.log("\n--- Beløp i norsk format ---");

sjekk("tusenskille og desimaler", byggVarsel(grunnlag).tekst.includes("6 521 080,00 kr"), true);
sjekk("uten desimaler i tallet", byggVarsel({ ...grunnlag, belop: 1000 })
  .tekst.includes("1 000,00 kr"), true);
sjekk("ingen harde mellomrom", / | /.test(byggVarsel(grunnlag).tekst), false);

console.log("\n--- Begrunnelse ---");

sjekk("med begrunnelse", byggVarsel(grunnlag).tekst.includes("Vi går for et annet tilbud"), true);
sjekk("uten begrunnelse gir ingen tom linje",
  byggVarsel({ ...grunnlag, begrunnelse: null }).tekst.includes("Begrunnelse"), false);
sjekk("signert har aldri begrunnelse",
  byggVarsel({ ...grunnlag, hendelse: "signert" }).tekst.includes("Begrunnelse"), false);

console.log("\n--- Felter som kan mangle ---");

sjekk("uten beløp utgår beløpslinja",
  byggVarsel({ ...grunnlag, belop: null }).tekst.includes("Beløp"), false);
sjekk("uten navn står det ikke tomt",
  byggVarsel({ ...grunnlag, svartAv: "" }).tekst.includes("Avslått av:"), false);
sjekk("krav viser prosjektreferansen",
  byggVarsel({ ...grunnlag, type: "amendment", nummer: "3", prosjektRef: "2026118" })
    .tekst.includes("2026118"), true);

console.log("\n--- Lenka skal alltid med ---");

for (const h of ["signert", "avslaatt"] as const) {
  sjekk(`lenke ved ${h}`,
    byggVarsel({ ...grunnlag, hendelse: h }).tekst.includes(grunnlag.lenke), true);
}

console.log(`\n${ok} i orden, ${feil} feil`);
process.exit(feil ? 1 : 0);
```

- [ ] **Steg 2: Kjør testen og se at den feiler**

```bash
node --experimental-strip-types supabase/functions/varsel-epost/tekst.test.ts
```

Forventet: `ERR_MODULE_NOT_FOUND` for `./tekst.ts`.

- [ ] **Steg 3: Skriv implementasjonen**

Opprett `supabase/functions/varsel-epost/tekst.ts`:

```ts
// Teksten i varselmailen.
//
// Ligger for seg selv, uten Deno-API, av to grunner: edge functionen
// importerer den som nabofil, og node kan kjøre nøyaktig den samme filen i en
// test. Dermed finnes teksten ett sted, selv om den brukes i to kjøretider.
//
// Mailen leses på en telefon ute på et anlegg. Den skal si hva som skjedde i
// første linje, og tåle å bli lest i sollys.

export type Hendelse = "signert" | "avslaatt";
export type DokumentType = "offer" | "amendment";

export interface VarselData {
  type: DokumentType;
  hendelse: Hendelse;
  /** Tilbudsnummer eller endringsnummer, uten «#» */
  nummer: string;
  tittel: string;
  kunde: string;
  /** Navnet kunden skrev inn da de signerte eller avslo */
  svartAv: string;
  /** ISO-tidspunkt fra basen, i UTC */
  tidspunkt: string;
  /** Eks. mva. Null når summen ikke er kjent. */
  belop: number | null;
  begrunnelse: string | null;
  /** Bare for krav om endring */
  prosjektRef: string | null;
  lenke: string;
}

export interface Varselmelding {
  emne: string;
  tekst: string;
}

// Intl setter harde mellomrom som tusenskille. De ser like ut i en e-postklient
// helt til de ikke gjør det — noen klienter viser dem som «Â». Vi bytter dem
// til vanlige mellomrom, som også gjør testene til å stole på.
const mykneMellomrom = (s: string) => s.replace(/[  ]/g, " ");

function norskTid(iso: string): string {
  const d = new Date(iso);
  const dato = new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Oslo",
  }).format(d);
  const klokke = new Intl.DateTimeFormat("nb-NO", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo",
  }).format(d);
  return `${dato} kl. ${klokke}`;
}

function norskeKroner(n: number): string {
  return mykneMellomrom(
    new Intl.NumberFormat("nb-NO", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n),
  ) + " kr";
}

export function byggVarsel(d: VarselData): Varselmelding {
  const hva = d.type === "offer" ? `Tilbud #${d.nummer}` : `Krav om endring #${d.nummer}`;
  const gjort = d.hendelse === "signert" ? "signert" : "avslått";
  const emne = `${hva} ${gjort} av ${d.kunde}`;

  const verb = d.hendelse === "signert" ? "signerte" : "avslo";
  const apning = d.type === "offer"
    ? `${d.kunde} ${verb} tilbud #${d.nummer} «${d.tittel}»`
    : `${d.kunde} ${verb} krav om endring #${d.nummer}${d.prosjektRef ? ` på prosjekt ${d.prosjektRef}` : ""}`;

  // Bare linjer vi faktisk har innhold til. En rad som står igjen tom ser ut
  // som en feil i systemet, ikke som informasjon vi mangler.
  const rader: string[] = [];
  if (d.svartAv.trim()) {
    rader.push(`${d.hendelse === "signert" ? "Signert av" : "Avslått av"}:  ${d.svartAv.trim()}`);
  }
  if (d.belop !== null) rader.push(`Beløp:        ${norskeKroner(d.belop)} eks. mva`);
  if (d.hendelse === "avslaatt" && d.begrunnelse?.trim()) {
    rader.push(`Begrunnelse:  «${d.begrunnelse.trim()}»`);
  }

  const tekst = [
    `${apning}`,
    `den ${norskTid(d.tidspunkt)}.`,
    "",
    ...rader,
    "",
    `${d.type === "offer" ? "Åpne tilbudet" : "Åpne kravet"}: ${d.lenke}`,
  ].join("\n");

  return { emne, tekst };
}
```

- [ ] **Steg 4: Kjør testen og se at den passerer**

```bash
node --experimental-strip-types supabase/functions/varsel-epost/tekst.test.ts
```

Forventet: `17 i orden, 0 feil`

- [ ] **Steg 5: Legg testen inn i testsuiten**

I `package.json`, legg til sist i `test`-scriptet:

```
 && node --experimental-strip-types supabase/functions/varsel-epost/tekst.test.ts
```

Kjør hele suiten og se at alt er grønt:

```bash
bun run test
```

- [ ] **Steg 6: Commit**

```bash
git add supabase/functions/varsel-epost/tekst.ts supabase/functions/varsel-epost/tekst.test.ts package.json
git commit -m "Teksten i varselmailen, med norsk tid og norske kroner"
```

---

### Task 2: Varsel-e-post i Innstillinger

**Files:**
- Modify: `src/hooks/use-app-settings.ts`
- Modify: `src/routes/settings.tsx`
- Create: `supabase/migrations/20260922000000_varsel_ved_kundesvar.sql` (bare kolonnen i denne oppgaven; Task 3 utvider samme fil)

**Interfaces:**
- Consumes: ingenting fra Task 1.
- Produces: i basen `app_settings.notify_email text` og de fire `boolean`-kolonnene `notify_offer_signed`, `notify_offer_rejected`, `notify_amendment_signed`, `notify_amendment_rejected`. I klienten de samme fem feltene på `AppSettings`. Task 4 leser alle fem fra edge functionen.

- [ ] **Steg 1: Opprett migrasjonsfilen med kolonnen**

Opprett `supabase/migrations/20260922000000_varsel_ved_kundesvar.sql`:

```sql
-- Varsel på e-post når kunden signerer eller avslår.
--
-- Kundens svar kommer i dag ikke til oss — vi må gå og se etter. Et avslag kan
-- bli liggende i «Aktive» og bli fulgt opp av folk som tror tilbudet fortsatt
-- er i spill, og en signatur kan bli liggende et døgn før noen setter i gang.

-- ─── Hvor varselet skal ─────────────────────────────────────────────────────
-- Tom betyr av. Ingen skal få uventet e-post fordi denne migrasjonen ble kjørt;
-- varslene starter først når noen selv fyller ut feltet i Innstillinger.
alter table public.app_settings
  add column if not exists notify_email text not null default '';

comment on column public.app_settings.notify_email is
  'Adressen varsler om kundesvar går til. Tom = varsling er av for dette firmaet.';

-- ─── Hva firmaet vil vite om ────────────────────────────────────────────────
-- Alle står på, men notify_email er tom. Et firma som fyller ut adressen får
-- dermed alt, og skrur av det som viser seg å bli støy — den som nettopp slo
-- på varsling vet ennå ikke hva de kommer til å slutte å lese.
alter table public.app_settings
  add column if not exists notify_offer_signed        boolean not null default true,
  add column if not exists notify_offer_rejected      boolean not null default true,
  add column if not exists notify_amendment_signed    boolean not null default true,
  add column if not exists notify_amendment_rejected  boolean not null default true;

comment on column public.app_settings.notify_offer_signed is
  'Varsle når kunden signerer et tilbud.';
comment on column public.app_settings.notify_offer_rejected is
  'Varsle når kunden avslår et tilbud.';
comment on column public.app_settings.notify_amendment_signed is
  'Varsle når kunden signerer et krav om endring.';
comment on column public.app_settings.notify_amendment_rejected is
  'Varsle når kunden avslår et krav om endring.';
```

- [ ] **Steg 2: Kjør migrasjonen i Supabase-dashboardet**

Åpne SQL Editor i prosjekt `rmlczuhipndlvfvkpznm`, lim inn innholdet over, kjør. Bekreft med:

```sql
select column_name, data_type, column_default
  from information_schema.columns
 where table_name = 'app_settings' and column_name like 'notify%'
 order by column_name;
```

Forventet: fem rader — `notify_email` som `text` med default `''::text`, og de
fire `notify_*`-flaggene som `boolean` med default `true`.

- [ ] **Steg 3: Legg feltene i typene**

I `src/hooks/use-app-settings.ts`, i `interface AppSettings`, etter `company_org_nr: string;`:

```ts
  /** Hvor varsler om kundesvar skal. Tom betyr at varsling er av. */
  notify_email: string;
  notify_offer_signed: boolean;
  notify_offer_rejected: boolean;
  notify_amendment_signed: boolean;
  notify_amendment_rejected: boolean;
```

Og i `DEFAULT_SETTINGS`, etter `company_org_nr: "",`:

```ts
  notify_email: "",
  notify_offer_signed: true,
  notify_offer_rejected: true,
  notify_amendment_signed: true,
  notify_amendment_rejected: true,
```

- [ ] **Steg 4: Legg feltene i grensesnittet**

Sjekk først at `Checkbox` er importert øverst i `src/routes/settings.tsx`; er den ikke det, legg til:

```tsx
import { Checkbox } from "@/components/ui/checkbox";
```

Ved siden av de andre `useState`-linjene (nær `const [emailSubject, setEmailSubject] = useState(...)` på linje 258):

```tsx
  const [notifyEmail, setNotifyEmail] = useState(DEFAULT_SETTINGS.notify_email);
  // Ett flagg per hendelse, i ett objekt: da er avkrysningene under én løkke
  // og ikke fire nesten like blokker som skal holdes i takt for hånd.
  const [varsler, setVarsler] = useState({
    notify_offer_signed: true,
    notify_offer_rejected: true,
    notify_amendment_signed: true,
    notify_amendment_rejected: true,
  });
```

I funksjonen som fyller skjemaet fra lagrede innstillinger (ved `setEmailSubject(saved.email_subject_template);`, linje 274):

```tsx
    setNotifyEmail(saved.notify_email);
    setVarsler({
      notify_offer_signed: saved.notify_offer_signed,
      notify_offer_rejected: saved.notify_offer_rejected,
      notify_amendment_signed: saved.notify_amendment_signed,
      notify_amendment_rejected: saved.notify_amendment_rejected,
    });
```

I objektet som lagres (ved `email_subject_template: emailSubject,`, linje 289):

```tsx
    notify_email: notifyEmail,
    ...varsler,
```

Legg så en egen seksjon rett etter `</SectionCard>` som avslutter «E-post»-seksjonen (linje 480). Innpakningen heter `SectionCard` og brukes slik filen allerede gjør det på linje 462:

```tsx
      {/* Varsler */}
      <SectionCard
        title="Varsler"
        description="Få beskjed på e-post når en kunde svarer på et tilbud eller et krav om endring"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Varsel-e-post</Label>
            <Input
              type="email"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              placeholder="post@firma.no"
              className="max-w-sm"
            />
            <p className="text-xs text-muted-foreground">
              La feltet stå tomt for å slå av varslingen helt.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Varsle meg når</Label>
            {([
              ["notify_offer_signed", "kunden signerer et tilbud"],
              ["notify_offer_rejected", "kunden avslår et tilbud"],
              ["notify_amendment_signed", "kunden signerer et krav om endring"],
              ["notify_amendment_rejected", "kunden avslår et krav om endring"],
            ] as const).map(([noekkel, tekst]) => (
              <label key={noekkel} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={varsler[noekkel]}
                  disabled={!notifyEmail.trim()}
                  onCheckedChange={(v) => setVarsler((s) => ({ ...s, [noekkel]: !!v }))}
                />
                <span className={notifyEmail.trim() ? "" : "text-muted-foreground"}>
                  {tekst}
                </span>
              </label>
            ))}
            {!notifyEmail.trim() && (
              <p className="text-xs text-muted-foreground">
                Skriv inn en e-postadresse over for å velge hva du vil varsles om.
              </p>
            )}
          </div>
        </div>
      </SectionCard>
```

Avkrysningene gråes ut når adressen er tom. Uten det ville skjermen vist fire
avhukede valg på et firma som ikke får varsler i det hele tatt — og det er en
skjerm som lyver.

`Label` er allerede importert i filen; `Checkbox` er det ikke, og må legges til
slik steget åpner med.

- [ ] **Steg 5: Kjør lint og typesjekk på de endrede filene**

```bash
node node_modules/eslint/bin/eslint.js src/hooks/use-app-settings.ts
```

Forventet: ingen nye feil.

Merk: `node node_modules/typescript/bin/tsc --noEmit` gir 114 forhåndseksisterende feil i dette repoet fordi `src/integrations/supabase/types.ts` er utdatert. Tell feilene før og etter, og bekreft at tallet er uendret — ikke at det er null.

- [ ] **Steg 6: Prøv seksjonen i appen**

```bash
bun run dev
```

Gå til Innstillinger og sjekk fire ting:

1. Med tomt e-postfelt er alle fire avkrysningene grå og ikke klikkbare
2. Skriver du inn en adresse, blir de klikkbare og alle fire er avhuket
3. Fjern huken på «kunden avslår et krav om endring», lagre, last siden på nytt — huken skal fortsatt være borte
4. Tøm e-postfeltet, lagre, last på nytt — adressen skal være tom, og avkrysningene skal stå slik du satte dem

Punkt 4 er verdt å sjekke særskilt: slår du varslingen av og på igjen, skal du ikke måtte sette opp valgene på nytt.

- [ ] **Steg 7: Commit**

```bash
git add supabase/migrations/20260922000000_varsel_ved_kundesvar.sql src/hooks/use-app-settings.ts src/routes/settings.tsx
git commit -m "Varsel-e-post i Innstillinger, med valg av hva det varsles om"
```

---

### Task 3: Trigger som fanger kundens svar

**Files:**
- Modify: `supabase/migrations/20260922000000_varsel_ved_kundesvar.sql` (legges til på slutten)

**Interfaces:**
- Consumes: `app_settings.notify_email` fra Task 2 (ikke lest her, men samme migrasjonsfil).
- Produces: tabellen `varsel_oppsett` og triggere som sender `{type, id, hendelse}` til `funksjon_url`. Task 4 tar imot nøyaktig denne kroppen.

- [ ] **Steg 1: Legg resten av migrasjonen til i filen**

Legg til på slutten av `supabase/migrations/20260922000000_varsel_ved_kundesvar.sql`:

```sql
-- ─── pg_net ─────────────────────────────────────────────────────────────────
-- Lar basen sende en HTTP-forespørsel uten å vente på svaret.
create extension if not exists pg_net;

-- ─── Hvor edge functionen bor ───────────────────────────────────────────────
-- Global drift, ikke firmadata: ett firma skal ikke kunne lese en hemmelighet
-- som gjelder alle. Derfor egen tabell og ikke en kolonne i app_settings.
create table if not exists public.varsel_oppsett (
  id               boolean primary key default true check (id),
  funksjon_url     text not null default '',
  delt_hemmelighet text not null default ''
);

comment on table public.varsel_oppsett is
  'Én rad. Adressen til varsel-epost-funksjonen og nøkkelen triggeren legitimerer seg med.';

insert into public.varsel_oppsett (id) values (true) on conflict (id) do nothing;

-- RLS på, og med vilje ingen policy: da slipper verken anon eller innloggede
-- til, mens security definer-funksjoner og service-role leser som før.
alter table public.varsel_oppsett enable row level security;

-- ─── Triggeren ──────────────────────────────────────────────────────────────
create or replace function public.varsle_kundesvar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hendelse text;
  v_oppsett  public.varsel_oppsett;
  v_type     text;
begin
  -- Bare kundens egne svar. signature_method er alt satt av
  -- stemple_manuell_godkjenning, som er en before-trigger, så en
  -- papirgodkjenning vi registrerer selv siler seg ut her.
  if new.customer_signed_at is not null
     and old.customer_signed_at is distinct from new.customer_signed_at
     and coalesce(new.signature_method, 'digital') = 'digital' then
    v_hendelse := 'signert';
  elsif new.rejected_at is not null
     and old.rejected_at is distinct from new.rejected_at then
    v_hendelse := 'avslaatt';
  else
    return new;
  end if;

  select * into v_oppsett from public.varsel_oppsett where id limit 1;
  if not found or btrim(coalesce(v_oppsett.funksjon_url, '')) = '' then
    return new;
  end if;

  v_type := case tg_table_name when 'offers' then 'offer' else 'amendment' end;

  -- Bare type, id og hendelse. Funksjonen slår opp resten selv, så den som
  -- måtte få tak i kallet ikke kan diktere hva det står i e-posten.
  begin
    perform net.http_post(
      url     := v_oppsett.funksjon_url,
      headers := jsonb_build_object(
                   'Content-Type',    'application/json',
                   'x-varsel-nokkel', v_oppsett.delt_hemmelighet
                 ),
      body    := jsonb_build_object('type', v_type, 'id', new.id, 'hendelse', v_hendelse)
    );
  exception when others then
    -- En e-post som ikke går skal aldri rulle tilbake en signatur kunden har
    -- avgitt. Signeringen er det viktige; varselet er en tjeneste til oss.
    null;
  end;

  return new;
end;
$$;

drop trigger if exists offers_varsle_kundesvar on public.offers;
create trigger offers_varsle_kundesvar
  after update of customer_signed_at, rejected_at on public.offers
  for each row execute function public.varsle_kundesvar();

drop trigger if exists amendments_varsle_kundesvar on public.amendments;
create trigger amendments_varsle_kundesvar
  after update of customer_signed_at, rejected_at on public.amendments
  for each row execute function public.varsle_kundesvar();
```

- [ ] **Steg 2: Kjør den nye delen i SQL Editor**

Lim inn alt fra `create extension if not exists pg_net;` og ut, kjør.

Feiler `create extension`, er pg_net ikke tilgjengelig på prosjektet. Da stopper planen her — si fra framfor å gå videre, for hele utløseren hviler på den.

- [ ] **Steg 3: Bekreft at triggerne finnes**

```sql
select tgname, tgrelid::regclass as tabell
  from pg_trigger
 where tgname in ('offers_varsle_kundesvar', 'amendments_varsle_kundesvar');
```

Forventet: to rader.

- [ ] **Steg 4: Bekreft at tabellen er stengt for vanlige brukere**

```sql
select relrowsecurity from pg_class where relname = 'varsel_oppsett';
select count(*) from pg_policies where tablename = 'varsel_oppsett';
```

Forventet: `true` og `0`. RLS på uten policy er det som stenger den.

- [ ] **Steg 5: Se at triggeren ikke fyrer på manuell godkjenning**

I SQL Editor, på et testtilbud du kan rote med:

```sql
select count(*) as for_test from net._http_response;

update public.offers
   set signature_method = 'papir', customer_signed_at = now()
 where id = '<uuid-til-et-testtilbud>';

select count(*) as etter_manuell from net._http_response;
```

Forventet: samme tall. Ingen forespørsel sendt.

- [ ] **Steg 6: Commit**

```bash
git add supabase/migrations/20260922000000_varsel_ved_kundesvar.sql
git commit -m "Trigger som fanger kundens svar og sender det videre"
```

---

### Task 4: Edge function varsel-epost

**Files:**
- Create: `supabase/functions/varsel-epost/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `byggVarsel`, `VarselData`, `Hendelse`, `DokumentType` fra `./tekst.ts` (Task 1). Kroppen `{type, id, hendelse}` fra Task 3. Kolonnene `notify_email` og de fire `notify_*`-flaggene fra Task 2.
- Produces: HTTP-endepunktet `/functions/v1/varsel-epost`.

- [ ] **Steg 1: Skriv funksjonen**

Opprett `supabase/functions/varsel-epost/index.ts`:

```ts
// Sender varsel på e-post når en kunde har signert eller avslått.
//
// Rulles ut med:
//   supabase functions deploy varsel-epost --no-verify-jwt
//
// --no-verify-jwt er nødvendig fordi det er en databasetrigger som ringer, og
// den har ingen Supabase-innlogging. Tilgangen styres i stedet av nøkkelen
// under, på samme måte som sms-inn gjør det.
//
// Triggeren sender bare {type, id, hendelse}. Alt annet slås opp her, slik at
// den som måtte få tak i kallet ikke kan bestemme hva det står i e-posten
// eller hvem den går til.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { byggVarsel, type DokumentType, type Hendelse, type VarselData } from "./tekst.ts";

function svar(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return svar(405, { error: "Bruk POST" });

  // Samme svar på manglende og feil nøkkel, så endepunktet ikke kan brukes til
  // å finne ut hvilke nøkler som finnes.
  const nokkel = req.headers.get("x-varsel-nokkel") ?? "";
  const fasit = Deno.env.get("VARSEL_NOKKEL") ?? "";
  if (!fasit || nokkel !== fasit) return svar(401, { error: "Ugyldig nøkkel" });

  const { type, id, hendelse } = await req.json().catch(() => ({}));
  if (type !== "offer" && type !== "amendment") return svar(400, { error: "Ukjent type" });
  if (hendelse !== "signert" && hendelse !== "avslaatt") return svar(400, { error: "Ukjent hendelse" });
  if (!id) return svar(400, { error: "Mangler id" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const tabell = type === "offer" ? "offers" : "amendments";
  const { data: sak, error: oppslag } = await supabase
    .from(tabell)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (oppslag || !sak) return svar(404, { error: "Fant ikke saken" });

  const { data: innst } = await supabase
    .from("app_settings")
    .select(
      "notify_email, notify_offer_signed, notify_offer_rejected, " +
        "notify_amendment_signed, notify_amendment_rejected",
    )
    .eq("tenant_id", sak.tenant_id)
    .maybeSingle();

  const mottaker = (innst?.notify_email ?? "").trim();
  // Tomt felt betyr at firmaet ikke har slått på varsling. Det er ikke en feil.
  if (!mottaker) return svar(200, { ok: true, hoppet_over: "ingen varsel-e-post satt" });

  // Firmaet velger selv hva som er verdt en e-post.
  const flagg = {
    offer: { signert: "notify_offer_signed", avslaatt: "notify_offer_rejected" },
    amendment: {
      signert: "notify_amendment_signed",
      avslaatt: "notify_amendment_rejected",
    },
  }[type as DokumentType][hendelse as Hendelse];

  // Bare et uttrykkelig false stopper varselet. Er kolonnen ikke der — en base
  // som ikke har fått migrasjonen ennå — sender vi heller. Et varsel for mye er
  // til å leve med; et som forsvinner uten spor er ikke det.
  if ((innst as Record<string, unknown> | null)?.[flagg] === false) {
    return svar(200, { ok: true, hoppet_over: `${flagg} er av` });
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
  const data: VarselData = {
    type: type as DokumentType,
    hendelse: hendelse as Hendelse,
    nummer: String(sak.offer_number ?? sak.amendment_number ?? ""),
    tittel: String(sak.title ?? ""),
    kunde: String(sak.customer_name ?? ""),
    svartAv: String(
      hendelse === "signert" ? (sak.customer_signed_by ?? "") : (sak.rejected_by ?? ""),
    ),
    tidspunkt: String(
      (hendelse === "signert" ? sak.customer_signed_at : sak.rejected_at) ??
        new Date().toISOString(),
    ),
    belop: typeof sak.total_amount === "number" ? sak.total_amount : null,
    begrunnelse: sak.rejected_note ?? null,
    prosjektRef: type === "amendment" ? (sak.project_ref ?? null) : null,
    lenke: `${appUrl}/${type === "offer" ? "tilbud" : "endringsmeldinger"}/${id}`,
  };

  const { emne, tekst } = byggVarsel(data);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("VARSEL_FRA") ?? "onboarding@resend.dev",
      to: [mottaker],
      subject: emne,
      text: tekst,
    }),
  });

  if (!res.ok) {
    // Logges slik at det er synlig i funksjonsloggen. Triggeren venter ikke på
    // svaret vårt, så dette er eneste stedet feilen blir sett.
    const detalj = await res.text();
    console.error(`Resend avviste varselet (${res.status}): ${detalj}`);
    return svar(502, { error: "Resend avviste varselet", status: res.status });
  }

  return svar(200, { ok: true });
});
```

- [ ] **Steg 2: Sjekk feltnavnene mot den faktiske basen**

`select *` over henter alt, men feltnavnene i `data`-objektet må finnes. Kjør i SQL Editor:

```sql
select column_name from information_schema.columns
 where table_name = 'offers'
   and column_name in ('offer_number','title','customer_name','customer_signed_by','customer_signed_at','rejected_by','rejected_at','rejected_note','total_amount','tenant_id')
 order by column_name;

select column_name from information_schema.columns
 where table_name = 'amendments'
   and column_name in ('amendment_number','title','customer_name','customer_signed_by','customer_signed_at','rejected_by','rejected_at','rejected_note','total_amount','project_ref','tenant_id')
 order by column_name;
```

Mangler et felt, rett navnet i `index.ts` før utrulling. `types.ts` i repoet er utdatert og kan ikke brukes som fasit her — basen er fasit.

- [ ] **Steg 3: Skru av JWT-kravet**

Legg til sist i `supabase/config.toml`:

```toml
# Det er en databasetrigger som ringer denne, og den har ingen Supabase-
# innlogging. Uten denne linja avvises hvert varsel med 401 så snart noen
# ruller ut funksjonen på nytt. Tilgangen styres av x-varsel-nokkel i stedet.
[functions.varsel-epost]
verify_jwt = false
```

- [ ] **Steg 4: Opprett funksjonen i dashboardet**

Supabase → Edge Functions → *Deploy a new function* → navn `varsel-epost`. Lim inn `index.ts` og `tekst.ts` som to filer. Slå av «Verify JWT».

- [ ] **Steg 5: Sett de tre hemmelighetene som mangler**

Edge Functions → Secrets. `RESEND_API_KEY` er alt satt:

| Navn | Verdi |
|---|---|
| `VARSEL_NOKKEL` | En tilfeldig streng, f.eks. fra `select encode(gen_random_bytes(24), 'hex');` |
| `VARSEL_FRA` | `onboarding@resend.dev` |
| `APP_URL` | `https://tilbudssystem-mal.vercel.app` |

- [ ] **Steg 6: Koble triggeren til funksjonen**

I SQL Editor, med den samme `VARSEL_NOKKEL`-verdien:

```sql
update public.varsel_oppsett
   set funksjon_url     = 'https://rmlczuhipndlvfvkpznm.supabase.co/functions/v1/varsel-epost',
       delt_hemmelighet = '<samme verdi som VARSEL_NOKKEL>'
 where id;
```

- [ ] **Steg 7: Prøv at feil nøkkel blir avvist**

```bash
curl -i -X POST "https://rmlczuhipndlvfvkpznm.supabase.co/functions/v1/varsel-epost" \
  -H "Content-Type: application/json" \
  -H "x-varsel-nokkel: feil-nokkel" \
  -d '{"type":"offer","id":"00000000-0000-0000-0000-000000000000","hendelse":"signert"}'
```

Forventet: `401` og `{"error":"Ugyldig nøkkel"}`.

- [ ] **Steg 8: Commit**

```bash
git add supabase/functions/varsel-epost/index.ts supabase/config.toml
git commit -m "Edge function som sender varselet via Resend"
```

---

### Task 5: Ende til ende

**Files:** ingen endringer med mindre noe feiler.

**Interfaces:**
- Consumes: alt fra Task 1–4.
- Produces: bekreftelse på at en ekte kundehandling gir en e-post i innboksen.

- [ ] **Steg 1: Fyll inn varseladressen**

I Innstillinger, sett «Varsel-e-post» til adressen Resend-kontoen er opprettet på. Med `onboarding@resend.dev` som avsender er det etter alt å dømme den eneste adressen som kan motta.

- [ ] **Steg 2: Lag et testtilbud med signeringslenke**

Opprett et tilbud med en liten sum og en tittel som er lett å kjenne igjen, og hent signeringslenken.

- [ ] **Steg 3: Avslå det gjennom lenken**

Åpne lenken i et privat vindu, avslå, skriv et navn og en begrunnelse.

- [ ] **Steg 4: Se etter mailen**

Forventet i innboksen innen et minutt:

```
Emne:  Tilbud #<nr> avslått av <kunde>
```

med navn, beløp, begrunnelse og en lenke som åpner tilbudet.

- [ ] **Steg 5: Kom mailen ikke, finn ut hvor det stoppet**

Gå lagvis, ikke gjett:

```sql
-- Sendte triggeren noe i det hele tatt?
select id, created, status_code, content
  from net._http_response
 order by created desc
 limit 5;
```

- Ingen rad → triggeren fyrte ikke. Sjekk at `varsel_oppsett.funksjon_url` er fylt ut, og at avslaget faktisk satte `rejected_at`.
- `401` → `delt_hemmelighet` og `VARSEL_NOKKEL` er ikke like.
- `200` med `hoppet_over: "ingen varsel-e-post satt"` → feltet i Innstillinger er tomt.
- `200` med `hoppet_over: "notify_… er av"` → avkrysningen for denne hendelsen er skrudd av. Svaret sier hvilken.
- `502` → Resend avviste. Les funksjonsloggen i dashboardet; er det testdomenet som ikke får sende til adressen, er det eget domene som er neste steg.

- [ ] **Steg 6: Prøv en signering også**

Gjenta med et nytt testtilbud, men signer i stedet. Bekreft at mailen sier «signert», og at det **ikke** står noen begrunnelseslinje.

- [ ] **Steg 7: Prøv et krav om endring**

Samme øvelse på en endringsmelding. Bekreft at emnet sier «Krav om endring #<nr>» og at prosjektreferansen står i teksten.

- [ ] **Steg 8: Prøv at avkrysningen faktisk stopper varselet**

Dette er hele poenget med valgene, og det er verdt å se med egne øyne.

I Innstillinger, fjern huken på «kunden avslår et tilbud» og lagre. Avslå så et nytt testtilbud gjennom lenken.

Forventet: **ingen e-post**, og i basen:

```sql
select status_code, content
  from net._http_response
 order by created desc
 limit 1;
```

`200` med `hoppet_over: "notify_offer_rejected er av"`.

Sett huken tilbake etterpå.

- [ ] **Steg 9: Rydd opp**

Slett testtilbudene og testkravet.

---

## Når planen er gjennomført

- Kundens svar kommer til deg uten at noen må gå og se etter
- Manuelle godkjenninger varsler ikke, så innboksen forblir verdt å lese
- Veien til eget avsenderdomene er én hemmelighet å endre: `VARSEL_FRA`
