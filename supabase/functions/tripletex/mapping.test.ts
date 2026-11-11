// Tester for oversettelsen mellom appen og Tripletex. Kjøres av `bun run test`.
//
// Det viktigste her er at delordrene til sammen blir nøyaktig tilbudssummen —
// uten at noe tas med to ganger — og at hentingen av kunder ikke slår sammen
// to firmaer som bare heter det samme.

import {
  delordre,
  gjeldendeAndeler,
  fakturastatus,
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
function kaster(navn: string, fn: () => unknown, inneholder: string) {
  try {
    fn();
    sjekk(navn, "kastet ikke", `kaster «${inneholder}»`);
  } catch (e) {
    sjekk(navn, String((e as Error).message).includes(inneholder), true);
  }
}

// ─── Delordre ───────────────────────────────────────────────────────────────

const linjer: Array<Tilbudslinje & { id: string }> = [
  {
    id: "grav",
    sort_order: 2,
    description: "Graving",
    unit: "m³",
    quantity: 12,
    unit_price: 450,
    discount_pct: 10,
  },
  {
    id: "over",
    sort_order: 1,
    description: "Grunnarbeid",
    is_heading: true,
    quantity: 0,
    unit_price: 0,
  },
  {
    id: "asf",
    sort_order: 3,
    description: "Opsjon: asfalt",
    unit: "m²",
    quantity: 40,
    unit_price: 300,
    included: false,
  },
  {
    id: "rigg",
    sort_order: 4,
    description: "Rigg",
    unit: "RS",
    quantity: 1,
    unit_price: 5000,
    comment: "Inkl. brakke",
    ns_code: "AB1",
  },
];
// Graving: 12 × 450 × 0,9 = 4 860. Rigg: 5 000. Sum 9 860, + 8 % = 10 648,80.

const forste = delordre(linjer, {}, { grav: 40, rigg: 100 }, 8, 42);
sjekk("første: graving 40 %", forste.linjer[0].unitPriceExcludingVatCurrency, 1944);
sjekk(
  "første: tekst med mengde, pris, rabatt og andel",
  forste.linjer[0].description,
  "Graving (12 m³ à 450,00, 10 % rabatt) – utført 40 %",
);
sjekk(
  "første: NS-kode først, kommentar på egen linje",
  forste.linjer[1].description,
  "AB1 Rigg (1 RS à 5 000,00) – utført 100 %\nInkl. brakke",
);
sjekk(
  "første: antall 1, ingen rabatt på linjen",
  [forste.linjer[0].count, forste.linjer[0].discount],
  [1, 0],
);
sjekk("første: adm.påslag av det som er med", forste.linjer[2], {
  description: "Adm.påslag 8 %",
  count: 1,
  unitPriceExcludingVatCurrency: 555.52,
  discount: 0,
  vatType: { id: 42 },
  sortIndex: 3,
});
sjekk("første: overskrift og opsjon ikke med", forste.linjer.length, 3);
sjekk("første: andeler lagres for alle poster", forste.andeler, { grav: 40, rigg: 100 });

const andre = delordre(linjer, forste.andeler, { grav: 100, rigg: 100 }, 8, 42);
sjekk("andre: bare økningen på graving", andre.linjer[0].unitPriceExcludingVatCurrency, 2916);
sjekk("andre: rigg som står stille er ikke med", andre.linjer.length, 2);
sjekk(
  "andre: teksten sier hvor langt den var",
  andre.linjer[0].description.endsWith("utført 100 % (før 40 %)"),
  true,
);
sjekk(
  "til sammen er delordrene tilbudssummen",
  Math.round((forste.sum + andre.sum) * 100) / 100,
  10648.8,
);

sjekk(
  "post uten ny andel beholder den gamle",
  delordre(linjer, { grav: 40, rigg: 50 }, { rigg: 60 }, 0, 1).andeler,
  { grav: 40, rigg: 60 },
);
sjekk("uten påslag ingen påslagslinje", delordre(linjer, {}, { grav: 50 }, 0, 1).linjer.length, 1);
sjekk(
  "desimalprosent med komma",
  delordre(linjer, {}, { grav: 12.5 }, 7.5, 1).linjer.map(
    (l) => l.description.split(" – ")[1] ?? l.description,
  ),
  ["utført 12,5 %", "Adm.påslag 7,5 %"],
);

kaster(
  "lavere enn sist avvises",
  () => delordre(linjer, { grav: 60 }, { grav: 40 }, 0, 1),
  "kan ikke settes lavere",
);
kaster("over 100 % avvises", () => delordre(linjer, {}, { grav: 120 }, 0, 1), "mellom 0 og 100");
kaster(
  "ingenting nytt avvises",
  () => delordre(linjer, { grav: 40 }, { grav: 40 }, 0, 1),
  "Ingen poster",
);

sjekk(
  "gjeldende andeler: høyeste per post, kreditert teller ikke",
  gjeldendeAndeler([
    { andeler: { grav: 40, rigg: 100 }, tripletex_status: "betalt" },
    { andeler: { grav: 70, rigg: 100 }, tripletex_status: "kreditert" },
    { andeler: { grav: 60 }, tripletex_status: "ordre" },
    { andeler: null, tripletex_status: null },
  ]),
  { grav: 60, rigg: 100 },
);

// ─── Status fra Tripletex ───────────────────────────────────────────────────

sjekk("ingen faktura: ordre", fakturastatus(null), "ordre");
sjekk(
  "faktura med alt utestående: fakturert",
  fakturastatus({ id: 1, amount: 1250, amountOutstanding: 1250 }),
  "fakturert",
);
sjekk(
  "noe betalt: delvis",
  fakturastatus({ id: 1, amount: 1250, amountOutstanding: 250 }),
  "delvis_betalt",
);
sjekk(
  "øresavrunding igjen: betalt",
  fakturastatus({ id: 1, amount: 1250, amountOutstanding: 0.2 }),
  "betalt",
);
sjekk(
  "kreditert vinner over betalt",
  fakturastatus({ id: 1, amount: 1250, amountOutstanding: 0, isCredited: true }),
  "kreditert",
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
  [finn(12)?.type, (finn(12) as { id?: string } | undefined)?.id],
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
