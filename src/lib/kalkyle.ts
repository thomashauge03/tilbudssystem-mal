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

/**
 * Startlinjene i en ny kalkyle: alle aktive koder i kodebanken, sortert som i
 * standarden. Brukeren luker bort det som ikke trengs i stedet for å søke opp
 * hver kode.
 */
export const alleKoderSomLinjer = (koder: NsKode[]): KalkyleLinje[] =>
  koder.filter((k) => k.active).sort(sammenlignKoder).map(linjeFraKode);

/** Fjerner poster uten mengde. Overskrifter og fritekstlinjer med tekst blir stående. */
export const utenTommePoster = (linjer: KalkyleLinje[]): KalkyleLinje[] =>
  linjer.filter((l) => l.is_heading || Number(l.quantity || 0) !== 0 || (!l.ns_code?.trim() && !!l.description.trim()));

export const tomLinje = (enhet: string): KalkyleLinje =>
  ({ ns_code: null, description: "", unit: enhet, quantity: 0, unit_price: 0 });

export const tomOverskrift = (): KalkyleLinje =>
  ({ ns_code: null, description: "", unit: "", quantity: 0, unit_price: 0, is_heading: true });

/** Har linjen en kode som skal vises? Overskrifter og tomme koder teller ikke. */
export const harKode = (l: { is_heading?: boolean | null; ns_code?: string | null }) =>
  !l.is_heading && !!l.ns_code?.trim();

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
