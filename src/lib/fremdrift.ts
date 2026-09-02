// Tidsaksen i en fremdriftsplan.
//
// Norske fremdriftsplaner leses i uker — «oppstart uke 12», «ferdig uke 34» —
// og ukenummeret er ISO 8601, ikke «uken datoen tilfeldigvis faller i». De to
// er ikke det samme rundt nyttår: 1. januar 2027 hører til uke 53 i 2026, og
// 31. desember 2024 hører til uke 1 i 2025. Regner man feil der, forskyver hele
// planen seg med en uke akkurat i den perioden det er vinterstans og alle
// leser datoene ekstra nøye.
//
// Alle datoer er «YYYY-MM-DD» og behandles i UTC. Lokal tid ville gjort at en
// plan så ulik ut for noen som satt i en annen tidssone, og at datoer nær
// midnatt kunne hoppe en dag.

const DAG = 86_400_000;

/** «2026-03-04» -> Date ved midnatt UTC. Ugyldig dato gir null. */
export function parseDato(s?: string | null): Date | null {
  const t = String(s ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const tilDato = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * ISO-uke: uken eies av torsdagen sin. Derfor flyttes datoen til torsdagen i
 * samme uke før året leses av — det er nettopp det som gjør at romjulen kan
 * havne i uke 1 av neste år.
 */
export function isoUke(dato: Date): { aar: number; uke: number } {
  const t = new Date(dato.getTime());
  const ukedag = t.getUTCDay() || 7; // søndag er 0 i JS, men 7 i ISO
  t.setUTCDate(t.getUTCDate() + 4 - ukedag);
  const aarsstart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const uke = Math.ceil(((t.getTime() - aarsstart) / DAG + 1) / 7);
  return { aar: t.getUTCFullYear(), uke };
}

/** Mandagen i samme ISO-uke. */
export function mandagI(dato: Date): Date {
  const t = new Date(dato.getTime());
  const ukedag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - (ukedag - 1));
  return t;
}

/** Første dag i måneden. */
export function maanedStart(dato: Date): Date {
  return new Date(Date.UTC(dato.getUTCFullYear(), dato.getUTCMonth(), 1));
}

const MAANEDER = [
  "jan", "feb", "mar", "apr", "mai", "jun",
  "jul", "aug", "sep", "okt", "nov", "des",
];

export interface Kolonne {
  /** Første dag i kolonnen (mandag, eller den 1. i måneden) */
  fra: Date;
  /** Første dag ETTER kolonnen — gjør bredderegningen enkel */
  til: Date;
  /** «12» for uke, «mar» for måned */
  etikett: string;
  /** Vises over etiketten når året eller måneden skifter */
  overskrift: string;
}

export interface Tidsakse {
  type: "uke" | "maaned";
  kolonner: Kolonne[];
  fra: Date;
  til: Date;
}

/**
 * Bygger tidsaksen som dekker hele planen.
 *
 * Uker er det man vil ha. Men en plan som går over to år blir 100 ukekolonner,
 * og på et liggende A4 er hver av dem da under to millimeter bred — ulesbar.
 * Da byttes det til måneder i stedet for å presse fram noe ingen kan lese.
 */
export function lagTidsakse(
  startISO: string,
  sluttISO: string,
  maksKolonner = 34,
): Tidsakse | null {
  const s = parseDato(startISO);
  const e = parseDato(sluttISO);
  if (!s || !e) return null;
  const [fraDato, tilDato_] = s <= e ? [s, e] : [e, s];

  const antallUker = Math.floor((mandagI(tilDato_).getTime() - mandagI(fraDato).getTime()) / (7 * DAG)) + 1;

  if (antallUker <= maksKolonner) {
    const kolonner: Kolonne[] = [];
    let peker = mandagI(fraDato);
    let sisteMaaned = "";
    const startAar = mandagI(fraDato).getUTCFullYear();
    let sisteAar = startAar;
    for (let i = 0; i < antallUker; i++) {
      const neste = new Date(peker.getTime() + 7 * DAG);
      const { uke } = isoUke(peker);
      // Måneden skrives bare når den skifter. Ellers står det «mar» over hver
      // eneste kolonne og drukner ukenumrene, som er det man leser etter.
      //
      // Krysser planen et årsskifte, skrives året med på den første måneden i
      // det nye året: «jan 27». Uten det er «uke 45–12» umulig å tidfeste —
      // uke 12 kan like gjerne ha vært i fjor.
      const aar = peker.getUTCFullYear();
      const maaned = MAANEDER[peker.getUTCMonth()];
      // Året skrives bare i det selve skiftet skjer, ikke på hver måned etterpå.
      // «jan 27, feb, mar» leses like entydig som «jan 27, feb 27, mar 27», og
      // gjentakelsen ville drukna ukenumrene på samme måte som måneden gjorde.
      //
      // Sammenligningen går på månedsnavnet alene, ikke på den ferdige teksten.
      // Ellers regnes «jan» som forskjellig fra «jan 27», og januar skrives to
      // ganger: én gang med år og én gang uten.
      const nyMaaned = maaned !== sisteMaaned;
      const nyttAar = aar !== sisteAar && aar !== startAar;
      const overskrift = nyttAar
        ? `${maaned} ${String(aar).slice(2)}`
        : nyMaaned
          ? maaned
          : "";
      sisteMaaned = maaned;
      sisteAar = aar;
      kolonner.push({ fra: peker, til: neste, etikett: String(uke), overskrift });
      peker = neste;
    }
    return { type: "uke", kolonner, fra: kolonner[0].fra, til: kolonner[kolonner.length - 1].til };
  }

  const kolonner: Kolonne[] = [];
  let peker = maanedStart(fraDato);
  let sisteAar = "";
  while (peker <= tilDato_) {
    const neste = new Date(Date.UTC(peker.getUTCFullYear(), peker.getUTCMonth() + 1, 1));
    const aar = String(peker.getUTCFullYear());
    kolonner.push({
      fra: peker,
      til: neste,
      etikett: MAANEDER[peker.getUTCMonth()],
      overskrift: aar === sisteAar ? "" : aar,
    });
    sisteAar = aar;
    peker = neste;
  }
  return { type: "maaned", kolonner, fra: kolonner[0].fra, til: kolonner[kolonner.length - 1].til };
}

/**
 * Hvor på aksen en aktivitet ligger, i prosent.
 *
 * Prosent framfor kolonnespenn: da treffer streken riktig dag også når en
 * aktivitet starter en onsdag, og den samme regningen virker for både uke- og
 * månedsakse. Sluttdatoen teller med hele sin dag — en aktivitet som starter og
 * slutter samme dag skal være synlig, ikke null bred.
 */
export function plassering(
  akse: Tidsakse,
  startISO?: string | null,
  sluttISO?: string | null,
): { venstre: number; bredde: number } | null {
  const s = parseDato(startISO);
  if (!s) return null;
  const e = parseDato(sluttISO) ?? s;
  const [fra, til] = s <= e ? [s, e] : [e, s];

  const total = akse.til.getTime() - akse.fra.getTime();
  if (total <= 0) return null;

  const start = Math.max(fra.getTime(), akse.fra.getTime());
  const slutt = Math.min(til.getTime() + DAG, akse.til.getTime());
  if (slutt <= start) return null;

  return {
    venstre: ((start - akse.fra.getTime()) / total) * 100,
    bredde: ((slutt - start) / total) * 100,
  };
}

/** «uke 12» eller «uke 52 (2026)» når året ikke er det man forventer. */
export function ukeTekst(datoISO?: string | null, visAar = false): string {
  const d = parseDato(datoISO);
  if (!d) return "—";
  const { aar, uke } = isoUke(d);
  return visAar ? `uke ${uke} (${aar})` : `uke ${uke}`;
}

/**
 * «uke 36–43» for et spenn. Ordet «uke» skrives én gang, ikke to — «uke 36–uke
 * 43» leses tregere og tar plass i en tabellkolonne som er trang fra før.
 * Året tas med når spennet krysser et årsskifte, for da er 52–3 ikke opplagt.
 */
export function ukeSpenn(startISO?: string | null, sluttISO?: string | null): string {
  const s = parseDato(startISO);
  if (!s) return "—";
  const e = parseDato(sluttISO) ?? s;
  const a = isoUke(s);
  const b = isoUke(e);
  if (a.aar === b.aar && a.uke === b.uke) return `uke ${a.uke}`;
  if (a.aar === b.aar) return `uke ${a.uke}–${b.uke}`;
  return `uke ${a.uke}–${b.uke} (${b.aar})`;
}

/** Antall kalenderdager, begge dager medregnet. */
export function varighetDager(startISO?: string | null, sluttISO?: string | null): number {
  const s = parseDato(startISO);
  const e = parseDato(sluttISO) ?? s;
  if (!s || !e) return 0;
  return Math.round(Math.abs(e.getTime() - s.getTime()) / DAG) + 1;
}

/**
 * Fargene aktivitetene kan merkes med.
 *
 * Faste farger framfor fri valgmulighet: en fremdriftsplan leses av en byggherre
 * som skal finne igjen «rør» på tvers av tre reviderte utgaver, og da må fargen
 * bety det samme hver gang. Alle er valgt for å være til å skille fra hverandre
 * også i svart-hvitt-utskrift, der de faller ut som ulike gråtoner.
 */
export const FARGER = [
  { key: "graa", navn: "Grå", fyll: "#4B5563", kant: "#1F2937" },
  { key: "bla", navn: "Blå", fyll: "#2563EB", kant: "#1E3A8A" },
  { key: "gronn", navn: "Grønn", fyll: "#16A34A", kant: "#14532D" },
  { key: "oransje", navn: "Oransje", fyll: "#EA580C", kant: "#7C2D12" },
  { key: "lilla", navn: "Lilla", fyll: "#7C3AED", kant: "#4C1D95" },
  { key: "turkis", navn: "Turkis", fyll: "#0891B2", kant: "#164E63" },
  { key: "rod", navn: "Rød", fyll: "#DC2626", kant: "#7F1D1D" },
  { key: "gul", navn: "Okergul", fyll: "#CA8A04", kant: "#713F12" },
] as const;

export type FargeKey = (typeof FARGER)[number]["key"];

export const finnFarge = (key?: string | null) =>
  FARGER.find((f) => f.key === key) ?? FARGER[0];

export interface AktivitetLik {
  start_date?: string | null;
  end_date?: string | null;
  is_milestone?: boolean | null;
}

/** Ytterpunktene i planen, hentet fra aktivitetene. */
export function planPeriode(
  aktiviteter: AktivitetLik[],
): { start: string; slutt: string } | null {
  const datoer: number[] = [];
  for (const a of aktiviteter) {
    const s = parseDato(a.start_date);
    const e = parseDato(a.end_date) ?? s;
    if (s) datoer.push(s.getTime());
    if (e) datoer.push(e.getTime());
  }
  if (!datoer.length) return null;
  return {
    start: tilDato(new Date(Math.min(...datoer))),
    slutt: tilDato(new Date(Math.max(...datoer))),
  };
}
