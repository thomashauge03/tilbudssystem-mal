import React from "react";
import { AbsoluteFill, random } from "remotion";
import { useBilde } from "../felles/Tempo";
import { inter } from "../fonter";
import { Bakgrunn, mellom, Rom } from "../felles/Scene";
import { useFormat } from "../format";
import { ease, farge } from "../tema";
import { Dokument, Epost, Lapp, PdfIkon, Regneark, Sms } from "../ui/Kaos";

type Ting = {
  t: number;
  x: number;
  y: number;
  z: number;
  rz: number;
  ry?: number;
  el: React.ReactNode;
};

const FASTE: Ting[] = [
  { t: 0, x: -430, y: -40, z: -100, rz: -6, ry: 12, el: <Dokument navn="Tilbud_Hansen_v3_ENDELIG.docx" /> },
  { t: 12, x: 440, y: -250, z: 60, rz: 3, el: <Sms tekst="Når kommer tilbudet?" /> },
  { t: 22, x: 380, y: 130, z: -250, rz: 5, ry: -14, el: <Regneark navn="Kalkyle_graving (2).xlsx" /> },
  { t: 34, x: -110, y: 270, z: 120, rz: -9, el: <Lapp tekst="Husk endring hos Berg!!" /> },
  {
    t: 44,
    x: -560,
    y: -300,
    z: 0,
    rz: 2,
    el: <Epost fra="Per Hansen" emne="SV: Re: Tilbud?" tekst="Hei! Har du fått sett på tilbudet? Vi må bestemme oss før helgen." />,
  },
  { t: 54, x: 90, y: -310, z: 150, rz: 0, el: <PdfIkon navn="Tilbud (3).pdf" /> },
  { t: 62, x: -700, y: 250, z: -150, rz: -3, el: <Sms tekst="Kan du sende det på nytt? Fant det ikke i innboksen" /> },
  { t: 70, x: 660, y: 330, z: 60, rz: 8, el: <Lapp tekst="Fakturere Lie??" storrelse={170} /> },
  { t: 78, x: 60, y: 60, z: -420, rz: 4, el: <Dokument navn="Endring_fjell_NY(1).docx" bredde={380} /> },
  { t: 86, x: 560, y: -30, z: 200, rz: -2, el: <Sms tekst="Hva kostet egentlig den ekstra sprengingen?" /> },
  { t: 92, x: -300, y: -250, z: -360, rz: -4, el: <Regneark navn="Timer_sept_FINAL.xlsx" bredde={420} /> },
  {
    t: 100,
    x: 250,
    y: 290,
    z: 250,
    rz: 1,
    el: <Epost fra="Ingrid Berg" emne="Endringen?" tekst="Snakket vi ikke om at dette var med i prisen?" bredde={360} />,
  },
  { t: 108, x: -830, y: -60, z: 100, rz: 6, el: <Lapp tekst="RING PER!" storrelse={150} /> },
  { t: 114, x: 780, y: -210, z: -100, rz: 0, el: <PdfIkon navn="Tilbud_final_v2.pdf" /> },
  { t: 120, x: -400, y: 390, z: 180, rz: -2, el: <Sms tekst="Er mva med i den summen?" /> },
  { t: 126, x: 300, y: -130, z: 300, rz: -7, el: <Lapp tekst="Fremdriftsplan til byggemøtet!!" storrelse={180} /> },
];

const LAPPER = ["Purre Hansen", "Kvittering??", "Pukk 16–32 pris?", "Timer uke 38", "Sende PDF", "Ny pris asfalt", "Svar Berg", "Endring #2?"];
const SMSER = ["Hei, noe nytt?", "Når starter dere?", "Fikk ikke vedlegget", "Kan vi ta en prat?", "Hvor mye blir det?", "Ok?"];

/** Siste takten før droppet: flere og flere ting, tettere og tettere. */
const EKSTRA: Ting[] = Array.from({ length: 16 }, (_, i) => {
  const t = 136 + i * 2.6;
  const r = (s: string) => random(`kaos-${i}-${s}`);
  const vinkel = r("v") * Math.PI * 2;
  const avstand = 250 + r("a") * 520;
  const lapp = i % 2 === 0;
  return {
    t,
    x: Math.cos(vinkel) * avstand * 1.5,
    y: Math.sin(vinkel) * avstand * 0.75,
    z: -300 + r("z") * 600,
    rz: (r("r") - 0.5) * 18,
    el: lapp ? <Lapp tekst={LAPPER[i % LAPPER.length]} storrelse={130 + r("s") * 40} /> : <Sms tekst={SMSER[i % SMSER.length]} />,
  };
});

const ALLE = [...FASTE, ...EKSTRA];

/**
 * Slik er det i dag: dokumenter, regneark, e-poster, SMS-er og lapper hoper
 * seg opp i takt med at musikken bygger seg opp, mens klokka går. På
 * slutten suges alt inn i ett rødt punkt — og det punktet blir logoen.
 */
export const Kaos: React.FC<{ varighet: number }> = ({ varighet }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const kollaps = varighet - 40;
  const k = mellom(frame, [kollaps, varighet - 6], [0, 1], ease.ut);
  const kamera = mellom(frame, [0, kollaps], [0, 1], ease.lineaer);

  // Klokka: fra 21:14 til nesten midnatt
  const minutter = 21 * 60 + 14 + Math.floor(mellom(frame, [0, kollaps], [0, 158]));
  const klokke = `${String(Math.floor(minutter / 60)).padStart(2, "0")}:${String(minutter % 60).padStart(2, "0")}`;

  const punkt = mellom(frame, [varighet - 18, varighet], [0, 1], ease.inn);
  const skalaFormat = liggende ? 1 : type === "feed" ? 0.78 : 0.62;

  const klokkeVisning = (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: liggende ? 56 : px(160) }}>
      <div
        style={{
          fontFamily: inter,
          fontSize: liggende ? 88 : px(96),
          fontWeight: 300,
          letterSpacing: "-0.03em",
          color: farge.hvit,
          fontVariantNumeric: "tabular-nums",
          opacity: mellom(frame, [2, 20], [0, 0.92]) * (1 - k),
          textShadow: "0 4px 30px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.8)",
        }}
      >
        {klokke}
      </div>
    </AbsoluteFill>
  );

  return (
    <Bakgrunn lys={0.25 + kamera * 0.25}>
      <Rom avstand={1800}>
        <AbsoluteFill
          style={{
            transformStyle: "preserve-3d",
            transform: `scale(${(1 + kamera * 0.12) * skalaFormat}) rotateX(${6 - kamera * 4}deg) rotateZ(${-1 + kamera * 2}deg)`,
          }}
        >
          {ALLE.map((ting, i) => {
            const d = frame - ting.t;
            if (d < 0) return null;
            const inn = mellom(d, [0, 14], [0, 1], ease.inn);
            const drift = d * 0.35;
            const retning = random(`drift-${i}`) - 0.5;
            // Suget: hver ting trekkes inn mot midten, de nærmeste litt senere
            const egen = mellom(frame, [kollaps + (i % 6) * 2, varighet - 4], [0, 1], ease.ut);
            const x = (ting.x + retning * drift * 2) * (1 - egen);
            const y = (ting.y - drift * 0.6) * (1 - egen);
            const z = ting.z * (1 - egen) - egen * 200;
            const skala = (0.82 + inn * 0.18) * (1 - egen * 0.97);
            // Dybdeskarphet: det som ligger langt bak, er litt uskarpt
            const dybde = Math.max(0, (-ting.z - 180) / 110);
            const blur = (1 - inn) * 10 + egen * 14 + dybde * (1 - egen);
            return (
              <AbsoluteFill key={i} style={{ alignItems: "center", justifyContent: "center", transformStyle: "preserve-3d" }}>
                <div
                  style={{
                    transform: `translate3d(${x}px, ${y}px, ${z}px) rotateY(${(ting.ry ?? 0) * (1 - egen)}deg) rotateZ(${ting.rz * (1 - egen) + egen * 40 * retning}deg) scale(${skala})`,
                    opacity: inn * (1 - mellom(egen, [0.75, 1], [0, 1])),
                    filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
                  }}
                >
                  {ting.el}
                </div>
              </AbsoluteFill>
            );
          })}
        </AbsoluteFill>
      </Rom>
      {klokkeVisning}
      {/* Det røde punktet alt forsvinner inn i */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: farge.rod,
            transform: `scale(${punkt})`,
            boxShadow: `0 0 ${30 + punkt * 50}px ${10 + punkt * 20}px rgba(227,2,19,${0.35 * punkt})`,
          }}
        />
      </AbsoluteFill>
    </Bakgrunn>
  );
};
