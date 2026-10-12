import React from "react";
import { interpolate } from "remotion";
import { useBilde } from "../felles/Tempo";
import { FunksjonTekst } from "../felles/Funksjon";
import { FINGER, Fingertrykk } from "../felles/Peker";
import { Bakgrunn, mellom, Plassering, Rom } from "../felles/Scene";
import { signaturTilstand } from "../felles/Signatur";
import { Telefon } from "../felles/Telefon";
import { useFormat } from "../format";
import { ease } from "../tema";
import { SIGNATUR_BREDDE, Signeringsside } from "../ui/Signeringsside";

/** Tidene i signeringen, i bilder fra starten av sekvensen. */
export type SigneringTider = {
  rullFra: number;
  rullTil: number;
  navnFra: number;
  navnTil: number;
  signFra: number;
  signTil: number;
  kryss: number;
  knapp: number;
  ferdig: number;
};

export const SIGNERING_TIDER: SigneringTider = {
  rullFra: 30,
  rullTil: 58,
  navnFra: 62,
  navnTil: 84,
  signFra: 90,
  signTil: 132,
  kryss: 140,
  knapp: 154,
  ferdig: 162,
};

// Hvor ting står på signeringssiden etter at den er rullet ned (se
// Signeringsside): signaturfeltet og avkrysningen, i skjermpunkter.
export const RULL = 470;
const FELT = { x: 16 + 20 + 2, y: 698 - RULL + 2 };
const KRYSS = { x: 16 + 20 + 12 + 10, y: 817 - RULL + 12 + 10 };
const KNAPP = { x: 196, y: 921 - RULL + 22 };

/**
 * Telefonskjermen under signeringen, med fingeren som tegner. Brukes både i
 * signeringsscenen og når kunden signerer endringen.
 */
export const SigneringSkjerm: React.FC<{ dokument?: "tilbud" | "endring"; tider: SigneringTider; startRullet?: boolean }> = ({
  dokument = "tilbud",
  tider: T,
  startRullet = false,
}) => {
  const frame = useBilde();
  const rull = startRullet ? RULL : mellom(frame, [T.rullFra, T.rullTil], [0, RULL], ease.myk);
  const navnTegn = interpolate(frame, [T.navnFra, T.navnTil], [0, 13], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const signatur = mellom(frame, [T.signFra, T.signTil], [0, 1], ease.myk);
  const ferdig = mellom(frame, [T.ferdig, T.ferdig + 12], [0, 1], ease.inn);

  return (
    <Signeringsside
      dokument={dokument}
      rull={rull}
      navnTegn={navnTegn}
      navnFokus={frame >= T.navnFra - 4 && frame < T.signFra - 2}
      signatur={signatur}
      avkrysset={frame >= T.kryss + 2}
      knappTrykk={mellom(frame, [T.knapp - 2, T.knapp + 1, T.knapp + 6], [0, 1, 0])}
      ferdig={ferdig}
      hake={mellom(frame, [T.ferdig + 4, T.ferdig + 30], [0, 1], ease.myk)}
    />
  );
};

export const SigneringFinger: React.FC<{ tider: SigneringTider }> = ({ tider: T }) => {
  const frame = useBilde();
  const signatur = mellom(frame, [T.signFra, T.signTil], [0, 1], ease.myk);
  const { spiss } = signaturTilstand(signatur);
  const skala = SIGNATUR_BREDDE / 600;
  const tegner = frame >= T.signFra - 4 && frame <= T.signTil + 6 && spiss;
  return (
    <>
      {tegner && spiss && (
        <div
          style={{
            position: "absolute",
            left: FELT.x + spiss.x * skala - 22,
            top: FELT.y + spiss.y * skala - 22,
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: FINGER.bakgrunn,
            border: FINGER.kant,
            boxShadow: FINGER.skygge,
            zIndex: 40,
          }}
        />
      )}
      <Fingertrykk x={KRYSS.x} y={KRYSS.y} ved={T.kryss} />
      <Fingertrykk x={KNAPP.x} y={KNAPP.y} ved={T.knapp} />
    </>
  );
};

/**
 * Kunden signerer på mobilen: siden rulles ned, navnet skrives, fingeren
 * tegner signaturen, boksen krysses av og knappen trykkes — og haken lyser.
 */
export const Signering: React.FC<{ varighet: number }> = ({ varighet }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const T = SIGNERING_TIDER;
  const inn = mellom(frame, [0, 32], [0, 1], ease.inn);
  const glid = mellom(frame, [0, varighet], [0, 1], ease.myk);
  const ut = mellom(frame, [varighet - 10, varighet], [0, 1], ease.ut);
  const suksess = mellom(frame, [T.ferdig, T.ferdig + 24], [0, 1], ease.inn);

  return (
    <Bakgrunn lys={0.7 + suksess * 0.3} x={liggende ? 66 : 50} y={liggende ? 50 : 62}>
      {/* Et grønt skjær bak telefonen når signaturen er i boks */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 30% 45% at ${liggende ? 66 : 50}% ${liggende ? 52 : 62}%, rgba(48,209,88,${0.16 * suksess}), rgba(0,0,0,0) 70%)`,
        }}
      />
      <Rom avstand={2200}>
        <Plassering
          x={liggende ? 360 : 0}
          y={(liggende ? 10 : type === "feed" ? px(190) : px(260)) + (1 - inn) * 700}
          z={-glid * 30}
          rx={4}
          ry={(liggende ? -16 : -8) + glid * 8}
          rz={(1 - inn) * 10 + 1.5 - glid * 2}
          skala={liggende ? 1.02 : type === "feed" ? px(0.95) : px(1.42)}
          opacity={inn * (1 - ut)}
          blur={(1 - inn) * 10}
        >
          <Telefon over={<SigneringFinger tider={T} />}>
            <SigneringSkjerm tider={T} />
          </Telefon>
        </Plassering>
      </Rom>
      <FunksjonTekst
        etikett="Signering"
        tittel={"Kunden signerer\nrett på mobilen."}
        tittelStaaende={"Kunden signerer\nrett på mobilen."}
        inn={8}
        ut={varighet - 12}
      />
    </Bakgrunn>
  );
};
