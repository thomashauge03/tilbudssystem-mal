// Rendrer alle versjonene av filmen og gjør dem klare til bruk.
//
//   node scripts/render.mjs                    alle
//   node scripts/render.mjs hovedfilm          bare hovedfilmen (4K, 1080p og messe)
//   node scripts/render.mjs feed staaende      bare kortversjonene
//
// Hver versjon rendres først til ProRes 4444 (høy presisjon), og kodes så til
// H.264 med innstillinger som tar vare på filmkornet. Rendrer Remotion rett til
// H.264, glatter koderen bort kornet, og de mørke fargeovergangene får
// trappetrinn.
//
// Lyden normaliseres til -14 LUFS med topper under -1,5 dBTP — det YouTube,
// Meta, LinkedIn og TikTok spiller av på. Uten det skrur plattformene selv
// ned, og ofte hardere enn nødvendig.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const UT = path.resolve("out/leveranse");
const RAA = path.resolve("out/raa");
mkdirSync(UT, { recursive: true });
mkdirSync(RAA, { recursive: true });

const kjor = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" && cmd === "npx" });

const remotion = (id, fil, ekstra = []) =>
  kjor("npx", ["remotion", "render", id, fil, "--codec=prores", "--prores-profile=4444", ...ekstra]);

const H264 = [
  "-c:v", "libx264", "-preset", "slow", "-tune", "grain", "-crf", "15",
  "-x264-params", "aq-mode=3", "-pix_fmt", "yuv420p",
];

// Bildene fra Remotion er BT.709, men kommer umerket ut av ProRes-fila. Uten
// merke kan avspillere som faller tilbake på BT.601 vise logoens rødfarge
// mørkere enn den er. setparams merker bildene, så koderen skriver det inn i
// videostrømmen; write_colr skriver det i MP4-beholderen (Safari/QuickTime).
const MERK_BT709 = "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709";

/** Måler lydstyrken (første omgang av loudnorm) og gir filteret for andre omgang. */
const lydfilter = (inn) => {
  // ffmpeg skriver målingen til stderr
  const { stderr } = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", inn, "-vn", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1));
  console.log(`  lyd: ${m.input_i} LUFS, topp ${m.input_tp} dBTP → -14 LUFS`);
  return [
    "loudnorm=I=-14:TP=-1.5:LRA=11",
    `measured_I=${m.input_i}`,
    `measured_TP=${m.input_tp}`,
    `measured_LRA=${m.input_lra}`,
    `measured_thresh=${m.input_thresh}`,
    `offset=${m.target_offset}`,
    "linear=true",
  ].join(":");
};

/** ProRes med lyd → ferdig MP4. `skala` gir en nedskalert versjon. */
const kod = (inn, ut, { skala, lyd = true } = {}) => {
  const args = ["-hide_banner", "-v", "error", "-stats", "-y", "-i", inn];
  args.push("-vf", [skala && `scale=${skala}:flags=lanczos`, MERK_BT709].filter(Boolean).join(","));
  args.push(...H264, "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709");
  if (lyd) args.push("-af", lydfilter(inn), "-ar", "48000", "-c:a", "aac", "-b:a", "320k");
  else args.push("-an");
  args.push("-movflags", "+faststart+write_colr", ut);
  kjor("ffmpeg", args);
};

const valgt = process.argv.slice(2);
const skal = (navn) => valgt.length === 0 || valgt.includes(navn);

if (skal("hovedfilm")) {
  console.log("\nHovedfilmen i 4K …");
  const raa = path.join(RAA, "hovedfilm-4k.mov");
  remotion("Hovedfilm", raa, ["--scale=2", "--concurrency=4"]);
  console.log("Koder 4K …");
  kod(raa, path.join(UT, "techauge-hovedfilm-4k.mp4"));
  console.log("Koder 1080p, skalert ned fra 4K …");
  kod(raa, path.join(UT, "techauge-hovedfilm-1080p.mp4"), { skala: "1920:1080" });
  console.log("Messeversjonen: 1080p uten lyd …");
  kod(raa, path.join(UT, "techauge-messe-uten-lyd-1080p.mp4"), { skala: "1920:1080", lyd: false });
  rmSync(raa);
}

for (const [navn, id, fil] of [
  ["feed", "Feed-16x9", "techauge-feed-16x9.mp4"],
  ["feed", "Feed-4x5", "techauge-feed-4x5.mp4"],
  ["staaende", "Staaende-9x16", "techauge-reels-9x16.mp4"],
]) {
  if (!skal(navn)) continue;
  console.log(`\n${id} …`);
  const raa = path.join(RAA, fil.replace(".mp4", ".mov"));
  remotion(id, raa, ["--concurrency=5"]);
  kod(raa, path.join(UT, fil));
  rmSync(raa);
}

console.log(`\nFerdig. Filene ligger i ${UT}`);
