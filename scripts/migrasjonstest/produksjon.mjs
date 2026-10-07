// Kobler migrasjonskjeden i repoet mot produksjonsbasen via Supabase Management
// API. Alt er skrivebeskyttet («set transaction read only» først i hver
// spørring), unntatt «historikk --utfor».
//
//   node scripts/migrasjonstest/produksjon.mjs avvik [--til <versjon>]
//   node scripts/migrasjonstest/produksjon.mjs historikk --til <versjon> [--utfor]
//   node scripts/migrasjonstest/produksjon.mjs katalog --ut <fil>
//
// avvik      bygger kjeden til og med --til i PGlite og sammenligner den med
//            produksjonens katalog. Uten --til brukes alle filene.
// historikk  viser hvilke versjoner til og med --til som mangler i
//            supabase_migrations.schema_migrations i produksjon, og hva
//            supabase db push da ville kjørt. Med --utfor registreres de, med
//            setningene delt opp slik CLI-en gjør, men bare hvis avvik er tomt
//            først. --utfor skriver til produksjon: kjør det bare når Thomas har
//            sagt ja.
// katalog    lagrer produksjonens katalog i en fil.
//
// Tokenet hentes med tokenFor fra Varslingskontroll, aldri fra en egen kopi, og
// vaskes ut av all utskrift. Stien kan overstyres med SUPABASE_TOKEN_MODUL.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { byggKjede, lesKatalog, migrasjonsfiler } from "./kjede.mjs";
import { sporringer } from "./katalog.mjs";
import { sammenlign, skrivRapport } from "./sammenlign.mjs";
import { delOppSql, strengLiteral } from "./sql.mjs";

const HER = dirname(fileURLToPath(import.meta.url));
const TOKENMODUL =
  process.env.SUPABASE_TOKEN_MODUL || "C:/Users/thoma/varslingskontroll/db/token.js";

function prosjektRef() {
  const toml = readFileSync(resolve(HER, "../../supabase/config.toml"), "utf8");
  const m = /^\s*project_id\s*=\s*"([^"]+)"/m.exec(toml);
  if (!m) throw new Error("Fant ikke project_id i supabase/config.toml");
  return m[1];
}

let token = null;

function vask(s) {
  let ut = String(s);
  if (token) ut = ut.split(token).join("<token>");
  return ut
    .replace(/sbp_[A-Za-z0-9_]+/g, "<token>")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>")
    .replace(/Bearer\s+\S+/gi, "Bearer <token>");
}

// Node kan legge header-verdien, altså tokenet, inn i feilmeldinger. Alt som
// skrives ut ved feil går derfor gjennom vask.
process.on("uncaughtException", (e) => {
  console.error("Feil: " + vask(e?.stack || e));
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.error("Feil: " + vask(e?.stack || e));
  process.exit(1);
});

// Nettet har sviktet av og til her («fetch failed»). Da prøves det inntil tre
// ganger. Det er trygt også for registreringen, som ikke legger inn noe to ganger.
async function medNyeForsok(hva, fn) {
  for (let forsok = 1; ; forsok++) {
    try {
      return await fn();
    } catch (e) {
      const kode = e?.cause?.code ? ` (${e.cause.code})` : "";
      if (!(e instanceof TypeError) || forsok >= 3) {
        throw new Error(`${hva} feilet: ${vask(e?.message || e)}${kode}`);
      }
      await new Promise((ferdig) => setTimeout(ferdig, 2000 * forsok));
    }
  }
}

async function sporring(tekst) {
  const ref = prosjektRef();
  if (!token) {
    const { tokenFor } = createRequire(import.meta.url)(TOKENMODUL);
    token = await medNyeForsok("Hentingen av tokenet", () => tokenFor(ref));
  }
  const svar = await medNyeForsok("Kallet mot Management API", () =>
    fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: Buffer.from(JSON.stringify({ query: tekst }), "utf8"),
    }),
  );
  const kropp = await svar.text();
  if (svar.status >= 300) throw new Error(`HTTP ${svar.status}: ${vask(kropp).slice(0, 800)}`);
  return JSON.parse(kropp);
}

/** Skrivebeskyttet: Postgres avviser all skriving i transaksjonen. */
export function les(sql) {
  return sporring("set transaction read only;\n" + sql);
}

export async function hentKatalog() {
  const sjekk = await les("select current_setting('transaction_read_only') as ro");
  if (sjekk[0]?.ro !== "on") throw new Error("Spørringen var ikke skrivebeskyttet. Avbryter.");
  const k = {};
  for (const [navn, sql] of Object.entries(sporringer)) k[navn] = await les(sql);
  return k;
}

/** Bygger kjeden i PGlite og sammenligner med produksjonen. Gir avvikene. */
export async function avvik({ til } = {}) {
  console.log(`bygger kjeden${til ? ` til og med ${til}` : ""} i PGlite …`);
  const { db, feil, kjort } = await byggKjede({ til });
  if (feil.length) {
    await db.close();
    return [`kjeden bygger ikke: ${feil[0].versjon} feilet: ${feil[0].melding}`];
  }
  const kjede = await lesKatalog(db);
  await db.close();
  console.log(`${kjort.length} filer gikk gjennom. Henter produksjonens katalog skrivebeskyttet …`);
  return skrivRapport(sammenlign(await hentKatalog(), kjede));
}

/** SQL som registrerer filene i historikken slik CLI-en ville gjort, uten å kjøre dem. */
export function historikkSql(filer) {
  const rader = filer.map((m) => {
    const setninger = delOppSql(readFileSync(m.fil, "utf8")).map(strengLiteral).join(",\n      ");
    return `    (${strengLiteral(m.versjon)}, ${strengLiteral(m.navn)}, array[\n      ${setninger}\n    ]::text[])`;
  });
  return `insert into supabase_migrations.schema_migrations (version, name, statements)
select v.version, v.name, v.statements
  from (values
${rader.join(",\n")}
  ) as v(version, name, statements)
 where not exists (select 1 from supabase_migrations.schema_migrations s
                    where s.version = v.version);`;
}

async function historikk({ til, utfor }) {
  if (!til) throw new Error("historikk krever --til <versjon>: den siste versjonen som er kjørt i produksjon");
  const lokale = migrasjonsfiler();
  if (!lokale.some((m) => m.versjon === til)) throw new Error(`Ingen migrasjon har versjonen ${til}`);

  // Bare filer som beviselig er kjørt kan registreres: kjeden til og med --til
  // må gi nøyaktig det produksjonen har.
  const funn = await avvik({ til });

  const fjern = new Set((await les("select version from supabase_migrations.schema_migrations")).map((r) => r.version));
  const mangler = lokale.filter((m) => m.versjon <= til && !fjern.has(m.versjon));
  const venter = lokale.filter((m) => m.versjon > til && !fjern.has(m.versjon));
  const ukjente = [...fjern].filter((v) => !lokale.some((m) => m.versjon === v)).sort();

  console.log(`\nhistorikken i produksjon har ${fjern.size} versjoner`);
  if (ukjente.length) console.log(`registrert der, men uten fil her (db push nekter da): ${ukjente.join(", ")}`);
  console.log(`\nkjørt, men ikke registrert, til og med ${til} (${mangler.length}):`);
  for (const m of mangler) console.log(`  ${m.versjon}_${m.navn}`);
  console.log(`\netter ${til}, ikke kjørt i produksjon (${venter.length}):`);
  for (const m of venter) console.log(`  ${m.versjon}_${m.navn}`);
  console.log(
    `\nsupabase db push ville nå forsøkt å kjøre ${mangler.length + venter.length} filer` +
      (mangler.length ? `, ${mangler.length} av dem på nytt.` : "."),
  );

  if (!mangler.length) {
    console.log("ingenting å registrere");
    return;
  }
  if (funn.length) {
    console.log("\nregistrering er sperret til avvikene over er forklart eller ryddet");
    process.exitCode = 1;
    return;
  }
  if (!utfor) {
    console.log("\ntørrkjøring: ingenting er skrevet. --utfor registrerer, etter Thomas' ja.");
    return;
  }

  console.log(`\nregistrerer ${mangler.length} versjoner …`);
  await sporring(`begin;\n${historikkSql(mangler)}\ncommit;`);
  const etter = new Set((await les("select version from supabase_migrations.schema_migrations")).map((r) => r.version));
  const fortsattBorte = mangler.filter((m) => !etter.has(m.versjon));
  if (fortsattBorte.length) throw new Error(`Ikke registrert: ${fortsattBorte.map((m) => m.versjon).join(", ")}`);
  console.log(`ferdig: historikken har ${etter.size} versjoner, og db push vil bare kjøre de ${venter.length} som venter`);
}

async function hoved() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      til: { type: "string" },
      ut: { type: "string" },
      utfor: { type: "boolean", default: false },
    },
  });
  const [kommando] = positionals;
  if (kommando === "avvik") {
    process.exitCode = (await avvik({ til: values.til })).length ? 1 : 0;
  } else if (kommando === "historikk") {
    await historikk({ til: values.til, utfor: values.utfor });
  } else if (kommando === "katalog" && values.ut) {
    writeFileSync(values.ut, JSON.stringify(await hentKatalog(), null, 1));
    console.log(`produksjonens katalog er lagret i ${values.ut}`);
  } else {
    console.log("Bruk: node scripts/migrasjonstest/produksjon.mjs avvik|historikk|katalog (se øverst i fila)");
    process.exitCode = 2;
  }
}

const kjortDirekte =
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (kjortDirekte) await hoved();
