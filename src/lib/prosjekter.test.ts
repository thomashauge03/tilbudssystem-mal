// Tester for prosjektlåsen og sorteringen i valglistene. Kjøres av `npm test`.
//
// Låsen skal bare slå inn for Hauge Maskin: de andre tenantene har ingen
// SmartDok-synk og ville ellers mistet muligheten til å lage prosjekter.

import { prosjekterFraSmartDok, sorterProsjekter } from "./prosjekter.ts";

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

console.log("\n--- Hvem som får prosjektene fra SmartDok ---");

sjekk("Hauge Maskin", prosjekterFraSmartDok("95ee2a3d-6bd3-4a94-ab44-c000c49beae5"), true);
sjekk("en annen tenant", prosjekterFraSmartDok("00000000-0000-0000-0000-000000000000"), false);
sjekk("ingen tenant", prosjekterFraSmartDok(null), false);

console.log("\n--- Sortering ---");

const p = (project_number: string | null, name: string) => ({ project_number, name });
const sortert = sorterProsjekter([
  p(null, "Uten nummer B"),
  p("999", "Gammelt"),
  p("1000", "Nyere"),
  p(null, "Uten nummer A"),
  p("2011600", "Nyest"),
  p("", "Tomt nummer"),
]);
sjekk(
  "nyeste nummer først, tallrekkefølge, uten nummer sist etter navn",
  sortert.map((x) => x.name),
  ["Nyest", "Nyere", "Gammelt", "Tomt nummer", "Uten nummer A", "Uten nummer B"],
);

const inn = [p("1", "a"), p("2", "b")];
sorterProsjekter(inn);
sjekk(
  "endrer ikke lista den får",
  inn.map((x) => x.name),
  ["a", "b"],
);

console.log(`\n${ok} i orden, ${feil} feil`);
process.exit(feil ? 1 : 0);
