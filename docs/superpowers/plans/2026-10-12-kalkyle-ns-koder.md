# Kalkyle med NS 3420-koder – implementeringsplan

> **For agentiske utførere:** PÅKREVD UNDER-SKILL: Bruk superpowers:subagent-driven-development (anbefalt) eller superpowers:executing-plans for å gjennomføre planen oppgave for oppgave. Stegene bruker avkrysning (`- [ ]`) for sporing.

**Mål:** En ny side «Kalkyle» i toppmenyen, der man regner på tilbud med NS 3420-koder fra en kodebank med egne enhetspriser, lagrer kalkylen, legger linjene inn i et tilbud og tar den ut som PDF.

**Arkitektur:**
- Utregning, søk, gruppering og overføring ligger som ren logikk i `src/lib/kalkyle.ts` og testes med Node.
- Tre nye tabeller (`ns_codes`, `calculations`, `calculation_lines`) med RLS per tenant, og `ns_code` på `offer_lines`. Alt kommer i én migrasjon som brukeren limer inn i SQL Editor.
- Overføringen til tilbud går gjennom tilbudsskjemaet via `sessionStorage`, aldri rett i `offer_lines`.

**Teknologi:** TanStack Start/Router (filbaserte ruter), TanStack Query, supabase-js, shadcn/ui, Tailwind v4, sonner, lucide-react, Bun.

**Spesifikasjon:** [docs/superpowers/specs/2026-10-12-kalkyle-ns-koder-design.md](../specs/2026-10-12-kalkyle-ns-koder-design.md). Les den før du starter.

## Globale krav

- All tekst, alle kommentarer og alle commit-meldinger skrives på **bokmål**.
- Pakkebehandler er **Bun**. Ikke kjør `npm i`, for det brekker Vercel-byggingen.
- Standardens beskrivelsestekst fra NS 3420 skal aldri inn i koden eller i basen. Bare koder, enheter og egne korte titler.
- `src/integrations/supabase/types.ts` er utdatert. Nye tabeller brukes via `db` fra `src/lib/kalkyle-db.ts`, og den genererte filen skal ikke endres.
- `tsc --noEmit` har 114 feil fra før. Kompilering sjekkes med `bun run build`.
- Tester kjøres med `bun run test`: Node med `--experimental-strip-types`, uten testrammeverk. Filer som testes kan bare importere relativt med `.ts`-endelse, ikke `@/`.
- Migrasjoner limes inn i Supabase SQL Editor av brukeren. Management-tokenet er utløpt, og service-role-nøkkelen mot PostgREST kan bare lese og skrive rader.
- Hver commit slutter med `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Filer

| Fil | Ansvar |
|---|---|
| `src/lib/kalkyle.ts` (ny) | typer, utregning, gruppering, kodesøk og overføring til tilbudslinjer. Ren logikk |
| `src/lib/kalkyle.test.ts` (ny) | tester for alt i `kalkyle.ts` |
| `src/lib/kalkyle-db.ts` (ny) | utypet supabase-klient for de nye tabellene |
| `scripts/ns-startpakke-sql.mjs` (ny) | lager VALUES-radene til startpakken fra `docs/ns3420-startliste.md` |
| `supabase/migrations/20261012000000_kalkyle_ns_koder.sql` (ny) | tabeller, RLS, startpakke, `offer_lines.ns_code` og RPC-en |
| `src/components/app-nav.tsx` | ny menylenke |
| `src/routes/kalkyle.index.tsx` (ny) | liste over kalkyler |
| `src/routes/kalkyle.kodebank.tsx` (ny) | kodebanken |
| `src/routes/kalkyle.ny.tsx`, `src/routes/kalkyle.$id.tsx` (nye) | tynne ruter rundt skjemaet |
| `src/components/calculation-form.tsx` (ny) | regnearket |
| `src/components/kalkyle-til-tilbud.tsx` (ny) | dialogen «Legg til i tilbud» |
| `src/lib/pdf.ts` | `openPrintPdf` får `targetWin`, ny `openCalculationPdf`, og «Kode»-kolonne i tilbuds-PDF-en |
| `src/components/offer-form.tsx` | `ns_code` på linjer, «Kode»-kolonne og import fra kalkyle |

---

### Oppgave 1: Ren kalkylelogikk med tester

**Filer:**
- Opprett: `src/lib/kalkyle.ts`
- Opprett: `src/lib/kalkyle.test.ts`
- Endre: `package.json` (skriptet `test`)

**Grensesnitt:**
- Bruker: `lineNet` fra `src/lib/format.ts` (antall × pris, overskrift gir 0)
- Leverer: `NsKode`, `KalkyleLinje`, `KalkyleSummer`, `KalkyleGruppe`, `TilbudslinjeFraKalkyle`, `KalkyleImport`, `beregnKalkyle(linjer, paaslagPct, mvaPct)`, `grupperKalkyle(linjer)`, `sammenlignKoder(a, b)`, `sokKoder(koder, q, maks?)`, `linjeFraKode(kode)`, `tomLinje(enhet)`, `tomOverskrift()`, `kalkyleTilTilbudslinjer(navn, linjer, startIndex)`, `kalkyleImportNokkel(offerId?)`

- [ ] **Steg 1: Skriv testene**

`src/lib/kalkyle.test.ts`:

```ts
// Tester for kalkylelogikken. Kjøres med `bun run test` — ingen testrammeverk,
// bare Node som stripper typene selv.
//
// Det som teller her: summen i kalkylen skal stemme med det tilbudet viser
// etterpå, og påslaget skal ikke bli regnet to ganger når linjene flyttes over.

import {
  beregnKalkyle,
  grupperKalkyle,
  sokKoder,
  linjeFraKode,
  kalkyleTilTilbudslinjer,
  kalkyleImportNokkel,
  type KalkyleLinje,
  type NsKode,
} from "./kalkyle.ts";

let feil = 0;
let ok = 0;
function sjekk(navn: string, faktisk: unknown, forventet: unknown) {
  const a = JSON.stringify(faktisk);
  const b = JSON.stringify(forventet);
  if (a === b) {
    ok++;
  } else {
    feil++;
    console.log(`  FEIL  ${navn}\n        fikk:      ${a}\n        forventet: ${b}`);
  }
}

const linje = (p: Partial<KalkyleLinje>): KalkyleLinje => ({
  ns_code: null, description: "", unit: "m", quantity: 0, unit_price: 0, ...p,
});
const overskrift = (tekst: string): KalkyleLinje =>
  linje({ description: tekst, unit: "", is_heading: true });

console.log("\n--- 1. Utregning ---");

const enkel = [
  linje({ ns_code: "FD2.13", description: "Grøftegraving", unit: "m³", quantity: 10, unit_price: 250 }),
  linje({ ns_code: "UM1", description: "Rør", unit: "m", quantity: 20, unit_price: 100 }),
];
sjekk("sum uten påslag og mva", beregnKalkyle(enkel, 0, 0), { sum: 4500, paaslag: 0, eksMva: 4500, mva: 0, total: 4500 });
sjekk("påslag 10 % og mva 25 %", beregnKalkyle(enkel, 10, 25), { sum: 4500, paaslag: 450, eksMva: 4950, mva: 1237.5, total: 6187.5 });

// En overskrift som nettopp er gjort om fra en vanlig linje, kan ha prisen i
// minnet. Den skal likevel ikke telle.
const medOverskrift = [{ ...overskrift("GRUNNARBEID"), quantity: 5, unit_price: 99 }, ...enkel];
sjekk("overskrift teller ikke", beregnKalkyle(medOverskrift, 0, 0).sum, 4500);
sjekk("tom kalkyle", beregnKalkyle([], 12, 25), { sum: 0, paaslag: 0, eksMva: 0, mva: 0, total: 0 });

console.log("\n--- 2. Gruppering til PDF ---");

const gruppert = grupperKalkyle([
  linje({ description: "Rigg", quantity: 1, unit_price: 1000 }),
  overskrift("GRUNNARBEID"),
  linje({ description: "Graving", quantity: 2, unit_price: 100 }),
  linje({ description: "Fylling", quantity: 3, unit_price: 100 }),
  overskrift("VA"),
]);
sjekk("antall grupper", gruppert.length, 3);
sjekk("linjer før første overskrift får gruppe uten tittel", gruppert[0].overskrift, null);
sjekk("delsum før overskrift", gruppert[0].sum, 1000);
sjekk("delsum GRUNNARBEID", [gruppert[1].overskrift, gruppert[1].sum, gruppert[1].linjer.length], ["GRUNNARBEID", 500, 2]);
sjekk("tom gruppe til slutt", [gruppert[2].overskrift, gruppert[2].linjer.length], ["VA", 0]);

console.log("\n--- 3. Søk i kodebanken ---");

const kode = (code: string, title: string, active = true): NsKode => ({
  id: code, part: code.replace(/[0-9.].*$/, ""), code, title, unit: "m", unit_price: null,
  edition: "2017–2022", note: null, maa_kontrolleres: false, active,
});
const koder = [
  kode("FD2.2", "Graving, sjakt"),
  kode("FD2.13", "Grøftegraving, volum"),
  kode("FD2.1", "Grøftegraving"),
  kode("KD2.31", "Kantstein av betong"),
  kode("FB1", "Rydding", false),
];
sjekk("kode-prefiks, sortert hierarkisk", sokKoder(koder, "fd2").map((k) => k.code), ["FD2.1", "FD2.13", "FD2.2"]);
sjekk("mellomrom ignoreres i kode", sokKoder(koder, "fd 2.1").map((k) => k.code), ["FD2.1", "FD2.13"]);
sjekk("tekstsøk etter kodetreff", sokKoder(koder, "grøft").map((k) => k.code), ["FD2.1", "FD2.13"]);
sjekk("inaktive vises ikke", sokKoder(koder, "fb").length, 0);
sjekk("tomt søk gir ingenting", sokKoder(koder, "  ").length, 0);
sjekk("maks antall", sokKoder(koder, "fd", 2).length, 2);

console.log("\n--- 4. Ny linje fra kode ---");

sjekk("linje fra kode uten pris", linjeFraKode({ ...kode("FD2.13", "Grøftegraving, volum"), unit: "m³" }),
  { ns_code: "FD2.13", description: "Grøftegraving, volum", unit: "m³", quantity: 0, unit_price: 0 });
sjekk("linje fra kode med pris", linjeFraKode({ ...kode("FD2.13", "Grøft"), unit_price: 245.5 }).unit_price, 245.5);

console.log("\n--- 5. Overføring til tilbud ---");

const overfort = kalkyleTilTilbudslinjer("VA Storgata", [
  overskrift("GRUNNARBEID"),
  linje({ ns_code: "FD2.13", description: "Grøftegraving", unit: "m³", quantity: 10, unit_price: 250 }),
  linje({ ns_code: "", description: "Fritekst", unit: "stk", quantity: 1, unit_price: 500 }),
], 4);
sjekk("antall linjer = 1 overskrift + 3", overfort.length, 4);
sjekk("første er overskrift med kalkylens navn", [overfort[0].is_heading, overfort[0].description, overfort[0].sort_order], [true, "VA Storgata", 4]);
sjekk("sort_order fortsetter etter eksisterende", overfort.map((l) => l.sort_order), [4, 5, 6, 7]);
sjekk("pris uten påslag, ingen rabatt, inkludert", [overfort[2].unit_price, overfort[2].discount_pct, overfort[2].included], [250, 0, true]);
sjekk("kode følger med", overfort[2].ns_code, "FD2.13");
sjekk("tom kode blir null", overfort[3].ns_code, null);
sjekk("overskrift uten tall", [overfort[1].quantity, overfort[1].unit_price, overfort[1].ns_code], [0, 0, null]);
sjekk("kommentar er tom streng", overfort[2].comment, "");

console.log("\n--- 6. Importnøkkel ---");

sjekk("nøkkel for nytt tilbud", kalkyleImportNokkel(), "kalkyle-import-new");
sjekk("nøkkel for eksisterende", kalkyleImportNokkel("abc"), "kalkyle-import-abc");

console.log(`\n${ok} ok, ${feil} feil`);
if (feil) process.exit(1);
```

- [ ] **Steg 2: Kjør testen og se at den feiler**

Kjør: `node --experimental-strip-types src/lib/kalkyle.test.ts`
Forventet: feiler med `Cannot find module ... kalkyle.ts`.

- [ ] **Steg 3: Skriv `src/lib/kalkyle.ts`**

```ts
// Kalkyle med NS 3420-koder: utregning, søk i kodebanken og overføring til
// tilbud. Ren logikk uten Supabase og uten @-importer, så Node kan teste den
// direkte (se kalkyle.test.ts).
//
// NS 3420 eies av Standard Norge. Vi lagrer bare kodene, enhetene og våre egne
// korte titler, aldri standardens beskrivelsestekst.
import { lineNet } from "./format.ts";

/** En rad i kodebanken (tabellen ns_codes). */
export interface NsKode {
  id: string;
  /** Del av NS 3420, f.eks. "F", "U", "CD". */
  part: string;
  /** Koderot, f.eks. "FD2.13". */
  code: string;
  /** Vår egen korte tittel, ikke standardens tekst. */
  title: string;
  unit: string;
  unit_price: number | null;
  edition: string | null;
  note: string | null;
  maa_kontrolleres: boolean;
  active: boolean;
}

/** En linje i kalkylen (tabellen calculation_lines). */
export interface KalkyleLinje {
  id?: string;
  /** Kopi av koden, ikke en fremmednøkkel: kalkylen skal stå seg når kodebanken endres. */
  ns_code: string | null;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  /** Overskrift: bare tekst, ingen tall. */
  is_heading?: boolean;
}

export interface KalkyleSummer {
  sum: number;
  paaslag: number;
  eksMva: number;
  mva: number;
  total: number;
}

/** Sum, påslag og mva. Overskrifter teller 0, samme regel som i tilbudene. */
export function beregnKalkyle(linjer: KalkyleLinje[], paaslagPct: number, mvaPct: number): KalkyleSummer {
  const sum = linjer.reduce((s, l) => s + lineNet(l), 0);
  const paaslag = sum * (Number(paaslagPct || 0) / 100);
  const eksMva = sum + paaslag;
  const mva = eksMva * (Number(mvaPct || 0) / 100);
  return { sum, paaslag, eksMva, mva, total: eksMva + mva };
}

export interface KalkyleGruppe {
  /** null for linjer som står før første overskrift. */
  overskrift: string | null;
  linjer: KalkyleLinje[];
  sum: number;
}

/** Deler linjene i bolker etter overskriftene, med delsum per bolk. */
export function grupperKalkyle(linjer: KalkyleLinje[]): KalkyleGruppe[] {
  const grupper: KalkyleGruppe[] = [];
  let aktiv: KalkyleGruppe | null = null;
  for (const l of linjer) {
    if (l.is_heading) {
      aktiv = { overskrift: l.description, linjer: [], sum: 0 };
      grupper.push(aktiv);
      continue;
    }
    if (!aktiv) {
      aktiv = { overskrift: null, linjer: [], sum: 0 };
      grupper.push(aktiv);
    }
    aktiv.linjer.push(l);
    aktiv.sum += lineNet(l);
  }
  return grupper;
}

/**
 * Sorterer koder slik de står i standarden: FD2.1, FD2.13, FD2.2.
 * Vanlig tegnsammenligning gir akkurat det. Tallsortering ville satt FD2.13
 * etter FD2.2, og localeCompare kan hoppe over punktumene.
 */
export const sammenlignKoder = (a: { code: string }, b: { code: string }) =>
  a.code < b.code ? -1 : a.code > b.code ? 1 : 0;

const normKode = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Søk i aktive koder: treff på starten av koden først, så treff i tittelen. */
export function sokKoder(koder: NsKode[], q: string, maks = 30): NsKode[] {
  const n = normKode(q);
  if (!n) return [];
  const tekst = q.trim().toLowerCase();
  const aktive = koder.filter((k) => k.active);
  const kodeTreff = aktive.filter((k) => normKode(k.code).startsWith(n));
  const tekstTreff = aktive.filter((k) => !normKode(k.code).startsWith(n) && k.title.toLowerCase().includes(tekst));
  return [...kodeTreff.sort(sammenlignKoder), ...tekstTreff.sort(sammenlignKoder)].slice(0, maks);
}

/** Ny kalkylelinje fra en kode i kodebanken. Mengden fyller brukeren inn. */
export function linjeFraKode(k: NsKode): KalkyleLinje {
  return { ns_code: k.code, description: k.title, unit: k.unit, quantity: 0, unit_price: Number(k.unit_price ?? 0) };
}

export const tomLinje = (enhet: string): KalkyleLinje =>
  ({ ns_code: null, description: "", unit: enhet, quantity: 0, unit_price: 0 });

export const tomOverskrift = (): KalkyleLinje =>
  ({ ns_code: null, description: "", unit: "", quantity: 0, unit_price: 0, is_heading: true });

/** Samme form som `Line` i offer-form.tsx, pluss ns_code. */
export interface TilbudslinjeFraKalkyle {
  sort_order: number;
  included: boolean;
  is_heading: boolean;
  ns_code: string | null;
  description: string;
  comment: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_pct: number;
}

/**
 * Gjør kalkylen om til tilbudslinjer: én overskrift med kalkylens navn og så
 * linjene i samme rekkefølge. Prisene går over uten kalkylepåslaget, for
 * tilbudet har sin egen adm.kost. Ellers ville påslaget blitt regnet to ganger.
 */
export function kalkyleTilTilbudslinjer(navn: string, linjer: KalkyleLinje[], startIndex: number): TilbudslinjeFraKalkyle[] {
  const hode: TilbudslinjeFraKalkyle = {
    sort_order: startIndex, included: true, is_heading: true, ns_code: null,
    description: navn, comment: "", quantity: 0, unit: "", unit_price: 0, discount_pct: 0,
  };
  return [
    hode,
    ...linjer.map((l, i) => {
      const h = !!l.is_heading;
      return {
        sort_order: startIndex + 1 + i,
        included: true,
        is_heading: h,
        ns_code: h ? null : (l.ns_code?.trim() || null),
        description: l.description,
        comment: "",
        quantity: h ? 0 : Number(l.quantity || 0),
        unit: h ? "" : l.unit,
        unit_price: h ? 0 : Number(l.unit_price || 0),
        discount_pct: 0,
      };
    }),
  ];
}

/** Det kalkylen legger i sessionStorage før tilbudsskjemaet åpnes. */
export interface KalkyleImport {
  navn: string;
  markup_pct: number;
  linjer: KalkyleLinje[];
}

/** Nøkkelen i sessionStorage. Samme mønster som utkastnøkkelen i offer-form.tsx. */
export const kalkyleImportNokkel = (offerId?: string) => `kalkyle-import-${offerId ?? "new"}`;
```

- [ ] **Steg 4: Kjør testen og se at den går gjennom**

Kjør: `node --experimental-strip-types src/lib/kalkyle.test.ts`
Forventet: `27 ok, 0 feil`.

- [ ] **Steg 5: Legg testen inn i `bun run test`**

I `package.json`, skriptet `test`: legg til `&& node --experimental-strip-types src/lib/kalkyle.test.ts` rett etter `src/lib/lagringsnokkel.test.ts`.

Kjør: `bun run test`
Forventet: alle testfilene går gjennom.

- [ ] **Steg 6: Commit**

```bash
git add src/lib/kalkyle.ts src/lib/kalkyle.test.ts package.json
git commit -m "Kalkyle: utregning, kodesøk og overføring til tilbud

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Oppgave 2: Migrasjon med tabeller, startpakke og ns_code

**Filer:**
- Opprett: `scripts/ns-startpakke-sql.mjs`
- Opprett: `supabase/migrations/20261012000000_kalkyle_ns_koder.sql`

**Grensesnitt:**
- Bruker: `current_tenant_id()` og `tenants` fra basen. Funksjonskroppen til `get_offer_pdf_by_token` fra `supabase/migrations/20261007000003_kundens_pdf_som_i_appen.sql`.
- Leverer: tabellene `ns_codes`, `calculations` og `calculation_lines`, kolonnen `offer_lines.ns_code`, RPC-en `seed_ns_codes()` (returnerer antall nye koder) og `get_offer_pdf_by_token` med `ns_code` på linjene.

- [ ] **Steg 1: Skriv generatoren for startpakken**

`scripts/ns-startpakke-sql.mjs`:

```js
// Lager VALUES-radene til startpakken i NS-kodebanken fra docs/ns3420-startliste.md.
// Kjør: node scripts/ns-startpakke-sql.mjs
//
// Koder som bare gjelder utgaven fra 2015 og eldre, tas ikke med. Flere av dem
// betyr noe annet i dag (UP1.11 var forankring av rør og er nå betongkum).
// UVERIFISERT-koder (bare én byggherre) merkes med maa_kontrolleres = true.
import { readFileSync } from "node:fs";

const md = readFileSync(new URL("../docs/ns3420-startliste.md", import.meta.url), "utf8");
// Samme skrivemåte som enhetene i appen (UNITS i src/lib/format.ts)
const ENHET = { m2: "m²", m3: "m³", timer: "time" };
const q = (s) => `'${s.replace(/'/g, "''")}'`;

const rader = [];
for (const linje of md.split("\n")) {
  const m = linje.match(/^\| ([A-Z]+) \| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \|/);
  if (!m) continue;
  const [, del, kode, emne, enhetRaa, status] = m;
  if (status.includes("≤2015")) continue;
  const forste = enhetRaa.split("/")[0].trim();
  const enhet = ENHET[forste] ?? forste;
  const maa = status.trim().startsWith("UVERIFISERT");
  rader.push(`    (${q(del)}, ${q(kode.trim())}, ${q(emne.trim())}, ${q(enhet)}, ${maa})`);
}
console.log(rader.join(",\n"));
console.error(`${rader.length} koder`);
```

Kjør: `node scripts/ns-startpakke-sql.mjs > /dev/null`
Forventet på stderr: `125 koder`. Er tallet et annet, skal du se på tabellen i `docs/ns3420-startliste.md` (148 rader, 23 med «≤2015») og rette regexen før du går videre.

- [ ] **Steg 2: Skriv migrasjonen**

`supabase/migrations/20261012000000_kalkyle_ns_koder.sql`. Linjen `-- STARTPAKKE` byttes ut i steg 3.

```sql
-- Kalkyle med NS 3420-koder.
--
-- ns_codes er firmaets kodebank: koderot, egen kort tittel, enhet og egen
-- enhetspris. Standardens beskrivelsestekst lagres ikke. NS 3420 eies av
-- Standard Norge. Startpakken er hentet fra offentlige anbudsgrunnlag, se
-- docs/ns3420-startliste.md, og ingen kilde bruker 2024-utgaven. Derfor står
-- utgaven på hver kode.
--
-- calculations og calculation_lines er lagrede kalkyler. Linjene har samme
-- form som offer_lines, så de kan flyttes rett over til et tilbud.
-- calculation_lines.ns_code er en kopi, ikke en fremmednøkkel: en gammel
-- kalkyle skal ikke endre seg når noen retter tittelen i kodebanken.
--
-- offer_lines.ns_code tar koden med inn i tilbudet. get_offer_pdf_by_token
-- gjenopprettes med feltet, ellers ville kundens PDF på signeringssiden mistet
-- Kode-kolonnen. Det skjedde med is_heading før 20261007000003.

create table if not exists public.ns_codes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  part             text not null,
  code             text not null,
  title            text not null,
  unit             text not null default '',
  unit_price       numeric(12,2),
  edition          text,
  note             text,
  maa_kontrolleres boolean not null default false,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.calculations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  customer_text text,
  markup_pct    numeric(5,2) not null default 0,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.calculation_lines (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  calculation_id uuid not null references public.calculations(id) on delete cascade,
  sort_order     int not null default 0,
  ns_code        text,
  description    text not null default '',
  unit           text not null default '',
  quantity       numeric(12,2) not null default 0,
  unit_price     numeric(12,2) not null default 0,
  is_heading     boolean not null default false,
  created_at     timestamptz not null default now(),
  -- Samme regel som offer_lines_overskrift_uten_pris (20260915000003)
  constraint calculation_lines_overskrift_uten_pris
    check (not is_heading or (quantity = 0 and unit_price = 0))
);

create index if not exists calculation_lines_calculation_idx
  on public.calculation_lines (calculation_id, sort_order);

-- RLS per firma, samme mønster som i 20260616000000
do $$
declare
  t text;
begin
  foreach t in array array['ns_codes', 'calculations', 'calculation_lines'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s_tenant_isolation" on public.%I;', t, t);
    execute format(
      'create policy "%s_tenant_isolation" on public.%I
       using (tenant_id = current_tenant_id())
       with check (tenant_id = current_tenant_id());',
      t, t
    );
  end loop;
end$$;

alter table public.offer_lines add column if not exists ns_code text;
comment on column public.offer_lines.ns_code is
  'NS 3420-kode for linjen, kopiert fra kalkylen. Vises som Kode-kolonne i tilbuds-PDF-en.';

-- Startpakken for ett firma. Kan kjøres flere ganger uten duplikater.
-- Ikke åpen for klienten: den tar firma som parameter.
create or replace function public.seed_ns_codes_for(p_tenant uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n int;
begin
  insert into ns_codes (tenant_id, part, code, title, unit, edition, maa_kontrolleres)
  select p_tenant, v.part, v.code, v.title, v.unit, '2017–2022', v.maa
  from (values
-- STARTPAKKE
  ) as v(part, code, title, unit, maa)
  on conflict (tenant_id, code) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.seed_ns_codes_for(uuid) from public, anon, authenticated;

-- Knappen «Legg inn startpakken» i kodebanken. Bruker innlogget brukers firma,
-- aldri et firma sendt inn fra klienten.
create or replace function public.seed_ns_codes()
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t uuid := current_tenant_id();
begin
  if t is null then
    raise exception 'Fant ikke firma for innlogget bruker';
  end if;
  return seed_ns_codes_for(t);
end;
$$;
revoke all on function public.seed_ns_codes() from public, anon;
grant execute on function public.seed_ns_codes() to authenticated;

-- Alle firmaer som finnes nå, får startpakken med en gang
select public.seed_ns_codes_for(id) from public.tenants;

-- get_offer_pdf_by_token: uendret fra 20261007000003, bortsett fra ns_code på linjene.
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
      'is_heading', is_heading,
      'ns_code', ns_code
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

grant execute on function public.get_offer_pdf_by_token(text) to anon, authenticated;
```

- [ ] **Steg 3: Sett inn startpakken**

Kjør: `node scripts/ns-startpakke-sql.mjs > startpakke.tmp.sql`
Bytt ut linjen `-- STARTPAKKE` i migrasjonen med innholdet i `startpakke.tmp.sql`, ordrett. Det er 125 rader skilt med komma, og den siste har ikke komma. Slett så `startpakke.tmp.sql`.

Sjekk med Grep at migrasjonen ikke lenger inneholder `-- STARTPAKKE`, og at `'FD2.13'` finnes.

- [ ] **Steg 4: Sammenlign RPC-en med originalen**

Kjør: `git diff --no-index <(sed -n '/^create or replace function public.get_offer_pdf_by_token/,/^\$\$;/p' supabase/migrations/20261007000003_kundens_pdf_som_i_appen.sql) <(sed -n '/^create or replace function public.get_offer_pdf_by_token/,/^\$\$;/p' supabase/migrations/20261012000000_kalkyle_ns_koder.sql)`
Forventet: bare to forskjeller. Raden `'is_heading', is_heading` får komma, raden `'ns_code', ns_code` er ny, og kommentarlinjene om adresse er borte. Ingen andre endringer.

- [ ] **Steg 5: Commit**

```bash
git add scripts/ns-startpakke-sql.mjs supabase/migrations/20261012000000_kalkyle_ns_koder.sql
git commit -m "Kalkyle: tabeller, startpakke med NS-koder og kode på tilbudslinjer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Steg 6: Få migrasjonen kjørt (brukeren)**

Stopp og be brukeren lime inn hele `supabase/migrations/20261012000000_kalkyle_ns_koder.sql` i Supabase SQL Editor og kjøre den. Vent på svar.

- [ ] **Steg 7: Sjekk resultatet med PostgREST**

Bruk `VITE_SUPABASE_URL` og `SUPABASE_SERVICE_ROLE_KEY` fra `.env`, og skriv ikke nøkkelen ut i svaret. Kjør:
- `GET $URL/rest/v1/ns_codes?select=tenant_id&limit=1000`. Forventet: 125 rader per tenant.
- `GET $URL/rest/v1/ns_codes?select=code,maa_kontrolleres&maa_kontrolleres=eq.true`. Forventet: minst én rad per tenant (`FS2.334`).
- `GET $URL/rest/v1/offer_lines?select=ns_code&limit=1`. Forventet: 200, ikke feil om ukjent kolonne.
- `GET $URL/rest/v1/calculations?select=id&limit=1`. Forventet: 200 og `[]`.

---

### Oppgave 3: Menylenke, kalkylelisten og kodebanken

**Filer:**
- Opprett: `src/lib/kalkyle-db.ts`
- Endre: `src/components/app-nav.tsx:16-28`
- Opprett: `src/routes/kalkyle.index.tsx`
- Opprett: `src/routes/kalkyle.kodebank.tsx`

**Grensesnitt:**
- Bruker: `NsKode`, `beregnKalkyle` og `sammenlignKoder` fra oppgave 1, og tabellene og `seed_ns_codes` fra oppgave 2.
- Leverer: `db` (utypet supabase-klient) og query-nøklene `["ns-codes"]` og `["calculations"]`.

- [ ] **Steg 1: Lag `src/lib/kalkyle-db.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// De genererte typene i integrations/supabase/types.ts er utdaterte og kjenner
// ikke kalkyletabellene. Dette er samme klient, bare uten typesjekk på
// tabellnavn, slik at den nye koden slipper `as never` på hvert kall.
export const db = supabase as unknown as SupabaseClient;
```

- [ ] **Steg 2: Legg til menylenken**

I `BASE_LINKS` i `src/components/app-nav.tsx`, rett etter `{ to: "/tilbud", label: "Tilbud" },`:

```ts
  { to: "/kalkyle", label: "Kalkyle" },
```

- [ ] **Steg 3: Lag kalkylelisten**

`src/routes/kalkyle.index.tsx`:

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2, BookOpen } from "lucide-react";
import { db } from "@/lib/kalkyle-db";
import { beregnKalkyle, type KalkyleLinje } from "@/lib/kalkyle";
import { nok, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/kalkyle/")({
  component: Kalkyler,
});

interface KalkyleRad {
  id: string;
  name: string;
  customer_text: string | null;
  markup_pct: number;
  updated_at: string;
  calculation_lines: KalkyleLinje[];
}

function Kalkyler() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sok, setSok] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["calculations"],
    queryFn: async () => {
      const { data, error } = await db
        .from("calculations")
        .select("id, name, customer_text, markup_pct, updated_at, calculation_lines(quantity, unit_price, is_heading)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as KalkyleRad[];
    },
  });

  const synlige = useMemo(() => {
    const q = sok.trim().toLowerCase();
    return (data ?? []).filter((k) => !q || k.name.toLowerCase().includes(q) || (k.customer_text ?? "").toLowerCase().includes(q));
  }, [data, sok]);

  const slett = async (k: KalkyleRad) => {
    if (!window.confirm(`Slette kalkylen «${k.name}»? Dette kan ikke angres.`)) return;
    const { error } = await db.from("calculations").delete().eq("id", k.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Kalkylen er slettet");
    qc.invalidateQueries({ queryKey: ["calculations"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Kalkyle</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/kalkyle/kodebank"><BookOpen className="mr-1 h-4 w-4" />Kodebank</Link>
          </Button>
          <Button onClick={() => navigate({ to: "/kalkyle/ny" })}><Plus className="mr-1 h-4 w-4" />Ny kalkyle</Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Søk i navn eller kunde…" value={sok} onChange={(e) => setSok(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Laster…</p>
      ) : error ? (
        <p className="text-destructive">Kunne ikke hente kalkylene: {(error as Error).message}</p>
      ) : synlige.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          {data?.length ? "Ingen kalkyler passer søket." : "Ingen kalkyler ennå. Trykk «Ny kalkyle» for å starte."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Navn</th>
                <th className="px-3 py-2 text-left">Kunde / prosjekt</th>
                <th className="px-3 py-2 text-right">Sum eks. mva</th>
                <th className="px-3 py-2 text-left">Sist endret</th>
                <th className="w-12 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {synlige.map((k) => (
                <tr key={k.id} className="cursor-pointer border-b hover:bg-accent/40" onClick={() => navigate({ to: "/kalkyle/$id", params: { id: k.id } })}>
                  <td className="px-3 py-2 font-medium">{k.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{k.customer_text}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{nok(beregnKalkyle(k.calculation_lines, k.markup_pct, 0).eksMva)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(k.updated_at)}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" onClick={() => slett(k)} title="Slett kalkyle"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Steg 4: Lag kodebanken**

`src/routes/kalkyle.kodebank.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Search, Save, ShieldAlert } from "lucide-react";
import { db } from "@/lib/kalkyle-db";
import { sammenlignKoder, type NsKode } from "@/lib/kalkyle";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/kalkyle/kodebank")({
  component: Kodebank,
});

function Kodebank() {
  const qc = useQueryClient();
  const { tenantId } = useAuth();
  const [sok, setSok] = useState("");
  const [visInaktive, setVisInaktive] = useState(false);
  const [ny, setNy] = useState({ part: "", code: "", title: "", unit: "", unit_price: "" });
  const [legger, setLegger] = useState(false);

  const { data: koder, isLoading, error } = useQuery({
    queryKey: ["ns-codes"],
    queryFn: async () => {
      const { data, error } = await db.from("ns_codes").select("*");
      if (error) throw error;
      return ((data ?? []) as NsKode[]).sort(sammenlignKoder);
    },
  });

  const grupper = useMemo(() => {
    const q = sok.trim().toLowerCase();
    const synlige = (koder ?? []).filter((k) =>
      (visInaktive || k.active) &&
      (!q || k.code.toLowerCase().includes(q) || k.title.toLowerCase().includes(q)));
    const perDel = new Map<string, NsKode[]>();
    for (const k of synlige) perDel.set(k.part, [...(perDel.get(k.part) ?? []), k]);
    return [...perDel.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }, [koder, sok, visInaktive]);

  const leggInnStartpakke = async () => {
    setLegger(true);
    const { data, error } = await db.rpc("seed_ns_codes");
    setLegger(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${data} koder lagt inn`);
    qc.invalidateQueries({ queryKey: ["ns-codes"] });
  };

  const leggTil = async () => {
    const code = ny.code.trim();
    if (!ny.part.trim() || !code || !ny.title.trim()) { toast.error("Del, kode og tittel må fylles inn"); return; }
    const { error } = await db.from("ns_codes").insert({
      tenant_id: tenantId,
      part: ny.part.trim().toUpperCase(),
      code,
      title: ny.title.trim(),
      unit: ny.unit.trim(),
      unit_price: ny.unit_price === "" ? null : Number(ny.unit_price),
    });
    if (error) {
      toast.error(error.code === "23505" ? `Koden ${code} finnes allerede i kodebanken` : error.message);
      return;
    }
    setNy({ part: "", code: "", title: "", unit: "", unit_price: "" });
    toast.success(`${code} lagt til`);
    qc.invalidateQueries({ queryKey: ["ns-codes"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/kalkyle"><ArrowLeft className="mr-1 h-4 w-4" />Kalkyler</Link></Button>
        <h1 className="text-2xl font-semibold">Kodebank</h1>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Kodene i startpakken er hentet fra offentlige anbudsgrunnlag (NS 3420, utgave 2017–2022) og bør kontrolleres mot
        gjeldende utgave av standarden. Titlene er våre egne. Kilder: <code>docs/ns3420-startliste.md</code>.
        Koder slettes ikke, de settes som inaktive, slik at gamle kalkyler fortsatt gir mening.
      </p>

      {isLoading ? <p className="text-muted-foreground">Laster…</p>
        : error ? <p className="text-destructive">Kunne ikke hente kodebanken: {(error as Error).message}</p>
        : !koder?.length ? (
          <div className="rounded-lg border p-6 text-center">
            <p className="mb-3 text-muted-foreground">Kodebanken er tom.</p>
            <Button onClick={leggInnStartpakke} disabled={legger}>Legg inn startpakken</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Søk på kode eller tittel…" value={sok} onChange={(e) => setSok(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={visInaktive} onCheckedChange={(v) => setVisInaktive(!!v)} />Vis inaktive
              </label>
            </div>

            <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[5rem_8rem_1fr_6rem_8rem_auto]">
              <Input placeholder="Del" value={ny.part} onChange={(e) => setNy({ ...ny, part: e.target.value })} />
              <Input placeholder="Kode" value={ny.code} onChange={(e) => setNy({ ...ny, code: e.target.value })} />
              <Input placeholder="Tittel (egne ord)" value={ny.title} onChange={(e) => setNy({ ...ny, title: e.target.value })} />
              <Input placeholder="Enhet" value={ny.unit} onChange={(e) => setNy({ ...ny, unit: e.target.value })} />
              <Input placeholder="Enhetspris" type="number" className="no-spinner" value={ny.unit_price} onChange={(e) => setNy({ ...ny, unit_price: e.target.value })} />
              <Button onClick={leggTil}><Plus className="mr-1 h-4 w-4" />Ny kode</Button>
            </div>

            {grupper.map(([del, liste]) => (
              <section key={del} className="space-y-1">
                <h2 className="mt-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Del {del}</h2>
                {liste.map((k) => <KodeRad key={k.id} kode={k} />)}
              </section>
            ))}
          </>
        )}
    </div>
  );
}

/** Én kode med egne felt. Lagres med knappen, som bare er aktiv når noe er endret. */
function KodeRad({ kode }: { kode: NsKode }) {
  const qc = useQueryClient();
  const [k, setK] = useState(kode);
  const endret = JSON.stringify(k) !== JSON.stringify(kode);

  const lagre = async (patch?: Partial<NsKode>) => {
    const neste = { ...k, ...patch };
    const { error } = await db.from("ns_codes").update({
      title: neste.title.trim(),
      unit: neste.unit.trim(),
      unit_price: neste.unit_price === null || (neste.unit_price as unknown) === "" ? null : Number(neste.unit_price),
      edition: neste.edition?.trim() || null,
      note: neste.note?.trim() || null,
      active: neste.active,
      maa_kontrolleres: neste.maa_kontrolleres,
    }).eq("id", kode.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["ns-codes"] });
  };

  return (
    <div className={`grid items-center gap-2 rounded border px-2 py-1.5 md:grid-cols-[7rem_1fr_5rem_7rem_7rem_1fr_auto_auto] ${k.active ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-1 font-mono text-sm">
        {k.code}
        {k.maa_kontrolleres && (
          <button type="button" title="Finnes bare hos én byggherre. Trykk når koden er kontrollert mot standarden." onClick={() => { setK({ ...k, maa_kontrolleres: false }); lagre({ maa_kontrolleres: false }); }}>
            <ShieldAlert className="h-4 w-4 text-amber-600" />
          </button>
        )}
      </div>
      <Input value={k.title} onChange={(e) => setK({ ...k, title: e.target.value })} />
      <Input value={k.unit} onChange={(e) => setK({ ...k, unit: e.target.value })} placeholder="Enhet" />
      <Input type="number" className="no-spinner text-right" placeholder="Pris" value={k.unit_price ?? ""} onChange={(e) => setK({ ...k, unit_price: e.target.value === "" ? null : Number(e.target.value) })} />
      <Input value={k.edition ?? ""} onChange={(e) => setK({ ...k, edition: e.target.value })} placeholder="Utgave" />
      <Input value={k.note ?? ""} onChange={(e) => setK({ ...k, note: e.target.value })} placeholder="Merknad" />
      <label className="flex items-center gap-1 text-xs"><Checkbox checked={k.active} onCheckedChange={(v) => setK({ ...k, active: !!v })} />Aktiv</label>
      <Button size="sm" variant={endret ? "default" : "ghost"} disabled={!endret} onClick={() => lagre()}><Save className="h-4 w-4" /></Button>
    </div>
  );
}
```

- [ ] **Steg 5: Bygg**

Kjør: `bun run build`
Forventet: bygget går gjennom, og `src/routeTree.gen.ts` får rutene `/kalkyle/` og `/kalkyle/kodebank`. Ruta `/kalkyle/` peker til `kalkyle.ny`, som ennå ikke finnes. Da kan TanStack Router klage på typen i `navigate({ to: "/kalkyle/ny" })` og `"/kalkyle/$id"`. Det er ventet, og oppgave 4 retter det. Selve vite-bygget skal likevel gå gjennom.

- [ ] **Steg 6: Commit**

```bash
git add src/lib/kalkyle-db.ts src/components/app-nav.tsx src/routes/kalkyle.index.tsx src/routes/kalkyle.kodebank.tsx src/routeTree.gen.ts
git commit -m "Kalkyle: menylenke, kalkyleliste og kodebank

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Oppgave 4: Regnearket (calculation-form)

**Filer:**
- Opprett: `src/components/calculation-form.tsx`
- Opprett: `src/routes/kalkyle.ny.tsx`
- Opprett: `src/routes/kalkyle.$id.tsx`

**Grensesnitt:**
- Bruker: `KalkyleLinje`, `NsKode`, `beregnKalkyle`, `sokKoder`, `linjeFraKode`, `tomLinje`, `tomOverskrift` og `sammenlignKoder` fra oppgave 1, `db` og query-nøklene fra oppgave 3, `useAppSettings` (`units`, `vat_pct`) og `useAuth` (`tenantId`).
- Leverer: `CalculationForm({ calculationId?: string })`. Oppgave 5 og 7 legger knapper i fotlinja: `{/* PDF-KNAPP */}` og `{/* TILBUD-KNAPP */}`.

- [ ] **Steg 1: Lag rutene**

`src/routes/kalkyle.ny.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { CalculationForm } from "@/components/calculation-form";

export const Route = createFileRoute("/kalkyle/ny")({
  component: () => <CalculationForm />,
});
```

`src/routes/kalkyle.$id.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { CalculationForm } from "@/components/calculation-form";

export const Route = createFileRoute("/kalkyle/$id")({
  component: EditCalculation,
});

function EditCalculation() {
  const { id } = Route.useParams();
  // key: et nytt skjema når man går fra én kalkyle til en annen
  return <CalculationForm key={id} calculationId={id} />;
}
```

- [ ] **Steg 2: Lag skjemaet**

`src/components/calculation-form.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowDown, ArrowUp, Heading, Plus, Save, Search, Trash2 } from "lucide-react";
import { db } from "@/lib/kalkyle-db";
import { supabase } from "@/integrations/supabase/client";
import {
  beregnKalkyle, linjeFraKode, sammenlignKoder, sokKoder, tomLinje, tomOverskrift,
  type KalkyleLinje, type NsKode,
} from "@/lib/kalkyle";
import { lineNet, nok, UNITS as FALLBACK_UNITS } from "@/lib/format";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface KalkyleHode {
  name: string;
  customer_text: string;
  markup_pct: number;
}

export function CalculationForm({ calculationId }: { calculationId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { tenantId } = useAuth();
  const { data: appSettings } = useAppSettings();
  const units = appSettings?.units ?? FALLBACK_UNITS;
  const vatPct = appSettings?.vat_pct ?? 25;

  const [hode, setHode] = useState<KalkyleHode>({ name: "", customer_text: "", markup_pct: 0 });
  const [linjer, setLinjer] = useState<KalkyleLinje[]>([]);
  const [klar, setKlar] = useState(false);
  const [lagrer, setLagrer] = useState(false);
  const lagrerRef = useRef(false);
  const [sok, setSok] = useState("");
  const [fokus, setFokus] = useState<number | null>(null);

  // Samme standard som tilbudene: adm.kost for året
  const { data: adminCost } = useQuery({
    queryKey: ["admin-cost-current"],
    queryFn: async () => {
      const year = new Date().getFullYear();
      const { data } = await supabase.from("admin_costs").select("pct").eq("year", year).maybeSingle();
      return Number(data?.pct ?? 0);
    },
  });

  const { data: koder } = useQuery({
    queryKey: ["ns-codes"],
    queryFn: async () => {
      const { data, error } = await db.from("ns_codes").select("*");
      if (error) throw error;
      return ((data ?? []) as NsKode[]).sort(sammenlignKoder);
    },
  });

  const { data: lastet, error: lastFeil } = useQuery({
    queryKey: ["calculation", calculationId],
    enabled: !!calculationId,
    queryFn: async () => {
      const [k, l] = await Promise.all([
        db.from("calculations").select("*").eq("id", calculationId!).single(),
        db.from("calculation_lines").select("*").eq("calculation_id", calculationId!).order("sort_order"),
      ]);
      if (k.error) throw k.error;
      if (l.error) throw l.error;
      return { kalkyle: k.data, linjer: (l.data ?? []) as KalkyleLinje[] };
    },
  });

  useEffect(() => {
    if (klar) return;
    if (!calculationId && adminCost !== undefined) {
      setHode((h) => ({ ...h, markup_pct: adminCost }));
      setKlar(true);
    }
    if (calculationId && lastet) {
      const k = lastet.kalkyle;
      setHode({ name: k.name ?? "", customer_text: k.customer_text ?? "", markup_pct: Number(k.markup_pct ?? 0) });
      setLinjer(lastet.linjer.map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })));
      setKlar(true);
    }
  }, [calculationId, adminCost, lastet, klar]);

  // Etter at en kode er lagt til, står markøren i mengdefeltet
  useEffect(() => {
    if (fokus === null) return;
    document.querySelector<HTMLInputElement>(`[data-mengde="${fokus}"]`)?.focus();
    setFokus(null);
  }, [fokus]);

  const treff = useMemo(() => sokKoder(koder ?? [], sok), [koder, sok]);
  const summer = useMemo(() => beregnKalkyle(linjer, hode.markup_pct, vatPct), [linjer, hode.markup_pct, vatPct]);

  const leggTilKode = (k: NsKode) => {
    setLinjer((p) => {
      setFokus(p.length);
      return [...p, linjeFraKode(k)];
    });
    setSok("");
  };
  const oppdater = (i: number, patch: Partial<KalkyleLinje>) =>
    setLinjer((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const fjern = (i: number) => setLinjer((p) => p.filter((_, idx) => idx !== i));
  const flytt = (fra: number, til: number) =>
    setLinjer((p) => {
      if (til < 0 || til >= p.length) return p;
      const neste = [...p];
      const [l] = neste.splice(fra, 1);
      neste.splice(til, 0, l);
      return neste;
    });

  /** Samme vakt som bekreftNullinjer i offer-form.tsx. */
  const bekreftNullinjer = () => {
    const mistenkelige = linjer.filter((l) => !l.is_heading && l.description.trim() && lineNet(l) === 0);
    if (!mistenkelige.length) return true;
    const liste = mistenkelige.map((l) => `• ${l.ns_code ?? ""} ${l.description} — ${l.quantity} × ${l.unit_price}`).join("\n");
    return window.confirm(`${mistenkelige.length} linje(r) summerer til 0 kr:\n\n${liste}\n\nLagre likevel?`);
  };

  const lagre = async (): Promise<string | null> => {
    if (lagrerRef.current) return null;
    if (!hode.name.trim()) { toast.error("Kalkylen må ha et navn"); return null; }
    if (!bekreftNullinjer()) return null;
    lagrerRef.current = true;
    setLagrer(true);
    try {
      const payload = {
        name: hode.name.trim(),
        customer_text: hode.customer_text.trim() || null,
        markup_pct: Number(hode.markup_pct || 0),
        updated_at: new Date().toISOString(),
      };
      let id = calculationId;
      if (id) {
        const { error } = await db.from("calculations").update(payload).eq("id", id);
        if (error) { toast.error(error.message); return null; }
        // Slett-og-sett-inn, som tilbudslinjene. Feiler slettingen, stopper vi
        // før innsettingen, ellers ville linjene blitt dobbelt.
        const { error: slettFeil } = await db.from("calculation_lines").delete().eq("calculation_id", id);
        if (slettFeil) { toast.error(slettFeil.message); return null; }
      } else {
        const { data, error } = await db.from("calculations").insert({ ...payload, tenant_id: tenantId }).select("id").single();
        if (error) { toast.error(error.message); return null; }
        id = data.id as string;
      }
      if (linjer.length) {
        const { error } = await db.from("calculation_lines").insert(linjer.map((l, idx) => ({
          tenant_id: tenantId,
          calculation_id: id,
          sort_order: idx,
          ns_code: l.is_heading ? null : (l.ns_code?.trim() || null),
          description: l.description,
          unit: l.is_heading ? "" : l.unit,
          quantity: l.is_heading ? 0 : Number(l.quantity || 0),
          unit_price: l.is_heading ? 0 : Number(l.unit_price || 0),
          is_heading: !!l.is_heading,
        })));
        if (error) { toast.error(error.message); return null; }
      }
      qc.invalidateQueries({ queryKey: ["calculations"] });
      qc.invalidateQueries({ queryKey: ["calculation", id] });
      toast.success("Kalkylen er lagret");
      if (!calculationId) navigate({ to: "/kalkyle/$id", params: { id: id! }, replace: true });
      return id!;
    } finally {
      lagrerRef.current = false;
      setLagrer(false);
    }
  };

  if (lastFeil) return <p className="text-destructive">Kunne ikke hente kalkylen: {(lastFeil as Error).message}</p>;
  if (!klar) return <div className="text-muted-foreground">Laster…</div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/kalkyle"><ArrowLeft className="mr-1 h-4 w-4" />Kalkyler</Link></Button>
        <h1 className="text-2xl font-semibold">{calculationId ? hode.name || "Kalkyle" : "Ny kalkyle"}</h1>
      </div>

      <div className="grid gap-3 md:grid-cols-[2fr_2fr_1fr]">
        <div className="space-y-1.5"><Label>Navn</Label><Input value={hode.name} onChange={(e) => setHode({ ...hode, name: e.target.value })} placeholder="F.eks. VA Storgata" /></div>
        <div className="space-y-1.5"><Label>Kunde / prosjekt</Label><Input value={hode.customer_text} onChange={(e) => setHode({ ...hode, customer_text: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Påslag %</Label><Input type="number" step="0.1" className="no-spinner text-right" value={hode.markup_pct} onChange={(e) => setHode({ ...hode, markup_pct: Number(e.target.value) })} onFocus={(e) => e.target.select()} /></div>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={koder?.length ? "Søk NS-kode eller tekst, Enter legger til første treff" : "Kodebanken er tom – legg inn startpakken under Kodebank"}
          value={sok}
          onChange={(e) => setSok(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && treff[0]) { e.preventDefault(); leggTilKode(treff[0]); } if (e.key === "Escape") setSok(""); }}
        />
        {treff.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
            {treff.map((k) => (
              <button key={k.id} type="button" className="flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => leggTilKode(k)}>
                <span className="w-20 shrink-0 font-mono">{k.code}</span>
                <span className="flex-1">{k.title}</span>
                <span className="text-muted-foreground">{k.unit}</span>
                <span className="w-24 text-right tabular-nums text-muted-foreground">{k.unit_price != null ? nok(Number(k.unit_price)) : "–"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <datalist id="kalkyle-enheter">{units.map((u) => <option key={u} value={u} />)}</datalist>

      <div className="space-y-2">
        <div className="hidden grid-cols-[7rem_1fr_6rem_5rem_8rem_8rem_6rem] gap-2 px-2 text-xs uppercase tracking-wider text-muted-foreground md:grid">
          <span>Kode</span><span>Beskrivelse</span><span className="text-right">Mengde</span><span>Enhet</span><span className="text-right">Enhetspris</span><span className="text-right">Sum</span><span />
        </div>
        {linjer.length === 0 && <p className="py-6 text-center text-muted-foreground">Ingen poster. Søk opp en NS-kode over, eller legg til en fritekstlinje.</p>}
        {linjer.map((l, i) => {
          const pil = (
            <div className="flex items-center justify-end gap-0.5">
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => flytt(i, i - 1)} title="Flytt opp"><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === linjer.length - 1} onClick={() => flytt(i, i + 1)} title="Flytt ned"><ArrowDown className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => fjern(i)} title="Slett"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          );
          if (l.is_heading) {
            return (
              <div key={i} className="grid grid-cols-[1fr_6rem] items-center gap-2 rounded border bg-muted/40 px-2 py-1.5">
                <Input value={l.description} onChange={(e) => oppdater(i, { description: e.target.value })} placeholder="Overskrift, f.eks. GRUNNARBEID" className="font-semibold uppercase tracking-wide" />
                {pil}
              </div>
            );
          }
          const null0 = l.description.trim() && lineNet(l) === 0;
          return (
            <div key={i} className={`grid grid-cols-2 items-center gap-2 rounded border px-2 py-1.5 md:grid-cols-[7rem_1fr_6rem_5rem_8rem_8rem_6rem] ${null0 ? "border-amber-400" : ""}`}>
              <Input className="font-mono" value={l.ns_code ?? ""} onChange={(e) => oppdater(i, { ns_code: e.target.value })} placeholder="Kode" />
              <Input className="col-span-2 md:col-span-1" value={l.description} onChange={(e) => oppdater(i, { description: e.target.value })} placeholder="Beskrivelse" />
              <Input data-mengde={i} type="number" step="any" className="no-spinner text-right" value={l.quantity || ""} placeholder="Mengde" onChange={(e) => oppdater(i, { quantity: Number(e.target.value) })} onFocus={(e) => e.target.select()} />
              <Input list="kalkyle-enheter" value={l.unit} onChange={(e) => oppdater(i, { unit: e.target.value })} placeholder="Enhet" />
              <Input type="number" step="any" className="no-spinner text-right" value={l.unit_price || ""} placeholder="Enhetspris" onChange={(e) => oppdater(i, { unit_price: Number(e.target.value) })} onFocus={(e) => e.target.select()} />
              <span className="text-right font-medium tabular-nums">{nok(lineNet(l))}</span>
              {pil}
            </div>
          );
        })}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setLinjer((p) => [...p, tomOverskrift()])}><Heading className="mr-1 h-4 w-4" />Ny overskrift</Button>
          <Button size="sm" variant="outline" onClick={() => setLinjer((p) => [...p, tomLinje(units[0] ?? "")])}><Plus className="mr-1 h-4 w-4" />Fritekstlinje</Button>
        </div>
      </div>

      <div className="ml-auto max-w-sm space-y-1 rounded-lg border p-3 text-sm tabular-nums">
        <div className="flex justify-between"><span>Sum poster</span><span>{nok(summer.sum)}</span></div>
        <div className="flex justify-between"><span>Påslag ({hode.markup_pct} %)</span><span>{nok(summer.paaslag)}</span></div>
        <div className="flex justify-between font-medium"><span>Sum eks. mva</span><span>{nok(summer.eksMva)}</span></div>
        <div className="flex justify-between text-muted-foreground"><span>Mva ({vatPct} %)</span><span>{nok(summer.mva)}</span></div>
        <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Total inkl. mva</span><span>{nok(summer.total)}</span></div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-end gap-2">
          {/* PDF-KNAPP */}
          {/* TILBUD-KNAPP */}
          <Button onClick={() => lagre()} disabled={lagrer}><Save className="mr-1 h-4 w-4" />Lagre</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Steg 3: Bygg**

Kjør: `bun run build`
Forventet: går gjennom uten feil. `src/routeTree.gen.ts` får `/kalkyle/ny` og `/kalkyle/$id`.

- [ ] **Steg 4: Sjekk i forhåndsvisningen**

Panelet er utlogget, så sidene kan ikke klikkes gjennom. Start dev-serveren med `preview_start` og sjekk:
- `/kalkyle/?tsr-split=component`, `/kalkyle/ny?tsr-split=component` og `/kalkyle/kodebank?tsr-split=component` gir 200 og en JS-modul uten feil i konsollen.
- `read_console_messages` med `onlyErrors` viser ingen nye feil. Router-feilen på `/login` er gammel og kan ignoreres.

Logikken bak lagringen sjekkes mot PostgREST med service-role-nøkkelen. Spør brukeren før du skriver: sett inn en testkalkyle med tre linjer i `calculations` og `calculation_lines` for en tenant, les den tilbake sortert på `sort_order`, og slett den igjen. Rader med overskrift og pris skal avvises av CHECK-regelen (forventet: 400 og `calculation_lines_overskrift_uten_pris`).

- [ ] **Steg 5: Commit**

```bash
git add src/components/calculation-form.tsx src/routes/kalkyle.ny.tsx src/routes/kalkyle.\$id.tsx src/routeTree.gen.ts
git commit -m "Kalkyle: regneark med kodesøk, poster, overskrifter og summer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Oppgave 5: PDF av kalkylen

**Filer:**
- Endre: `src/lib/pdf.ts:1-43` (`openPrintPdf`) og legg til `openCalculationPdf` rett etter `openPrintPdf`
- Endre: `src/components/calculation-form.tsx` (`{/* PDF-KNAPP */}`)

**Grensesnitt:**
- Bruker: `beregnKalkyle`, `grupperKalkyle` og `KalkyleLinje` fra `@/lib/kalkyle`, `lineNet` og `escapeHtml` fra `@/lib/format`, og `fmtNok`/`fmtNum` i `pdf.ts`.
- Leverer: `openCalculationPdf(d: CalculationPdfData, settings: CalculationPdfSettings, targetWin?: Window | null)`.

- [ ] **Steg 1: La `openPrintPdf` ta imot et ferdig åpnet vindu**

I `src/lib/pdf.ts`, endre signaturen og første linje i `openPrintPdf`:

```ts
export function openPrintPdf(title: string, bodyHtml: string, targetWin?: Window | null) {
  // Et vindu åpnet etter en await regnes ikke som brukerutløst og blir blokkert.
  // Den som kaller etter en await, åpner derfor vinduet i klikket og sender det inn.
  const win = targetWin ?? window.open("", "_blank", "width=900,height=1100");
  if (!win) return;
```

Resten av funksjonen er uendret.

- [ ] **Steg 2: Legg til `openCalculationPdf`**

Endre importen øverst i `src/lib/pdf.ts` til:

```ts
import { offerHasDeadline, escapeHtml, lineNet } from "@/lib/format";
import { beregnKalkyle, grupperKalkyle, type KalkyleLinje } from "@/lib/kalkyle";
```

Legg til rett etter `openPrintPdf`. Funksjonen bruker `fmtNok` og `fmtNum`, som er deklarert lenger ned i fila som funksjonsdeklarasjoner. De er hoistet og kan derfor brukes her.

```ts
export interface CalculationPdfData {
  name: string;
  customer_text: string;
  markup_pct: number;
  lines: KalkyleLinje[];
}

export interface CalculationPdfSettings {
  company_name: string;
  company_org_nr?: string;
  logo_url?: string;
  vat_pct: number;
}

/** Kalkylen som PDF: poster gruppert på overskrift med delsum, påslag som egen linje. */
export function openCalculationPdf(d: CalculationPdfData, settings: CalculationPdfSettings, targetWin?: Window | null) {
  const s = beregnKalkyle(d.lines, d.markup_pct, settings.vat_pct);
  const dato = new Intl.DateTimeFormat("nb-NO").format(new Date());
  const logo = settings.logo_url
    ? `<img src="${escapeHtml(settings.logo_url)}" alt="" style="max-height:48px;max-width:200px"/>`
    : `<h1>${escapeHtml(settings.company_name)}</h1>`;
  const rad = (l: KalkyleLinje) => `<tr>
      <td style="font-family:monospace;white-space:nowrap">${escapeHtml(l.ns_code ?? "")}</td>
      <td>${escapeHtml(l.description)}</td>
      <td class="num">${fmtNum(Number(l.quantity || 0))}</td>
      <td>${escapeHtml(l.unit)}</td>
      <td class="num">${fmtNok(Number(l.unit_price || 0))}</td>
      <td class="num">${fmtNok(lineNet(l))}</td>
    </tr>`;
  const grupper = grupperKalkyle(d.lines).map((g) => {
    const tittel = g.overskrift !== null
      ? `<tr><td colspan="6" style="padding-top:14px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #1e3a8a">${escapeHtml(g.overskrift)}</td></tr>`
      : "";
    const delsum = g.overskrift !== null && g.linjer.length
      ? `<tr><td colspan="5" class="num" style="font-weight:600">Sum ${escapeHtml(g.overskrift)}</td><td class="num" style="font-weight:600">${fmtNok(g.sum)}</td></tr>`
      : "";
    return tittel + g.linjer.map(rad).join("") + delsum;
  }).join("");
  const sumRad = (k: string, v: number, stil = "") =>
    `<tr${stil ? ` class="${stil}"` : ""}><td colspan="5" class="num">${k}</td><td class="num">${fmtNok(v)}</td></tr>`;

  const body = `
    <div class="header">
      <div>${logo}${settings.company_org_nr ? `<div class="meta" style="text-align:left">Org.nr. ${escapeHtml(settings.company_org_nr)}</div>` : ""}</div>
      <div class="meta">
        <div><strong>Kalkyle</strong></div>
        <div>${escapeHtml(d.name)}</div>
        ${d.customer_text ? `<div>${escapeHtml(d.customer_text)}</div>` : ""}
        <div>${dato}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Kode</th><th>Beskrivelse</th><th class="num">Mengde</th><th>Enhet</th><th class="num">Enhetspris</th><th class="num">Sum</th></tr></thead>
      <tbody>${grupper || `<tr><td colspan="6" style="text-align:center;color:#555">Ingen poster</td></tr>`}</tbody>
      <tfoot>
        ${sumRad("Sum poster", s.sum)}
        ${s.paaslag ? sumRad(`Påslag (${fmtNum(d.markup_pct)}&nbsp;%)`, s.paaslag) : ""}
        ${sumRad("Sum eks. mva", s.eksMva)}
        ${sumRad(`Mva (${fmtNum(settings.vat_pct)}&nbsp;%)`, s.mva)}
        ${sumRad("Total inkl. mva", s.total, "total-row")}
      </tfoot>
    </table>
    <div class="footer">NS-kodene følger NS 3420. Beskrivelsene er forkortet og erstatter ikke standardens tekst.</div>`;
  openPrintPdf(`Kalkyle – ${d.name}`, body, targetWin);
}
```

`tfoot td` er fet i `openPrintPdf` sin stil. Den har også en kantlinje over hver rad, men det godtas. `fmtNum` tar bare ett tall (`pdf.ts:103`), så sjekk signaturen før du bruker den.

- [ ] **Steg 3: Legg til PDF-knappen i skjemaet**

I `src/components/calculation-form.tsx`:
- Legg `FileDown` til i lucide-importen.
- Legg til `import { openCalculationPdf } from "@/lib/pdf";`.
- Bytt ut `{/* PDF-KNAPP */}` med:

```tsx
          <Button
            variant="outline"
            onClick={() => {
              // Vinduet åpnes i selve klikket. Ellers blokkerer nettleseren det.
              const win = window.open("", "_blank", "width=900,height=1100");
              if (!win) { toast.error("Nettleseren blokkerte PDF-vinduet. Tillat popup-vinduer for denne siden og prøv igjen."); return; }
              openCalculationPdf(
                { name: hode.name || "Kalkyle", customer_text: hode.customer_text, markup_pct: hode.markup_pct, lines: linjer },
                { company_name: appSettings?.company_name ?? "", company_org_nr: appSettings?.company_org_nr ?? "", logo_url: appSettings?.logo_url ?? "", vat_pct: vatPct },
                win,
              );
            }}
          >
            <FileDown className="mr-1 h-4 w-4" />PDF
          </Button>
```

Sjekk med Grep at `company_org_nr` finnes i `src/hooks/use-app-settings.ts`. Finnes den ikke, bruk `(appSettings as { company_org_nr?: string } | undefined)?.company_org_nr ?? ""`.

- [ ] **Steg 4: Bygg og sjekk HTML-en**

Kjør: `bun run build`. Forventet: går gjennom.

Sjekk utseendet uten innlogging med fremgangsmåten i minnenotatet om PDF-feilsøking:
- Bygg et lite skript med esbuild i scratchpad som kaller `openCalculationPdf` med et falskt `window`-objekt. Objektet fanger `document.write`.
- Bruk tre grupper med overskrift, én linje uten overskrift først og påslag på 10 %.
- Skriv HTML-en til fil og render den med hodeløs Edge over CDP til PDF. Se på resultatet.

Forventet:
- Kodekolonnen står til venstre, og delsummene står under hver gruppe.
- Påslag og mva står på egne linjer, og totalen er riktig.

- [ ] **Steg 5: Commit**

```bash
git add src/lib/pdf.ts src/components/calculation-form.tsx
git commit -m "Kalkyle: PDF med koder, delsummer, påslag og mva

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Oppgave 6: NS-kode på tilbudslinjer og i tilbuds-PDF-en

**Filer:**
- Endre: `src/components/offer-form.tsx` (`interface Line` ved linje 24, `linesInsert` ved linje ~400, tabellen ved linje ~1172 og mobilkortene ved linje ~1345)
- Endre: `src/lib/pdf.ts` (`interface OfferLine` ved linje 49, CSS ved linje 244-250, og `lineRow`/`tableHtml` i `openOfferPdf` ved linje ~930-975)

**Grensesnitt:**
- Bruker: `offer_lines.ns_code` fra oppgave 2.
- Leverer: `Line.ns_code?: string | null` i offer-form og `OfferLine.ns_code?: string | null` i pdf.ts. Oppgave 7 legger linjer med `ns_code` inn i skjemaet.

- [ ] **Steg 1: `ns_code` på linjen og ved lagring**

I `src/components/offer-form.tsx`, i `interface Line`, rett etter `is_heading?: boolean;`:

```ts
  /** NS 3420-kode fra kalkylen. null eller udefinert når linjen ikke har kode. */
  ns_code?: string | null;
```

I `linesInsert` i `save`, rett etter `is_heading: !!l.is_heading,`:

```ts
        ns_code: l.is_heading ? null : (l.ns_code?.trim() || null),
```

- [ ] **Steg 2: Kode-kolonnen på skrivebord**

Rett etter `const laast = isSigned && !laastOpp;` (linje ~473):

```ts
  // Kode-kolonnen vises bare når minst én linje har kode, altså når linjer er
  // hentet fra en kalkyle. Tilbud uten koder ser ut som før.
  const visKode = lines.some((l) => !l.is_heading && l.ns_code != null);
```

I `<thead>` i skrivebordstabellen, rett etter `<th className="w-8 px-1 py-2"></th>`:

```tsx
                  {visKode && <th className="w-24 px-2 py-2 text-left">Kode</th>}
```

Raden «Ingen linjer»: endre `colSpan={9}` til `colSpan={visKode ? 10 : 9}`.

Overskriftsraden: endre `<td className="px-2 py-2" colSpan={7}>` til `<td className="px-2 py-2" colSpan={visKode ? 8 : 7}>`.

Vanlig rad: rett etter `<td className="px-1 pt-3"><Checkbox ... /></td>`:

```tsx
                      {visKode && (
                        <td className="px-2 py-2">
                          <Input readOnly={laast} className="font-mono text-xs" value={l.ns_code ?? ""} onChange={(e) => updLine(i, { ns_code: e.target.value })} placeholder="Kode" />
                        </td>
                      )}
```

- [ ] **Steg 3: Kode på mobilkortet**

I mobilkortet for vanlige linjer, rett før `<div className="space-y-1.5">` med `<Label className="text-xs">Beskrivelse</Label>`:

```tsx
                    {l.ns_code != null && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">NS-kode</Label>
                        <Input readOnly={laast} className="font-mono" value={l.ns_code} onChange={(e) => updLine(i, { ns_code: e.target.value })} />
                      </div>
                    )}
```

- [ ] **Steg 4: Kode-kolonnen i tilbuds-PDF-en**

I `src/lib/pdf.ts`, i `interface OfferLine`, etter `is_heading?: boolean;`:

```ts
  /** NS 3420-kode. Gir en Kode-kolonne i PDF-en når minst én linje har den. */
  ns_code?: string | null;
```

CSS, rett etter `.items col.c-sum   { width: 14%; }` (linje 250):

```css
  .items col.c-code  { width: 10%; }
  .items.med-kode col.c-desc { width: 40%; }
  .items tbody td.code-cell { font-size: 9pt; color: var(--slate-600); white-space: nowrap; font-variant-numeric: tabular-nums; }
```

I `openOfferPdf`, rett etter `const included = lines.filter((l) => l.included);`:

```ts
  // Kode-kolonnen kommer bare med når tilbudet har NS-koder, så tilbud uten
  // koder ser ut akkurat som før.
  const visKode = included.some((l) => !l.is_heading && !!l.ns_code);
  const kolonner = visKode ? 7 : 6;
```

I `lineRow`:
- Endre `<td colspan="6">` i overskriftsraden til `<td colspan="${kolonner}">`.
- I vanlig rad, rett etter `return \`<tr data-sum="${net}">`, sett inn `${visKode ? \`<td class="code-cell">${escapeHtml(l.ns_code ?? "")}</td>\` : ""}` foran `${descCell}`.

I `tableHtml`:
- Endre `colspan="6"` i «Ingen linjer» til `colspan="${kolonner}"`.
- Endre `<table class="items">` til `<table class="items${visKode ? " med-kode" : ""}">`.
- Sett inn `${visKode ? '<col class="c-code"/>' : ""}` først i `<colgroup>`.
- Sett inn `${visKode ? "<th>Kode</th>" : ""}` foran `<th>Beskrivelse</th>`.

- [ ] **Steg 5: Sjekk at ingenting annet regner med seks kolonner**

Kjør Grep på `colspan|td:first-child|th:first-child` i `src/lib/pdf.ts`. Sjekk at `td:first-child { padding-left: 0; }` også ser greit ut for kodecellen. Det gjør den, fordi den bare fjerner venstre marg.

Kjør Grep på `children\[|cells\[|querySelectorAll\('td'\)` i kjøreskriptet (linje 455-850). Finner du kode som teller celler eller leser en bestemt celle, må den ta hensyn til den ekstra kolonnen.

- [ ] **Steg 6: Bygg og render**

Kjør: `bun run build`. Forventet: går gjennom.

Render tilbuds-PDF-en på samme måte som i oppgave 5, steg 4, i to varianter:
- a) linjer uten `ns_code`: skal se ut som før, med seks kolonner og samme bredder.
- b) 30 linjer med `ns_code` fordelt under to overskrifter: Kode-kolonnen er med, overskriftene går over hele bredden, og overføringssummene (carry) stemmer på hver side.

- [ ] **Steg 7: Commit**

```bash
git add src/components/offer-form.tsx src/lib/pdf.ts
git commit -m "Tilbud: NS-kode på linjene og Kode-kolonne i PDF-en

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Oppgave 7: «Legg til i tilbud»

**Filer:**
- Opprett: `src/components/kalkyle-til-tilbud.tsx`
- Endre: `src/components/calculation-form.tsx` (`{/* TILBUD-KNAPP */}`)
- Endre: `src/components/offer-form.tsx` (ny effekt etter `visKode`)

**Grensesnitt:**
- Bruker: `KalkyleImport`, `KalkyleLinje`, `kalkyleImportNokkel` og `kalkyleTilTilbudslinjer` fra oppgave 1, og `Line.ns_code` fra oppgave 6.
- Leverer: `KalkyleTilTilbud({ data: KalkyleImport })`, en knapp som åpner dialogen.

- [ ] **Steg 1: Lag dialogen**

`src/components/kalkyle-til-tilbud.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FilePlus, Search, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { kalkyleImportNokkel, type KalkyleImport } from "@/lib/kalkyle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface TilbudRad {
  id: string;
  offer_number: number | null;
  title: string | null;
  customer_name: string | null;
  status: string | null;
}

/**
 * Legger kalkylens linjer inn i et tilbud. Linjene skrives ikke rett i basen.
 * De legges i sessionStorage, og tilbudsskjemaet henter dem når det er lastet
 * (se offer-form.tsx). Et ulagret utkast for samme tilbud ville ellers slettet
 * dem ved neste lagring, og et nytt tilbud trenger kunde fra kunderegisteret.
 */
export function KalkyleTilTilbud({ data }: { data: KalkyleImport }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sok, setSok] = useState("");

  const { data: tilbud, isLoading } = useQuery({
    queryKey: ["offers-unsigned"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id, offer_number, title, customer_name, status")
        .is("customer_signed_at" as never, null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as TilbudRad[];
    },
  });

  const synlige = useMemo(() => {
    const q = sok.trim().toLowerCase();
    return (tilbud ?? []).filter((t) => !q ||
      String(t.offer_number ?? "").includes(q) ||
      (t.title ?? "").toLowerCase().includes(q) ||
      (t.customer_name ?? "").toLowerCase().includes(q));
  }, [tilbud, sok]);

  const send = (offerId?: string) => {
    sessionStorage.setItem(kalkyleImportNokkel(offerId), JSON.stringify(data));
    setOpen(false);
    if (offerId) navigate({ to: "/tilbud/$id", params: { id: offerId } });
    else navigate({ to: "/tilbud/ny" });
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={!data.linjer.length}>
        <Send className="mr-1 h-4 w-4" />Legg til i tilbud
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Legg til i tilbud</DialogTitle>
            <DialogDescription>
              Postene legges sist i tilbudet under overskriften «{data.navn}», uten kalkylepåslaget. Tilbudet bruker sin egen adm.kost.
              Trykk Lagre i tilbudet etterpå.
            </DialogDescription>
          </DialogHeader>
          <Button className="w-full justify-start" variant="secondary" onClick={() => send()}>
            <FilePlus className="mr-2 h-4 w-4" />Nytt tilbud
          </Button>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Søk tilbudsnummer, tittel eller kunde…" value={sok} onChange={(e) => setSok(e.target.value)} />
          </div>
          <div className="max-h-80 overflow-y-auto rounded border">
            {isLoading ? <p className="p-3 text-muted-foreground">Laster…</p>
              : synlige.length === 0 ? <p className="p-3 text-muted-foreground">Ingen tilbud som kan endres.</p>
              : synlige.map((t) => (
                <button key={t.id} type="button" className="flex w-full items-baseline gap-3 border-b px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => send(t.id)}>
                  <span className="w-14 shrink-0 tabular-nums text-muted-foreground">#{t.offer_number}</span>
                  <span className="flex-1 font-medium">{t.title}</span>
                  <span className="text-muted-foreground">{t.customer_name}</span>
                  <span className="w-20 text-right text-xs text-muted-foreground">{t.status}</span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

Sjekk med Glob at `src/components/ui/dialog.tsx` finnes og eksporterer navnene over. Finnes ikke `.is("customer_signed_at" as never, null)` som typer, er castingen nok. Bygget typesjekker ikke.

- [ ] **Steg 2: Knappen i kalkylen**

I `src/components/calculation-form.tsx`, legg til `import { KalkyleTilTilbud } from "@/components/kalkyle-til-tilbud";` og bytt ut `{/* TILBUD-KNAPP */}` med:

```tsx
          <KalkyleTilTilbud data={{ navn: hode.name.trim() || "Kalkyle", markup_pct: Number(hode.markup_pct || 0), linjer }} />
```

- [ ] **Steg 3: Importen i tilbudsskjemaet**

I `src/components/offer-form.tsx`, legg til importen:

```ts
import { kalkyleImportNokkel, kalkyleTilTilbudslinjer, type KalkyleImport } from "@/lib/kalkyle";
```

Rett etter `const visKode = ...` fra oppgave 6:

```ts
  // Linjer fra en kalkyle (se kalkyle-til-tilbud.tsx). De legges inn her, etter
  // at skjemaet og et eventuelt utkast er lastet, og ikke rett i basen: et
  // ulagret utkast for samme tilbud ville ellers slettet dem ved neste lagring.
  // Nøkkelen fjernes før noe annet, så linjene ikke legges inn to ganger når
  // effekten kjøres på nytt.
  useEffect(() => {
    if (!initialized) return;
    const key = kalkyleImportNokkel(offerId);
    const raa = sessionStorage.getItem(key);
    if (!raa) return;
    sessionStorage.removeItem(key);
    if (laast) {
      toast.error("Tilbudet er signert. Linjene fra kalkylen ble ikke lagt inn.");
      return;
    }
    let imp: KalkyleImport;
    try { imp = JSON.parse(raa); } catch { return; }
    let antall = 0;
    userEditedRef.current = true;
    setLines((p) => {
      const nye = kalkyleTilTilbudslinjer(imp.navn, imp.linjer, p.length);
      antall = nye.length;
      return [...p, ...nye];
    });
    if (!isEdit) {
      setOffer((o) => ({ ...o, title: o.title.trim() ? o.title : imp.navn, admin_cost_pct: Number(imp.markup_pct || 0) }));
    }
    toast.success(`${antall || imp.linjer.length + 1} linjer lagt til fra kalkylen – trykk Lagre`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);
```

Sjekk:
- `useEffect` og `toast` er alt importert i fila.
- Det finnes ingen `return` på komponentnivå før denne linjen. Den første er `if (isEdit && !initialized) return ...` langt nede i render-delen, så hook-rekkefølgen er stabil.
- Kommentaren `eslint-disable-next-line` trengs bare hvis `bun run lint` klager. Fjern den ellers.

- [ ] **Steg 4: Bygg og lint**

Kjør: `bun run build && bun run test`
Forventet: alt går gjennom.

Kjør: `bunx eslint src/components/offer-form.tsx src/components/calculation-form.tsx src/components/kalkyle-til-tilbud.tsx src/routes/kalkyle.*.tsx src/lib/kalkyle*.ts`
Forventet: ingen nye feil.

- [ ] **Steg 5: Sjekk overføringen**

Panelet er utlogget, så det fulle klikkløpet kan ikke kjøres her. Sjekk det som lar seg sjekke:
- `kalkyleTilTilbudslinjer` er dekket av testene i oppgave 1.
- Kjør `/tilbud/ny?tsr-split=component` og `/kalkyle/ny?tsr-split=component` i forhåndsvisningen. De skal laste uten konsollfeil.
- Be brukeren gjøre én runde innlogget: kalkyle → «Legg til i tilbud» → eksisterende tilbud → Lagre. Tilbudet skal få overskrift og poster sist, Kode-kolonnen skal vises, og PDF-en skal vise den.

- [ ] **Steg 6: Commit**

```bash
git add src/components/kalkyle-til-tilbud.tsx src/components/calculation-form.tsx src/components/offer-form.tsx
git commit -m "Kalkyle: legg postene inn i nytt eller eksisterende tilbud

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
