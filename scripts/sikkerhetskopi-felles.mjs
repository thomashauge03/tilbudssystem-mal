// Felles for sikkerhetskopi.mjs og gjenopprett-sikkerhetskopi.mjs: filformatet,
// krypteringen og passordfrasen.
//
// Hver kopi er én fil. Innholdet er JSON med alle tabellene, pakket med gzip og
// kryptert med AES-256-GCM. Nøkkelen avledes fra en passordfrase med scrypt. Alt
// skjer i minnet, så ingen klartekst skrives til disk på veien.
//
// Filformat, versjon 1:
//   byte 0 til 5    «TSKOPI» i ASCII
//   byte 6          formatversjon, 1
//   byte 7          log2 av scrypt-parameteren N (17 betyr N = 131072)
//   byte 8          scrypt r
//   byte 9          scrypt p
//   byte 10 til 25  salt, 16 tilfeldige byte
//   byte 26 til 37  IV for AES-256-GCM, 12 tilfeldige byte
//   deretter        det krypterte innholdet
//   siste 16 byte   autentiseringsmerket fra GCM
// Nøkkelen er scrypt(passordfrasen i NFC, salt) på 32 byte. De 38 første bytene
// er med som tilleggsdata (AAD), så en endring hvor som helst i fila oppdages.

import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

export const ROT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Ved siden av repoet, ikke i det, så produksjonsdata aldri havner i git.
export const BACKUPMAPPE = resolve(ROT, "..", "tilbudssystem-backup");
export const FILENDELSE = ".kryptert";
export const MILJOVARIABEL = "SIKKERHETSKOPI_PASSFRASE";

const MAGI = Buffer.from("TSKOPI", "ascii");
const VERSJON = 1;
const HODE = 38;
const MERKE = 16;
const FORMAT = "tilbudssystem-sikkerhetskopi";
const MINSTE_LENGDE = 12;

// OWASP anbefaler minst N = 2^17, r = 8 og p = 1. Det koster rundt et kvart
// sekund og 128 MiB minne per forsøk, også for den som gjetter.
const SCRYPT = { log2N: 17, r: 8, p: 1 };

// Verdiene leses fra hodet når en kopi åpnes. En skadet fil skal ikke kunne be
// om gigabyte med minne eller minutter med regning.
function rimelig({ log2N, r, p }) {
  if (log2N < 10 || log2N > 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;
  return 128 * r * (2 ** log2N + p + 2) <= 1024 ** 3;
}

function avledNokkel(passfrase, salt, { log2N, r, p }) {
  const N = 2 ** log2N;
  const maxmem = 128 * r * (N + p + 2) + 1024 * 1024;
  return new Promise((ok, feil) =>
    scrypt(passfrase.normalize("NFC"), salt, 32, { N, r, p, maxmem }, (e, nokkel) =>
      e ? feil(e) : ok(nokkel),
    ),
  );
}

export async function krypter(data, passfrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const hode = Buffer.concat([
    MAGI,
    Buffer.from([VERSJON, SCRYPT.log2N, SCRYPT.r, SCRYPT.p]),
    salt,
    iv,
  ]);
  const nokkel = await avledNokkel(passfrase, salt, SCRYPT);
  try {
    const c = createCipheriv("aes-256-gcm", nokkel, iv);
    c.setAAD(hode);
    const innhold = Buffer.concat([c.update(data), c.final()]);
    return Buffer.concat([hode, innhold, c.getAuthTag()]);
  } finally {
    nokkel.fill(0);
  }
}

export async function dekrypter(fil, passfrase) {
  if (fil.length < MAGI.length || !fil.subarray(0, MAGI.length).equals(MAGI)) {
    throw new Error("Fila er ikke en kryptert sikkerhetskopi fra tilbudssystemet.");
  }
  if (fil.length < HODE + MERKE) {
    throw new Error("Fila er for kort til å være en hel sikkerhetskopi. Den er trolig avkortet.");
  }
  if (fil[6] !== VERSJON) {
    throw new Error(
      `Fila har formatversjon ${fil[6]}, men skriptet kan bare lese versjon ${VERSJON}.`,
    );
  }
  const valg = { log2N: fil[7], r: fil[8], p: fil[9] };
  if (!rimelig(valg)) {
    throw new Error(
      `Fila har urimelige scrypt-verdier i hodet (N = 2^${valg.log2N}, r = ${valg.r}, p = ${valg.p}). ` +
        "Den er skadet, eller ikke laget av dette skriptet.",
    );
  }
  const nokkel = await avledNokkel(passfrase, fil.subarray(10, 26), valg);
  try {
    const d = createDecipheriv("aes-256-gcm", nokkel, fil.subarray(26, HODE));
    d.setAAD(fil.subarray(0, HODE));
    d.setAuthTag(fil.subarray(fil.length - MERKE));
    return Buffer.concat([d.update(fil.subarray(HODE, fil.length - MERKE)), d.final()]);
  } catch {
    // GCM kan ikke skille feil nøkkel fra endret innhold; begge gir feil merke.
    throw new Error("Kunne ikke dekryptere: feil passordfrase, eller fila er skadet eller endret.");
  } finally {
    nokkel.fill(0);
  }
}

// Innholdet før kryptering: { tatt, kilde, tabeller: { navn: rader }, oversikt }.
export function pakk(innhold) {
  return gzipSync(Buffer.from(JSON.stringify({ format: FORMAT, ...innhold }), "utf8"));
}

export function pakkUt(data) {
  let innhold = null;
  try {
    innhold = JSON.parse(gunzipSync(data).toString("utf8"));
  } catch {
    // Fanges av sjekken under.
  }
  if (innhold?.format !== FORMAT || typeof innhold.tabeller !== "object") {
    throw new Error(
      "Innholdet har ukjent form, så dette er ikke en sikkerhetskopi fra tilbudssystemet.",
    );
  }
  return innhold;
}

// Lokal tid i begge ledd, til filnavnet: 2026-10-07_154512.
export function lagStempel(d) {
  const to = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${to(d.getMonth() + 1)}-${to(d.getDate())}_` +
    `${to(d.getHours())}${to(d.getMinutes())}${to(d.getSeconds())}`
  );
}

// Glemmes passordfrasen, kan ingen åpne kopiene. Da er det bedre å stoppe en
// frase som er lett å gjette eller lett å huske feil, før den tas i bruk.
export function sjekkNyPassfrase(passfrase) {
  if ([...passfrase].length < MINSTE_LENGDE) {
    throw new Error(
      `Passordfrasen må ha minst ${MINSTE_LENGDE} tegn. ` +
        "Fire eller fem tilfeldige ord er lett å huske og vanskelig å gjette.",
    );
  }
  if (passfrase !== passfrase.trim()) {
    throw new Error(
      "Passordfrasen begynner eller slutter med mellomrom. Det er lett å glemme når kopien " +
        "skal åpnes, så velg en uten.",
    );
  }
}

// Tar imot det terminalen sender i råmodus. Gir { tekst } mens det skrives, og
// { tekst, ferdig: true } eller { tekst: "", avbrutt: true } til slutt.
export function tastetrykk(tekst, biter) {
  const tegn = [...biter];
  for (let i = 0; i < tegn.length; i++) {
    const t = tegn[i];
    if (t === "\r" || t === "\n") return { tekst, ferdig: true };
    if (t === "\u0003") return { tekst: "", avbrutt: true };
    if (t === "\u007f" || t === "\b") tekst = [...tekst].slice(0, -1).join("");
    else if (t === "\u001b") i = sekvensensSlutt(tegn, i);
    else if (t >= " ") tekst += t;
  }
  return { tekst };
}

// Piltaster, F-taster og Alt+tast kommer som ESC fulgt av noen tegn. Ingen av
// dem skal bli en del av frasen. Gir indeksen til sekvensens siste tegn.
function sekvensensSlutt(tegn, i) {
  if (tegn[i + 1] === "O") return i + 2; // ESC O P: F1 i mange terminaler
  if (tegn[i + 1] !== "[") return i + 1; // Alt+tast, eller Esc alene
  if (tegn[i + 2] === "[") return i + 3; // ESC [ [ A: F1 i Windows-konsollen
  let j = i + 2;
  while (j < tegn.length && !(tegn[j] >= "@" && tegn[j] <= "~")) j++;
  return j;
}

function spørSkjult(spørsmål) {
  return new Promise((ok, feil) => {
    const inn = process.stdin;
    let tekst = "";
    const lytt = (biter) => {
      const s = tastetrykk(tekst, biter);
      tekst = s.tekst;
      if (!s.ferdig && !s.avbrutt) return;
      inn.off("data", lytt);
      inn.setRawMode(false);
      inn.pause();
      process.stderr.write("\n");
      if (s.avbrutt) feil(Object.assign(new Error("Avbrutt."), { kode: 130 }));
      else ok(tekst);
    };
    // Spørsmålene går til stderr, så stdout kan sendes videre som ren JSON.
    process.stderr.write(spørsmål);
    inn.setEncoding("utf8");
    inn.setRawMode(true);
    inn.on("data", lytt);
    inn.resume();
  });
}

// Fra miljøvariabelen, ellers spør vi uten å vise det som skrives. En ny frase
// må skrives to ganger, for en skrivefeil der gjør kopien umulig å åpne.
export async function hentPassfrase({ ny }) {
  const fraMiljo = process.env[MILJOVARIABEL];
  if (fraMiljo) {
    if (ny) sjekkNyPassfrase(fraMiljo);
    return fraMiljo;
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      `Fant ingen passordfrase. Sett ${MILJOVARIABEL}, eller kjør skriptet i PowerShell ` +
        "eller Windows Terminal, så blir du spurt.",
    );
  }
  if (!ny) return spørSkjult("Passordfrase: ");
  const passfrase = await spørSkjult(`Ny passordfrase for kopien (minst ${MINSTE_LENGDE} tegn): `);
  sjekkNyPassfrase(passfrase);
  if ((await spørSkjult("Skriv den én gang til: ")) !== passfrase) {
    throw new Error("Passordfrasene var ikke like.");
  }
  return passfrase;
}
