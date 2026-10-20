/**
 * Grunnene et krav om endring kan ha. Hver er en egen boolsk kolonne på
 * amendments, og en melding kan ha flere samtidig. Skjemaet, merkene i
 * oversikten og PDF-en leser alle fra denne lista, så en ny grunn trenger
 * bare kolonnen i basen og en linje her.
 */
export const ENDRINGSTYPER = [
  { k: "is_mass_settlement", l: "Masseavregning", kort: "Masse" },
  { k: "is_additional_work", l: "Tilleggsarbeid", kort: "Tillegg" },
  { k: "is_price_increase", l: "Prisstigning", kort: "Pris↑" },
  { k: "is_ground_conditions", l: "Uforutsette grunnforhold", kort: "Grunn" },
  { k: "is_document_error", l: "Feil i underlag", kort: "Underlag" },
  { k: "is_waiting_time", l: "Ventetid og stans", kort: "Ventetid" },
  { k: "is_authority_order", l: "Pålegg fra myndigheter", kort: "Myndighet" },
  { k: "is_acceleration", l: "Forsering", kort: "Forsering" },
  { k: "is_schedule_change", l: "Endret framdrift", kort: "Framdrift" },
] as const;

export type Endringstype = typeof ENDRINGSTYPER[number]["k"];
export type Endringstyper = Record<Endringstype, boolean>;

/** Alle grunnene avhuket bort — utgangspunktet for et nytt krav. */
export const ingenEndringstyper = (): Endringstyper =>
  Object.fromEntries(ENDRINGSTYPER.map((t) => [t.k, false])) as Endringstyper;

/** Plukker grunnene ut av en rad. Mangler kolonnen, regnes den som ikke avhuket. */
export const endringstyperFra = (rad: Partial<Record<Endringstype, boolean | null>>): Endringstyper =>
  Object.fromEntries(ENDRINGSTYPER.map((t) => [t.k, !!rad[t.k]])) as Endringstyper;
