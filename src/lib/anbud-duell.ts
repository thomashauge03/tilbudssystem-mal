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
  const teller = new Map<string, number>();
  for (const a of anbud) {
    if (!a.bids.some((b) => b.is_us)) continue;
    for (const b of a.bids) {
      if (b.is_us) continue;
      const navn = String(b.company ?? "").trim();
      if (navn) teller.set(navn, (teller.get(navn) ?? 0) + 1);
    }
  }
  return [...teller.entries()]
    .map(([navn, moter]) => ({ navn, moter }))
    .sort((x, y) => y.moter - x.moter || x.navn.localeCompare(y.navn, "nb"));
}

export function lagDuell(anbud: AnbudForAnalyse[], konkurrent: string): Duell | null {
  const leter = konkurrent.trim().toLowerCase();
  if (!leter) return null;

  const punkter: DuellPunkt[] = [];

  for (const a of anbud) {
    const vaart = a.bids.find((b) => b.is_us);
    const deres = a.bids.find((b) => String(b.company ?? "").trim().toLowerCase() === leter);
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
    navn: konkurrent,
    punkter,
    moter: punkter.length,
    viLavest: punkter.filter((p) => p.viLavest).length,
    snittPst: pst.reduce((s, x) => s + x, 0) / pst.length,
    medianPst: sortert.length % 2 ? sortert[midt] : (sortert[midt - 1] + sortert[midt]) / 2,
    minPst: sortert[0],
    maksPst: sortert[sortert.length - 1],
  };
}
