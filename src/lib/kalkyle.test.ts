// Tester for kalkylelogikken. Kjøres med `bun run test` — ingen testrammeverk,
// bare Node som stripper typene selv.
//
// Det som teller her: summen i kalkylen skal stemme med det tilbudet viser
// etterpå, og påslaget skal ikke bli regnet to ganger når linjene flyttes over.

import {
  beregnKalkyle,
  grupperKalkyle,
  sokKoder,
  linjeFraKode,
  kalkyleTilTilbudslinjer,
  kalkyleImportNokkel,
  type KalkyleLinje,
  type NsKode,
} from "./kalkyle.ts";

let feil = 0;
let ok = 0;
function sjekk(navn: string, faktisk: unknown, forventet: unknown) {
  const a = JSON.stringify(faktisk);
  const b = JSON.stringify(forventet);
  if (a === b) {
    ok++;
  } else {
    feil++;
    console.log(`  FEIL  ${navn}\n        fikk:      ${a}\n        forventet: ${b}`);
  }
}

const linje = (p: Partial<KalkyleLinje>): KalkyleLinje => ({
  ns_code: null, description: "", unit: "m", quantity: 0, unit_price: 0, ...p,
});
const overskrift = (tekst: string): KalkyleLinje =>
  linje({ description: tekst, unit: "", is_heading: true });

console.log("\n--- 1. Utregning ---");

const enkel = [
  linje({ ns_code: "FD2.13", description: "Grøftegraving", unit: "m³", quantity: 10, unit_price: 250 }),
  linje({ ns_code: "UM1", description: "Rør", unit: "m", quantity: 20, unit_price: 100 }),
];
sjekk("sum uten påslag og mva", beregnKalkyle(enkel, 0, 0), { sum: 4500, paaslag: 0, eksMva: 4500, mva: 0, total: 4500 });
sjekk("påslag 10 % og mva 25 %", beregnKalkyle(enkel, 10, 25), { sum: 4500, paaslag: 450, eksMva: 4950, mva: 1237.5, total: 6187.5 });

// En overskrift som nettopp er gjort om fra en vanlig linje, kan ha prisen i
// minnet. Den skal likevel ikke telle.
const medOverskrift = [{ ...overskrift("GRUNNARBEID"), quantity: 5, unit_price: 99 }, ...enkel];
sjekk("overskrift teller ikke", beregnKalkyle(medOverskrift, 0, 0).sum, 4500);
sjekk("tom kalkyle", beregnKalkyle([], 12, 25), { sum: 0, paaslag: 0, eksMva: 0, mva: 0, total: 0 });

console.log("\n--- 2. Gruppering til PDF ---");

const gruppert = grupperKalkyle([
  linje({ description: "Rigg", quantity: 1, unit_price: 1000 }),
  overskrift("GRUNNARBEID"),
  linje({ description: "Graving", quantity: 2, unit_price: 100 }),
  linje({ description: "Fylling", quantity: 3, unit_price: 100 }),
  overskrift("VA"),
]);
sjekk("antall grupper", gruppert.length, 3);
sjekk("linjer før første overskrift får gruppe uten tittel", gruppert[0].overskrift, null);
sjekk("delsum før overskrift", gruppert[0].sum, 1000);
sjekk("delsum GRUNNARBEID", [gruppert[1].overskrift, gruppert[1].sum, gruppert[1].linjer.length], ["GRUNNARBEID", 500, 2]);
sjekk("tom gruppe til slutt", [gruppert[2].overskrift, gruppert[2].linjer.length], ["VA", 0]);

console.log("\n--- 3. Søk i kodebanken ---");

const kode = (code: string, title: string, active = true): NsKode => ({
  id: code, part: code.replace(/[0-9.].*$/, ""), code, title, unit: "m", unit_price: null,
  edition: "2017–2022", note: null, maa_kontrolleres: false, active,
});
const koder = [
  kode("FD2.2", "Graving, sjakt"),
  kode("FD2.13", "Grøftegraving, volum"),
  kode("FD2.1", "Grøftegraving"),
  kode("KD2.31", "Kantstein av betong"),
  kode("FB1", "Rydding", false),
];
sjekk("kode-prefiks, sortert hierarkisk", sokKoder(koder, "fd2").map((k) => k.code), ["FD2.1", "FD2.13", "FD2.2"]);
sjekk("mellomrom ignoreres i kode", sokKoder(koder, "fd 2.1").map((k) => k.code), ["FD2.1", "FD2.13"]);
sjekk("tekstsøk etter kodetreff", sokKoder(koder, "grøft").map((k) => k.code), ["FD2.1", "FD2.13"]);
sjekk("inaktive vises ikke", sokKoder(koder, "fb").length, 0);
sjekk("tomt søk gir ingenting", sokKoder(koder, "  ").length, 0);
sjekk("maks antall", sokKoder(koder, "fd", 2).length, 2);

console.log("\n--- 4. Ny linje fra kode ---");

sjekk("linje fra kode uten pris", linjeFraKode({ ...kode("FD2.13", "Grøftegraving, volum"), unit: "m³" }),
  { ns_code: "FD2.13", description: "Grøftegraving, volum", unit: "m³", quantity: 0, unit_price: 0 });
sjekk("linje fra kode med pris", linjeFraKode({ ...kode("FD2.13", "Grøft"), unit_price: 245.5 }).unit_price, 245.5);

console.log("\n--- 5. Overføring til tilbud ---");

const overfort = kalkyleTilTilbudslinjer("VA Storgata", [
  overskrift("GRUNNARBEID"),
  linje({ ns_code: "FD2.13", description: "Grøftegraving", unit: "m³", quantity: 10, unit_price: 250 }),
  linje({ ns_code: "", description: "Fritekst", unit: "stk", quantity: 1, unit_price: 500 }),
], 4);
sjekk("antall linjer = 1 overskrift + 3", overfort.length, 4);
sjekk("første er overskrift med kalkylens navn", [overfort[0].is_heading, overfort[0].description, overfort[0].sort_order], [true, "VA Storgata", 4]);
sjekk("sort_order fortsetter etter eksisterende", overfort.map((l) => l.sort_order), [4, 5, 6, 7]);
sjekk("pris uten påslag, ingen rabatt, inkludert", [overfort[2].unit_price, overfort[2].discount_pct, overfort[2].included], [250, 0, true]);
sjekk("kode følger med", overfort[2].ns_code, "FD2.13");
sjekk("tom kode blir null", overfort[3].ns_code, null);
sjekk("overskrift uten tall", [overfort[1].quantity, overfort[1].unit_price, overfort[1].ns_code], [0, 0, null]);
sjekk("kommentar er tom streng", overfort[2].comment, "");

console.log("\n--- 6. Importnøkkel ---");

sjekk("nøkkel for nytt tilbud", kalkyleImportNokkel(), "kalkyle-import-new");
sjekk("nøkkel for eksisterende", kalkyleImportNokkel("abc"), "kalkyle-import-abc");

console.log(`\n${ok} ok, ${feil} feil`);
if (feil) process.exit(1);
