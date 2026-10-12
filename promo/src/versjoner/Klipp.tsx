import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Korn } from "../felles/Korn";
import { Tempo } from "../felles/Tempo";
import { Effekt, Musikk, Musikkbit, Signal } from "../lyd/Lydspor";
import { SCENE_LYD, SCENER, Scenenavn } from "../scener/register";

export type Del = {
  scene: Scenenavn;
  fra: number;
  til: number;
  /**
   * Hvor fort scenen spilles. Utelatt: scenen presses inn i plassen den har
   * (lengden den er skrevet for delt på plassen). Oppgitt: scenen spilles i
   * det tempoet og kuttes der plassen slutter.
   */
  tempo?: number;
};

export type Plan = { deler: Del[]; musikk: Musikkbit[]; lengde: number };

const tempoFor = (d: Del) => d.tempo ?? SCENER[d.scene].standard / (d.til - d.fra);

/** Lydeffektene til scenene i en plan, flyttet til filmens bilder og justert for tempo. */
export const effekterFor = (plan: Plan): Signal[] =>
  plan.deler.flatMap((d) => {
    const tempo = tempoFor(d);
    return (SCENE_LYD[d.scene] ?? [])
      .map((s) => ({ ...s, ved: d.fra + s.ved / tempo, varighet: s.varighet ? Math.round(s.varighet / tempo) : undefined }))
      .filter((s) => s.ved < d.til);
  });

/**
 * En versjon av filmen bygget fra en plan: scenene etter hverandre i sitt
 * tempo, musikkbitene under, og lydeffektene der scenene sier de skal være.
 */
export const Klipp: React.FC<{ plan: Plan; medLyd?: boolean }> = ({ plan, medLyd = true }) => (
  <AbsoluteFill style={{ background: "#000" }}>
    {plan.deler.map((d) => {
      const tempo = tempoFor(d);
      const plass = d.til - d.fra;
      return (
        <Sequence key={`${d.scene}-${d.fra}`} name={d.scene} from={d.fra} durationInFrames={plass}>
          <Tempo tempo={tempo}>{SCENER[d.scene].el(Math.round(plass * tempo))}</Tempo>
        </Sequence>
      );
    })}
    <Korn />
    {medLyd && (
      <>
        <Musikk biter={plan.musikk} />
        {effekterFor(plan).map((s, i) => (
          <Effekt key={i} {...s} />
        ))}
      </>
    )}
  </AbsoluteFill>
);
