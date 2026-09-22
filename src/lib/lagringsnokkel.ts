// Filnavn som skal tåle å bli en nøkkel i Supabase Storage.
//
// Lagringen måler hver objektnøkkel mot et mønster som bare slipper gjennom
// ASCII. Norske filnavn gjør ikke det: «sideveis - mål.pdf» ble avvist med
// «Invalid key», og vedlegget forsvant uten at noe annet i skjemaet merket det.
// Det var å-en alene som felte den — mellomrom og bindestrek går fint.
//
// Derfor skilles det her mellom to ting som lett blir blandet sammen: navnet
// mennesket skal se, og nøkkelen filen ligger under. Det første er `file.name`
// og skal stå urørt i lista og på nedlastingen; det andre er denne funksjonens
// svar. Hadde vi latt dem være samme streng, måtte vi valgt mellom et filnavn
// som ser feil ut for den som lastet det opp, og et vedlegg som ikke lar seg
// laste opp i det hele tatt.

/**
 * Gjør et filnavn om til noe Supabase Storage tar imot.
 *
 * Norske og tyske bokstaver skrives om til nærmeste ASCII i stedet for å
 * strykes, slik at navnet fortsatt er til å kjenne igjen for den som leter i
 * bøtta: «mål» blir «mal», ikke «ml».
 */
export function trygtFilnavn(navn: unknown): string {
  const rent = String(navn ?? "")
    // Disse dekomponerer ikke av seg selv — æ og ø er egne bokstaver, ikke en
    // vokal med et tegn over — så de må skrives om for hånd.
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .replace(/ø/g, "o")
    .replace(/Ø/g, "O")
    .replace(/å/g, "a")
    .replace(/Å/g, "A")
    .replace(/ß/g, "ss")
    // Resten av de aksenttunge bokstavene deles i grunnbokstav + tegn, og
    // tegnet strykes: é blir e, ü blir u. \p{Mn} er nettopp de tegnene som
    // henger på bokstaven foran. Skrevet slik og ikke som et tallintervall:
    // formateringen gjør ̀-ͯ om til de rå tegnene, og da står det
    // usynlige krøller i kildekoden som ingen kan lese eller rette.
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    // Punktum og skråstrek i følge er «gå opp et nivå». Et vedlegg er stemplet
    // med firmaets tenant-id i stien nettopp for å holde firmaene fra
    // hverandre, og et filnavn skal ikke kunne skyve filen ut av den mappa.
    .replace(/[./\\]{2,}/g, "_")
    // En enkelt skråstrek ville laget en ny undermappe i stedet for et filnavn.
    .replace(/[/\\]/g, "_")
    // Alt som står igjen utenfor det lagringen godtar. Sammenhengende tegn blir
    // til ett understrek, så en emoji ikke etterlater seg en rekke av dem.
    .replace(/[^A-Za-z0-9._\- ]+/g, "_")
    .replace(/_{2,}/g, "_")
    .trim();

  // Et navn helt uten bokstaver eller tall er ikke et navn lenger — det skjer
  // når hele filnavnet var emoji eller et alfabet vi ikke kan skrive om.
  // «_.pdf» ville vært en gyldig nøkkel, men ikke til å finne igjen.
  return /[A-Za-z0-9]/.test(rent) ? rent : "fil";
}
