// Tester for telefonnormaliseringen. Kjøres av `npm test`.
//
// Den viktigste saken her er 47-fella: norske mobilnummer kan selv starte med
// 47, så landskoden kan ikke skrelles av på siffer alene.

import { normaliserTelefon, formaterTelefon, telefonSiffer, telefonAdvarsel } from "./telefon.ts";

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

console.log("\n--- Samme nummer, skrevet på alle måtene ---");

// Alle disse er 912 34 567 og skal ende likt
for (const inn of [
  "91234567",
  "912 34 567",
  "912-34-567",
  "91 23 45 67",
  "  91234567  ",
  "+4791234567",
  "+47 912 34 567",
  "+47 91 23 45 67",
  "004791234567",
  "0047 912 34 567",
  "47 912 34 567",
  "(+47) 912 34 567",
  "tlf. 912 34 567",
]) {
  sjekk(`«${inn}»`, telefonSiffer(inn), "91234567");
}

console.log("\n--- Gruppering ---");

sjekk("mobil 9 grupperes 3-2-3", formaterTelefon("91234567"), "912 34 567");
sjekk("mobil 4 grupperes 3-2-3", formaterTelefon("47123456"), "471 23 456");
sjekk("fasttelefon grupperes 2-2-2-2", formaterTelefon("22123456"), "22 12 34 56");
sjekk("visning følger med", normaliserTelefon("+4722123456").visning, "22 12 34 56");

console.log("\n--- 47-fella ---");

// Åtte siffer som starter på 47 er et ekte norsk mobilnummer, ikke landskode
sjekk("47123456 beholder alle åtte", telefonSiffer("47123456"), "47123456");
sjekk("47123456 er norsk", normaliserTelefon("47123456").norsk, true);
sjekk("«47 12 34 56» beholder åtte", telefonSiffer("47 12 34 56"), "47123456");
// Ti siffer som starter på 47 ER landskode
sjekk("4747123456 skreller kode", telefonSiffer("4747123456"), "47123456");
sjekk("+4747123456 skreller kode", telefonSiffer("+4747123456"), "47123456");
sjekk("landskode registreres", normaliserTelefon("+4791234567").landskode, "47");
sjekk("uten kode er landskode tom", normaliserTelefon("91234567").landskode, "");

console.log("\n--- Utenlandske nummer skal ikke tvinges til åtte siffer ---");

sjekk("svensk beholdes", normaliserTelefon("+46 70 123 45 67").siffer, "46701234567");
sjekk("svensk er ikke norsk", normaliserTelefon("+46 70 123 45 67").norsk, false);
sjekk("svensk vises med pluss", normaliserTelefon("+46 70 123 45 67").visning, "+46701234567");
sjekk("dansk beholdes", normaliserTelefon("+45 12 34 56 78").siffer, "4512345678");

console.log("\n--- Typo og tomt ---");

sjekk("tomt felt", normaliserTelefon("").tomt, true);
sjekk("bare mellomrom", normaliserTelefon("   ").tomt, true);
sjekk("null", normaliserTelefon(null).tomt, true);
sjekk("tomt gir ingen advarsel", telefonAdvarsel(""), null);
sjekk("riktig nummer gir ingen advarsel", telefonAdvarsel("912 34 567"), null);
sjekk("for få siffer", telefonAdvarsel("912 34 56"), "Bare 7 siffer — norske nummer har 8");
sjekk("for mange siffer", telefonAdvarsel("912 34 5678"), "9 siffer — sjekk at det stemmer");
sjekk("ingen siffer", telefonAdvarsel("ring meg"), "Fant ingen siffer her");

console.log("\n--- Normalisering skal tåle å kjøres to ganger ---");

// Feltet lagrer den grupperte visningen, så den må normalisere til seg selv
for (const inn of ["+47 912 34 567", "22123456", "47123456"]) {
  const en = normaliserTelefon(inn).visning;
  const to = normaliserTelefon(en).visning;
  sjekk(`«${inn}» er stabil`, to, en);
}

console.log(`\n${ok} i orden, ${feil} feil`);
process.exit(feil ? 1 : 0);
