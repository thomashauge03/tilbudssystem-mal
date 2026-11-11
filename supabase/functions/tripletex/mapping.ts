// Hvordan tilbud og kunder oversettes mellom appen og Tripletex.
//
// Ligger for seg selv, uten Deno-API, slik som tekst.ts i varsel-epost: edge
// functionen importerer den som nabofil, og node kan teste nøyaktig den samme
// filen. Det som kan gå galt med penger, skal kunne prøves uten Tripletex.

// ─── Tilbud → ordre ─────────────────────────────────────────────────────────

export interface Tilbudslinje {
  sort_order?: number | null;
  description?: string | null;
  comment?: string | null;
  unit?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  discount_pct?: number | null;
  included?: boolean | null;
  is_heading?: boolean | null;
  ns_code?: string | null;
}

export interface Ordrelinje {
  description: string;
  count: number;
  unitPriceExcludingVatCurrency: number;
  discount: number;
  vatType: { id: number };
  sortIndex: number;
}

const kroner = (n: number) => Math.round(n * 100) / 100;

// ─── Delordre: andel per post ───────────────────────────────────────────────

/** {offer_line_id: prosent} — hvor stor del av hver post som er tatt med totalt. */
export type Andeler = Record<string, number>;

export interface Delordrerad {
  andeler?: Andeler | null;
  tripletex_status?: string | null;
}

/**
 * Hvor langt hver post er tatt med, etter alle delordrene som gjelder.
 *
 * En kreditert ordre teller ikke: pengene er gitt tilbake, og andelen er åpen
 * igjen. Andelene kan bare gå opp, så den høyeste er den siste.
 */
export function gjeldendeAndeler(rader: Delordrerad[]): Andeler {
  const ut: Andeler = {};
  for (const r of rader ?? []) {
    if (r.tripletex_status === "kreditert" || !r.andeler) continue;
    for (const [id, pct] of Object.entries(r.andeler)) {
      ut[id] = Math.max(ut[id] ?? 0, Number(pct) || 0);
    }
  }
  return ut;
}

/**
 * Passer andelene fra tidligere delordre med linjene tilbudet har nå?
 *
 * Andelene huskes per linje-id. Har linjene fått nye id-er — et tilbud som er
 * bygd opp på nytt, eller en lagring fra en eldre versjon av appen — ser det ut
 * som ingenting er fakturert, og neste ordre ville tatt alt med igjen. Da skal
 * det heller stoppe enn å fakturere dobbelt. At noen linjer er fjernet, er
 * greit; at ingen av dem finnes lenger, er det ikke.
 */
export function andelerPasser(rader: Delordrerad[], linjeIder: Iterable<string>): boolean {
  const ider = new Set(linjeIder);
  const tidligere = Object.keys(gjeldendeAndeler(rader));
  return !tidligere.length || tidligere.some((id) => ider.has(id));
}

const tall = (n: number, des = 2) =>
  new Intl.NumberFormat("nb-NO", { minimumFractionDigits: des, maximumFractionDigits: des })
    .format(n)
    .replace(new RegExp("[\\u00a0\\u202f]", "g"), " ");

const prosent = (n: number) => `${tall(n, Number.isInteger(n) ? 0 : 1)} %`;

/**
 * Linjenettoen, eks. mva.
 *
 * Tvilling av `lineNet` i `src/lib/format.ts` (og `summerLinjer` i
 * varsel-epost), av samme grunn: Deno kan ikke importere fra `src/`. Endres
 * reglene der, må de endres her — ellers står det et annet beløp på ordren i
 * Tripletex enn i tilbudet kunden signerte. Overskrifter og linjer som ikke er
 * med, er alt silt ut av den som kaller.
 */
const netto = (l: Tilbudslinje) =>
  Number(l.quantity ?? 0) * Number(l.unit_price ?? 0) * (1 - Number(l.discount_pct ?? 0) / 100);

export interface Delordre {
  linjer: Ordrelinje[];
  sum: number;
  /** Andelene etter denne ordren — lagres på raden i payments. */
  andeler: Andeler;
}

/**
 * Ordrelinjene for økningen fra `forrige` til `nye`.
 *
 * Hver post som har økt, blir én linje som ser ut som en vanlig fakturalinje:
 * navnet, andelen i parentes — «asfalt (23 %)», neste gang «asfalt (23 → 60 %)»
 * — og mengden og prisen i Tripletex sine egne felt, her 29,9 × 300,00. Før
 * sto mengde, pris og andel i teksten, og linjen ble uleselig. Kommentaren på
 * posten er utelatt av samme grunn; den står i tilbuds-PDF-en som ligger ved.
 *
 * Overskriftene fra tilbudet kommer med som tekstlinjer, men bare over poster
 * som er med denne gangen — ellers står det overskrifter uten noe under.
 *
 * Adm.påslaget kommer som egen linje av det som er tatt med denne gangen, så
 * alle delordrene til sammen blir tilbudssummen.
 *
 * En post som er merket fullført (`avsluttet`), tas ikke med lenger: den er
 * ferdig selv om ikke alt ble fakturert — mengden ble kanskje mindre enn i
 * tilbudet. Andelen den hadde, står.
 *
 * Kaster med en melding brukeren kan lese hvis en andel er ugyldig eller
 * ingenting har økt.
 */
export function delordre(
  linjer: Array<Tilbudslinje & { id: string }>,
  forrige: Andeler,
  nye: Andeler,
  adminPct: number | null | undefined,
  vatTypeId: number,
  avsluttet: ReadonlySet<string> = new Set(),
): Delordre {
  const iRekkefolge = [...(linjer ?? [])]
    .filter((l) => l.included !== false)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));

  const ut: Ordrelinje[] = [];
  const andeler: Andeler = {};
  let grunnlag = 0;
  let poster = 0;
  // Overskriften settes inn først når en post under den faktisk kommer med.
  let ventendeOverskrift: string | null = null;

  for (const l of iRekkefolge) {
    if (l.is_heading) {
      ventendeOverskrift = (l.description ?? "").trim() || null;
      continue;
    }
    const for_ = Number(forrige[l.id] ?? 0);
    const na = nye[l.id] === undefined ? for_ : Number(nye[l.id]);
    const navn = (l.description ?? "").trim() || "posten";
    if (avsluttet.has(l.id)) {
      if (na > for_) {
        throw new Error(
          `«${navn}» er merket som fullført. Ta av haken for å fakturere mer av den.`,
        );
      }
      andeler[l.id] = for_;
      continue;
    }
    if (!Number.isFinite(na) || na < 0 || na > 100) {
      throw new Error(`Andelen for «${navn}» må være mellom 0 og 100 %`);
    }
    if (na < for_) {
      throw new Error(
        `«${navn}» er alt tatt med ${prosent(for_)}. Andelen kan ikke settes lavere — krediter i Tripletex i stedet.`,
      );
    }
    andeler[l.id] = na;
    if (na === for_) continue;

    // Mengden for økningen, slik Tripletex regner: antall × pris − rabatt.
    // Fire desimaler holder avviket fra tilbudssummen under et øre.
    const antall = Math.round(Number(l.quantity ?? 0) * ((na - for_) / 100) * 10_000) / 10_000;
    const pris = kroner(Number(l.unit_price ?? 0));
    const rabatt = Number(l.discount_pct ?? 0);
    grunnlag += kroner(antall * pris * (1 - rabatt / 100));

    if (ventendeOverskrift) {
      ut.push({
        description: ventendeOverskrift,
        count: 0,
        unitPriceExcludingVatCurrency: 0,
        discount: 0,
        vatType: { id: vatTypeId },
        sortIndex: ut.length + 1,
      });
      ventendeOverskrift = null;
    }

    const kode = (l.ns_code ?? "").trim();
    const andel =
      for_ > 0 ? `${tall(for_, Number.isInteger(for_) ? 0 : 1)} → ${prosent(na)}` : prosent(na);
    ut.push({
      description: `${[kode, navn].filter(Boolean).join(" ")} (${andel})`,
      count: antall,
      unitPriceExcludingVatCurrency: pris,
      discount: rabatt,
      vatType: { id: vatTypeId },
      sortIndex: ut.length + 1,
    });
    poster++;
  }

  if (!poster) throw new Error("Ingen poster har fått høyere andel enn sist");

  const pct = Number(adminPct ?? 0);
  if (pct > 0) {
    ut.push({
      description: `Adm.påslag ${prosent(pct)}`,
      count: 1,
      unitPriceExcludingVatCurrency: kroner(grunnlag * (pct / 100)),
      discount: 0,
      vatType: { id: vatTypeId },
      sortIndex: ut.length + 1,
    });
  }

  return { linjer: ut, sum: ordresum(ut), andeler };
}

// ─── Status fra Tripletex ───────────────────────────────────────────────────

export type Tripletexstatus = "ordre" | "fakturert" | "delvis_betalt" | "betalt" | "kreditert";

export interface TripletexFaktura {
  id: number;
  invoiceNumber?: number | null;
  invoiceDate?: string | null;
  amount?: number | null;
  amountOutstanding?: number | null;
  isCredited?: boolean | null;
  isCreditNote?: boolean | null;
  orders?: Array<{ id: number }> | null;
}

/** Hvor ordren står, ut fra fakturaen Tripletex har laget av den (om noen). */
export function fakturastatus(f: TripletexFaktura | null | undefined): Tripletexstatus {
  if (!f) return "ordre";
  if (f.isCredited) return "kreditert";
  const belop = Math.abs(Number(f.amount ?? 0));
  const utestaende = Number(f.amountOutstanding ?? belop);
  // Øresavrunding kan la noen øre stå igjen på en faktura som er betalt.
  if (utestaende <= 0.5) return "betalt";
  if (utestaende < belop - 0.5) return "delvis_betalt";
  return "fakturert";
}

/** Hva ordren blir på, eks. mva, regnet slik Tripletex regner linjene. */
function ordresum(linjer: Ordrelinje[]): number {
  return kroner(
    linjer.reduce(
      (s, l) => s + l.count * l.unitPriceExcludingVatCurrency * (1 - l.discount / 100),
      0,
    ),
  );
}

/**
 * Nummeret på mva-koden i Tripletex for en sats.
 *
 * Tripletex har flere koder med samme prosent (omvendt avgiftsplikt, uttak
 * osv.), så det holder ikke å lete etter prosenten. Dette er de vanlige
 * kodene for salg innenlands. Ukjent sats gir null, og da leter vi på prosent.
 */
export function mvaNummer(sats: number): string | null {
  return ({ 25: "3", 15: "31", 12: "33", 0: "5" } as Record<number, string>)[sats] ?? null;
}

// ─── Tripletex-kunde → kunde i appen ────────────────────────────────────────

export interface TripletexAdresse {
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

export interface TripletexKunde {
  id: number;
  name?: string | null;
  organizationNumber?: string | null;
  email?: string | null;
  invoiceEmail?: string | null;
  phoneNumber?: string | null;
  phoneNumberMobile?: string | null;
  postalAddress?: TripletexAdresse | null;
  physicalAddress?: TripletexAdresse | null;
}

export interface AppKunde {
  id: string;
  name: string;
  org_number?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tripletex_id?: number | null;
}

export interface Kundefelt {
  name: string;
  org_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

/** Adressen på én linje, slik adressefeltet i appen holder den. */
export function adresseTekst(a: TripletexAdresse | null | undefined): string {
  if (!a) return "";
  const gate = [a.addressLine1, a.addressLine2]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const sted = [a.postalCode, a.city]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return [gate, sted].filter(Boolean).join(", ");
}

export function kundefelt(t: TripletexKunde): Kundefelt {
  const tom = (s: string | null | undefined) => (s ?? "").trim() || null;
  return {
    name: (t.name ?? "").trim(),
    org_number: tom(t.organizationNumber),
    email: tom(t.email) ?? tom(t.invoiceEmail),
    phone: tom(t.phoneNumberMobile) ?? tom(t.phoneNumber),
    address: tom(adresseTekst(t.postalAddress)) ?? tom(adresseTekst(t.physicalAddress)),
  };
}

/** Org.nr. med bare sifrene, så «987 654 321» og «987654321» er det samme. */
export const orgnr = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Navn uten store/små bokstaver og doble mellomrom. */
export const navnenokkel = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export type Kundevalg =
  | { type: "ny"; tripletexId: number; felt: Kundefelt }
  | {
      type: "oppdater";
      tripletexId: number;
      id: string;
      felt: Partial<Kundefelt>;
      kobles: boolean;
    };

/**
 * Hva som skal skje med hver kunde fra Tripletex.
 *
 * Tripletex er fasiten. En kunde som finnes i appen fra før, kobles i denne
 * rekkefølgen: samme Tripletex-id, så samme org.nr., så samme navn — navnet
 * bare når det peker på én eneste ukoblet kunde, ellers kunne to ulike firmaer
 * med samme navn blitt slått sammen. Resten blir nye kunder.
 *
 * Et tomt felt i Tripletex visker ikke ut det som står i appen: der kan noen ha
 * skrevet inn et telefonnummer Tripletex ikke har.
 *
 * Kunder som bare finnes i appen, røres ikke. De opprettes i Tripletex først
 * når et tilbud til dem sendes over.
 */
export function planleggKunder(fraTripletex: TripletexKunde[], iAppen: AppKunde[]): Kundevalg[] {
  const paId = new Map<number, AppKunde>();
  const ledige: AppKunde[] = [];
  for (const k of iAppen) {
    if (k.tripletex_id != null) paId.set(Number(k.tripletex_id), k);
    else ledige.push(k);
  }
  const brukt = new Set<string>();

  const valg: Kundevalg[] = [];
  for (const t of fraTripletex) {
    const felt = kundefelt(t);
    if (!felt.name) continue;

    let treff = paId.get(Number(t.id));
    let kobles = false;

    if (!treff && orgnr(felt.org_number)) {
      treff = ledige.find(
        (k) => !brukt.has(k.id) && orgnr(k.org_number) === orgnr(felt.org_number),
      );
      kobles = !!treff;
    }
    if (!treff) {
      const like = ledige.filter(
        (k) =>
          !brukt.has(k.id) &&
          navnenokkel(k.name) === navnenokkel(felt.name) &&
          // Har kunden i appen et annet org.nr., er det et annet firma.
          (!orgnr(k.org_number) || !orgnr(felt.org_number)),
      );
      if (like.length === 1) {
        treff = like[0];
        kobles = true;
      }
    }

    if (!treff) {
      valg.push({ type: "ny", tripletexId: Number(t.id), felt });
      continue;
    }
    brukt.add(treff.id);

    const endret: Partial<Kundefelt> = {};
    for (const n of ["name", "org_number", "email", "phone", "address"] as const) {
      const ny = felt[n];
      if (ny && ny !== (treff[n] ?? null)) endret[n] = ny;
    }
    if (kobles || Object.keys(endret).length) {
      valg.push({
        type: "oppdater",
        tripletexId: Number(t.id),
        id: treff.id,
        felt: endret,
        kobles,
      });
    }
  }
  return valg;
}

/** Kunden slik Tripletex vil ha den når appen oppretter den der. */
export function tilTripletexKunde(k: AppKunde) {
  const ut: Record<string, unknown> = { name: k.name.trim() };
  const org = orgnr(k.org_number);
  if (org) ut.organizationNumber = org;
  if (k.email?.trim()) {
    ut.email = k.email.trim();
    ut.invoiceEmail = k.email.trim();
  }
  if (k.phone?.trim()) ut.phoneNumber = k.phone.trim();
  // Adressefeltet i appen er fritekst. Uten å vite hva som er gate og hva som
  // er poststed, legges hele teksten i første adresselinje.
  if (k.address?.trim()) ut.postalAddress = { addressLine1: k.address.trim() };
  return ut;
}
