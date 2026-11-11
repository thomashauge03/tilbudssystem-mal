// Tall og dager slik de skal stå på dashbordet.
//
// Beløp: hele kroner i rader («1 995 950 kr»), én desimal i overskrifter
// («2,0 mill»). Dager skrives som vanlige ord: «fristen gikk ut for 12 dager
// siden», ikke «12 d» eller en dato man må regne på selv.

const heleKroner = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

const millFormat = (desimaler: number) =>
  new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: desimaler,
    maximumFractionDigits: desimaler,
  });

/** «14 537 768» – hele kroner uten enhet. */
export function tall(n: number): string {
  return heleKroner.format(Math.round(n));
}

/** «14 537 768 kr» – hele kroner, aldri øre. */
export function kr(n: number): string {
  return `${tall(n)} kr`;
}

/** «2,0» – millioner med fast antall desimaler, uten enhet. */
export function millTall(n: number, desimaler = 1): string {
  return millFormat(desimaler).format(n / 1_000_000);
}

/** «2,0 mill». Under én million: hele kroner («882 198 kr»). */
export function mill(n: number): string {
  if (Math.abs(n) < 1_000_000) return kr(n);
  return `${millTall(n)} mill`;
}

/** «0,6 mill» – alltid i millioner, for tall som skal sammenlignes med hverandre. */
export function millAlltid(n: number, desimaler = 1): string {
  return `${millTall(n, desimaler)} mill`;
}

/** Tall til stolper: «2,8», «0» for ingenting og «<0,1» for små beløp, så de ikke ser ut som null. */
export function stolpeTall(n: number): string {
  if (n <= 0) return "0";
  if (n < 50_000) return "<0,1";
  return millTall(n);
}

/** Deler «20,8 mill» / «46 329 kr» i tall og enhet, så enheten kan settes mindre. */
export function delBelop(tekst: string): [string, string] {
  const i = tekst.lastIndexOf(" ");
  return i < 0 ? [tekst, ""] : [tekst.slice(0, i), tekst.slice(i + 1)];
}

/** «1 tilbud», «9 tilbud», «1 jobb», «23 jobber». */
export function antall(n: number, entall: string, flertall: string): string {
  return `${n} ${n === 1 ? entall : flertall}`;
}

/** Negativ = fristen er passert, positiv = dager igjen. */
export function fristTekst(dager: number | null): string {
  if (dager === null) return "ingen svarfrist";
  if (dager < 0) {
    const d = -dager;
    return d === 1 ? "fristen gikk ut i går" : `fristen gikk ut for ${d} dager siden`;
  }
  if (dager === 0) return "svarfrist i dag";
  if (dager === 1) return "svarfrist i morgen";
  return `svarfrist om ${dager} dager`;
}

/** «sendt for 43 dager siden», «sendt i går», «sendt i dag». */
export function sendtTekst(dager: number | null): string {
  if (dager === null) return "ikke sendt";
  if (dager <= 0) return "sendt i dag";
  if (dager === 1) return "sendt i går";
  return `sendt for ${dager} dager siden`;
}

/** «YYYY-MM-DD» for en lokal dato (ikke UTC, så midnatt ikke flytter dagen). */
export function isoDato(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dag = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dag}`;
}

function dagnummer(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / 86_400_000);
}

/** Hele dager fra `fra` til `til` (begge «YYYY-MM-DD»). */
export function dagerMellom(fra: string, til: string): number {
  return dagnummer(til) - dagnummer(fra);
}

const storForbokstav = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «I dag», «I går», «Mandag» (siste uka) eller «3. nov». */
export function dagNavn(dato: string, idag: Date): string {
  const siden = dagerMellom(dato, isoDato(idag));
  if (siden <= 0) return "I dag";
  if (siden === 1) return "I går";
  const [a, m, d] = dato.slice(0, 10).split("-").map(Number);
  const dag = new Date(a, m - 1, d);
  if (siden < 7) return storForbokstav(dag.toLocaleDateString("nb-NO", { weekday: "long" }));
  const maned = dag.toLocaleDateString("nb-NO", { month: "short" }).replace(".", "");
  return `${d}. ${maned}`;
}

/** «Onsdag 11. november». */
export function datoOverskrift(idag: Date): string {
  const ukedag = idag.toLocaleDateString("nb-NO", { weekday: "long" });
  const maned = idag.toLocaleDateString("nb-NO", { month: "long" });
  return `${storForbokstav(ukedag)} ${idag.getDate()}. ${maned}`;
}

/** «oktober» – måneden før `idag`. */
export function forrigeManedNavn(idag: Date): string {
  return new Date(idag.getFullYear(), idag.getMonth() - 1, 1).toLocaleDateString("nb-NO", {
    month: "long",
  });
}
