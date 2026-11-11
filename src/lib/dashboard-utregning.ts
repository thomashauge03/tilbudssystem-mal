// Utregningen bak dashbordet, uten Supabase.
//
// Alt her er rene funksjoner av rådataene og dagens dato, så tallene kan
// regnes ut og etterprøves med node mot en eksport av databasen. Hentingen
// ligger i dashboard-data.ts. Kolonnene står i UTVALG under, og hentingen må
// bruke nøyaktig dem: mangler en kolonne, blir tallet stille feil.

import {
  offerTotal,
  amendmentTotal,
  lineNet,
  isAmendmentRejected,
  OFFER_WON_STATUSES,
  OFFER_COMPLETED,
  OFFER_SENT,
  OFFER_REJECTED,
  type LineLike,
} from "./format";
import type {
  DashboardData,
  Hendelse,
  Jobb,
  KravSomVenter,
  Kunde,
  Maned,
  SjekkPunkt,
  TilbudSomVenter,
} from "./dashboard-typer";

// ─── Rådata ────────────────────────────────────────────────────────────────

/** Select-strengene. Hentingen i appen og etterprøvingen med node bruker de samme. */
export const UTVALG = {
  offers:
    "id, offer_number, title, status, customer_id, customer_name, customer_email, offer_date, valid_until, created_at, customer_signed_at, rejected_at, admin_cost_pct, offer_lines(id, quantity, unit_price, discount_pct, included, is_heading), customers(phone, email)",
  amendments:
    "id, offer_id, amendment_number, title, status, notified_date, sent_at, created_at, customer_signed_at, rejected_at, amendment_lines(id, quantity, unit_price, discount_pct, is_heading)",
  payments:
    "id, amount, paid, paid_date, invoice_date, created_at, offer_id, amendment_id, tripletex_status, tripletex_faktura_dato",
  delpost_fullfort: "offer_line_id, offer_id, amendment_id, andel",
  app_settings: "payment_terms",
} as const;

type Linje = LineLike & { id: string };

export type RaaTilbud = {
  id: string;
  offer_number: number;
  title: string | null;
  status: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  offer_date: string | null;
  valid_until: string | null;
  created_at: string;
  customer_signed_at: string | null;
  rejected_at: string | null;
  admin_cost_pct: number | null;
  offer_lines: Linje[] | null;
  /** Kunden i kunderegisteret, via customer_id. */
  customers: { phone: string | null; email: string | null } | null;
};

export type RaaEndring = {
  id: string;
  offer_id: string | null;
  amendment_number: string | null;
  title: string | null;
  status: string | null;
  notified_date: string | null;
  sent_at: string | null;
  created_at: string;
  customer_signed_at: string | null;
  rejected_at: string | null;
  amendment_lines: Linje[] | null;
};

export type RaaBetaling = {
  id: string;
  amount: number | string | null;
  paid: boolean | null;
  paid_date: string | null;
  invoice_date: string | null;
  created_at: string;
  offer_id: string | null;
  amendment_id: string | null;
  tripletex_status: string | null;
  tripletex_faktura_dato: string | null;
};

export type RaaFullfort = {
  offer_line_id: string;
  offer_id: string | null;
  amendment_id: string | null;
  andel: number | string;
};

export type Raadata = {
  offers: RaaTilbud[];
  amendments: RaaEndring[];
  payments: RaaBetaling[];
  /** Tom når tabellen mangler eller ikke kunne leses. */
  delpostFullfort: RaaFullfort[];
  /** Fra app_settings, f.eks. «30 dager netto». */
  paymentTerms: string | null;
};

// ─── Datoer ────────────────────────────────────────────────────────────────

const OSLO = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * «YYYY-MM-DD» i norsk tid. Et tidsstempel som 2026-10-31T23:30Z er 1. november
 * her, og skal telle i november. En ren dato står som den er.
 */
export function lokalDato(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? null : OSLO.format(d);
}

const dagNr = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

/** Dager fra a til b (b − a), hele dager. */
const dagerMellom = (a: string, b: string) => Math.round(dagNr(b) - dagNr(a));

const leggTilDager = (iso: string, n: number) =>
  new Date((dagNr(iso) + n) * 86400000).toISOString().slice(0, 10);

/** «2026-11» flyttet n måneder. */
function flyttManed(ym: string, n: number) {
  const tot = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n;
  return `${Math.floor(tot / 12)}-${String((tot % 12) + 1).padStart(2, "0")}`;
}

const KORT = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const LANG = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

// ─── Tall og tekst ─────────────────────────────────────────────────────────

const tall = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Mindre enn en krone er avrunding, ikke penger. */
const ORE = 1;

/** «3,1 mill». */
const mill = (n: number, desimaler = 1) => `${(n / 1e6).toFixed(desimaler).replace(".", ",")} mill`;

/** «59 419», hele kroner med mellomrom som tusenskille. */
const kroner = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/ | /g, " ");

/** «28.09.2025». */
const norskDato = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/**
 * «Tilbud - Asfaltering» → «Asfaltering». Ordet sier ingenting når det står foran hvert tilbud.
 * Første bokstav gjøres stor, ellers blir «Tilbud - reparasjon av …» til en tittel som starter med liten bokstav.
 */
export const rensTittel = (t: string | null | undefined) => {
  const s = String(t ?? "").replace(/^tilbud\s*[-–]\s*/i, "").trim();
  return s.charAt(0).toLocaleUpperCase("nb-NO") + s.slice(1);
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Første tall i «30 dager netto». Ellers 30. */
export function betalingsfrist(terms: string | null | undefined) {
  const m = String(terms ?? "").match(/\d+/);
  const n = m ? parseInt(m[0], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

// ─── Regler ────────────────────────────────────────────────────────────────

/** Godkjent: signert digitalt eller godkjent for hånd (status endringsmelding), og ikke avslått. Som Status-siden. */
export const erEndringGodkjent = (a: RaaEndring) =>
  !isAmendmentRejected(a) && (!!a.customer_signed_at || a.status === "endringsmelding");

/** Krav som venter på kunden: verken avslått eller godkjent. */
export const erKrav = (a: RaaEndring) => !isAmendmentRejected(a) && !erEndringGodkjent(a);

const FAKTURERT_STATUS = ["fakturert", "delvis_betalt", "betalt"];

/** Fakturaen er sendt: betalt, eller fakturert i Tripletex. */
const erFakturert = (p: Pick<RaaBetaling, "paid" | "tripletex_status">) =>
  !!p.paid || FAKTURERT_STATUS.includes(p.tripletex_status ?? "");

/** Ordre i Tripletex som ikke er fakturert ennå. */
const erKlar = (p: RaaBetaling) => p.tripletex_status === "ordre" && !p.paid;

const fakturadato = (p: RaaBetaling) =>
  lokalDato(p.tripletex_faktura_dato) ?? lokalDato(p.invoice_date) ?? lokalDato(p.paid_date) ?? lokalDato(p.created_at);

/**
 * Så langt før opprettelsen kan tilbudsdatoen ligge før vi regner den som feilskrevet.
 * Ikke 60: #1010 (70 dager) og #1017 (84 dager) er ekte kontrakter som ble lagt inn
 * etter at systemet ble tatt i bruk i juni. Feil år (#1029) gir nærmere 365.
 */
const MAKS_DAGER_FOR_LAGET = 180;

/** Tilbudsdatoen er trolig feil (f.eks. feil år) når den ligger langt før tilbudet ble laget. */
const harFeilTilbudsdato = (o: RaaTilbud) => {
  const d = lokalDato(o.offer_date);
  const laget = lokalDato(o.created_at);
  return !!d && !!laget && dagerMellom(d, laget) > MAKS_DAGER_FOR_LAGET;
};

/** Datoen tilbudet ble gitt: offer_date, eller created_at når offer_date mangler eller er feilskrevet. */
const tilbudDato = (o: RaaTilbud) =>
  (harFeilTilbudsdato(o) ? null : lokalDato(o.offer_date)) ?? lokalDato(o.created_at);

// ─── Igjen å fakturere ─────────────────────────────────────────────────────
//
// Regelen deles med Status-siden, så «igjen» er samme tall begge steder:
// - en jobb er tilbudet pluss de godkjente endringene på det,
// - en fullført jobb har ingenting igjen, uansett hvor mye som er fakturert,
// - en jobb har aldri mindre enn 0 igjen: det som er fakturert for mye på én
//   jobb, skal ikke trekkes fra det som står igjen på de andre,
// - det som står igjen på poster merket ferdig i delordren, skal ikke faktureres.

/** Det som trengs av et tilbud for å regne ut igjen. */
export type IgjenTilbud = Pick<RaaTilbud, "id" | "status" | "admin_cost_pct" | "offer_lines">;
/** Det som trengs av en godkjent endring for å regne ut igjen. */
export type IgjenEndring = Pick<RaaEndring, "id" | "offer_id" | "amendment_lines">;
/** Det som trengs av en betaling for å regne ut igjen. */
export type IgjenBetaling = Pick<RaaBetaling, "amount" | "paid" | "offer_id" | "amendment_id" | "tripletex_status">;

/** Igjen på én jobb. Under en krone er avrunding og regnes som 0. */
export function igjenPaJobb(kontrakt: number, fakturert: number, fullfort: boolean, restFerdigePoster = 0) {
  if (fullfort) return 0;
  const r = kontrakt - fakturert - restFerdigePoster;
  return r < ORE ? 0 : r;
}

/** Det av postene merket ferdig som aldri skal faktureres, per tilbud og per endring. */
export function restPaFerdigePoster(tilbud: IgjenTilbud[], endringer: IgjenEndring[], ferdige: RaaFullfort[]) {
  const linjeTilbud = new Map<string, { linje: Linje; adminPct: number }>();
  for (const o of tilbud)
    for (const l of o.offer_lines ?? [])
      if (l.included !== false) linjeTilbud.set(l.id, { linje: l, adminPct: tall(o.admin_cost_pct) });
  const linjeEndring = new Map<string, Linje>();
  for (const a of endringer) for (const l of a.amendment_lines ?? []) linjeEndring.set(l.id, l);

  const restTilbud = new Map<string, number>();
  const restEndring = new Map<string, number>();
  for (const f of ferdige) {
    const andel = Math.min(100, Math.max(0, tall(f.andel)));
    if (f.amendment_id) {
      const l = linjeEndring.get(f.offer_line_id);
      if (l) restEndring.set(f.amendment_id, (restEndring.get(f.amendment_id) ?? 0) + lineNet(l) * ((100 - andel) / 100));
    } else if (f.offer_id) {
      const t = linjeTilbud.get(f.offer_line_id);
      if (t)
        restTilbud.set(
          f.offer_id,
          (restTilbud.get(f.offer_id) ?? 0) + lineNet(t.linje) * ((100 - andel) / 100) * (1 + t.adminPct / 100),
        );
    }
  }
  return { restTilbud, restEndring };
}

/**
 * Igjen å fakturere for et utvalg vunne tilbud og godkjente endringer. Betalingene kan gjelde hva som helst:
 * bare de som hører til utvalget, telles. En endring uten tilbud i utvalget regnes som en jobb for seg.
 */
export function igjenAFakturere(
  tilbud: IgjenTilbud[],
  endringer: IgjenEndring[],
  betalinger: IgjenBetaling[],
  ferdige: RaaFullfort[] = [],
) {
  const fakturertPaTilbud = new Map<string, number>();
  const fakturertPaEndring = new Map<string, number>();
  for (const p of betalinger) {
    if (p.tripletex_status === "kreditert" || !erFakturert(p)) continue;
    const m = p.amendment_id ? fakturertPaEndring : fakturertPaTilbud;
    const id = p.amendment_id ?? p.offer_id;
    if (id) m.set(id, (m.get(id) ?? 0) + tall(p.amount));
  }
  const { restTilbud, restEndring } = restPaFerdigePoster(tilbud, endringer, ferdige);
  const tilbudIder = new Set(tilbud.map((o) => o.id));

  let igjen = 0;
  for (const o of tilbud) {
    const endr = endringer.filter((a) => a.offer_id === o.id);
    igjen += igjenPaJobb(
      offerTotal(o.offer_lines, o.admin_cost_pct) + sum(endr.map((a) => amendmentTotal(a.amendment_lines))),
      (fakturertPaTilbud.get(o.id) ?? 0) + sum(endr.map((a) => fakturertPaEndring.get(a.id) ?? 0)),
      o.status === OFFER_COMPLETED,
      (restTilbud.get(o.id) ?? 0) + sum(endr.map((a) => restEndring.get(a.id) ?? 0)),
    );
  }
  for (const a of endringer)
    if (!a.offer_id || !tilbudIder.has(a.offer_id))
      igjen += igjenPaJobb(
        amendmentTotal(a.amendment_lines),
        fakturertPaEndring.get(a.id) ?? 0,
        false,
        restEndring.get(a.id) ?? 0,
      );
  return igjen;
}

// ─── Utregningen ───────────────────────────────────────────────────────────

/**
 * Regner ut hele dashbordet. `idag` er «YYYY-MM-DD» i norsk tid.
 */
export function lagDashboard(raa: Raadata, idag: string): DashboardData {
  const frist = betalingsfrist(raa.paymentTerms);

  const tilbudPaId = new Map(raa.offers.map((o) => [o.id, o]));
  const tilbudSum = new Map(raa.offers.map((o) => [o.id, offerTotal(o.offer_lines, o.admin_cost_pct)]));
  const endringSum = new Map(raa.amendments.map((a) => [a.id, amendmentTotal(a.amendment_lines)]));

  const vunnet = raa.offers.filter((o) => OFFER_WON_STATUSES.includes(o.status ?? ""));
  const vunnetIder = new Set(vunnet.map((o) => o.id));
  const godkjente = raa.amendments.filter(erEndringGodkjent);
  const godkjentIder = new Set(godkjente.map((a) => a.id));

  // Kreditert telles aldri. En rad med amendment_id hører til endringen, ellers til tilbudet.
  const betalinger = raa.payments.filter((p) => p.tripletex_status !== "kreditert");
  const paKontrakt = betalinger.filter((p) =>
    p.amendment_id ? godkjentIder.has(p.amendment_id) : !!p.offer_id && vunnetIder.has(p.offer_id),
  );
  const fakturertRader = paKontrakt.filter(erFakturert);

  const fakturertPaTilbud = new Map<string, number>();
  const fakturertPaEndring = new Map<string, number>();
  for (const p of fakturertRader) {
    const m = p.amendment_id ? fakturertPaEndring : fakturertPaTilbud;
    const id = (p.amendment_id ?? p.offer_id)!;
    m.set(id, (m.get(id) ?? 0) + tall(p.amount));
  }

  // Rest på poster merket ferdig: det av posten som aldri skal faktureres.
  const { restTilbud, restEndring } = restPaFerdigePoster(raa.offers, raa.amendments, raa.delpostFullfort ?? []);

  const endringerPaTilbud = new Map<string, RaaEndring[]>();
  for (const a of godkjente)
    if (a.offer_id) endringerPaTilbud.set(a.offer_id, [...(endringerPaTilbud.get(a.offer_id) ?? []), a]);

  /** Fakturert mer enn summen, for tilbudet alene (uten endringene) og for én endring. 0 når det ikke er det. */
  const over = (f: number, s: number) => (f - s > ORE ? f - s : 0);
  const overTilbud = (o: RaaTilbud) => over(fakturertPaTilbud.get(o.id) ?? 0, tilbudSum.get(o.id)!);
  const overEndring = (a: RaaEndring) => over(fakturertPaEndring.get(a.id) ?? 0, endringSum.get(a.id)!);

  // ── Jobbene ──
  const jobber: Jobb[] = vunnet.map((o) => {
    const endr = endringerPaTilbud.get(o.id) ?? [];
    const kontrakt = tilbudSum.get(o.id)! + sum(endr.map((a) => endringSum.get(a.id)!));
    const fakturert = (fakturertPaTilbud.get(o.id) ?? 0) + sum(endr.map((a) => fakturertPaEndring.get(a.id) ?? 0));
    const rest = (restTilbud.get(o.id) ?? 0) + sum(endr.map((a) => restEndring.get(a.id) ?? 0));
    const igjen = igjenPaJobb(kontrakt, fakturert, o.status === OFFER_COMPLETED, rest);
    // Tilbudet og hver endring sjekkes for seg, så en feil på én endring ikke
    // skjules av det som står igjen på tilbudet, eller telles to ganger.
    const forMye = overTilbud(o) + sum(endr.map(overEndring));
    return {
      id: o.id,
      nummer: o.offer_number,
      tittel: rensTittel(o.title),
      kunde: o.customer_name,
      kontrakt,
      fakturert,
      igjen,
      prosentFakturert: kontrakt > 0 ? (fakturert / kontrakt) * 100 : fakturert > 0 ? 100 : 0,
      fase: igjen === 0 ? "ferdig" : fakturert < ORE ? "ikke_startet" : "i_gang",
      fakturertForMye: forMye,
    };
  });
  jobber.sort((a, b) => b.igjen - a.igjen || a.nummer - b.nummer);

  // Godkjente endringer uten et vunnet tilbud hører ikke til noen jobb, men er avtalt og skal med i pengene.
  const lose = godkjente.filter((a) => !a.offer_id || !vunnetIder.has(a.offer_id));
  const loseIgjen = sum(
    lose.map((a) =>
      igjenPaJobb(endringSum.get(a.id)!, fakturertPaEndring.get(a.id) ?? 0, false, restEndring.get(a.id) ?? 0),
    ),
  );

  // ── Pengene ──
  const kontraktTilbud = sum(vunnet.map((o) => tilbudSum.get(o.id)!));
  const kontraktEndringer = sum(godkjente.map((a) => endringSum.get(a.id)!));
  const kontraktssum = kontraktTilbud + kontraktEndringer;
  const fakturert = sum(fakturertRader.map((p) => tall(p.amount)));
  const betalt = sum(paKontrakt.filter((p) => p.paid).map((p) => tall(p.amount)));
  const ubetalte = fakturertRader.filter((p) => !p.paid);
  const forfalte = ubetalte.filter((p) => {
    const d = fakturadato(p);
    return !!d && leggTilDager(d, frist) < idag;
  });
  const igjen = sum(jobber.map((j) => j.igjen)) + loseIgjen;

  const ikkeStartet = jobber.filter((j) => j.fase === "ikke_startet").slice(0, 2);
  const ikkeStartetSum = sum(ikkeStartet.map((j) => j.igjen));
  const hvorPengeneLigger =
    ikkeStartet.length > 0 && igjen > 0 && ikkeStartetSum > igjen * 0.3
      ? `${mill(ikkeStartetSum)} av dette er ${ikkeStartet.map((j) => j.tittel || `#${j.nummer}`).join(" og ")}, som ikke er startet.`
      : null;

  // ── Tilbud som venter på svar ──
  const sendt = raa.offers.filter((o) => o.status === OFFER_SENT);
  const tilbudSomVenter: TilbudSomVenter[] = sendt.map((o) => {
    const fristDato = lokalDato(o.valid_until);
    const dager = fristDato ? dagerMellom(idag, fristDato) : null;
    return {
      id: o.id,
      nummer: o.offer_number,
      tittel: rensTittel(o.title),
      kunde: o.customer_name,
      telefon: o.customers?.phone?.trim() || null,
      epost: o.customers?.email?.trim() || o.customer_email?.trim() || null,
      belop: tilbudSum.get(o.id)!,
      fristDato,
      dagerTilFrist: dager,
      borLukkes: dager !== null && dager < -30,
    };
  });
  const passert = (t: TilbudSomVenter) => t.dagerTilFrist !== null && t.dagerTilFrist < 0;
  tilbudSomVenter.sort((a, b) => {
    if (passert(a) !== passert(b)) return passert(a) ? -1 : 1;
    if (passert(a)) return b.belop - a.belop;
    // Nærmeste frist først, uten frist sist.
    return (a.dagerTilFrist ?? Infinity) - (b.dagerTilFrist ?? Infinity) || b.belop - a.belop;
  });

  // ── Krav som venter på kunden ──
  const kravSomVenter: KravSomVenter[] = raa.amendments.filter(erKrav).map((a) => {
    const t = a.offer_id ? tilbudPaId.get(a.offer_id) : undefined;
    const belop = endringSum.get(a.id)!;
    const sendtDato = lokalDato(a.sent_at);
    return {
      id: a.id,
      nummer: a.amendment_number ?? "",
      tittel: rensTittel(a.title),
      kunde: t?.customer_name ?? null,
      telefon: t?.customers?.phone?.trim() || null,
      belop,
      sendtDato,
      dagerSidenSendt: sendtDato ? dagerMellom(sendtDato, idag) : null,
      ikkeSendt: !sendtDato,
      manglerBelop: Math.abs(belop) < ORE,
    };
  });
  const gruppe = (k: KravSomVenter) => (k.ikkeSendt ? 0 : k.manglerBelop ? 2 : 1);
  kravSomVenter.sort(
    (a, b) =>
      gruppe(a) - gruppe(b) ||
      b.belop - a.belop ||
      (b.dagerSidenSendt ?? 0) - (a.dagerSidenSendt ?? 0) ||
      a.nummer.localeCompare(b.nummer, "nb", { numeric: true }),
  );
  const kravGamle = kravSomVenter.filter((k) => k.dagerSidenSendt !== null && k.dagerSidenSendt > 30);
  const kravOver30Dager = sum(kravGamle.map((k) => k.belop));

  // ── Måneder ──
  const denne = idag.slice(0, 7);
  const manedKoder = Array.from({ length: 6 }, (_, i) => flyttManed(denne, i - 5));
  const nye = new Map<string, number>();
  const leggTil = (m: Map<string, number>, dato: string | null, n: number) => {
    if (!dato) return;
    const k = dato.slice(0, 7);
    m.set(k, (m.get(k) ?? 0) + n);
  };
  for (const o of vunnet)
    leggTil(nye, lokalDato(o.customer_signed_at) ?? tilbudDato(o), tilbudSum.get(o.id)!);
  for (const a of godkjente)
    leggTil(nye, lokalDato(a.customer_signed_at) ?? lokalDato(a.notified_date) ?? lokalDato(a.created_at), endringSum.get(a.id)!);
  const fakt = new Map<string, number>();
  for (const p of fakturertRader) leggTil(fakt, fakturadato(p), tall(p.amount));

  const maneder: Maned[] = manedKoder.map((k) => ({
    maned: k,
    navn: KORT[+k.slice(5, 7) - 1],
    nyeJobber: nye.get(k) ?? 0,
    fakturert: fakt.get(k) ?? 0,
    hittil: k === denne,
  }));
  const siste3 = maneder.slice(-3);
  const inn3 = sum(siste3.map((m) => m.nyeJobber));
  const fakt3 = sum(siste3.map((m) => m.fakturert));
  const manederSetning = `Fra 1. ${LANG[+siste3[0].maned.slice(5, 7) - 1]}: ${mill(inn3)} i nye jobber, ${mill(fakt3)} fakturert.`;

  // ── Tilbud ──
  const forrige = flyttManed(denne, -1);
  const gitt = raa.offers.filter((o) => o.status !== "utkast");
  const gittDenne = gitt.filter((o) => tilbudDato(o)?.slice(0, 7) === denne);
  const gittForrige = gitt.filter((o) => tilbudDato(o)?.slice(0, 7) === forrige);

  const fraDato = `${flyttManed(denne, -12)}-${idag.slice(8, 10)}`;
  const siste12 = raa.offers.filter((o) => (tilbudDato(o) ?? "") >= fraDato);
  const fatt = siste12.filter((o) => OFFER_WON_STATUSES.includes(o.status ?? ""));
  const tapt = siste12.filter((o) => o.status === OFFER_REJECTED);
  const aldri = siste12.filter((o) => o.status === OFFER_SENT && !!o.valid_until && lokalDato(o.valid_until)! < idag);
  // Vanlig størrelse (median), ikke gjennomsnitt: ett tapt tilbud på 17,6 mill
  // drog snittet for tapte opp til 1,69 mill. Tilbud på 0 kr er ikke en jobb og telles ikke.
  const snitt = (xs: RaaTilbud[]) => median(xs.map((o) => tilbudSum.get(o.id)!).filter((n) => n >= ORE));

  // ── Største kunder ──
  const perKunde = new Map<string, Kunde>();
  for (const j of jobber) {
    const navn = j.kunde?.trim() || "Uten kunde";
    const k = perKunde.get(navn) ?? { navn, kontrakt: 0, fakturert: 0, prosentFakturert: 0 };
    k.kontrakt += j.kontrakt;
    k.fakturert += j.fakturert;
    perKunde.set(navn, k);
  }
  const kunder = [...perKunde.values()]
    .map((k) => ({ ...k, prosentFakturert: k.kontrakt > 0 ? (k.fakturert / k.kontrakt) * 100 : 0 }))
    .sort((a, b) => b.kontrakt - a.kontrakt)
    .slice(0, 5);

  // ── Bør sjekkes ──
  // Én linje per tilbud eller endring som har feilen, så samme sak bare står ett
  // sted. Tilbudet sjekkes uten endringene, og hver endring for seg.
  const borSjekkes: SjekkPunkt[] = [];
  const tilEndring = (a: RaaEndring) => ({ to: "/endringsmeldinger/$id" as const, id: a.id });
  const betaltPaEndring = (a: RaaEndring) =>
    sum(paKontrakt.filter((p) => p.paid && p.amendment_id === a.id).map((p) => tall(p.amount)));

  for (const o of vunnet.filter((o) => overTilbud(o) > 0).sort((a, b) => overTilbud(b) - overTilbud(a)))
    borSjekkes.push({
      tekst: `#${o.offer_number}: fakturert ${kroner(overTilbud(o))} kr mer enn tilbudet. Sjekk beløpene.`,
      lenke: { to: "/tilbud/$id", id: o.id },
    });

  // En endring med minus i sum får sin egen linje under, og står ikke også her.
  const minus = godkjente.concat(raa.amendments.filter(erKrav)).filter((a) => endringSum.get(a.id)! < -ORE);
  const minusIder = new Set(minus.map((a) => a.id));
  for (const a of godkjente
    .filter((a) => overEndring(a) > 0 && !minusIder.has(a.id))
    .sort((a, b) => overEndring(b) - overEndring(a))) {
    const f = fakturertPaEndring.get(a.id) ?? 0;
    borSjekkes.push({
      tekst:
        Math.abs(endringSum.get(a.id)!) < ORE
          ? `Endring ${a.amendment_number}: ${kroner(f)} kr er fakturert, men endringen står med 0 kr. Legg inn beløpet.`
          : `Endring ${a.amendment_number}: fakturert ${kroner(overEndring(a))} kr mer enn avtalt. Sjekk beløpene.`,
      lenke: tilEndring(a),
    });
  }
  for (const a of minus) {
    const s = -endringSum.get(a.id)!;
    const betalt = betaltPaEndring(a);
    const fakt = fakturertPaEndring.get(a.id) ?? 0;
    borSjekkes.push({
      tekst:
        Math.abs(betalt - s) < ORE
          ? `Endring ${a.amendment_number} står med minus ${kroner(s)} kr, men kunden har betalt ${kroner(betalt)} kr. Trolig feil fortegn. Rett linjen.`
          : `Endring ${a.amendment_number} står med minus ${kroner(s)} kr${fakt > ORE ? `, og ${kroner(fakt)} kr er fakturert` : ""}. Sjekk linjene.`,
      lenke: tilEndring(a),
    });
  }
  for (const o of raa.offers.filter((o) => o.status !== "utkast" && harFeilTilbudsdato(o)))
    borSjekkes.push({
      tekst: `#${o.offer_number} har tilbudsdato ${norskDato(lokalDato(o.offer_date)!)}, men ble laget ${norskDato(lokalDato(o.created_at)!)}. Sjekk datoen.`,
      lenke: { to: "/tilbud/$id", id: o.id },
    });
  for (const t of tilbudSomVenter.filter((t) => t.borLukkes).sort((a, b) => a.dagerTilFrist! - b.dagerTilFrist!))
    borSjekkes.push({
      tekst: `#${t.nummer} er ${-t.dagerTilFrist!} dager over fristen. Merk som avslått hvis jobben er tapt.`,
      lenke: { to: "/tilbud/$id", id: t.id },
    });

  // ── Siste 7 dager ──
  const fra7 = leggTilDager(idag, -6);
  const hendelser: (Hendelse & { tid: string })[] = [];
  // Kort tekst: «{hva} · {nummer} {tittel}». Beløp 0 er ikke et beløp og blir null.
  const nyHendelse = (tid: string | null, hva: string, navn: string, h: Omit<Hendelse, "dato" | "tekst">) => {
    const dato = lokalDato(tid);
    if (dato && dato >= fra7 && dato <= idag)
      hendelser.push({
        ...h,
        tekst: navn ? `${hva} · ${navn}` : hva,
        belop: h.belop !== null && Math.abs(h.belop) >= ORE ? h.belop : null,
        dato,
        tid: tid!,
      });
  };
  const tilbudNavn = (o: RaaTilbud) => `#${o.offer_number} ${rensTittel(o.title)}`.trim();
  const endringNavn = (a: RaaEndring) => `${a.amendment_number ?? ""} ${rensTittel(a.title)}`.trim();
  for (const o of raa.offers) {
    const h = { belop: tilbudSum.get(o.id)!, lenke: { to: "/tilbud/$id" as const, id: o.id } };
    nyHendelse(o.customer_signed_at, "Kunden signerte tilbud", tilbudNavn(o), { type: "tilbud_signert", ...h });
    nyHendelse(o.rejected_at, "Kunden avslo tilbud", tilbudNavn(o), { type: "tilbud_avslatt", ...h });
  }
  for (const a of raa.amendments) {
    const h = { belop: endringSum.get(a.id)!, lenke: tilEndring(a) };
    nyHendelse(a.customer_signed_at, "Kunden godkjente endring", endringNavn(a), { type: "endring_godkjent", ...h });
    nyHendelse(a.rejected_at, "Kunden avslo endring", endringNavn(a), { type: "endring_avslatt", ...h });
    nyHendelse(a.sent_at, "Krav sendt", endringNavn(a), { type: "krav_sendt", ...h });
  }
  const endringPaId = new Map(raa.amendments.map((a) => [a.id, a]));
  for (const p of betalinger.filter((p) => p.paid)) {
    const a = p.amendment_id ? endringPaId.get(p.amendment_id) : undefined;
    const o = p.offer_id ? tilbudPaId.get(p.offer_id) : undefined;
    nyHendelse(p.paid_date, "Kunden betalte", a ? endringNavn(a) : o ? tilbudNavn(o) : "", {
      type: "betaling",
      belop: tall(p.amount),
      lenke: a ? tilEndring(a) : o ? { to: "/tilbud/$id", id: o.id } : null,
    });
  }
  hendelser.sort((a, b) => (a.tid < b.tid ? 1 : a.tid > b.tid ? -1 : 0));
  const siste7Dager: Hendelse[] = hendelser.slice(0, 8).map(({ tid: _tid, ...h }) => h);

  return {
    totalKontraktssum: kontraktssum,
    totalFakturert: fakturert,
    pengene: {
      kontraktssum,
      kontraktTilbud,
      kontraktEndringer,
      antallGodkjenteEndringer: godkjente.length,
      fakturert,
      betalt,
      kundenSkylder: sum(ubetalte.map((p) => tall(p.amount))),
      antallUbetalteFakturaer: ubetalte.length,
      forfalt: sum(forfalte.map((p) => tall(p.amount))),
      antallForfalte: forfalte.length,
      klarTilFakturering: sum(paKontrakt.filter(erKlar).map((p) => tall(p.amount))),
      igjen,
      prosentFakturert: kontraktssum > 0 ? (fakturert / kontraktssum) * 100 : 0,
      hvorPengeneLigger,
    },
    tilbudSomVenter,
    tilbudSomVenterSum: sum(tilbudSomVenter.map((t) => t.belop)),
    kravSomVenter,
    kravSomVenterSum: sum(kravSomVenter.map((k) => k.belop)),
    kravOver30Dager,
    antallKravOver30Dager: kravGamle.length,
    jobber,
    faser: {
      ikkeStartet: jobber.filter((j) => j.fase === "ikke_startet").length,
      iGang: jobber.filter((j) => j.fase === "i_gang").length,
      ferdig: jobber.filter((j) => j.fase === "ferdig").length,
    },
    maneder,
    manederSetning,
    mindreArbeidIgjen: inn3 < fakt3 / 2,
    tilbud: {
      gittDenneManed: gittDenne.length,
      gittDenneManedSum: sum(gittDenne.map((o) => tilbudSum.get(o.id)!)),
      gittForrigeManed: gittForrige.length,
      denneManedNavn: LANG[+denne.slice(5, 7) - 1],
      fikkJobben: fatt.length,
      avBesvarte: fatt.length + tapt.length + aldri.length,
      saNei: tapt.length,
      svarteAldri: aldri.length,
      snittFatt: snitt(fatt),
      snittTapt: snitt(tapt),
    },
    kunder,
    borSjekkes,
    siste7Dager,
  };
}
