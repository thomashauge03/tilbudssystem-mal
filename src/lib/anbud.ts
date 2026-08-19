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

export interface ParsedProtocol {
  /** Overskriften uten ordet «Anbudsprotokoll» og uten kolon på slutten */
  title: string;
  bids: ParsedBid[];
  /** Linjer tolkeren ikke fikk noe ut av — vises så brukeren kan rette selv */
  ignored: string[];
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

  for (const linje of linjer) {
    // Overskriften: første linje som nevner anbudsprotokoll, eller aller første
    // linje dersom ingen gjør det.
    if (!title && /anbudsprotokoll/i.test(linje)) {
      title = linje
        .replace(/^\s*anbudsprotokoll\s*/i, "")
        .replace(/[\s:]+$/, "")
        .trim();
      continue;
    }

    const m = linje.match(BELOP);
    if (!m) {
      // Overskriften brytes ofte over to linjer i SMS-en («… Farsund
      // Kommune», «Støttemur Finsnes næringsbygg»). Alt som kommer før det
      // første budet og ikke har beløp, hører til overskriften.
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

  return { title, bids, ignored };
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
