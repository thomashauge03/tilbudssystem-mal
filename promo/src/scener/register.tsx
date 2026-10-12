import React from "react";
import { Sequence } from "remotion";
import { Tone } from "../felles/Scene";
import type { Signal } from "../lyd/Lydspor";
import { HOVEDFILM } from "../tid";
import { AnbudScene, AnbudSporsmal } from "./Anbudsscener";
import { Apning } from "./Apning";
import { Mobil, Slagord } from "./Avslutning";
import { Endring, ENDRING_TIDER } from "./Endring";
import { Kaos } from "./Kaos";
import { LogoScene } from "./LogoScene";
import { Fremdrift, OrdreScene } from "./Oversikt";
import { Produkt } from "./Produkt";
import { Signering, SIGNERING_TIDER } from "./Signering";
import { TILBUD_TIDER, TilbudScene } from "./TilbudScene";
import { Varsel, VARSEL_TIDER } from "./Varsel";

/**
 * Sluttkortet i kortversjonene: slagordet på sluttslaget, så logoen med
 * adresse. Hovedfilmen har de to som egne scener.
 */
export const SluttKort: React.FC<{ varighet: number }> = ({ varighet }) => (
  <>
    <Sequence durationInFrames={96} name="slagord">
      <Slagord varighet={96} andreLinje={22} />
    </Sequence>
    <Sequence from={90} durationInFrames={varighet - 90} name="logo">
      <Tone ut={24} varighet={varighet - 90}>
        <LogoScene varighet={varighet - 90} slutt taglineInn={30} adresseInn={38} />
      </Tone>
    </Sequence>
  </>
);

export type Scenenavn = keyof typeof HOVEDFILM | "sluttKort";

/** Scenene, med lengden de er skrevet for (den de har i hovedfilmen). */
export const SCENER: Record<Scenenavn, { standard: number; el: (varighet: number) => React.ReactNode }> = (() => {
  const std = (n: keyof typeof HOVEDFILM) => HOVEDFILM[n][1] - HOVEDFILM[n][0];
  return {
    apning: { standard: std("apning"), el: (v) => <Apning varighet={v} /> },
    kaos: { standard: std("kaos"), el: (v) => <Kaos varighet={v} /> },
    logo: { standard: std("logo"), el: (v) => <LogoScene varighet={v} /> },
    produkt: { standard: std("produkt"), el: (v) => <Produkt varighet={v} /> },
    tilbud: { standard: std("tilbud"), el: (v) => <TilbudScene varighet={v} /> },
    signering: { standard: std("signering"), el: (v) => <Signering varighet={v} /> },
    varsel: { standard: std("varsel"), el: (v) => <Varsel varighet={v} /> },
    endring: { standard: std("endring"), el: (v) => <Endring varighet={v} /> },
    fremdrift: { standard: std("fremdrift"), el: (v) => <Fremdrift varighet={v} /> },
    ordre: { standard: std("ordre"), el: (v) => <OrdreScene varighet={v} /> },
    anbudSporsmal: { standard: std("anbudSporsmal"), el: (v) => <AnbudSporsmal varighet={v} /> },
    anbud: { standard: std("anbud"), el: (v) => <AnbudScene varighet={v} /> },
    mobil: { standard: std("mobil"), el: (v) => <Mobil varighet={v} /> },
    slutt: { standard: std("slutt"), el: (v) => <Slagord varighet={v} /> },
    logoSlutt: {
      standard: std("logoSlutt"),
      el: (v) => (
        <Tone ut={26} varighet={v}>
          <LogoScene varighet={v} slutt />
        </Tone>
      ),
    },
    sluttKort: { standard: 196, el: (v) => <SluttKort varighet={v} /> },
  };
})();

const tast = (fra: number, til: number, antall: number, volum = 0.2): Signal[] =>
  Array.from({ length: antall }, (_, i) => ({
    lyd: (["tast1", "tast2", "tast3"] as const)[i % 3],
    ved: fra + ((til - fra) * i) / Math.max(1, antall - 1),
    volum: volum * (0.85 + ((i * 37) % 10) / 50),
  }));

const T = TILBUD_TIDER;
const S = SIGNERING_TIDER;
const E = ENDRING_TIDER;

/**
 * Lydeffektene til hver scene, i scenens egne bilder (før tempo). Negative
 * tider starter litt før scenen, så sveipet er i gang når bildet kommer.
 */
export const SCENE_LYD: Partial<Record<Scenenavn, Signal[]>> = {
  kaos: [{ lyd: "sug", ved: 216 - 45, volum: 0.55 }],
  logo: [{ lyd: "dunk", ved: 0, volum: 0.6 }],
  produkt: [{ lyd: "sveip", ved: -4, volum: 0.35 }],
  tilbud: [
    { lyd: "sveip", ved: -4, volum: 0.3 },
    ...tast(T.linjerFra + 4, T.linjerTil, 11),
    { lyd: "klikk", ved: T.klikk - 1, volum: 0.5 },
    { lyd: "sveip-kort", ved: T.pdf, volum: 0.4 },
  ],
  signering: [
    { lyd: "sveip", ved: -4, volum: 0.3 },
    ...tast(S.navnFra, S.navnTil, 9, 0.18),
    { lyd: "skrible", ved: S.signFra, volum: 0.3, varighet: S.signTil - S.signFra + 4 },
    { lyd: "klikk", ved: S.kryss, volum: 0.4 },
    { lyd: "klikk", ved: S.knapp, volum: 0.45 },
    { lyd: "pling", ved: S.ferdig + 4, volum: 0.5 },
  ],
  varsel: [{ lyd: "varsel", ved: VARSEL_TIDER.varsel, volum: 0.5 }],
  endring: [
    { lyd: "fjell", ved: 8, volum: 0.7 },
    { lyd: "sveip", ved: E.vinduInn - 2, volum: 0.28 },
    ...tast(E.linjerFra, E.linjerTil, 6, 0.18),
    { lyd: "klikk", ved: E.send - 1, volum: 0.5 },
    { lyd: "sveip-kort", ved: E.telefonInn, volum: 0.35 },
    { lyd: "skrible", ved: 162, volum: 0.25, varighet: 30 },
    { lyd: "klikk", ved: 196, volum: 0.35 },
    { lyd: "klikk", ved: 206, volum: 0.4 },
    { lyd: "laas", ved: E.signert + 4, volum: 0.5 },
    { lyd: "pling", ved: E.teller + 6, volum: 0.42 },
  ],
  fremdrift: [{ lyd: "sveip", ved: -4, volum: 0.28 }],
  anbud: [{ lyd: "dunk", ved: 0, volum: 0.45 }],
  mobil: [{ lyd: "sveip", ved: -4, volum: 0.3 }],
  logoSlutt: [{ lyd: "glimt", ved: 0, volum: 0.35 }],
  sluttKort: [{ lyd: "glimt", ved: 90, volum: 0.35 }],
};
