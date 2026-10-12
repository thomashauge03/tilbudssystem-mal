import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { useBilde } from "../felles/Tempo";
import { endringSum, nok, tilbudSum } from "../data";
import { inter } from "../fonter";
import { Musepeker } from "../felles/Peker";
import { Bakgrunn, mellom, Plassering, Rom } from "../felles/Scene";
import { Tittel } from "../felles/Tekst";
import { Telefon } from "../felles/Telefon";
import { useFormat } from "../format";
import { ease, farge } from "../tema";
import { Endringsmelding } from "../ui/Endringsmelding";
import { Vindu } from "../ui/Vindu";
import { SigneringFinger, SigneringSkjerm, SigneringTider } from "./Signering";

export const ENDRING_TIDER = {
  kortUt: 44,
  vinduInn: 48,
  linjerFra: 84,
  linjerTil: 108,
  send: 122,
  telefonInn: 136,
  telefonUt: 240,
  signert: 226,
  teller: 250,
} as const;

// Kunden signerer endringen raskere enn tilbudet: navnet står der allerede.
const TELEFON: SigneringTider = {
  rullFra: -20,
  rullTil: -10,
  navnFra: -12,
  navnTil: -8,
  signFra: 162,
  signTil: 190,
  kryss: 196,
  knapp: 206,
  ferdig: 212,
};

/** Den lille kortet som viser at ordreverdien har vokst */
const Ordreverdi: React.FC<{ verdi: number; pluss: number; synlig: number }> = ({ verdi, pluss, synlig }) => (
  <div
    style={{
      fontFamily: inter,
      borderRadius: 24,
      padding: "22px 28px",
      background: "rgba(28,28,30,0.72)",
      backdropFilter: "blur(30px) saturate(1.4)",
      boxShadow: "0 30px 80px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.10)",
      color: farge.hvit,
      opacity: synlig,
      transform: `translateY(${(1 - synlig) * 30}px) scale(${0.96 + synlig * 0.04})`,
      minWidth: 440,
    }}
  >
    <div style={{ fontSize: 20, color: farge.gra, fontWeight: 500 }}>Total ordreverdi</div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 4 }}>
      <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{nok(Math.round(verdi))}</div>
    </div>
    <div
      style={{
        display: "inline-block",
        marginTop: 10,
        fontSize: 20,
        fontWeight: 600,
        color: farge.gronn,
        background: "rgba(48,209,88,0.14)",
        borderRadius: 999,
        padding: "4px 14px",
        opacity: pluss,
      }}
    >
      + {nok(endringSum)} i endringer
    </div>
  </div>
);

/**
 * Pengene: «Traff fjell i grøfta» — et krav om endring skrives, sendes,
 * signeres av kunden på mobilen og låses. Ordreverdien teller opp. Ingen
 * krangel etterpå.
 */
export const Endring: React.FC<{ varighet: number }> = ({ varighet }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const T = ENDRING_TIDER;

  const kortUt = mellom(frame, [T.kortUt, T.kortUt + 12], [0, 1], ease.ut);
  const vindu = mellom(frame, [T.vinduInn, T.vinduInn + 32], [0, 1], ease.inn);
  const linjer = interpolate(frame, [T.linjerFra, T.linjerTil], [0, 2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sendt = mellom(frame, [T.send + 2, T.send + 12], [0, 1]);
  const signert = mellom(frame, [T.signert, T.signert + 16], [0, 1]);
  const telefonInn = mellom(frame, [T.telefonInn, T.telefonInn + 22], [0, 1], ease.inn);
  const telefonUt = mellom(frame, [T.telefonUt, T.telefonUt + 20], [0, 1], ease.ut);
  const teller = mellom(frame, [T.teller, T.teller + 28], [0, 1], ease.inn);
  const kortInn = mellom(frame, [T.teller - 8, T.teller + 10], [0, 1], ease.inn);
  const glid = mellom(frame, [T.vinduInn, varighet], [0, 1], ease.myk);
  const ut = mellom(frame, [varighet - 10, varighet], [0, 1], ease.ut);

  const vb = 1440;
  const vh = 860;
  const sendX = vb - 32 - 78;
  const sendY = 60 + 28 + 18;

  return (
    <Bakgrunn lys={0.75} rodt={frame < T.kortUt + 10}>
      {/* Tittelkortet */}
      {kortUt < 1 && (
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: liggende ? 10 : px(16),
            opacity: 1 - kortUt,
            filter: kortUt > 0 ? `blur(${kortUt * 10}px)` : undefined,
          }}
        >
          <Tittel tekst="~Tirsdag kl. 09.12~" inn={2} storrelse={liggende ? 46 : px(52)} vekt={500} sperring="-0.01em" modus="samlet" />
          <Tittel
            tekst={liggende ? "Traff fjell i grøfta." : "Traff fjell\ni grøfta."}
            inn={8}
            storrelse={liggende ? 124 : px(120)}
            stagger={5}
            varighet={26}
          />
        </AbsoluteFill>
      )}

      <Rom avstand={2600}>
        {vindu > 0 && (
          <Plassering
            x={liggende ? -40 : 0}
            y={(liggende ? 150 : type === "feed" ? px(170) : px(-20)) + (1 - vindu) * 520}
            z={-glid * 80 - telefonInn * (1 - telefonUt) * 140}
            rx={9 + (1 - vindu) * 24}
            ry={9 - glid * 7}
            skala={liggende ? 1 : (px(1080) / vb) * 0.96}
            opacity={vindu * (1 - ut) * (1 - telefonInn * (1 - telefonUt) * 0.35)}
            blur={(1 - vindu) * 14}
          >
            <Vindu
              bredde={vb}
              hoyde={vh}
              zoom={1.04}
              aktiv="Endringsmeldinger"
              over={
                <Musepeker
                  rute={[
                    { f: T.send - 24, x: vb - 300, y: vh - 200 },
                    { f: T.send - 2, x: sendX / 1.04, y: sendY },
                    { f: T.send + 26, x: sendX / 1.04 - 60, y: sendY + 120 },
                  ]}
                  klikk={[T.send]}
                  synligFra={T.send - 24}
                  synligTil={T.send + 30}
                />
              }
            >
              <Endringsmelding
                linjer={linjer}
                sendt={sendt}
                signert={signert}
                sendTrykk={mellom(frame, [T.send - 2, T.send + 1, T.send + 6], [0, 1, 0])}
              />
            </Vindu>
          </Plassering>
        )}
        {telefonInn > 0 && telefonUt < 1 && (
          <Plassering
            x={(liggende ? 560 : type === "feed" ? px(250) : 0) + (1 - telefonInn) * 900 + telefonUt * 900}
            y={liggende ? 60 : type === "feed" ? px(180) : px(470)}
            z={120}
            rx={3}
            ry={-14}
            rz={(1 - telefonInn) * 8 - telefonUt * 8}
            skala={liggende ? 0.92 : type === "feed" ? px(0.8) : px(1.12)}
          >
            <Telefon klokke="09:30" over={<SigneringFinger tider={TELEFON} />}>
              <SigneringSkjerm dokument="endring" tider={TELEFON} startRullet />
            </Telefon>
          </Plassering>
        )}
      </Rom>

      {kortInn > 0 && (
        <div
          style={
            liggende
              ? { position: "absolute", left: 150, bottom: 90, zIndex: 20 }
              : { position: "absolute", left: "50%", bottom: type === "feed" ? px(90) : px(420), transform: "translateX(-50%)", zIndex: 20, zoom: px(1.15) }
          }
        >
          <Ordreverdi verdi={tilbudSum + endringSum * teller} pluss={mellom(frame, [T.teller + 6, T.teller + 18], [0, 1])} synlig={kortInn * (1 - ut)} />
        </div>
      )}

      {frame > T.kortUt && (
        <div style={{ position: "absolute", top: liggende ? 64 : px(150), left: liggende ? 150 : 0, right: liggende ? undefined : 0, padding: liggende ? 0 : `0 ${px(60)}px` }}>
          <Tittel
            tekst={liggende ? "Kunden signerer endringen\nfør du graver videre." : "Kunden signerer\nendringen før du\ngraver videre."}
            inn={T.kortUt + 20}
            ut={varighet - 12}
            storrelse={liggende ? 60 : px(76)}
            justering={liggende ? "left" : "center"}
          />
        </div>
      )}
    </Bakgrunn>
  );
};
