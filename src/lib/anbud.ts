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
//
// To krav trekker i hver sin retning, og begge må innfris:
//   – slippe gjennom det som ER bud, uansett hvordan avsenderen skriver beløpet
//   – holde ute det som IKKE er bud (datolinjer, telefon- og organisasjonsnummer)
// Går ett falskt bud gjennom, blir det som regel det laveste, og da regnes hele
// anbudet som tapt mot en konkurrent som ikke finnes. Derfor er tvilstilfeller
// aldri stille: de havner i `ignored`, som vises for brukeren.

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

/**
 * Datolinjer meldingsappen skyter inn mellom meldingene («tirsdag 17. feb. •
 * 16:56», «04.03.2026», «12.02.2026 09:14»). Ved masseimport havner de inne i
 * den forrige protokollens blokk, og må bort før noe annet prøves — ellers blir
 * årstallet lest som et bud på 2 026 kroner.
 */
const DATOLINJE =
  /^(?:(?:man|tir|ons|tors|tirs|fre|lør|søn)[a-zæøå]*\.?\s*)?\d{0,2}\.?\s*(?:[a-zæøå]{3,}\.?)?\s*(?:•|·|kl\.?)?\s*\d{1,2}[:.]\d{2}$|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s+(?:kl\.?\s*)?\d{1,2}[:.]\d{2})?$/i;

/**
 * Telefon- og organisasjonsnummer står i signaturen og er ni siffer i
 * tregrupper — altså akkurat samme form som et beløp.
 */
const KONTAKTNR = /\b(tlf|telefon|mob|mobil|org\.?\s*nr|orgnr|foretaksregisteret)\b/i;

/** Et nummer alene på linjen, med eller uten landkode: «+47 900 12 345». */
const BARE_NUMMER = /^\+?\d[\d\s.-]{6,}$/;

/**
 * Laveste beløp vi godtar som et ekte anbud. Årstall (2026), husnummer og
 * ukenummer ligger under; det gjør ingen entreprisesum. Alt som havner under
 * grensen blir ikke forkastet i stillhet — det legges i `ignored`.
 */
export const MINSTE_BELOP = 10_000;

// Tallformene avsenderne faktisk bruker, i tur og orden:
//   1.250.000 / 1 250 000   punktum eller mellomrom som tusenskille, øre etter komma
//   1,250,000               komma som tusenskille (kopiert fra regneark), øre etter punktum
//   950000                  rent tall, minst fire siffer
const TALL =
  String.raw`\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?` +
  String.raw`|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?` +
  String.raw`|\d{4,}(?:[.,]\d{1,2})?`;

// Halen etter beløpet: «,-», «kr», «eks mva», «(inkl. mva)» — alt valgfritt.
const HALE =
  String.raw`(?:\s*[,.]-)?\s*(?:kr\.?)?\s*` +
  String.raw`(?:\(?\s*(?:eks|eksl|ekskl|eksklusive|inkl|inklusive)\.?\s*(?:mva|moms)\.?\s*\)?)?\s*`;

/** Beløpet står sist på linjen; «kr» kan stå foran eller bak. */
const BELOP = new RegExp(String.raw`^(.*?)[\s:]*(?:kr\.?\s*)?(` + TALL + String.raw`)` + HALE + `$`, "i");

/** Ser linjen ut til å inneholde en pengesum? Brukes for å avgjøre om en linje
 *  tolkeren ikke forsto kan være et tapt bud, eller bare er en tekstlinje. */
const PENGEAKTIG = /\d{1,3}(?:[.,\s]\d{3})+|\d{4,}/;

function tilTall(s: string): number {
  const t = s.trim();
  // Ett eller to siffer bak det siste skilletegnet er øre, ikke en tusengruppe.
  const ore = t.match(/[.,](\d{1,2})$/);
  const heltall = ore ? t.slice(0, ore.index) : t;
  const bare = heltall.replace(/\D/g, "");
  if (!bare) return NaN;
  return Number(bare) + (ore ? Number(ore[1].padEnd(2, "0")) / 100 : 0);
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

    // Kjent støy tas før beløpsmønsteret slipper til. Ellers leses «04.03.2026»
    // som et bud fra «04.03» på 2 026 kroner, og «Mvh Firma AS, org.nr 912 345
    // 678» som et bud på 912 millioner.
    if (DATOLINJE.test(linje) || BARE_NUMMER.test(linje)) continue;
    if (STOY.test(linje) || KONTAKTNR.test(linje)) continue;

    // «Nomeland Anlegg - Leverte ikke i tide», «B.S.Graveservice AS-Avvist»:
    // tilbyderen var med, men uten pris. Den skal registreres, ikke forsvinne.
    if (UTELATT.test(linje)) {
      // Navn og grunn skilles med bindestrek eller kolon. Men bindestreken
      // finnes også inne i firmanavn («Nord-Odal Maskin - Avvist»), så vi deler
      // på det SISTE skilletegnet som fortsatt har grunnen etter seg. Da holder
      // både «Nord-Odal Maskin - Avvist» og «B.S.Graveservice AS-Avvist».
      let kutt = -1;
      let lengde = 0;
      for (const s of linje.matchAll(/\s*[-–—:]\s*/g)) {
        if (UTELATT.test(linje.slice(s.index + s[0].length))) {
          kutt = s.index;
          lengde = s[0].length;
        }
      }
      const navn = (kutt >= 0 ? linje.slice(0, kutt) : linje.replace(UTELATT, "")).trim();
      const grunn = (kutt >= 0 ? linje.slice(kutt + lengde) : linje).trim();
      if (navn) {
        disqualified.push({ company: navn.replace(/[\s-]+$/, ""), note: grunn });
        continue;
      }
    }

    const m = linje.match(BELOP);
    const company = m ? m[1].replace(/[\s:.,-]+$/, "").trim() : "";
    const amount = m ? tilTall(m[2]) : NaN;

    // Et firmanavn inneholder minst én bokstav. Uten det kravet blir «04.03» og
    // «912 345 678» stående igjen som tilbydere.
    const gyldig =
      !!m && !!company && /\p{L}/u.test(company) && Number.isFinite(amount) && amount >= MINSTE_BELOP;

    if (gyldig) {
      bids.push({ company, amount });
      continue;
    }

    // Overskriften brytes ofte over to linjer i SMS-en («… Farsund Kommune»).
    // Men BARE tekstlinjer får slås sammen med overskriften: har linjen et tall
    // som ligner en pengesum, er den etter alt å dømme et bud vi ikke klarte å
    // lese, og da skal brukeren varsles i stedet for at den forsvinner.
    if (title && bids.length === 0 && !PENGEAKTIG.test(linje)) {
      title = `${title} ${linje}`.trim();
      continue;
    }
    ignored.push(linje);
  }

  // Ingen overskrift funnet: bruk den første linjen som ikke var et bud — men
  // aldri en som kan være et bud, for da forsvinner den ut av varselet.
  if (!title) {
    const i = ignored.findIndex((l) => !PENGEAKTIG.test(l));
    if (i >= 0) title = ignored.splice(i, 1)[0].replace(/[\s:]+$/, "");
  }

  // Laveste pris først — det er rekkefølgen protokollen normalt leses i
  bids.sort((a, b) => a.amount - b.amount);

  return { title, bids, ignored, disqualified };
}

/**
 * Finner vårt eget bud blant budene. Navnet i protokollen er skrevet for hånd
 * («Hauge Maskin as» mot «Hauge Maskin AS»), så sammenligningen må være løs —
 * men ikke løsere enn at «Haugen Maskin» fortsatt er et annet firma enn «Hauge
 * Maskin». Sammenligningen går derfor på hele ord, ikke på tegn.
 *
 * Er det tvil om hvilket bud som er vårt, returneres ingenting. Et anbud uten
 * eget bud gir en tom rubrikk; feil bud merket som vårt gir feil statistikk for
 * all ettertid.
 */
export function finnEgetBud(bids: ParsedBid[], firmanavn?: string | null): ParsedBid | undefined {
  const eget = ord(firmanavn);
  if (!eget.length) return undefined;

  const noyaktig = bids.filter((b) => ord(b.company).join(" ") === eget.join(" "));
  if (noyaktig.length) return noyaktig[0];

  // «Hauge Maskin» mot «Hauge Maskin Anlegg AS»: det ene navnet fortsetter der
  // det andre slutter, på ordgrense.
  const delvis = bids.filter((b) => {
    const n = ord(b.company);
    if (!n.length) return false;
    const [kort, lang] = n.length < eget.length ? [n, eget] : [eget, n];
    return kort.every((o, i) => o === lang[i]);
  });
  if (delvis.length === 1) return delvis[0];
  if (delvis.length > 1) return undefined;

  // Noen protokoller forkorter: «HM» for Hauge Maskin. Godtas bare når
  // forkortelsen er kort, ellers ville tilfeldige navn truffet.
  const init = eget.map((o) => o[0]).join("");
  if (init.length > 3) return undefined;
  const korte = bids.filter((b) => ord(b.company).join("") === init);
  return korte.length === 1 ? korte[0] : undefined;
}

/** «Hauge Maskin AS» -> ["hauge", "maskin"]. Selskapsform og tegnsetting bort. */
function ord(s?: string | null): string[] {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9æøå\s]/g, " ")
    .split(/\s+/)
    .filter((o) => o && !/^(as|asa|ans|da)$/.test(o));
}

/**
 * Deler en samling meldinger i enkeltprotokoller, og sier fra om det som ble
 * forkastet.
 *
 * Limer man inn en hel SMS-tråd, kommer protokollene etter hverandre uten noe
 * tydelig skille. Ordet «Anbudsprotokoll» starter alltid en ny, så det brukes
 * som skillelinje.
 */
export function splittProtokollerDetaljert(
  text: string,
): Array<{ tekst: string; protokoll: ParsedProtocol; brukbar: boolean }> {
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

  return bolker
    .map((b) => b.join("\n").trim())
    .filter(Boolean)
    .map((tekst) => {
      const protokoll = parseAnbudsprotokoll(tekst);
      // Under to bud er som regel en rest fra meldingsappen — men det kan også
      // være en protokoll tolkeren ikke fikk tak på, så den skal kunne vises.
      return { tekst, protokoll, brukbar: protokoll.bids.length >= 2 };
    });
}

/** Bare protokollene som lot seg tolke. */
export function splittProtokoller(text: string): string[] {
  return splittProtokollerDetaljert(text)
    .filter((b) => b.brukbar)
    .map((b) => b.tekst);
}
