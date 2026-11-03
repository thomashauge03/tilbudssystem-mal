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

/**
 * Summen av linjene før adm.påslag, eks. mva.
 *
 * Tvilling av `lineNet`/`offerTotal` i `src/lib/format.ts` (og `summerLinjer`
 * i varsel-epost), av samme grunn: Deno kan ikke importere fra `src/`. Endres
 * reglene der, må de endres her — ellers står det et annet beløp på ordren i
 * Tripletex enn i tilbudet kunden signerte.
 */
export function linjegrunnlag(linjer: Tilbudslinje[]): number {
  return (linjer ?? [])
    .filter((l) => l.included !== false && !l.is_heading)
    .reduce((s, l) => {
      const brutto = Number(l.quantity ?? 0) * Number(l.unit_price ?? 0);
      return s + brutto * (1 - Number(l.discount_pct ?? 0) / 100);
    }, 0);
}

/**
 * Teksten på ordrelinjen.
 *
 * En ordrelinje i Tripletex uten produkt har ingen enhet, så enheten står i
 * teksten — ellers er «12» på en linje for graving ikke til å forstå. NS-koden
 * kommer først, slik den gjør i PDF-en. Kommentaren får egen linje.
 */
export function linjetekst(l: Tilbudslinje): string {
  const kode = (l.ns_code ?? "").trim();
  const tekst = (l.description ?? "").trim();
  const enhet = (l.unit ?? "").trim();
  let ut = [kode, tekst].filter(Boolean).join(" ");
  if (enhet && !l.is_heading) ut += ` (${enhet})`;
  const kommentar = (l.comment ?? "").trim();
  if (kommentar) ut += `\n${kommentar}`;
  return ut;
}

/**
 * Ordrelinjene et tilbud blir i Tripletex.
 *
 * - Linjer som ikke er tatt med i tilbudet, blir ikke med.
 * - Overskrifter blir tekstlinjer uten beløp, så ordren er delt opp som
 *   tilbudet.
 * - Adm.påslaget blir en egen linje til slutt, så summen på ordren blir den
 *   samme som tilbudssummen.
 *
 * Prisen sendes per enhet og rabatten for seg, slik Tripletex selv regner,
 * i stedet for et ferdig nettobeløp — da ser ordren ut som tilbudet.
 */
export function ordrelinjer(
  linjer: Tilbudslinje[],
  adminPct: number | null | undefined,
  vatTypeId: number,
): Ordrelinje[] {
  const med = [...(linjer ?? [])]
    .filter((l) => l.included !== false)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));

  const ut: Ordrelinje[] = med.map((l, i) => ({
    description: linjetekst(l),
    count: l.is_heading ? 0 : Number(l.quantity ?? 0),
    unitPriceExcludingVatCurrency: l.is_heading ? 0 : kroner(Number(l.unit_price ?? 0)),
    discount: l.is_heading ? 0 : Number(l.discount_pct ?? 0),
    vatType: { id: vatTypeId },
    sortIndex: i + 1,
  }));

  const pct = Number(adminPct ?? 0);
  if (pct > 0) {
    ut.push({
      description: `Adm.påslag ${String(pct).replace(".", ",")} %`,
      count: 1,
      unitPriceExcludingVatCurrency: kroner(linjegrunnlag(med) * (pct / 100)),
      discount: 0,
      vatType: { id: vatTypeId },
      sortIndex: ut.length + 1,
    });
  }
  return ut;
}

/** Hva ordren blir på, eks. mva, regnet slik Tripletex regner linjene. */
export function ordresum(linjer: Ordrelinje[]): number {
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
