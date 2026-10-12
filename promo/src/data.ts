/**
 * Alt innhold i filmen er oppdiktet. Firmanavnet er sjekket mot
 * Brønnøysundregistrene (ingen treff 2026-09-23), og kunden er Kari Nordmann —
 * navnet alle i Norge kjenner igjen som et eksempel. Ingenting er hentet fra
 * databasen til appen.
 *
 * Tallene henger sammen slik appen regner dem: summen av linjene er tilbudet,
 * endringen legges på ordreverdien, og mva er 25 %.
 */

/** Slik appen skriver kroner: «186 400,00 kr» (src/lib/format.ts). */
export const nok = (n: number) =>
  new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(n);

/** Kortere form til store tall i filmen: «186 400 kr». */
export const kr = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Math.round(n)) + " kr";

export const firma = {
  navn: "Fjordheim Maskin AS",
  kort: "Fjordheim Maskin",
  bruker: "Erik Fjordheim",
  initialer: "EF",
} as const;

export const kunde = {
  navn: "Kari Nordmann",
} as const;

export type Linje =
  | { overskrift: string }
  | { tekst: string; antall: number; enhet: string; pris: number };

export const tilbud = {
  nummer: 1187,
  prosjekt: "2026118",
  tittel: "Drenering og ny innkjørsel",
  dato: "14.09.2026",
  gyldigTil: "14.10.2026",
  tekst: "Vi takker for forespørselen og har gleden av å gi følgende tilbud på drenering rundt huset og ny asfaltert innkjørsel.",
  linjer: [
    { overskrift: "GRUNNARBEID" },
    { tekst: "Rigg og drift", antall: 1, enhet: "RS", pris: 12500 },
    { tekst: "Graving av grøft for drenering", antall: 48, enhet: "m", pris: 450 },
    { tekst: "Bortkjøring av overskuddsmasser", antall: 36, enhet: "m³", pris: 390 },
    { overskrift: "DRENERING" },
    { tekst: "Drensrør 110 mm med filterduk", antall: 48, enhet: "m", pris: 520 },
    { tekst: "Kum 400 mm med sandfang", antall: 2, enhet: "stk", pris: 6800 },
    { tekst: "Tilbakefylling med pukk 16–32", antall: 30, enhet: "m³", pris: 615 },
    { overskrift: "ASFALT" },
    { tekst: "Oppbygging og avretting av innkjørsel", antall: 65, enhet: "m²", pris: 420 },
    { tekst: "Asfaltering, Agb 11", antall: 65, enhet: "m²", pris: 830 },
  ] as Linje[],
  signert: { dato: "17.09.2026", klokke: "19:42" },
} as const;

export const erOverskrift = (l: Linje): l is { overskrift: string } => "overskrift" in l;
export const linjeSum = (l: Linje) => (erOverskrift(l) ? 0 : l.antall * l.pris);
export const sum = (linjer: readonly Linje[]) => linjer.reduce((s, l) => s + linjeSum(l), 0);

export const tilbudSum = sum(tilbud.linjer); // 186 400
export const MVA = 0.25;

export const endring = {
  nummer: "2026118-1",
  dato: "29.09.2026",
  tidspunkt: "Tirsdag 09:12",
  beskrivelse: "Fast fjell i grøfta langs nordveggen. Må sprenges før dreneringen kan legges videre.",
  arsak: "Uforutsett fjell, ikke påvist ved befaring.",
  linjer: [
    { tekst: "Sprenging av fjell i grøft", antall: 12, enhet: "m³", pris: 2450 },
    { tekst: "Bortkjøring av sprengstein", antall: 12, enhet: "m³", pris: 750 },
  ] as Linje[],
} as const;

export const endringSum = sum(endring.linjer); // 38 400
export const ordreverdi = tilbudSum + endringSum; // 224 800

/** Fremdriftsplanen: uke 40–43 høsten 2026. Start og slutt i dager fra mandag uke 40. */
export const fremdrift = {
  uker: [40, 41, 42, 43],
  maned: ["sep.–okt.", "okt.", "okt.", "okt."],
  aktiviteter: [
    { navn: "Rigg og oppstart", ansvarlig: "Erik", farge: "graa", fra: 0, til: 2 },
    { navn: "Graving av grøft", ansvarlig: "Jonas", farge: "oransje", fra: 1, til: 6 },
    { navn: "Sprenging", ansvarlig: "Jonas", farge: "rod", fra: 2, til: 4, nyFraEndring: true },
    { navn: "Drenering og kummer", ansvarlig: "Mats", farge: "bla", fra: 5, til: 11 },
    { navn: "Tilbakefylling", ansvarlig: "Mats", farge: "turkis", fra: 10, til: 14 },
    { navn: "Oppbygging innkjørsel", ansvarlig: "Jonas", farge: "gul", fra: 14, til: 19 },
    { navn: "Asfaltering", ansvarlig: "Underentreprenør", farge: "graa", fra: 19, til: 21 },
    { navn: "Overlevering", ansvarlig: "Erik", farge: "gronn", fra: 25, til: 25, milepael: true },
  ],
} as const;

/** Andre jobber i lister og tabeller, så skjermene ser ut som et firma i drift. */
export const andreTilbud = [
  { nummer: 1186, tittel: "Tomtearbeid enebolig", kunde: "Per Hansen", total: 412_750, fakturert: 0.35, dager: 3 },
  { nummer: 1184, tittel: "Støttemur og drenering", kunde: "Ingrid Berg", total: 268_900, fakturert: 1, dager: 9 },
  { nummer: 1181, tittel: "VA-anlegg hytte", kunde: "Lars Johansen", total: 534_200, fakturert: 0.62, dager: 12 },
  { nummer: 1179, tittel: "Grøft for fiber og strøm", kunde: "Marte Solberg", total: 96_450, fakturert: 1, dager: 0 },
  { nummer: 1176, tittel: "Utgraving kjeller", kunde: "Anders Lie", total: 318_000, fakturert: 0, dager: 0 },
] as const;

export const dashbord = {
  kontraktssum: 4_862_350,
  fakturert: 3_104_900,
  endringer: 7,
  endringerSum: 412_600,
  apneTilbud: 12,
  fullFakturert: 23,
  delvisFakturert: 6,
  utgatte: 2,
  tilbudTotalt: 41,
} as const;
