import React from "react";
import { useBilde } from "../felles/Tempo";
import { Bakgrunn, mellom, Plassering, Rom } from "../felles/Scene";
import { Tittel } from "../felles/Tekst";
import { Telefon } from "../felles/Telefon";
import { useFormat } from "../format";
import { ease } from "../tema";
import { MobilOversikt } from "../ui/MobilOversikt";
import { EpostVarsel, Tilbudsliste } from "../ui/Tilbudsliste";
import { Vindu } from "../ui/Vindu";

export const VARSEL_TIDER = { varsel: 6, godkjent: 20 } as const;

/**
 * Et kort slag: varselet glir inn, og tilbudet går fra «Sendt» til
 * «Godkjent». I stående format kommer varselet på telefonen i stedet.
 */
export const Varsel: React.FC<{ varighet: number }> = ({ varighet }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const T = VARSEL_TIDER;
  const varsel = mellom(frame, [T.varsel, T.varsel + 16], [0, 1], ease.inn);
  const godkjent = mellom(frame, [T.godkjent, T.godkjent + 18], [0, 1], ease.lineaer);
  const ut = mellom(frame, [varighet - 8, varighet], [0, 1], ease.ut);
  const glid = mellom(frame, [0, varighet], [0, 1], ease.myk);

  if (!liggende) {
    return (
      <Bakgrunn lys={0.8} y={62}>
        <Rom avstand={2200}>
          <Plassering y={px(250)} ry={-6 + glid * 6} rx={4} skala={px(1.25)} opacity={1 - ut}>
            <Telefon
              klokke="19:42"
              over={
                <div style={{ position: "absolute", top: 60, left: 12, transform: `translateY(${(1 - varsel) * -140}px)`, opacity: varsel, zIndex: 30 }}>
                  <EpostVarsel bredde={369} />
                </div>
              }
            >
              <MobilOversikt />
            </Telefon>
          </Plassering>
        </Rom>
        <div style={{ position: "absolute", top: px(150), width: "100%", padding: `0 ${px(60)}px` }}>
          <Tittel tekst={"Du får beskjed\nmed en gang."} inn={2} ut={varighet - 10} storrelse={px(84)} />
        </div>
      </Bakgrunn>
    );
  }

  return (
    <Bakgrunn lys={0.8}>
      <Rom avstand={2600}>
        <Plassering y={150} z={-glid * 40} rx={9} ry={-8 + glid * 6} skala={0.96} opacity={1 - ut}>
          <Vindu bredde={1480} hoyde={760} zoom={1.12} aktiv="Tilbud">
            <Tilbudsliste godkjent={godkjent} />
          </Vindu>
        </Plassering>
        <Plassering x={560 + (1 - varsel) * 520} y={-150} z={220} opacity={varsel * (1 - ut)} blur={(1 - varsel) * 8}>
          <div style={{ zoom: 1.25 }}>
            <EpostVarsel bredde={440} />
          </div>
        </Plassering>
      </Rom>
      <div style={{ position: "absolute", top: 64, left: 150 }}>
        <Tittel tekst="Du får beskjed med en gang." inn={2} ut={varighet - 10} storrelse={76} justering="left" />
      </div>
    </Bakgrunn>
  );
};
