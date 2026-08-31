// Telefonnummer skrevet av mennesker.
//
// Det samme nummeret kommer inn på et titalls måter: «+47 912 34 567»,
// «0047 91234567», «912-34-567», «91 23 45 67», med mellomrom av og til og
// uten av og til. Skrives det rett i basen, blir det umulig å søke opp igjen,
// og to oppføringer av samme kunde ser ut som to ulike.
//
// Her ryddes alt til de åtte sifrene et norsk nummer består av, og vises igjen
// slik nordmenn faktisk grupperer dem. Utenlandske numre får stå som de er —
// de har ikke åtte siffer, og å tvinge dem inn i formen ville ødelagt dem.

export interface Telefon {
  /** Bare sifrene, uten landskode. Åtte tegn for norske numre. */
  siffer: string;
  /** Gruppert for lesing: «912 34 567» eller «22 12 34 56» */
  visning: string;
  /** Landskode uten +, f.eks. «47». Tom når nummeret er norsk uten kode. */
  landskode: string;
  /** Åtte siffer og norsk — altså trygt å ringe, søke på og sende SMS til */
  norsk: boolean;
  /** Tomt felt er hverken gyldig eller ugyldig */
  tomt: boolean;
}

/**
 * Norske nummer er åtte siffer. De som starter med 4 eller 9 er mobil og
 * grupperes 3-2-3; resten er fasttelefon og grupperes 2-2-2-2. Det er slik de
 * står på visittkort og i telefonkatalogen, og et nummer som er gruppert feil
 * leses tregere enn ett uten mellomrom i det hele tatt.
 */
export function formaterTelefon(siffer: string): string {
  const s = siffer.replace(/\D/g, "");
  if (s.length !== 8) return s;
  return /^[49]/.test(s)
    ? `${s.slice(0, 3)} ${s.slice(3, 5)} ${s.slice(5)}`
    : `${s.slice(0, 2)} ${s.slice(2, 4)} ${s.slice(4, 6)} ${s.slice(6)}`;
}

export function normaliserTelefon(input?: string | null): Telefon {
  const rå = String(input ?? "").trim();
  if (!rå) return { siffer: "", visning: "", landskode: "", norsk: true, tomt: true };

  let siffer = rå.replace(/\D/g, "");
  let landskode = "";

  // «+47…» og «0047…» sier selv at koden står først. Da kan den trygt skrelles
  // av uansett hva som kommer etter.
  const eksplisittKode = rå.startsWith("+") || /^00\d/.test(rå);
  if (eksplisittKode) {
    if (rå.startsWith("00")) siffer = siffer.slice(2);
    if (siffer.startsWith("47") && siffer.length === 10) {
      landskode = "47";
      siffer = siffer.slice(2);
    } else {
      // Utenlandsk. Vi vet ikke hvor lang koden er, så nummeret får stå samlet.
      return {
        siffer,
        visning: `+${siffer}`,
        landskode: "",
        norsk: false,
        tomt: false,
      };
    }
  } else if (siffer.length === 10 && siffer.startsWith("47")) {
    // «47 912 34 567» uten pluss. Ti siffer som starter på 47 er landskoden —
    // men merk at ÅTTE siffer som starter på 47 er et helt vanlig norsk
    // mobilnummer (47 12 34 56 finnes), så lengden må sjekkes først. Uten det
    // ville hvert nummer som begynner på 47 mistet de to første sifrene sine.
    landskode = "47";
    siffer = siffer.slice(2);
  }

  const norsk = siffer.length === 8;
  return {
    siffer,
    visning: norsk ? formaterTelefon(siffer) : siffer,
    landskode,
    norsk,
    tomt: false,
  };
}

/** Verdien som skal lagres: ryddet og gruppert, eller det brukeren skrev. */
export function telefonForLagring(input?: string | null): string | null {
  const t = normaliserTelefon(input);
  if (t.tomt) return null;
  return t.visning;
}

/** Bare sifrene — til tel:-lenker, SMS og sammenligning av to numre. */
export function telefonSiffer(input?: string | null): string {
  return normaliserTelefon(input).siffer;
}

/**
 * Melding å vise under feltet. Null når det ikke er noe å si — en advarsel på
 * hvert eneste felt blir fort noe man slutter å lese.
 */
export function telefonAdvarsel(input?: string | null): string | null {
  const t = normaliserTelefon(input);
  if (t.tomt || t.norsk) return null;
  if (!t.siffer) return "Fant ingen siffer her";
  if (t.siffer.length < 8) return `Bare ${t.siffer.length} siffer — norske nummer har 8`;
  return `${t.siffer.length} siffer — sjekk at det stemmer`;
}
