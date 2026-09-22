// Tester for filnavn som skal bli til nøkler i Supabase Storage. Kjøres av `bun test`.
//
// Bakgrunnen: lagringen avviste «sideveis - mål.pdf» med «Invalid key», og
// vedlegget ble aldri lastet opp. Det er ikke mellomrommet eller bindestreken
// som er problemet — de går fint — men å-en. Supabase slipper bare gjennom
// ASCII i objektnøkler, så hvert norske filnavn med æ, ø eller å var en feil
// som ventet på å skje.

import { trygtFilnavn } from "./lagringsnokkel.ts";

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

// Mønsteret Supabase Storage faktisk måler nøkkelen mot. Er dette oppfylt,
// blir filen tatt imot; er det ikke det, får du 400 InvalidKey. Skråstreken er
// utelatt her med vilje — et filnavn skal aldri kunne lage en ny mappe.
const GODTATT_AV_SUPABASE = /^(\w|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)+$/;

console.log("\n--- Norske bokstaver blir til ASCII ---");

sjekk("å", trygtFilnavn("mål.pdf"), "mal.pdf");
sjekk("ø", trygtFilnavn("kjøp.pdf"), "kjop.pdf");
sjekk("æ", trygtFilnavn("værsteg.pdf"), "vaersteg.pdf");
sjekk("store bokstaver", trygtFilnavn("MÅL-KJØP-VÆR.pdf"), "MAL-KJOP-VAER.pdf");
sjekk("filen fra feilmeldingen", trygtFilnavn("sideveis - mål.pdf"), "sideveis - mal.pdf");

console.log("\n--- Mellomrom og bindestrek skal stå i fred ---");

// Begge er beviselig godtatt av lagringen. Strøk vi dem også, ville filnavnene
// i bøtta bli vanskeligere å kjenne igjen enn de trenger å være.
sjekk("mellomrom", trygtFilnavn("a - b.pdf"), "a - b.pdf");
sjekk("understrek", trygtFilnavn("plan_2026.pdf"), "plan_2026.pdf");
sjekk("rent navn er urørt", trygtFilnavn("Kontrakt-1010.pdf"), "Kontrakt-1010.pdf");

console.log("\n--- Alt annet som ikke er ASCII ---");

sjekk("aksent", trygtFilnavn("café.pdf"), "cafe.pdf");
sjekk("tysk omlyd", trygtFilnavn("Grüße.pdf"), "Grusse.pdf");
sjekk("emoji forsvinner", trygtFilnavn("plan 🙂.pdf"), "plan _.pdf");
sjekk("kyrillisk", trygtFilnavn("план.pdf"), "_.pdf");

console.log("\n--- Navnet skal aldri kunne lage en mappe ---");

// Uten dette kunne et filnavn skrevet «../» ha skjøvet filen ut av mappa til
// firmaet og inn i et annet firmas. Vedlegg er stemplet med tenant-id i stien
// nettopp for å holde firmaene fra hverandre.
sjekk("skråstrek", trygtFilnavn("mappe/fil.pdf"), "mappe_fil.pdf");
sjekk("omvendt skråstrek", trygtFilnavn("mappe\\fil.pdf"), "mappe_fil.pdf");
sjekk("opp et nivå", trygtFilnavn("../../hemmelig.pdf"), "_hemmelig.pdf");

console.log("\n--- Tomt navn skal likevel gi en gyldig nøkkel ---");

sjekk("tom streng", trygtFilnavn(""), "fil");
sjekk("bare mellomrom", trygtFilnavn("   "), "fil");
sjekk("bare emoji", trygtFilnavn("🙂"), "fil");

console.log("\n--- Kjøres det to ganger, skal svaret være det samme ---");

for (const inn of ["sideveis - mål.pdf", "Grüße.pdf", "plan 🙂.pdf", "Kontrakt-1010.pdf"]) {
  const en = trygtFilnavn(inn);
  sjekk(`«${inn}» er stabil`, trygtFilnavn(en), en);
}

console.log("\n--- Resultatet skal alltid slippe gjennom hos Supabase ---");

// Den egentlige kontrakten. Blir denne rød, får brukeren «Invalid key» igjen,
// uansett hvor pent resultatet ser ut i testene over.
for (const inn of [
  "sideveis - mål.pdf",
  "MÅL-KJØP-VÆR.pdf",
  "café.pdf",
  "plan 🙂.pdf",
  "план.pdf",
  "../../hemmelig.pdf",
  "mappe/fil.pdf",
  "",
  "🙂",
  "Fremdriftsplan-Nytt-vannverk-på-Åseral-rev2.pdf",
]) {
  const ut = trygtFilnavn(inn);
  sjekk(`«${inn}» → «${ut}» godtas`, GODTATT_AV_SUPABASE.test(ut), true);
}

console.log(`\n${ok} i orden, ${feil} feil`);
process.exit(feil ? 1 : 0);
