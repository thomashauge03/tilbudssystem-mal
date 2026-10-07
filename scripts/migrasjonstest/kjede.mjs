// Bygger migrasjonskjeden i en tom PGlite-base, med det Supabase har på plass
// fra før (supabase-oppsett.sql) og én fil per transaksjon, slik supabase CLI
// gjør. Går den gjennom, kan kjeden bygge en ny base fra bunnen.
//
//   node scripts/migrasjonstest/kjede.mjs
//   node scripts/migrasjonstest/kjede.mjs --til 20261007000002 --katalog kjede.json
//   node scripts/migrasjonstest/kjede.mjs --igjen 20260708000001
//
//   --til <versjon>      stopp etter denne versjonen
//   --katalog <fil>      lagre systemkatalogen etterpå (se sammenlign.mjs)
//   --igjen <v1,v2,...>  kjør disse versjonene en gang til etter kjeden, og vis om
//                        katalogen endret seg. Slik sjekkes det at en fil tåler å
//                        bli kjørt mot en base der alt allerede finnes.
//   --fortsett           fortsett forbi en fil som feiler
//
// Første gang: cd scripts/migrasjonstest && npm install

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

import { sporringer } from "./katalog.mjs";
import { delOppSql } from "./sql.mjs";

const HER = dirname(fileURLToPath(import.meta.url));
export const MIGRASJONER = resolve(HER, "../../supabase/migrations");

// Det som skiller PGlite fra Supabase, og som ikke er skjema: pg_net finnes ikke
// i PGlite, så supabase-oppsett.sql har en stub med samme signatur.
const TILPASNINGER = [
  [/create extension if not exists pg_net\s*;/gi, "-- (PGlite) pg_net etterlignes i oppsettet"],
];

export function tilpassForPGlite(sql) {
  return TILPASNINGER.reduce((s, [re, ny]) => s.replace(re, ny), sql);
}

/** Migrasjonsfilene i den rekkefølgen CLI-en kjører dem, som { versjon, navn, fil }. */
export function migrasjonsfiler({ til } = {}) {
  return readdirSync(MIGRASJONER)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((f) => {
      const versjon = f.split("_")[0];
      return { versjon, navn: f.slice(versjon.length + 1, -4), fil: join(MIGRASJONER, f) };
    })
    .filter((m) => !til || m.versjon <= til);
}

/** En tom base med det Supabase har før første migrasjon. */
export async function nyBase() {
  // PGlite starter med search_path=public og nullstiller økten mellom
  // tilkoblinger, så søkestien rollen postgres har i Supabase må inn her.
  const standard = PGlite.defaultStartParams;
  if (!standard.includes("search_path=public")) {
    throw new Error("Fant ikke search_path=public i PGlites oppstartsparametre. Ny PGlite-versjon?");
  }
  const startParams = standard.map((p) =>
    p === "search_path=public" ? 'search_path="$user", public, extensions' : p,
  );
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp }, startParams });
  await db.exec(readFileSync(join(HER, "supabase-oppsett.sql"), "utf8"));
  return db;
}

function beskrivFeil(e, sql) {
  const deler = [e.message];
  for (const k of ["detail", "hint", "where"]) if (e[k]) deler.push(`${k}: ${String(e[k]).split("\n")[0]}`);
  if (e.position) {
    const linje = sql.slice(0, Number(e.position)).split("\n").length;
    deler.push(`linje ${linje}: ${sql.split("\n")[linje - 1].trim().slice(0, 120)}`);
  }
  return deler.join(" | ");
}

/** Kjører én migrasjonsfil som én transaksjon og registrerer den som CLI-en. */
export async function kjorFil(db, m, { registrer = true } = {}) {
  const sql = tilpassForPGlite(readFileSync(m.fil, "utf8"));
  try {
    await db.exec(sql);
  } catch (e) {
    throw new Error(beskrivFeil(e, sql));
  }
  if (registrer) {
    await db.query(
      `insert into supabase_migrations.schema_migrations (version, name, statements)
       values ($1, $2, $3)`,
      [m.versjon, m.navn, delOppSql(sql)],
    );
  }
}

/** Bygger kjeden fra tom base. Gir { db, feil, kjort }; lukk db etterpå. */
export async function byggKjede({ til, fortsett = false, logg = () => {} } = {}) {
  const db = await nyBase();
  const feil = [];
  const kjort = [];
  for (const m of migrasjonsfiler({ til })) {
    try {
      await kjorFil(db, m);
      kjort.push(m);
      logg(`ok    ${basename(m.fil)}`);
    } catch (e) {
      feil.push({ ...m, melding: e.message });
      logg(`FEIL  ${basename(m.fil)}\n      ${e.message}`);
      if (!fortsett) break;
    }
  }
  return { db, feil, kjort };
}

/** Systemkatalogen, med de samme spørringene som mot produksjonen. */
export async function lesKatalog(db) {
  const k = {};
  for (const [navn, sql] of Object.entries(sporringer)) k[navn] = (await db.query(sql)).rows;
  return k;
}

async function hoved() {
  const { values } = parseArgs({
    options: {
      til: { type: "string" },
      katalog: { type: "string" },
      igjen: { type: "string" },
      fortsett: { type: "boolean", default: false },
      stille: { type: "boolean", default: false },
    },
  });
  const logg = values.stille ? () => {} : (s) => console.log(s);
  const { db, feil, kjort } = await byggKjede({ til: values.til, fortsett: values.fortsett, logg });
  console.log(
    feil.length
      ? `${feil.length} fil(er) feilet, ${kjort.length} gikk gjennom`
      : `alle ${kjort.length} filene gikk gjennom fra tom base`,
  );

  let feilIgjen = 0;
  if (values.igjen) {
    const alle = migrasjonsfiler();
    const katalogFor = JSON.stringify(await lesKatalog(db));
    for (const v of values.igjen.split(",").filter(Boolean)) {
      const m = alle.find((x) => x.versjon === v || basename(x.fil) === v);
      if (!m) throw new Error(`Fant ikke migrasjonen ${v}`);
      try {
        await kjorFil(db, m, { registrer: false });
        logg(`igjen ok    ${basename(m.fil)}`);
      } catch (e) {
        feilIgjen++;
        console.log(`igjen FEIL  ${basename(m.fil)}\n      ${e.message}`);
      }
    }
    const uendret = JSON.stringify(await lesKatalog(db)) === katalogFor;
    console.log(
      `kjørt på nytt: ${feilIgjen} feilet, katalogen ${uendret ? "er uendret" : "ble ENDRET"}`,
    );
    if (!uendret) feilIgjen++;
  }

  if (values.katalog) {
    writeFileSync(values.katalog, JSON.stringify(await lesKatalog(db), null, 1));
    console.log(`katalogen er lagret i ${values.katalog}`);
  }
  await db.close();
  process.exitCode = feil.length || feilIgjen ? 1 : 0;
}

const kjortDirekte =
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (kjortDirekte) await hoved();
