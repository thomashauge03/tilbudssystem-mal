// Tester for tidsaksen i fremdriftsplanen. Kjøres av `npm test`.
//
// Tyngdepunktet ligger på årsskiftet. ISO-uker følger ikke kalenderåret, og en
// plan som går over nyttår er nettopp der ukenumrene betyr mest.

import {
  isoUke, mandagI, parseDato, tilDato, lagTidsakse, plassering,
  ukeTekst, varighetDager, planPeriode,
} from "./fremdrift.ts";

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
const uke = (s: string) => isoUke(parseDato(s)!);

console.log("\n--- ISO-uke, inkludert årsskiftet ---");

sjekk("4. mars 2026", uke("2026-03-04"), { aar: 2026, uke: 10 });
// 1. januar 2027 er en fredag -> hører til siste uke i 2026
sjekk("1. jan 2027 hører til 2026", uke("2027-01-01"), { aar: 2026, uke: 53 });
// 31. desember 2024 er en tirsdag -> hører til uke 1 i 2025
sjekk("31. des 2024 hører til 2025", uke("2024-12-31"), { aar: 2025, uke: 1 });
sjekk("1. jan 2024 er uke 1", uke("2024-01-01"), { aar: 2024, uke: 1 });
// 2020 hadde 53 uker
sjekk("28. des 2020 er uke 53", uke("2020-12-28"), { aar: 2020, uke: 53 });
sjekk("mandag og søndag i samme uke", uke("2026-03-02"), uke("2026-03-08"));
sjekk("søndag hører til uken før mandagen etter", uke("2026-03-08").uke, 10);
sjekk("mandagen etter er ny uke", uke("2026-03-09").uke, 11);

console.log("\n--- Mandag i uken ---");

sjekk("onsdag -> mandag", tilDato(mandagI(parseDato("2026-03-04")!)), "2026-03-02");
sjekk("søndag -> mandag samme uke", tilDato(mandagI(parseDato("2026-03-08")!)), "2026-03-02");
sjekk("mandag -> seg selv", tilDato(mandagI(parseDato("2026-03-02")!)), "2026-03-02");

console.log("\n--- Tidsakse ---");

const kort = lagTidsakse("2026-03-02", "2026-04-12")!;
sjekk("kort plan gir ukeakse", kort.type, "uke");
sjekk("seks uker", kort.kolonner.length, 6);
sjekk("første uke", kort.kolonner[0].etikett, "10");
sjekk("siste uke", kort.kolonner[5].etikett, "15");
sjekk("aksen starter på en mandag", tilDato(kort.fra), "2026-03-02");
// Måneden skrives bare når den skifter
sjekk("måned står første gang", kort.kolonner[0].overskrift, "mar");
sjekk("og ikke gjentas", kort.kolonner[1].overskrift, "");

// Over grensen byttes det til måneder
const lang = lagTidsakse("2026-01-01", "2027-12-31")!;
sjekk("lang plan gir månedsakse", lang.type, "maaned");
sjekk("24 måneder", lang.kolonner.length, 24);
sjekk("år står første gang", lang.kolonner[0].overskrift, "2026");
sjekk("og igjen ved årsskiftet", lang.kolonner[12].overskrift, "2027");

// 2026-01-05 er en mandag. Til og med uken som starter 2026-08-24 er det
// nøyaktig 34 uker — altså på grensen, og fortsatt ukeakse.
sjekk("på grensen: 34 uker", lagTidsakse("2026-01-05", "2026-08-30", 34)!.kolonner.length, 34);
sjekk("på grensen er det fortsatt uker", lagTidsakse("2026-01-05", "2026-08-30", 34)!.type, "uke");
sjekk("én uke over bytter til måned", lagTidsakse("2026-01-05", "2026-09-06", 34)!.type, "maaned");

sjekk("ugyldig dato gir null", lagTidsakse("", "2026-01-01"), null);
sjekk("snudd rekkefølge tåles", lagTidsakse("2026-04-12", "2026-03-02")!.kolonner.length, 6);

console.log("\n--- Plassering av streken ---");

const akse = lagTidsakse("2026-03-02", "2026-03-29")!; // fire uker
sjekk("fire uker", akse.kolonner.length, 4);

const hele = plassering(akse, "2026-03-02", "2026-03-29")!;
sjekk("hele perioden fyller aksen", [Math.round(hele.venstre), Math.round(hele.bredde)], [0, 100]);

const foerste = plassering(akse, "2026-03-02", "2026-03-08")!;
sjekk("første uke er fjerdedel", [Math.round(foerste.venstre), Math.round(foerste.bredde)], [0, 25]);

const andre = plassering(akse, "2026-03-09", "2026-03-15")!;
sjekk("andre uke starter på 25 %", [Math.round(andre.venstre), Math.round(andre.bredde)], [25, 25]);

// Én dag skal være synlig, ikke null bred
const endag = plassering(akse, "2026-03-04", "2026-03-04")!;
sjekk("én dag har bredde", endag.bredde > 0, true);
sjekk("én dag er en 28-del", Math.round(endag.bredde * 100) / 100, Math.round((100 / 28) * 100) / 100);

// Milepæl uten sluttdato bruker startdatoen
sjekk("uten sluttdato brukes start", plassering(akse, "2026-03-04")!.bredde, endag.bredde);
sjekk("uten startdato: ingen strek", plassering(akse, null, "2026-03-04"), null);
// Utenfor aksen klippes bort
sjekk("helt før aksen", plassering(akse, "2026-01-01", "2026-01-05"), null);
sjekk("helt etter aksen", plassering(akse, "2026-06-01", "2026-06-05"), null);
const delvis = plassering(akse, "2026-02-20", "2026-03-08")!;
sjekk("delvis før klippes til 0", Math.round(delvis.venstre), 0);

console.log("\n--- Småting ---");

sjekk("uketekst", ukeTekst("2026-03-04"), "uke 10");
sjekk("uketekst med år", ukeTekst("2027-01-01", true), "uke 53 (2026)");
sjekk("uketekst uten dato", ukeTekst(null), "—");
sjekk("varighet begge dager med", varighetDager("2026-03-02", "2026-03-08"), 7);
sjekk("varighet én dag", varighetDager("2026-03-02", "2026-03-02"), 1);
sjekk("varighet uten slutt", varighetDager("2026-03-02"), 1);
sjekk("varighet uten start", varighetDager(null, "2026-03-02"), 0);

sjekk("periode fra aktiviteter", planPeriode([
  { start_date: "2026-03-10", end_date: "2026-03-20" },
  { start_date: "2026-03-02", end_date: "2026-03-08" },
  { start_date: "2026-04-01", end_date: null },
]), { start: "2026-03-02", slutt: "2026-04-01" });
sjekk("periode uten datoer", planPeriode([{ start_date: null, end_date: null }]), null);
sjekk("periode av tom liste", planPeriode([]), null);

console.log(`\n${ok} i orden, ${feil} feil`);
process.exit(feil ? 1 : 0);
