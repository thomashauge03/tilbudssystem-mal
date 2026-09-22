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

/**
 * Adressene i «Varsel-e-post», som kan holde flere i samme firma.
 *
 * Semikolon godtas ved siden av komma: det er skilletegnet Outlook bruker, og
 * den som limer inn en liste derfra skal ikke måtte vite forskjellen. Tomme
 * ledd faller bort, så et etterfølgende komma ikke blir en mottaker uten
 * adresse — Resend avviser hele utsendingen om én adresse i lista er tom.
 */
export function splittMottakere(felt: string | null | undefined): string[] {
  return String(felt ?? "")
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

export interface Linje {
  quantity?: number | null;
  unit_price?: number | null;
  discount_pct?: number | null;
  included?: boolean | null;
  is_heading?: boolean | null;
}

/**
 * Hva tilbudet eller kravet er verdt, eks. mva.
 *
 * Dette er en tvilling av `offerTotal`/`amendmentTotal` i `src/lib/format.ts`,
 * og det er et bevisst onde: edge functionen kjører i Deno og kan ikke
 * importere fra `src/`, og det ligger ingen ferdig sum i basen å lese.
 *
 * Kommentaren over originalen forteller hvorfor det er verdt å passe på —
 * beløpet ble en gang regnet ulikt seks steder, og samme tilbud kunne vise tre
 * forskjellige tall i appen og et fjerde i PDF-en kunden hadde signert. Endrer
 * noen reglene der, må de endres her. Testene under låser de fire som betyr
 * noe: overskrifter teller ikke, linjer som ikke er inkludert teller ikke,
 * rabatt trekkes fra, og adm.påslaget legges til på tilbud (aldri på krav).
 */
export function summerLinjer(linjer: Linje[], adminPct?: number | null): number {
  const base = (linjer ?? [])
    .filter((l) => l.included !== false)
    .reduce((s, l) => {
      if (l.is_heading) return s;
      const brutto = Number(l.quantity ?? 0) * Number(l.unit_price ?? 0);
      return s + brutto * (1 - Number(l.discount_pct ?? 0) / 100);
    }, 0);
  return base + base * (Number(adminPct ?? 0) / 100);
}

// Intl setter harde mellomrom som tusenskille (U+00A0 og U+202F). De ser like
// ut i en e-postklient helt til de ikke gjør det — noen viser dem som «Â». Vi
// bytter dem til vanlige mellomrom, som også gjør testene til å stole på.
//
// Bygget fra en streng framfor skrevet som regex-literal: formateringen gjør
// escape-sekvensen om til selve tegnet, og da står det usynlige mellomrom i
// kildekoden som verken er til å lese eller rette. Eslint fanger dem som
// «irregular whitespace» — denne skrivemåten er svaret på den advarselen.
const HARDE_MELLOMROM = new RegExp("[\\u00a0\\u202f]", "g");

const mykneMellomrom = (s: string) => s.replace(HARDE_MELLOMROM, " ");

function norskTid(iso: string): string {
  const d = new Date(iso);
  const dato = new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Oslo",
  }).format(d);
  const klokke = new Intl.DateTimeFormat("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  }).format(d);
  return `${dato} kl. ${klokke}`;
}

function norskeKroner(n: number): string {
  return (
    mykneMellomrom(
      new Intl.NumberFormat("nb-NO", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n),
    ) + " kr"
  );
}

export function byggVarsel(d: VarselData): Varselmelding {
  const hva = d.type === "offer" ? `Tilbud #${d.nummer}` : `Krav om endring #${d.nummer}`;
  const gjort = d.hendelse === "signert" ? "signert" : "avslått";
  const emne = `${hva} ${gjort} av ${d.kunde}`;

  const verb = d.hendelse === "signert" ? "signerte" : "avslo";

  // Endringsnumre er tekst og skrives i praksis som «2026165-1» — altså med
  // prosjektnummeret i seg. Da blir «krav om endring #2026165-1 på prosjekt
  // 2026165» bare en gjentakelse, og prosjektet nevnes kun når nummeret ikke
  // alt sier det.
  const visProsjekt = !!d.prosjektRef && !d.nummer.startsWith(d.prosjektRef);
  const apning =
    d.type === "offer"
      ? `${d.kunde} ${verb} tilbud #${d.nummer} «${d.tittel}»`
      : `${d.kunde} ${verb} krav om endring #${d.nummer}${visProsjekt ? ` på prosjekt ${d.prosjektRef}` : ""}`;

  // Etikettene settes i samme bredde, så verdiene står under hverandre. Uten
  // det siger kolonnen fram og tilbake etter hvor langt ordet foran er, og en
  // mail med tre linjer ser rotete ut uten at man ser hvorfor.
  const rad = (etikett: string, verdi: string) => `${(etikett + ":").padEnd(14)}${verdi}`;

  // Bare linjer vi faktisk har innhold til. En rad som står igjen tom ser ut
  // som en feil i systemet, ikke som informasjon vi mangler.
  const rader: string[] = [];
  if (d.svartAv.trim()) {
    rader.push(rad(d.hendelse === "signert" ? "Signert av" : "Avslått av", d.svartAv.trim()));
  }
  if (d.belop !== null) rader.push(rad("Beløp", `${norskeKroner(d.belop)} eks. mva`));
  if (d.hendelse === "avslaatt" && d.begrunnelse?.trim()) {
    rader.push(rad("Begrunnelse", `«${d.begrunnelse.trim()}»`));
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
