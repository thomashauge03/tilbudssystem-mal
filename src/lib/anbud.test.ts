// Tester for anbudstolkeren. Kjøres med `npm test` — ingen testrammeverk, bare
// Node som stripper typene selv.
//
// Bakgrunn: tolkeren leste datolinjer og organisasjonsnummer som bud. Et falskt
// bud på 2 026 kroner ble laveste pris, og da så et anbud vi vant ut som tapt.
// Samtidig ble beløp med øre eller «eks mva» ikke lest i det hele tatt, og et
// bud tolkeren ikke forstod forsvant inn i tittelen uten noe varsel. Alle tre er
// dekket her. Legger du til et nytt format, legg til en test for det samtidig.

import {
  parseAnbudsprotokoll,
  finnEgetBud,
  splittProtokoller,
  splittProtokollerDetaljert,
} from "./anbud.ts";

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
const navn = (t: string) => parseAnbudsprotokoll(t).bids.map((b) => `${b.company}=${b.amount}`);

console.log("\n--- 1. Ekte protokoller skal fortsatt tolkes likt ---");

const p1 = parseAnbudsprotokoll(`Anbudsprotokoll VA Skardhei, Bortelid
Hauge Maskin as 9.147.480,-
TT Anlegg 9.436.464,-
Kvina Maskin 15.388.500,-`);
sjekk("p1 tittel", p1.title, "VA Skardhei, Bortelid");
sjekk("p1 bud", p1.bids.length, 3);
sjekk("p1 laveste", p1.bids[0], { company: "Hauge Maskin as", amount: 9147480 });
sjekk("p1 ingen ignorerte", p1.ignored, []);

const p2 = parseAnbudsprotokoll(`Anbudsprotokoll VVA Byremo :
Vasland Maskin 3.827.254
Br. Thorkildsen 4.532.354
Aas & Høiland 4.954.541`);
sjekk("p2 tittel", p2.title, "VVA Byremo");
sjekk("p2 bud", p2.bids.length, 3);
sjekk("p2 laveste", p2.bids[0].company, "Vasland Maskin");

const p3 = parseAnbudsprotokoll(`Anbudsåpning Pengeveien
Farsund Kommune
Firma A 796 150
Firma B 1.052.177
Nomeland Anlegg - Leverte ikke i tide`);
sjekk("p3 tittel over to linjer", p3.title, "Pengeveien Farsund Kommune");
sjekk("p3 bud", p3.bids.length, 2);
sjekk("p3 mellomrom som tusenskille", p3.bids[0].amount, 796150);
sjekk("p3 uten pris", p3.disqualified, [
  { company: "Nomeland Anlegg", note: "Leverte ikke i tide" },
]);

// Bindestrek finnes både som skilletegn og inne i firmanavnet
const utePris = (l: string) => parseAnbudsprotokoll(`Anbudsprotokoll T\nA AS 1.000.000\n${l}`).disqualified[0];
sjekk("bindestrek i firmanavn", utePris("Nord-Odal Maskin - Avvist"), {
  company: "Nord-Odal Maskin",
  note: "Avvist",
});
sjekk("bindestrek uten mellomrom", utePris("B.S.Graveservice AS-Avvist"), {
  company: "B.S.Graveservice AS",
  note: "Avvist",
});
sjekk("grunn med flere ord", utePris("Nomeland Anlegg - Leverte ikke i tide"), {
  company: "Nomeland Anlegg",
  note: "Leverte ikke i tide",
});

console.log("\n--- 2. Datoer, telefon og org.nr skal IKKE bli bud ---");

for (const linje of [
  "04.03.2026",
  "12.02.2026 09:14",
  "tirsdag 17. feb. • 16:56",
  "Tlf 38 123 456",
  "+47 900 12 345",
  "Org.nr 912 345 678",
  "Mvh Hauge Maskin AS, org.nr 912 345 678",
]) {
  const r = parseAnbudsprotokoll(`Anbudsprotokoll Test\nFirma A 1.000.000\n${linje}`);
  sjekk(`«${linje}» gir ingen bud nr. 2`, r.bids.length, 1);
}

// Årstall skal ikke bli et bud, men det skal heller ikke forsvinne i stillhet
const aar = parseAnbudsprotokoll(`Anbudsprotokoll Test
Firma A 1.000.000
Kontrakt signeres uke 12 2026`);
sjekk("årstall blir ikke bud", aar.bids.length, 1);
sjekk("årstall varsles", aar.ignored, ["Kontrakt signeres uke 12 2026"]);

console.log("\n--- 3. Beløp med øre, komma og halelapp skal leses ---");

sjekk("øre etter komma", navn("Anbudsprotokoll T\nA AS kr 1.250.000,00\nB AS kr 1.400.000,50"), [
  "A AS=1250000",
  "B AS=1400000.5",
]);
sjekk("komma som tusenskille", navn("Anbudsprotokoll T\nA AS 1,250,000\nB AS 1,400,000"), [
  "A AS=1250000",
  "B AS=1400000",
]);
sjekk("eks mva", navn("Anbudsprotokoll T\nA AS 1.000.000 eks mva\nB AS 2.000.000 inkl. mva"), [
  "A AS=1000000",
  "B AS=2000000",
]);
sjekk("parentes", navn("Anbudsprotokoll T\nA AS 3.827.254 (inkl. mva)"), ["A AS=3827254"]);
sjekk("rent tall", navn("Anbudsprotokoll T\nA AS 950000"), ["A AS=950000"]);
sjekk("kr bak", navn("Anbudsprotokoll T\nA AS 1.250.000 kr"), ["A AS=1250000"]);

console.log("\n--- 4. Et bud tolkeren ikke forstår skal varsles, ikke sluses inn i tittelen ---");

const t = parseAnbudsprotokoll(`Anbudsprotokoll VVA Byremo :
Vasland Maskin 3.827.254,,50xx
Br. Thorkildsen 4.532.354
Aas & Høiland 4.954.541`);
sjekk("tittel er ren", t.title, "VVA Byremo");
sjekk("den uforståtte linjen varsles", t.ignored, ["Vasland Maskin 3.827.254,,50xx"]);

console.log("\n--- 5. finnEgetBud skal ikke ta feil firma ---");

const bud = [
  { company: "Haugen Maskin AS", amount: 100 },
  { company: "Hauge Maskin as", amount: 200 },
];
sjekk("eksakt treff vinner", finnEgetBud(bud, "Hauge Maskin AS")?.amount, 200);
sjekk("Haugen treffer ikke Hauge", finnEgetBud([bud[0]], "Hauge Maskin AS"), undefined);
sjekk("ordgrense-prefiks", finnEgetBud([{ company: "Hauge Maskin Anlegg AS", amount: 5 }], "Hauge Maskin")?.amount, 5);
sjekk("tvetydig gir ingenting", finnEgetBud(
  [{ company: "Hauge Maskin Anlegg", amount: 1 }, { company: "Hauge Maskin Transport", amount: 2 }],
  "Hauge Maskin",
), undefined);
sjekk("forkorting HM", finnEgetBud([{ company: "HM", amount: 9 }], "Hauge Maskin AS")?.amount, 9);
sjekk("tomt firmanavn", finnEgetBud(bud, ""), undefined);

console.log("\n--- 6. Masseimport: datolinje mellom to protokoller ---");

const traad = `Anbudsprotokoll Jobb A
Firma A 1.000.000
Firma B 2.000.000
04.03.2026
Anbudsprotokoll Jobb B
Firma C 3.000.000
Firma D 4.000.000`;
const deler = splittProtokoller(traad);
sjekk("to protokoller", deler.length, 2);
const d1 = parseAnbudsprotokoll(deler[0]);
sjekk("A har to bud", d1.bids.length, 2);
sjekk("A laveste er ekte", d1.bids[0].amount, 1000000);
sjekk("A har ingen 04.03", d1.bids.some((b) => b.company.includes("04")), false);

const detaljert = splittProtokollerDetaljert(traad + "\nAnbudsprotokoll Rest\nbare tull");
sjekk("detaljert ser resten", detaljert.length, 3);
sjekk("resten er ikke brukbar", detaljert[2].brukbar, false);

console.log(`\n${ok} i orden, ${feil} feil`);
process.exit(feil ? 1 : 0);
