// Tester for én-mot-én-sammenligningen. Kjøres av `npm test`.

import { lagDuell, konkurrentliste, slaaSammenFirma } from "./anbud-duell.ts";

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

const bud = (c: string, a: number, us = false) => ({ company: c, amount: a, is_us: us });

const anbud = [
  {
    title: "Jobb A",
    opened_on: "2026-03-01",
    bids: [bud("Oss", 1000, true), bud("Konkurrent AS", 1200), bud("Tredje", 1500)],
  },
  {
    title: "Jobb B",
    opened_on: "2026-01-01",
    bids: [bud("Oss", 2000, true), bud("Konkurrent AS", 1600)],
  },
  {
    // Vi leverte ikke — skal ikke telle
    title: "Jobb C",
    opened_on: "2026-02-01",
    bids: [bud("Konkurrent AS", 900), bud("Tredje", 950)],
  },
  {
    // Konkurrenten leverte ikke — skal ikke telle
    title: "Jobb D",
    opened_on: "2026-04-01",
    bids: [bud("Oss", 500, true), bud("Tredje", 600)],
  },
];

console.log("\n--- Duell mot én konkurrent ---");

const d = lagDuell(anbud, "Konkurrent AS")!;
sjekk("bare anbud der begge leverte", d.moter, 2);
sjekk("eldste først", d.punkter.map((p) => p.anbud), ["Jobb B", "Jobb A"]);
sjekk("Jobb B: de lå under oss", d.punkter[0].diffPst, -20);
sjekk("Jobb A: de lå over oss", d.punkter[1].diffPst, 20);
sjekk("differanse i kroner", d.punkter.map((p) => p.diffKr), [-400, 200]);
sjekk("vi lavest i én av to", d.viLavest, 1);
sjekk("snitt", d.snittPst, 0);
sjekk("median av to", d.medianPst, 0);
sjekk("spenn", [d.minPst, d.maksPst], [-20, 20]);
sjekk("vant vi anbudet", d.punkter.map((p) => p.viVantAnbudet), [false, true]);

sjekk("ukjent konkurrent", lagDuell(anbud, "Finnes Ikke"), null);
sjekk("tomt navn", lagDuell(anbud, "  "), null);
sjekk("stor/liten bokstav", lagDuell(anbud, "konkurrent as")?.moter, 2);

console.log("\n--- Konkurrentlisten ---");

// Likt antall møter: alfabetisk, så rekkefølgen ikke hopper mellom hver visning
sjekk("bare anbud vi selv var med i", konkurrentliste(anbud), [
  { navn: "Konkurrent AS", moter: 2 },
  { navn: "Tredje", moter: 2 },
]);
sjekk("tom liste", konkurrentliste([]), []);

// Bud på 0 skal ikke gi uendelig prosent
const null0 = lagDuell(
  [{ title: "X", opened_on: null, bids: [bud("Oss", 0, true), bud("K", 100)] }],
  "K",
);
sjekk("0-bud teller ikke", null0, null);

console.log("\n--- Samme firma skrevet på ulike måter ---");

// De ekte skrivemåtene fra protokollene
const g = slaaSammenFirma([
  "Kvina Maskin", "Kvina Maskin AS", "Kvina",
  "Br. Thorkildsen", "Br Thorkildsen AS",
  "Lindland Maskin", "Lindland maskin AS",
  "Risa", "Risa AS",
]);
sjekk("selskapsform og tegnsetting", [g.get("Br. Thorkildsen"), g.get("Br Thorkildsen AS")], [
  "Br Thorkildsen AS",
  "Br Thorkildsen AS",
]);
sjekk("stor/liten bokstav", g.get("Lindland Maskin"), g.get("Lindland maskin AS"));
sjekk("kortform slås inn", g.get("Kvina"), g.get("Kvina Maskin"));
sjekk("AS-variant samme gruppe", g.get("Kvina Maskin AS"), g.get("Kvina Maskin"));
sjekk("Risa", g.get("Risa"), g.get("Risa AS"));

// Er kortformen tvetydig, skal den IKKE gjettes inn i en av dem
const tvil = slaaSammenFirma(["Kvina", "Kvina Maskin", "Kvina Transport"]);
sjekk("tvetydig kortform står alene", tvil.get("Kvina"), "Kvina");
sjekk("de to lange holdes fra hverandre", tvil.get("Kvina Maskin") !== tvil.get("Kvina Transport"), true);

// Grupperingen skal slå gjennom i listen og i grafen
const flereNavn = [
  { title: "A", opened_on: "2026-01-01", bids: [bud("Oss", 100, true), bud("Kvina Maskin", 120)] },
  { title: "B", opened_on: "2026-02-01", bids: [bud("Oss", 100, true), bud("Kvina Maskin AS", 130)] },
  { title: "C", opened_on: "2026-03-01", bids: [bud("Oss", 100, true), bud("Kvina", 140)] },
];
sjekk("tre skrivemåter = én konkurrent", konkurrentliste(flereNavn), [
  { navn: "Kvina Maskin AS", moter: 3 },
]);
sjekk("grafen får alle tre", lagDuell(flereNavn, "Kvina")?.moter, 3);
sjekk("uansett hvilken skrivemåte man velger", lagDuell(flereNavn, "Kvina Maskin AS")?.moter, 3);

console.log(`\n${ok} i orden, ${feil} feil`);
process.exit(feil ? 1 : 0);
