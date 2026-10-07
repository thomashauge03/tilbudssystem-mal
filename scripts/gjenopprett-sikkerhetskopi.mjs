// Åpner en kryptert sikkerhetskopi fra sikkerhetskopi.mjs og viser den, eller
// gjenoppretter den som JSON-filer.
//
//   node scripts/gjenopprett-sikkerhetskopi.mjs [kopi]
//       Når kopien ble tatt, hvor den kom fra og antall rader per tabell. Viser
//       ingen data. Uten kopi brukes den nyeste i ../tilbudssystem-backup.
//
//   node scripts/gjenopprett-sikkerhetskopi.mjs [kopi] --tabell offers
//       Radene i én tabell som JSON på stdout, til skjermen eller videre til et
//       annet program. Meldinger går til stderr, så utdataene er ren JSON.
//
//   node scripts/gjenopprett-sikkerhetskopi.mjs [kopi] --til-mappe <mappe>
//       Gjenoppretter kopien som én JSON-fil per tabell pluss _oversikt.json, i
//       samme form som de gamle klartekstkopiene. Det er klartekst med
//       persondata, så mappa må ligge utenfor repoet og være tom, og den skal
//       slettes når du er ferdig.
//
// Kopien kan oppgis som sti eller som navn, for eksempel 2026-10-07_154512.
// Passordfrasen leses fra SIKKERHETSKOPI_PASSFRASE; ellers blir du spurt, uten at
// det du skriver vises.
//
// Skriptet skriver aldri tilbake til basen, med vilje. Tabellene har triggere som
// gjør en blind tilbakeskriving gjennom API-et farlig: varsle_kundesvar sender
// e-post når signert- eller avslagstidspunktet på et tilbud eller en
// endringsmelding endres, logg_linjeendring legger til ny historikk for hver
// linje som skrives, og linjene i en signert endringsmelding kan ikke endres i
// det hele tatt. Hent ut det som trengs med --tabell eller --til-mappe, og legg
// det inn med SQL i en økt der triggerne er slått av
// (set session_replication_role = replica).

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

import {
  BACKUPMAPPE,
  FILENDELSE,
  ROT,
  dekrypter,
  hentPassfrase,
  pakkUt,
} from "./sikkerhetskopi-felles.mjs";

const BRUK = `Bruk:
  node scripts/gjenopprett-sikkerhetskopi.mjs [kopi]
  node scripts/gjenopprett-sikkerhetskopi.mjs [kopi] --tabell <tabell>
  node scripts/gjenopprett-sikkerhetskopi.mjs [kopi] --til-mappe <mappe>
Se kommentaren øverst i skriptet.`;

// Bare navn med dato og klokkeslett teller når den nyeste skal velges, så en
// fil med et annet navn aldri sniker seg foran.
const STEMPLET = /^\d{4}-\d{2}-\d{2}_\d{6}\.kryptert$/;

function finnKopi(oppgitt) {
  if (!oppgitt) {
    const alle = existsSync(BACKUPMAPPE)
      ? readdirSync(BACKUPMAPPE)
          .filter((f) => STEMPLET.test(f))
          .sort()
      : [];
    if (!alle.length) throw new Error(`Fant ingen krypterte sikkerhetskopier i ${BACKUPMAPPE}.`);
    return join(BACKUPMAPPE, alle.at(-1));
  }
  const direkte = resolve(oppgitt);
  if (existsSync(direkte) && statSync(direkte).isDirectory()) {
    throw new Error(
      `${direkte} er en mappe. Gamle klartekstkopier krypteres med ` +
        "node scripts/sikkerhetskopi.mjs --fra-mappe <mappe>.",
    );
  }
  for (const sti of [
    direkte,
    join(BACKUPMAPPE, oppgitt),
    join(BACKUPMAPPE, oppgitt + FILENDELSE),
  ]) {
    if (existsSync(sti) && statSync(sti).isFile()) return sti;
  }
  throw new Error(`Fant ikke sikkerhetskopien ${oppgitt}.`);
}

// Klartekst skal aldri havne i repoet, der den kan bli med i en commit, og aldri
// blandes med filer som ligger der fra før.
function sjekkMålmappe(mål) {
  const rel = relative(ROT, mål);
  const utenfor = rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  if (!utenfor) throw new Error(`${mål} ligger inne i repoet. Velg en mappe utenfor.`);
  if (existsSync(mål) && (!statSync(mål).isDirectory() || readdirSync(mål).length)) {
    throw new Error(`${mål} finnes og er ikke en tom mappe. Velg en ny.`);
  }
  return mål;
}

function visOversikt(kopi, fil) {
  console.log(`Sikkerhetskopi: ${basename(fil)}`);
  console.log(
    `Tatt:           ${new Date(kopi.tatt).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}`,
  );
  console.log(`Kilde:          ${kopi.kilde ?? "ukjent"}\n`);
  let sum = 0;
  for (const [tabell, antall] of Object.entries(kopi.oversikt ?? {})) {
    if (typeof antall === "number") sum += antall;
    const verdi = typeof antall === "number" ? `${String(antall).padStart(5)} rader` : antall;
    console.log(`  ${tabell.padEnd(26)} ${verdi}`);
  }
  console.log(`\n${sum} rader i ${Object.keys(kopi.tabeller).length} tabeller.`);
}

function visTabell(kopi, tabell) {
  if (!(tabell in kopi.tabeller)) {
    const feil = kopi.oversikt?.[tabell];
    throw new Error(
      feil
        ? `${tabell} kom ikke med i kopien (${feil}).`
        : `Kopien har ingen tabell som heter ${tabell}. Den har: ${Object.keys(kopi.tabeller).join(", ")}.`,
    );
  }
  if (!process.stdout.isTTY) {
    console.error("Merk: dette er klartekst med persondata. La det ikke bli liggende i en fil.");
  }
  process.stdout.write(`${JSON.stringify(kopi.tabeller[tabell], null, 2)}\n`);
}

function tilMappe(kopi, mål) {
  mkdirSync(mål, { recursive: true });
  for (const [tabell, rader] of Object.entries(kopi.tabeller)) {
    // Navnet blir et filnavn, så det skal ikke kunne peke ut av mappa.
    if (!/^\w+$/.test(tabell)) throw new Error(`Ugyldig tabellnavn i kopien: ${tabell}`);
    writeFileSync(join(mål, `${tabell}.json`), JSON.stringify(rader, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
  }
  writeFileSync(
    join(mål, "_oversikt.json"),
    JSON.stringify({ tatt: kopi.tatt, tabeller: kopi.oversikt }, null, 2),
    { encoding: "utf8", flag: "wx" },
  );
  console.log(`Gjenopprettet ${Object.keys(kopi.tabeller).length} tabeller til ${mål}`);
  console.log("Dette er klartekst med persondata. Slett mappa når du er ferdig med den.");
}

async function main() {
  let argumenter;
  try {
    argumenter = parseArgs({
      allowPositionals: true,
      options: {
        tabell: { type: "string" },
        "til-mappe": { type: "string" },
        hjelp: { type: "boolean", short: "h" },
      },
    });
  } catch (e) {
    throw new Error(`${e.message}\n${BRUK}`);
  }
  const { values: valg, positionals } = argumenter;
  if (valg.hjelp) return console.log(BRUK);
  if (positionals.length > 1 || (valg.tabell && valg["til-mappe"])) throw new Error(BRUK);

  const fil = finnKopi(positionals[0]);
  // Målmappa sjekkes før passordfrasen, så den ikke skrives forgjeves.
  const mål = valg["til-mappe"] && sjekkMålmappe(resolve(valg["til-mappe"]));

  const passfrase = await hentPassfrase({ ny: false });
  const kopi = pakkUt(await dekrypter(readFileSync(fil), passfrase));

  if (valg.tabell) visTabell(kopi, valg.tabell);
  else if (mål) tilMappe(kopi, mål);
  else visOversikt(kopi, fil);
}

try {
  await main();
} catch (e) {
  console.error(e.message);
  process.exitCode = e.kode ?? 1;
}
