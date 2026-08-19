// Tolker anbudsprotokollene som kommer på SMS.
//
// Formatet er fritekst skrevet av et menneske, så tolkeren må tåle variasjon.
// Ekte eksempler:
//
//   Anbudsprotokoll VA Skardhei, Bortelid        Anbudsprotokoll VVA Byremo :
//   Hauge Maskin as 9.147.480,-                  Vasland Maskin 3.827.254
//   TT Anlegg 9.436.464,-                        Br. Thorkildsen 4.532.354
//   Kvina Maskin 15.388.500,-                    Aas & Høiland 4.954.541
//
// Punktum er tusenskille, ikke desimaltegn: 9.147.480 er ni millioner.

export interface ParsedBid {
  company: string;
  amount: number;
}

/** Overskriften varierer: «Anbudsprotokoll», «Anbudsåpning», med og uten kolon. */
const OVERSKRIFT = /^\s*anbuds(protokoll|åpning|apning)\s*:?\s*/i;
const ER_OVERSKRIFT = /anbuds(protokoll|åpning|apning)/i;

/** Tilbydere som står oppført uten pris — avvist, for sent levert, trukket. */
const UTELATT = /(avvist|avslag|avslått|forkastet|trukket|ikke levert|for sent|i tide|ikke godkjent)/i;

/** Standardtekst avsenderen legger på, som ikke skal varsles om. */
const STOY = /^(denne sms|sendt (via|fra)|mvh|hilsen|kan ikke besvares)/i;

export interface ParsedProtocol {
  /** Overskriften uten ordet «Anbudsprotokoll» og uten kolon på slutten */
  title: string;
  bids: ParsedBid[];
  /** Linjer tolkeren ikke fikk noe ut av — vises så brukeren kan rette selv */
  ignored: string[];
  /** Tilbydere uten pris: avvist, levert for sent, trukket. Teller ikke i analysen. */
  disqualified: Array<{ company: string; note: string }>;
}

// Beløpet står sist på linjen. Grupper på tre skilt med punktum eller mellomrom,
// eventuelt et rent tall. Avsenderne er ikke konsekvente: "kr" kan stå foran
// eller bak beløpet, ",-" er valgfritt, og tusenskillet er punktum eller
// mellomrom ("796 150" og "1.052.177" i samme innboks).
const BELOP = /^(.*?)[\s:]*(?:kr\.?\s*)?((?:\d{1,3}(?:[.\s]\d{3})+)|\d{4,})(?:\s*[,.]-)?\s*(?:kr\.?)?\s*$/i;

function tilTall(s: string): number {
  // Punktum og mellomrom er tusenskille her — alt annet enn siffer bort
  const bare = s.replace(/[^\d]/g, "");
  return bare ? Number(bare) : NaN;
}

export function parseAnbudsprotokoll(text: string): ParsedProtocol {
  const linjer = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let title = "";
  const bids: ParsedBid[] = [];
  const ignored: string[] = [];
  const disqualified: Array<{ company: string; note: string }> = [];

  for (const linje of linjer) {
    // Overskriften: første linje som nevner anbudsprotokoll, eller aller første
    // linje dersom ingen gjør det.
    if (!title && ER_OVERSKRIFT.test(linje)) {
      title = linje
        .replace(OVERSKRIFT, "")
        .replace(/[\s:]+$/, "")
        .trim();
      continue;
    }

    const m = linje.match(BELOP);
    if (!m) {
      // Overskriften brytes ofte over to linjer i SMS-en («… Farsund
      // Kommune», «Støttemur Finsnes næringsbygg»). Alt som kommer før det
      // første budet og ikke har beløp, hører til overskriften.
      // «Nomeland Anlegg - Leverte ikke i tide», «B.S.Graveservice AS-Avvist»:
      // tilbyderen var med, men uten pris. Den skal registreres, ikke forsvinne.
      if (UTELATT.test(linje)) {
        const delt = linje.split(/\s*[-–—:]\s*/);
        const navn = (delt.length > 1 ? delt.slice(0, -1).join(" ") : linje).replace(UTELATT, "").trim();
        const grunn = (delt.length > 1 ? delt[delt.length - 1] : linje).trim();
        if (navn) { disqualified.push({ company: navn.replace(/[\s-]+$/, ""), note: grunn }); continue; }
      }
      if (STOY.test(linje)) continue;
      if (title && bids.length === 0) title = `${title} ${linje}`.trim();
      else ignored.push(linje);
      continue;
    }

    const company = m[1].replace(/[\s:.,-]+$/, "").trim();
    const amount = tilTall(m[2]);
    if (!company || !Number.isFinite(amount) || amount <= 0) {
      ignored.push(linje);
      continue;
    }
    bids.push({ company, amount });
  }

  // Ingen overskrift funnet: bruk den første linjen som ikke var et bud
  if (!title && ignored.length) title = ignored.shift()!.replace(/[\s:]+$/, "");

  // Laveste pris først — det er rekkefølgen protokollen normalt leses i
  bids.sort((a, b) => a.amount - b.amount);

  return { title, bids, ignored, disqualified };
}

/**
 * Finner vårt eget bud blant budene. Navnet i protokollen er skrevet for hånd
 * («Hauge Maskin as» mot «Hauge Maskin AS»), så sammenligningen må være løs.
 */
export function finnEgetBud(bids: ParsedBid[], firmanavn?: string | null): ParsedBid | undefined {
  const eget = normaliser(firmanavn);
  if (!eget) return undefined;
  const initialer = forkorting(firmanavn);

  return bids.find((b) => {
    const n = normaliser(b.company);
    if (!n) return false;
    if (n === eget || n.startsWith(eget) || eget.startsWith(n)) return true;
    // Noen protokoller forkorter: «HM» for Hauge Maskin. Godtas bare når
    // forkortelsen er kort, ellers ville tilfeldige navn truffet.
    return !!initialer && n === initialer && n.length <= 3;
  });
}

/** «Hauge Maskin AS» -> «hm» */
function forkorting(s?: string | null) {
  return String(s ?? "")
    .split(/\s+/)
    .filter((o) => o && !/^(as|asa|ans|da)$/i.test(o))
    .map((o) => o[0])
    .join("")
    .toLowerCase();
}

function normaliser(s?: string | null) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\b(as|asa|ans|da)\b/g, "")
    .replace(/[^a-z0-9æøå]/g, "")
    .trim();
}

/**
 * Deler en samling meldinger i enkeltprotokoller.
 *
 * Limer man inn en hel SMS-tråd, kommer protokollene etter hverandre uten noe
 * tydelig skille. Ordet «Anbudsprotokoll» starter alltid en ny, så det brukes
 * som skillelinje. Datolinjer og annet meldingsappen limer med, havner mellom
 * protokollene og blir ignorert av tolkeren.
 */
export function splittProtokoller(text: string): string[] {
  const linjer = String(text ?? "").split(/\r?\n/);
  const bolker: string[][] = [];
  let denne: string[] | null = null;

  for (const linje of linjer) {
    if (ER_OVERSKRIFT.test(linje)) {
      if (denne && denne.length) bolker.push(denne);
      denne = [linje];
    } else if (denne) {
      denne.push(linje);
    }
    // Linjer før den aller første protokollen kastes
  }
  if (denne && denne.length) bolker.push(denne);

  // Bolker uten minst to bud er som regel rester fra meldingsappen
  return bolker
    .map((b) => b.join("\n").trim())
    .filter((b) => parseAnbudsprotokoll(b).bids.length >= 2);
}

