// Tester for oversettelsen mellom appen og Tripletex. Kjøres av `bun run test`.
//
// Det viktigste her er at delordrene til sammen blir nøyaktig tilbudssummen —
// uten at noe tas med to ganger — og at hentingen av kunder ikke slår sammen
// to firmaer som bare heter det samme.

import {
  delordre,
  andelerPasser,
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
const [overskrift, grav1, rigg1, adm1] = forste.linjer;
sjekk(
  "første: overskriften står over postene sine",
  [overskrift.description, overskrift.count, overskrift.unitPriceExcludingVatCurrency],
  ["Grunnarbeid", 0, 0],
);
sjekk("første: bare navnet, ingen prosent", grav1.description, "Graving");
sjekk(
  "første: mengden for andelen, pris og rabatt i egne felt",
  [grav1.count, grav1.unitPriceExcludingVatCurrency, grav1.discount],
  [4.8, 450, 10],
);
sjekk("første: NS-kode først, ingen kommentar", rigg1.description, "AB1 Rigg");
sjekk(
  "første: 1 stk hel post er 1 stk til full pris",
  [rigg1.count, rigg1.unitPriceExcludingVatCurrency, rigg1.discount],
  [1, 5000, 0],
);
sjekk("første: adm.påslag av det som er med", adm1, {
  description: "Adm.påslag 8 %",
  count: 1,
  unitPriceExcludingVatCurrency: 555.52,
  discount: 0,
  vatType: { id: 42 },
  sortIndex: 4,
});
sjekk("første: opsjon som ikke er med, er borte", forste.linjer.length, 4);
// 4,8 × 450 × 0,9 = 1 944; + 5 000; + 8 % = 7 499,52
sjekk("første: summen", forste.sum, 7499.52);
sjekk("første: andeler lagres for alle poster", forste.andeler, { grav: 40, rigg: 100 });

const andre = delordre(linjer, forste.andeler, { grav: 100, rigg: 100 }, 8, 42);
sjekk(
  "andre: bare økningen på graving, rigg står stille",
  andre.linjer.map((l) => [l.description, l.count]),
  [
    ["Grunnarbeid", 0],
    ["Graving", 7.2],
    ["Adm.påslag 8 %", 1],
  ],
);
sjekk(
  "overskrift uten poster med denne gangen, blir ikke med",
  delordre(
    [
      { id: "h1", sort_order: 1, description: "Del 1", is_heading: true },
      { id: "a", sort_order: 2, description: "A", quantity: 1, unit_price: 100 },
      { id: "h2", sort_order: 3, description: "Del 2", is_heading: true },
      { id: "b", sort_order: 4, description: "B", quantity: 1, unit_price: 100 },
    ],
    { a: 100 },
    { b: 50 },
    0,
    1,
  ).linjer.map((l) => l.description),
  ["Del 2", "B"],
);
{
  // «veg 1», 1 stk à 10 000, 40 % gjort: 1 stk à 4 000 — ikke 0,4 stk.
  const veg = [
    {
      id: "v",
      sort_order: 1,
      description: "veg 1",
      unit: "Stk",
      quantity: 1,
      unit_price: 10000,
      discount_pct: 10,
    },
  ];
  const d1 = delordre(veg, {}, { v: 40 }, 0, 1).linjer[0];
  sjekk(
    "1 stk delvis: 1 stk med delbeløpet, rabatten trukket fra",
    [d1.count, d1.unitPriceExcludingVatCurrency, d1.discount],
    [1, 3600, 0],
  );
  const d2 = delordre(veg, { v: 40 }, { v: 100 }, 0, 1);
  sjekk(
    "1 stk resten: 1 stk med resten",
    [d2.linjer[0].count, d2.linjer[0].unitPriceExcludingVatCurrency],
    [1, 5400],
  );
  sjekk("1 stk til sammen: hele posten", 3600 + d2.sum, 9000);
}
sjekk(
  "mengde med mange desimaler rundes til fire",
  delordre(
    [{ id: "x", sort_order: 1, description: "X", quantity: 7, unit_price: 99 }],
    {},
    { x: 33.33 },
    0,
    1,
  ).linjer[0].count,
  2.3331,
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
sjekk("uten påslag ingen påslagslinje", delordre(linjer, {}, { grav: 50 }, 0, 1).linjer.length, 2);
sjekk(
  "påslag med desimal skrives med komma",
  delordre(linjer, {}, { grav: 12.5 }, 7.5, 1).linjer.map((l) => l.description),
  ["Grunnarbeid", "Graving", "Adm.påslag 7,5 %"],
);
sjekk(
  "mengde inn som andel: 29,9 av 130 m³ blir 29,9 tilbake",
  delordre(
    [{ id: "a", sort_order: 1, description: "asfalt", unit: "m³", quantity: 130, unit_price: 300 }],
    {},
    { a: (29.9 / 130) * 100 },
    0,
    1,
  ).linjer[0].count,
  29.9,
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

// ─── Fullført post ──────────────────────────────────────────────────────────

const fullfort = new Set(["grav"]);
const medFullfort = delordre(linjer, { grav: 95, rigg: 50 }, { rigg: 100 }, 0, 1, fullfort);
sjekk(
  "fullført post blir ikke med på ordren",
  medFullfort.linjer.map((l) => l.description),
  ["Grunnarbeid", "AB1 Rigg"],
);
sjekk("fullført post beholder andelen den hadde", medFullfort.andeler.grav, 95);
kaster(
  "fullført post kan ikke faktureres mer",
  () => delordre(linjer, { grav: 95 }, { grav: 100 }, 0, 1, fullfort),
  "merket som fullført",
);
kaster(
  "bare fullførte poster igjen: ingenting å lage",
  () => delordre(linjer, { grav: 95, rigg: 100 }, {}, 0, 1, fullfort),
  "Ingen poster",
);

// ─── Vakt mot dobbel fakturering ────────────────────────────────────────────

sjekk("ingen tidligere delordre: passer", andelerPasser([], ["a"]), true);
sjekk(
  "samme linje-id-er: passer",
  andelerPasser([{ andeler: { grav: 40 } }], ["grav", "rigg"]),
  true,
);
sjekk(
  "noen linjer fjernet: passer",
  andelerPasser([{ andeler: { grav: 40, borte: 100 } }], ["grav"]),
  true,
);
sjekk(
  "alle linjene har ny id: stopper",
  andelerPasser([{ andeler: { gammel1: 40, gammel2: 100 } }], ["ny1", "ny2"]),
  false,
);
sjekk(
  "bare kreditert før: passer",
  andelerPasser([{ andeler: { gammel: 40 }, tripletex_status: "kreditert" }], ["ny"]),
  true,
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
