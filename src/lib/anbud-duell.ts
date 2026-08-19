// Én konkurrent om gangen: hvordan har vi priset oss mot akkurat dem?
//
// Snittet i konkurrenttabellen svarer på om vi jevnt over ligger over eller
// under. Det skjuler samtidig det som er verdt å vite: om forspranget varierer
// fra jobb til jobb, om de underbyr oss bare på de små jobbene, og om avstanden
// har endret seg over tid. Derfor regnes hver duell ut for seg, i den
// rekkefølgen anbudene ble åpnet.
//
// Bare anbud der BEGGE har levert pris teller med. Møter de ikke opp, sier det
// ingenting om prisnivået vårt.

import type { AnbudForAnalyse } from "./anbud-innsikt";
import { firmaOrd } from "./anbud.ts";

/**
 * Samme firma skrives sjelden likt to ganger. I de ekte protokollene står
 * «Kvina Maskin», «Kvina Maskin AS» og «Kvina» om hverandre, og uten
 * sammenslåing blir ett firma til tre konkurrenter med for få møter hver til at
 * tallene betyr noe.
 *
 * Selskapsform, tegnsetting og store bokstaver fjernes. I tillegg slås et
 * kortere navn sammen med et lengre når det korte er starten på det lange og
 * det bare finnes ÉN slik kandidat — «Kvina» hører til «Kvina Maskin», men
 * hadde det også stått «Kvina Transport» i materialet, ville det vært en
 * gjetning, og da holdes de fra hverandre.
 */
export function slaaSammenFirma(navn: string[]): Map<string, string> {
  const nokler = new Map<string, { visning: string; antall: number }>();
  for (const n of navn) {
    const k = firmaOrd(n).join(" ");
    if (!k) continue;
    const f = nokler.get(k);
    // Den formen som er brukt oftest blir navnet som vises. Ved likt antall
    // vinner den lengste, som regel den med selskapsform.
    if (!f) nokler.set(k, { visning: n, antall: 1 });
    else {
      f.antall++;
      if (n.length > f.visning.length) f.visning = n;
    }
  }

  const alle = [...nokler.keys()];
  const kanonisk = new Map<string, string>(alle.map((k) => [k, k]));
  for (const kort of alle) {
    const treff = alle.filter((lang) => lang !== kort && (lang + " ").startsWith(kort + " "));
    if (treff.length === 1) kanonisk.set(kort, treff[0]);
  }

  // Navn -> visningsnavnet til gruppen det hører hjemme i
  const ut = new Map<string, string>();
  for (const n of navn) {
    const k = firmaOrd(n).join(" ");
    if (!k) continue;
    const gruppe = kanonisk.get(k) ?? k;
    ut.set(n, nokler.get(gruppe)?.visning ?? n);
  }
  return ut;
}

/** Alle firmanavn som er nevnt, uansett hvem som bød. */
function alleNavn(anbud: AnbudForAnalyse[]): string[] {
  return anbud.flatMap((a) => a.bids.map((b) => String(b.company ?? "").trim())).filter(Boolean);
}

export interface DuellPunkt {
  anbud: string;
  dato: string | null;
  vaart: number;
  deres: number;
  /** Positivt = de lå over oss (vi var billigst i duellen) */
  diffKr: number;
  diffPst: number;
  viLavest: boolean;
  /** Vant vi hele anbudet, ikke bare duellen mot denne ene */
  viVantAnbudet: boolean;
}

export interface Duell {
  navn: string;
  punkter: DuellPunkt[];
  /** Antall anbud der begge leverte pris */
  moter: number;
  /** Antall av dem der vi lå lavest av de to */
  viLavest: number;
  snittPst: number;
  /** Median tåler ett skjevt anbud bedre enn snittet */
  medianPst: number;
  /** Minste og største avstand — sier om de priser jevnt eller sprikende */
  minPst: number;
  maksPst: number;
}

const pstAv = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);

/** Alle konkurrenter vi har møtt, flest møter først. */
export function konkurrentliste(anbud: AnbudForAnalyse[]): Array<{ navn: string; moter: number }> {
  const gruppe = slaaSammenFirma(alleNavn(anbud));
  const teller = new Map<string, number>();
  for (const a of anbud) {
    if (!a.bids.some((b) => b.is_us)) continue;
    // Samme firma kan stå to ganger i én protokoll (ulik skrivemåte). Da er det
    // fortsatt ett møte, ikke to.
    const sett = new Set<string>();
    for (const b of a.bids) {
      if (b.is_us) continue;
      const navn = gruppe.get(String(b.company ?? "").trim());
      if (navn) sett.add(navn);
    }
    for (const navn of sett) teller.set(navn, (teller.get(navn) ?? 0) + 1);
  }
  return [...teller.entries()]
    .map(([navn, moter]) => ({ navn, moter }))
    .sort((x, y) => y.moter - x.moter || x.navn.localeCompare(y.navn, "nb"));
}

export function lagDuell(anbud: AnbudForAnalyse[], konkurrent: string): Duell | null {
  if (!konkurrent.trim()) return null;
  // Slår opp gjennom samme gruppering som listen, så «Kvina» og «Kvina Maskin AS»
  // gir samme graf uansett hvilken skrivemåte som ble valgt.
  const gruppe = slaaSammenFirma([...alleNavn(anbud), konkurrent.trim()]);
  const leter = gruppe.get(konkurrent.trim());
  if (!leter) return null;

  const punkter: DuellPunkt[] = [];

  for (const a of anbud) {
    const vaart = a.bids.find((b) => b.is_us);
    const deres = a.bids.find(
      (b) => !b.is_us && gruppe.get(String(b.company ?? "").trim()) === leter,
    );
    if (!vaart || !deres) continue;
    if (!(Number(vaart.amount) > 0) || !(Number(deres.amount) > 0)) continue;

    const v = Number(vaart.amount);
    const d = Number(deres.amount);
    const lavest = Math.min(...a.bids.map((b) => Number(b.amount)).filter((n) => n > 0));

    punkter.push({
      anbud: a.title,
      dato: a.opened_on ?? null,
      vaart: v,
      deres: d,
      diffKr: d - v,
      diffPst: pstAv(d, v),
      viLavest: v < d,
      viVantAnbudet: v <= lavest,
    });
  }

  if (!punkter.length) return null;

  // Eldste først, så grafen leses fra venstre mot høyre som en tidslinje.
  // Anbud uten dato havner bakerst — de har ingen plass på tidslinjen.
  punkter.sort((x, y) => {
    if (!x.dato && !y.dato) return 0;
    if (!x.dato) return 1;
    if (!y.dato) return -1;
    return String(x.dato).localeCompare(String(y.dato));
  });

  const pst = punkter.map((p) => p.diffPst);
  const sortert = [...pst].sort((x, y) => x - y);
  const midt = Math.floor(sortert.length / 2);

  return {
    navn: leter,
    punkter,
    moter: punkter.length,
    viLavest: punkter.filter((p) => p.viLavest).length,
    snittPst: pst.reduce((s, x) => s + x, 0) / pst.length,
    medianPst: sortert.length % 2 ? sortert[midt] : (sortert[midt - 1] + sortert[midt]) / 2,
    minPst: sortert[0],
    maksPst: sortert[sortert.length - 1],
  };
}
