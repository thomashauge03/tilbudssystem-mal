import { HOVEDFILM, HOVEDFILM_LENGDE, MUSIKKLIPP, sporBilde, TAKT } from "../tid";
import type { Plan } from "./Klipp";

/**
 * Planene for hver versjon. Alle klipp i musikken ligger på frasegrenser
 * (hver fjerde takt), og sluttslaget i sporet (takt 42) kommer etter en hel
 * frase — derfor kan man hoppe dit fra slutten av en hvilken som helst frase.
 */

const SLUTTSLAG = sporBilde(42);
/** Slagord og logo etter sluttslaget. Halen i sporet varer i ni sekunder. */
const SLUTTKORT = 196;

export const HOVEDFILM_PLAN: Plan = {
  lengde: HOVEDFILM_LENGDE,
  deler: (Object.keys(HOVEDFILM) as (keyof typeof HOVEDFILM)[]).map((scene) => ({
    scene,
    fra: HOVEDFILM[scene][0],
    til: HOVEDFILM[scene][1],
  })),
  musikk: [
    { film: 0, spor: 0, lengde: MUSIKKLIPP.film, ut: 4 },
    { film: MUSIKKLIPP.film, spor: MUSIKKLIPP.spor, lengde: HOVEDFILM_LENGDE - MUSIKKLIPP.film, ut: 70 },
  ],
};

/**
 * Feeden (LinkedIn, Facebook), 16:9 og 4:5, rundt 32 sekunder: åpning og
 * kaos på oppbyggingen, logoen på droppet, tilbud–signering–endring på
 * første halvdel av grooven, og slagord og logo på sluttslaget.
 */
const F0 = 0;
const feedDeler = (() => {
  const t = (n: number) => F0 + n * TAKT; // takter fra filmens start (sporets takt 2)
  return [
    { scene: "apning" as const, fra: t(0), til: t(1.5) },
    { scene: "kaos" as const, fra: t(1.5), til: t(3) },
    { scene: "logo" as const, fra: t(3), til: t(4), tempo: 1 },
    { scene: "tilbud" as const, fra: t(4), til: t(6) },
    { scene: "signering" as const, fra: t(6), til: t(8) },
    { scene: "endring" as const, fra: t(8), til: t(11) },
    { scene: "sluttKort" as const, fra: t(11), til: t(11) + SLUTTKORT, tempo: 1 },
  ];
})();

export const FEED_PLAN: Plan = {
  lengde: feedDeler[feedDeler.length - 1].til,
  deler: feedDeler,
  musikk: [
    { film: 0, spor: sporBilde(2), lengde: 11 * TAKT, inn: 6, ut: 4 },
    { film: 11 * TAKT, spor: SLUTTSLAG, lengde: SLUTTKORT, ut: 50 },
  ],
};

/**
 * Stående (Reels, TikTok, Shorts), under 30 sekunder og med telefonen i
 * front: åpning, logo, signering, varsel, endring, mobil, slagord og logo.
 */
const staaendeDeler = (() => {
  const t = (n: number) => n * TAKT; // takter fra filmens start (sporets takt 3)
  return [
    { scene: "apning" as const, fra: t(0), til: t(2) },
    { scene: "logo" as const, fra: t(2), til: t(3), tempo: 1 },
    { scene: "signering" as const, fra: t(3), til: t(5) },
    { scene: "varsel" as const, fra: t(5), til: t(6) },
    { scene: "endring" as const, fra: t(6), til: t(9) },
    { scene: "mobil" as const, fra: t(9), til: t(10), tempo: 1 },
    { scene: "sluttKort" as const, fra: t(10), til: t(10) + SLUTTKORT, tempo: 1 },
  ];
})();

export const STAAENDE_PLAN: Plan = {
  lengde: staaendeDeler[staaendeDeler.length - 1].til,
  deler: staaendeDeler,
  musikk: [
    { film: 0, spor: sporBilde(3), lengde: 10 * TAKT, inn: 6, ut: 4 },
    { film: 10 * TAKT, spor: SLUTTSLAG, lengde: SLUTTKORT, ut: 50 },
  ],
};
