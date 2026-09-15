/**
 * Escaper tekst før den settes inn i HTML. Ligger her og ikke i pdf.ts fordi
 * pdf.ts drar med seg hele dokumentmotoren — funksjonen må kunne brukes, og
 * etterprøves, uten den.
 */
export const escapeHtml = (s: string | null | undefined) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const nok = (n: number | null | undefined) =>
  new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(Number(n ?? 0));

export const num = (n: number | null | undefined) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(Number(n ?? 0));

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
};

export const toISODate = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (d: Date, days: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
};

export const UNITS = ["stk", "m", "m²", "m³", "tonn", "time", "LS", "RS"];
export const OUR_REFS = ["Tommy Hauge", "Karl Hauge"];

// Én felles nøkkel for temavalget. Tidligere skrev toppmenyen til "th-theme"
// mens innstillingssiden brukte "hm-theme", så de to temavelgerne overstyrte
// hverandre og valget i Innstillinger overlevde ikke en omlasting.
export const THEME_STORAGE_KEY = "th-theme";

// Fristen "gyldig t.o.m." gjelder bare tilbud som ikke er godkjent. Et godkjent
// tilbud er aktivt, og da har fristen ingen betydning lenger — det skal verken
// vises, telles som utløpt eller filtreres bort.
// ─── Én sannhet for hva et tilbud er verdt ────────────────────────────────
// Dette ble tidligere regnet ulikt seks steder: noen glemte rabatt, andre tok
// med linjer som ikke er inkludert, andre igjen droppet adm.påslag. Samme
// tilbud kunne dermed vise tre forskjellige beløp i appen — og et fjerde i
// PDF-en kunden hadde signert.
export interface LineLike {
  quantity?: number | null;
  unit_price?: number | null;
  discount_pct?: number | null;
  included?: boolean | null;
  /** Overskrift i oppstillingen: bare tekst, ingen pris. */
  is_heading?: boolean | null;
}

/**
 * Er linjen en overskrift?
 *
 * Ligger her og ikke i hvert skjema, for spørsmålet stilles overalt der linjer
 * summeres, tegnes eller telles — og et sted som glemmer den, får en overskrift
 * inn i et beløp.
 */
export const erOverskrift = (l: LineLike | null | undefined) => !!l?.is_heading;

/** Nettosum for én linje: antall × pris, minus eventuell rabatt. */
export function lineNet(l: LineLike) {
  // En overskrift bærer ingen tall. Vakten står her og ikke bare i databasen,
  // fordi en rad som nettopp ble gjort om til overskrift i skjemaet, ennå kan
  // ha prisen sin med seg i minnet.
  if (erOverskrift(l)) return 0;
  const gross = Number(l.quantity ?? 0) * Number(l.unit_price ?? 0);
  return gross * (1 - Number(l.discount_pct ?? 0) / 100);
}

/**
 * Total for et tilbud: bare inkluderte linjer, minus rabatt, pluss adm.påslag.
 * Spørringen må hente `quantity, unit_price, discount_pct, included` på linjene
 * og `admin_cost_pct` på tilbudet — ellers blir tallet stille feil.
 */
export function offerTotal(lines: LineLike[] | null | undefined, adminPct?: number | null) {
  const base = (lines ?? []).filter((l) => l.included !== false).reduce((s, l) => s + lineNet(l), 0);
  return base + base * (Number(adminPct ?? 0) / 100);
}

/** Endringslinjer har ikke inkludert-hake og ikke adm.påslag. */
export function amendmentTotal(lines: LineLike[] | null | undefined) {
  return (lines ?? []).reduce((s, l) => s + lineNet(l), 0);
}

export const OFFER_APPROVED = "godkjent";
export const OFFER_COMPLETED = "fullført";

// Begge betyr at jobben er vunnet. De må telle likt i alle økonomivisninger —
// et fullført tilbud er fortsatt en kontrakt som er utført og fakturert, og
// skal ikke forsvinne ut av kontraktssum, ordre eller status.
export const OFFER_WON_STATUSES = [OFFER_APPROVED, OFFER_COMPLETED];

export const isOfferWon = (status?: string | null) => OFFER_WON_STATUSES.includes(status ?? "");

export const OFFER_REJECTED = "avslått";

export const isOfferRejected = (status?: string | null) => (status ?? "") === OFFER_REJECTED;

/**
 * Tilbud som ikke lenger venter på svar: vunnet, fullført eller avslått.
 *
 * Et avslått tilbud er ute av spill. Det skal ikke telles som aktivt, ikke
 * ligge i «utløper snart» og ikke dukke opp blant de utløpte når fristen
 * passerer — kunden har alt sagt nei, og en påminnelse om å følge det opp er
 * bare støy som skjuler de tilbudene man faktisk kan vinne.
 */
export const OFFER_CLOSED_STATUSES = [...OFFER_WON_STATUSES, OFFER_REJECTED];

export const offerHasDeadline = (status?: string | null) => !isOfferWon(status);

export const isOfferExpired = (
  offer: { status?: string | null; valid_until?: string | null },
  today: string,
) => offerHasDeadline(offer.status) && !!offer.valid_until && offer.valid_until < today;

// Endringsmeldingsnummer er sammensatt: "<prosjektnr>-<løpenummer>", f.eks.
// "1001-3". Kolonnen er text, så en ren alfabetisk sortering ville plassert
// "1001-10" foran "1001-2". Her sammenlignes prefiks og løpenummer hver for seg.
export function compareAmendmentNumber(a: string | null | undefined, b: string | null | undefined) {
  const parse = (v: string | null | undefined) => {
    const s = String(v ?? "");
    const m = s.match(/^(.*)-(\d+)$/);
    return m ? { prefix: m[1], seq: parseInt(m[2], 10) } : { prefix: s, seq: 0 };
  };
  const pa = parse(a);
  const pb = parse(b);
  // numeric: true så prosjektnummer 1001 sorteres etter 999, ikke før
  const byPrefix = pa.prefix.localeCompare(pb.prefix, "nb", { numeric: true });
  return byPrefix !== 0 ? byPrefix : pa.seq - pb.seq;
}
