import React from "react";
import { Audio } from "@remotion/media";
import { interpolate, Sequence, staticFile } from "remotion";

export const MUSIKK = staticFile("musikk/showreel.mp3");

export type Lyd =
  | "sveip"
  | "sveip-kort"
  | "klikk"
  | "tast1"
  | "tast2"
  | "tast3"
  | "pling"
  | "varsel"
  | "dunk"
  | "sug"
  | "fjell"
  | "laas"
  | "skrible"
  | "glimt";

export type Signal = { lyd: Lyd; ved: number; volum: number; varighet?: number };

/** En lydeffekt på et bestemt bilde. */
export const Effekt: React.FC<Signal> = ({ lyd, ved, volum, varighet }) => (
  <Sequence from={Math.max(0, Math.round(ved))} durationInFrames={varighet} layout="none" name={`lyd: ${lyd}`}>
    <Audio src={staticFile(`lyd/${lyd}.wav`)} volume={volum} />
  </Sequence>
);

/** Et stykke av musikksporet lagt på filmen: fra et bilde i sporet, på et bilde i filmen. */
export type Musikkbit = {
  /** Bildet i filmen der biten begynner */
  film: number;
  /** Bildet i sporet biten starter fra */
  spor: number;
  lengde: number;
  /** Bilder med inntoning i starten (0 = full styrke fra første bilde) */
  inn?: number;
  /** Bilder med uttoning på slutten */
  ut?: number;
};

/**
 * Musikken som en rekke biter. Klippene ligger på takter, så hver bit starter
 * på full styrke (slaget på takten beholdes), og biten før toner ut de siste
 * bildene så det ikke smeller i overgangen.
 */
export const Musikk: React.FC<{ biter: Musikkbit[]; volum?: number }> = ({ biter, volum = 0.9 }) => (
  <>
    {biter.map((b, i) => (
      <Sequence key={i} from={b.film} durationInFrames={b.lengde} layout="none" name={`musikk ${i + 1}`}>
        <Audio
          src={MUSIKK}
          trimBefore={b.spor}
          trimAfter={b.spor + b.lengde}
          volume={(f) =>
            volum *
            Math.min(
              b.inn ? interpolate(f, [0, b.inn], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1,
              b.ut ? interpolate(f, [b.lengde - b.ut, b.lengde], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1,
            )
          }
        />
      </Sequence>
    ))}
  </>
);
