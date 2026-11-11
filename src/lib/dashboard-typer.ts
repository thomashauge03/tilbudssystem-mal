/**
 * Kontrakten mellom datalaget (dashboard-data.ts) og visningen (components/dashboard/*).
 *
 * Alle beløp er i hele kroner (number, ikke avrundet her — visningen avrunder).
 * Alle datoer er ISO-strenger «YYYY-MM-DD». Dager er hele dager regnet mot «i dag».
 */

/** Pengene øverst: hvor mye er avtalt, fakturert, betalt og igjen. */
export type Pengene = {
  /** Godkjente/fullførte tilbud + godkjente endringer. Samme regel som Status-siden. */
  kontraktssum: number;
  kontraktTilbud: number;
  kontraktEndringer: number;
  antallGodkjenteEndringer: number;
  /** Fakturaen er sendt (betalt eller ikke). Kreditert telles ikke. */
  fakturert: number;
  /** Kunden har betalt (paid = true). */
  betalt: number;
  /** Fakturert, men ikke betalt. */
  kundenSkylder: number;
  antallUbetalteFakturaer: number;
  /** Ubetalt og mer enn betalingsfristen (app_settings.payment_terms, ellers 30 d) siden fakturadato. */
  forfalt: number;
  antallForfalte: number;
  /** Ordre i Tripletex som ikke er fakturert ennå (tripletex_status = 'ordre'). */
  klarTilFakturering: number;
  /** Σ per jobb: 0 for fullført, ellers max(0, kontrakt − fakturert − rest på poster merket ferdig). */
  igjen: number;
  /** 0–100, fakturert / kontraktssum. */
  prosentFakturert: number;
  /** Ferdig utregnet setning om hvor pengene ligger, eller null. F.eks. «3,1 mill av dette er #1027 og #1013, som ikke er startet.» */
  hvorPengeneLigger: string | null;
};

export type TilbudSomVenter = {
  id: string;
  nummer: number;
  tittel: string;
  kunde: string | null;
  telefon: string | null;
  epost: string | null;
  belop: number;
  fristDato: string | null;
  /** Negativ = fristen er passert så mange dager siden. Positiv = dager igjen. null = ingen frist. */
  dagerTilFrist: number | null;
  /** Mer enn 30 dager over frist. */
  borLukkes: boolean;
};

export type KravSomVenter = {
  id: string;
  nummer: string;
  tittel: string;
  /** Kunden på tilbudet kravet hører til. */
  kunde: string | null;
  telefon: string | null;
  belop: number;
  sendtDato: string | null;
  /** Dager siden sendt. null = ikke sendt. */
  dagerSidenSendt: number | null;
  ikkeSendt: boolean;
  manglerBelop: boolean;
};

export type Jobb = {
  /** Tilbudets id, for lenke til /tilbud/$id. */
  id: string;
  nummer: number;
  tittel: string;
  kunde: string | null;
  /** Tilbud + godkjente endringer på tilbudet. */
  kontrakt: number;
  fakturert: number;
  igjen: number;
  /** 0–100 (kan være over 100 når det er fakturert for mye). */
  prosentFakturert: number;
  fase: "ikke_startet" | "i_gang" | "ferdig";
  fakturertForMye: number;
};

export type Maned = {
  /** «2026-10» */
  maned: string;
  /** «okt» */
  navn: string;
  /** Kontrakt for tilbud godkjent den måneden + godkjente endringer den måneden. */
  nyeJobber: number;
  fakturert: number;
  /** Inneværende måned (ikke ferdig). */
  hittil: boolean;
};

export type Hendelse = {
  dato: string;
  type: "tilbud_signert" | "tilbud_avslatt" | "endring_godkjent" | "endring_avslatt" | "krav_sendt" | "betaling";
  tekst: string;
  belop: number | null;
  lenke: { to: "/tilbud/$id" | "/endringsmeldinger/$id"; id: string } | null;
};

export type SjekkPunkt = {
  tekst: string;
  lenke: { to: "/tilbud/$id" | "/endringsmeldinger/$id"; id: string } | null;
};

export type Kunde = { navn: string; kontrakt: number; fakturert: number; prosentFakturert: number };

export type DashboardData = {
  /** Beholdes for mobil.tsx: lik pengene.kontraktssum og pengene.fakturert. */
  totalKontraktssum: number;
  totalFakturert: number;

  pengene: Pengene;
  /** Alle tilbud med status sendt. Først de med frist passert (størst beløp først), så resten (nærmeste frist først). */
  tilbudSomVenter: TilbudSomVenter[];
  tilbudSomVenterSum: number;
  /** Krav (ikke avslått, ikke godkjent). Rekkefølge: ikke sendt, så med beløp (størst først), så mangler beløp. */
  kravSomVenter: KravSomVenter[];
  kravSomVenterSum: number;
  /** Sum av krav som er sendt for mer enn 30 dager siden. */
  kravOver30Dager: number;
  /** Antall krav som er sendt for mer enn 30 dager siden. */
  antallKravOver30Dager: number;

  /** Alle godkjente/fullførte tilbud, sortert på igjen (størst først). */
  jobber: Jobb[];
  faser: { ikkeStartet: number; iGang: number; ferdig: number };

  /** Siste 6 måneder, eldste først, inneværende måned sist. */
  maneder: Maned[];
  /** Ferdig setning, f.eks. «Siste 3 måneder: 0,66 mill i nye jobber, 5,23 mill fakturert.» */
  manederSetning: string;
  /** Satt når nye jobber siste 3 mnd er under halvparten av fakturert. */
  mindreArbeidIgjen: boolean;

  tilbud: {
    gittDenneManed: number;
    gittDenneManedSum: number;
    gittForrigeManed: number;
    /** Norsk navn på måneden, «november». */
    denneManedNavn: string;
    /** Siste 12 mnd: godkjent+fullført. */
    fikkJobben: number;
    /** Siste 12 mnd: godkjent+fullført+avslått+sendt med frist passert. */
    avBesvarte: number;
    saNei: number;
    svarteAldri: number;
    /** Median («vanlig størrelse») på tilbud du fikk og tilbud som ble avslått. Ett stort tilbud skal ikke styre tallet. */
    snittFatt: number;
    snittTapt: number;
  };
  kunder: Kunde[];
  borSjekkes: SjekkPunkt[];
  siste7Dager: Hendelse[];
};
