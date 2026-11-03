// Tester for oversettelsen mellom appen og Tripletex. Kjøres av `bun run test`.
//
// Det viktigste her er at ordren i Tripletex blir på nøyaktig det samme
// beløpet som tilbudet kunden signerte, og at hentingen av kunder ikke slår
// sammen to firmaer som bare heter det samme.

import {
  linjegrunnlag,
  linjetekst,
  ordrelinjer,
  ordresum,
  mvaNummer,
  kundefelt,
  planleggKunder,
  tilTripletexKunde,
  type Tilbudslinje,
  type AppKunde,
} from "./mapping.ts";

let feil = 0;
let ok = 0;
function sjekk(navn: string, faktisk: unknown, forventet: unknown) {
  const a = JSON.stringify(faktisk);
  const b = JSON.stringify(forventet);
  if (a === b) ok++;
  else {
    feil++;
    console.log(`  FEIL  ${navn}\n        fikk:      ${a}\n        forventet: ${b}`);
  }
}

// ─── Ordrelinjer ────────────────────────────────────────────────────────────

const linjer: Tilbudslinje[] = [
  {
    sort_order: 2,
    description: "Graving",
    unit: "m³",
    quantity: 12,
    unit_price: 450,
    discount_pct: 10,
  },
  { sort_order: 1, description: "Grunnarbeid", is_heading: true, quantity: 0, unit_price: 0 },
  {
    sort_order: 3,
    description: "Opsjon: asfalt",
    unit: "m²",
    quantity: 40,
    unit_price: 300,
    included: false,
  },
  {
    sort_order: 4,
    description: "Rigg",
    unit: "RS",
    quantity: 1,
    unit_price: 5000,
    comment: "Inkl. brakke",
    ns_code: "AB1",
  },
];

const ut = ordrelinjer(linjer, 8, 42);

sjekk("overskrift først, i sort_order", ut[0].description, "Grunnarbeid");
sjekk("overskrift uten beløp", [ut[0].count, ut[0].unitPriceExcludingVatCurrency], [0, 0]);
sjekk(
  "linje som ikke er tatt med, er borte",
  ut.some((l) => l.description.includes("asfalt")),
  false,
);
sjekk("enhet står i teksten", ut[1].description, "Graving (m³)");
sjekk(
  "rabatt følger med for seg",
  [ut[1].count, ut[1].unitPriceExcludingVatCurrency, ut[1].discount],
  [12, 450, 10],
);
sjekk("NS-kode først, kommentar på egen linje", ut[2].description, "AB1 Rigg (RS)\nInkl. brakke");
sjekk(
  "mva-koden på alle linjer",
  ut.every((l) => l.vatType.id === 42),
  true,
);
sjekk("adm.påslag som siste linje", ut[3].description, "Adm.påslag 8 %");
// 12 × 450 × 0,9 = 4 860, + 5 000 = 9 860; 8 % = 788,80
sjekk("adm.påslag regnet av inkluderte linjer", ut[3].unitPriceExcludingVatCurrency, 788.8);
sjekk("grunnlaget er det samme som i appen", linjegrunnlag(linjer), 9860);
sjekk("ordresummen er tilbudssummen", ordresum(ut), 10648.8);
sjekk(
  "sortIndex fortløpende",
  ut.map((l) => l.sortIndex),
  [1, 2, 3, 4],
);

sjekk("uten påslag ingen påslagslinje", ordrelinjer(linjer, 0, 1).length, 3);
sjekk(
  "påslag med desimal skrives med komma",
  ordrelinjer(linjer, 7.5, 1)[3].description,
  "Adm.påslag 7,5 %",
);
sjekk(
  "overskrift får ikke enhet",
  linjetekst({ description: "Del 2", unit: "stk", is_heading: true }),
  "Del 2",
);

sjekk("mva 25 % er kode 3", mvaNummer(25), "3");
sjekk("ukjent sats gir null", mvaNummer(17), null);

// ─── Kunder fra Tripletex ───────────────────────────────────────────────────

sjekk(
  "kundefelt: mobil foran fast, e-post foran fakturaepost, postadresse",
  kundefelt({
    id: 1,
    name: " Veidekke AS ",
    organizationNumber: "917 096 333",
    email: "",
    invoiceEmail: "faktura@veidekke.no",
    phoneNumber: "22000000",
    phoneNumberMobile: "99999999",
    postalAddress: { addressLine1: "Postboks 6", postalCode: "0213", city: "Oslo" },
  }),
  {
    name: "Veidekke AS",
    org_number: "917 096 333",
    email: "faktura@veidekke.no",
    phone: "99999999",
    address: "Postboks 6, 0213 Oslo",
  },
);

const iAppen: AppKunde[] = [
  { id: "a", name: "Koblet AS", tripletex_id: 10, email: "gammel@koblet.no" },
  { id: "b", name: "Orgnr AS", org_number: "987654321" },
  { id: "c", name: "Navnesen Bygg" },
  { id: "d", name: "Dobbel AS" },
  { id: "e", name: "Dobbel AS" },
  { id: "f", name: "Annet Firma AS", org_number: "111111111" },
  { id: "g", name: "Bare i appen" },
];

const plan = planleggKunder(
  [
    { id: 10, name: "Koblet AS", email: "ny@koblet.no" },
    { id: 11, name: "Orgnr AS (nytt navn)", organizationNumber: "987 654 321" },
    { id: 12, name: "navnesen  bygg" },
    { id: 13, name: "Dobbel AS" },
    { id: 14, name: "Annet Firma AS", organizationNumber: "222222222" },
    { id: 15, name: "Helt Ny AS", phoneNumber: "12345678" },
    { id: 16, name: "" },
  ],
  iAppen,
);

const finn = (tid: number) => plan.find((v) => v.tripletexId === tid);

sjekk("samme id: oppdateres, kobles ikke på nytt", finn(10), {
  type: "oppdater",
  tripletexId: 10,
  id: "a",
  felt: { email: "ny@koblet.no" },
  kobles: false,
});
sjekk("samme org.nr. med mellomrom: kobles og får nytt navn", finn(11), {
  type: "oppdater",
  tripletexId: 11,
  id: "b",
  felt: { name: "Orgnr AS (nytt navn)", org_number: "987 654 321" },
  kobles: true,
});
sjekk(
  "samme navn, store/små og doble mellomrom: kobles",
  [finn(12)?.type, (finn(12) as any)?.id],
  ["oppdater", "c"],
);
sjekk("to i appen med samme navn: ny kunde, ikke gjetning", finn(13)?.type, "ny");
sjekk("samme navn men ulikt org.nr.: annet firma", finn(14)?.type, "ny");
sjekk("ukjent kunde blir ny", finn(15), {
  type: "ny",
  tripletexId: 15,
  felt: { name: "Helt Ny AS", org_number: null, email: null, phone: "12345678", address: null },
});
sjekk("kunde uten navn hoppes over", finn(16), undefined);
sjekk(
  "kunde som bare er i appen røres ikke",
  plan.some((v) => v.type === "oppdater" && v.id === "g"),
  false,
);

sjekk(
  "uendret koblet kunde gir ingen oppdatering",
  planleggKunder([{ id: 10, name: "Koblet AS", email: "gammel@koblet.no" }], iAppen),
  [],
);
sjekk(
  "tomt felt i Tripletex visker ikke ut appen",
  planleggKunder([{ id: 10, name: "Koblet AS", email: "" }], iAppen),
  [],
);

sjekk(
  "ny kunde til Tripletex: org.nr. bare sifre, adresse i første linje",
  tilTripletexKunde({
    id: "x",
    name: " Ny AS ",
    org_number: "987 654 321",
    email: "post@ny.no",
    phone: "",
    address: "Veien 1, 1234 Sted",
  }),
  {
    name: "Ny AS",
    organizationNumber: "987654321",
    email: "post@ny.no",
    invoiceEmail: "post@ny.no",
    postalAddress: { addressLine1: "Veien 1, 1234 Sted" },
  },
);

console.log(`\n${ok} i orden, ${feil} feil`);
process.exit(feil ? 1 : 0);
