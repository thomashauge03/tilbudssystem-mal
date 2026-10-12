/**
 * Filmen går i takt med musikken. Sporet ligger på nøyaktig 100 BPM
 * (scripts/takt.py), og ved 30 bilder i sekundet blir det 18 bilder per slag
 * og 72 per takt — så alle klipp kan ligge på hele bilder, uten avrunding.
 *
 * Takt 0 starter 0,705 s inn i sporet, etter et opptaktsslag. Oppbygningen:
 *   takt 0–4    intro, bygger seg opp
 *   takt 5      grooven slår inn (12,70 s)
 *   takt 16     melodien kommer inn (39,10 s)
 *   takt 21–25  pausen, med stigning mot slutten (51,10–63,10 s)
 *   takt 26     grooven tilbake (63,10 s)
 *   takt 42     siste slag (101,50 s), så en hale på ni sekunder
 */
export const FPS = 30;
export const SLAG = 18;
export const TAKT = 72;

/** Sekunder i sporet der takt 0 begynner. */
export const TAKT0_SEK = 0.705;

/** Bildet i sporet (fra sporets start) der en takt begynner. */
export const sporBilde = (takt: number) => Math.round(TAKT0_SEK * FPS) + takt * TAKT;

/** Sekunder → bilder. */
export const sek = (s: number) => Math.round(s * FPS);

/** Bildet i hovedfilmen der takt n begynner (filmen starter samtidig med sporet). */
export const takt = (n: number) => sporBilde(n);

/**
 * Hovedfilmen, scene for scene, i takter. Etter takt 30 hopper musikken fra
 * takt 30 til takt 38 i sporet (begge starter en frase på fire takter), så
 * sluttslaget i sporet (takt 42) havner på filmens takt 34.
 */
export const HOVEDFILM = {
  apning: [0, takt(2)],
  kaos: [takt(2), takt(5)],
  logo: [takt(5), takt(7)],
  produkt: [takt(7), takt(9)],
  tilbud: [takt(9), takt(12)],
  signering: [takt(12), takt(15)],
  varsel: [takt(15), takt(16)],
  endring: [takt(16), takt(20)],
  fremdrift: [takt(20), takt(21)],
  ordre: [takt(21), takt(23)],
  anbudSporsmal: [takt(23), takt(26)],
  anbud: [takt(26), takt(29)],
  mobil: [takt(29), takt(31)],
  slutt: [takt(31), takt(34)],
  logoSlutt: [takt(34), takt(34) + 150],
} as const;

/** Der musikken klippes: filmens takt 30 fortsetter med sporets takt 38. */
export const MUSIKKLIPP = { film: takt(30), spor: sporBilde(38) } as const;

export const HOVEDFILM_LENGDE = HOVEDFILM.logoSlutt[1];
