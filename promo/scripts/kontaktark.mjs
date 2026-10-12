// Renderer utvalgte bilder fra en komposisjon og setter dem sammen til ett
// kontaktark, så man kan se flyten i en scene uten å rendre hele filmen.
//
//   node scripts/kontaktark.mjs Hovedfilm 60 140 260 350 [--skala=0.5] [--kolonner=3] [--ut=navn]
//
// Bildene havner i out/stillbilder/, arket i out/<navn>.png.
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flagg = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const [komposisjon, ...rammer] = args.filter((a) => !a.startsWith("--"));
const skala = Number(flagg.skala ?? 0.5);
const kolonner = Number(flagg.kolonner ?? 3);
const navn = flagg.ut ?? `ark-${komposisjon}`;

const mappe = path.resolve("out/stillbilder");
mkdirSync(mappe, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const nettleser = await openBrowser("chrome", { chromiumOptions: { gl: "angle" } });
const comp = await selectComposition({ serveUrl, id: komposisjon, puppeteerInstance: nettleser });

const filer = [];
for (const r of rammer) {
  const fil = path.join(mappe, `${komposisjon}-${String(r).padStart(5, "0")}.png`);
  await renderStill({ composition: comp, serveUrl, output: fil, frame: Number(r), scale: skala, puppeteerInstance: nettleser, imageFormat: "png" });
  filer.push(fil);
  process.stdout.write(`bilde ${r} `);
}
await nettleser.close({ silent: true });

// Kontaktark med ffmpeg: rammenummeret skrives nederst i hvert bilde.
const liste = path.join(mappe, "liste.txt");
writeFileSync(liste, filer.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
const rader = Math.ceil(filer.length / kolonner);
const bredde = Math.round(comp.width * skala);
execFileSync("ffmpeg", [
  "-v", "error", "-y",
  "-f", "concat", "-safe", "0", "-i", liste,
  "-vf", `scale=${Math.min(bredde, 640)}:-2,tile=${kolonner}x${rader}:padding=6:color=0x333333`,
  "-frames:v", "1",
  path.resolve(`out/${navn}.png`),
]);
console.log(`\nark: out/${navn}.png (${rammer.join(", ")})`);
