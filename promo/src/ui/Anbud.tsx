import React from "react";
import { interpolate } from "remotion";
import { nok } from "../data";
import { app, ease } from "../tema";
import { Kort, Sidetittel } from "./deler";

/**
 * Anbudsprotokollene (src/routes/anbud.tsx). Konkurrentnavnene er oppdiktet
 * og sjekket mot Brønnøysundregistrene — en reklame skal ikke sette tall på
 * ekte firmaer.
 */
const KONKURRENTER = [
  { navn: "Tindrud Anlegg", pst: -2.4 },
  { navn: "Kvernvik Graving", pst: 5.1 },
  { navn: "Lysefjell Maskin", pst: 3.2 },
  { navn: "Bratvik Graving", pst: -0.9 },
  { navn: "Nordaas Anlegg", pst: 8.6 },
];

const UTVIKLING = [
  { navn: "Gangvei", v: 7.8 },
  { navn: "Boligfelt", v: 6.1 },
  { navn: "VA-anlegg", v: 6.9 },
  { navn: "Skolegård", v: 4.2 },
  { navn: "Parkering", v: 3.6 },
  { navn: "Kryss", v: 0 },
  { navn: "Rundkjøring", v: 2.1 },
  { navn: "Kai", v: 0 },
];

const DUELL = [3.1, 5.6, -1.2, 4.4, 6.8, 2.9, 7.3, 5.0, 4.1];

const klamp = (v: number, a: number, b: number, easing = ease.inn) =>
  interpolate(v, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

const Stat: React.FC<{ etikett: string; verdi: React.ReactNode; hint: string; farge?: string }> = ({ etikett, verdi, hint, farge }) => (
  <Kort>
    <div style={{ fontSize: 14, color: app.dempetTekst }}>{etikett}</div>
    <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700, color: farge, fontVariantNumeric: "tabular-nums" }}>{verdi}</div>
    <div style={{ marginTop: 4, fontSize: 12, color: app.dempetTekst }}>{hint}</div>
  </Kort>
);

const pst = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;

/** Søylediagram med null-linje, rødt under null og grønt over, slik appen tegner det */
const Soyler: React.FC<{ data: { navn: string; pst: number }[]; tegnet: number; bredde: number; hoyde: number; etiketter?: boolean }> = ({
  data,
  tegnet,
  bredde,
  hoyde,
  etiketter = true,
}) => {
  const maks = 10;
  const venstre = 36;
  const bunn = etiketter ? 46 : 12;
  const h = hoyde - bunn - 8;
  const null0 = 8 + h * (maks / (maks + 4));
  const skala = (v: number) => (v / (maks + 4)) * h;
  const w = (bredde - venstre - 8) / data.length;
  return (
    <svg width={bredde} height={hoyde} style={{ display: "block", overflow: "visible" }}>
      {[-4, 0, 5, 10].map((t) => (
        <g key={t}>
          <line x1={venstre} x2={bredde - 8} y1={null0 - skala(t)} y2={null0 - skala(t)} stroke={app.kant} strokeDasharray={t === 0 ? undefined : "3 3"} />
          <text x={venstre - 6} y={null0 - skala(t) + 4} fontSize="11" textAnchor="end" fill={app.dempetTekst}>
            {t} %
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const p = klamp(tegnet, i * 0.08, i * 0.08 + 0.5);
        const v = skala(d.pst) * p;
        const x = venstre + i * w + w * 0.18;
        return (
          <g key={d.navn}>
            <rect
              x={x}
              y={v >= 0 ? null0 - v : null0}
              width={w * 0.64}
              height={Math.abs(v)}
              rx={2}
              fill={d.pst < 0 ? "#dc2626" : "#16a34a"}
            />
            {etiketter && (
              <text
                x={x + w * 0.32}
                y={hoyde - bunn + 18}
                fontSize="10.5"
                fill={app.dempetTekst}
                textAnchor="end"
                transform={`rotate(-20 ${x + w * 0.32} ${hoyde - bunn + 18})`}
              >
                {d.navn}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export const Anbud: React.FC<{ tegnet?: number; tall?: number }> = ({ tegnet = 1, tall = 1 }) => {
  const linje = klamp(tegnet, 0.05, 0.75, ease.myk);
  const lb = 560;
  const lh = 200;
  const pts = UTVIKLING.map((d, i) => ({
    x: 36 + (i / (UTVIKLING.length - 1)) * (lb - 50),
    y: 8 + (1 - d.v / 10) * (lh - 54),
  }));
  const synligeUt = Math.max(1, linje * (pts.length - 1));
  const sti = pts
    .filter((_, i) => i <= Math.ceil(synligeUt))
    .map((p, i, a) => {
      if (i === a.length - 1 && i > synligeUt) {
        const forrige = pts[i - 1];
        const t = synligeUt - (i - 1);
        return `L${forrige.x + (p.x - forrige.x) * t} ${forrige.y + (p.y - forrige.y) * t}`;
      }
      return `${i ? "L" : "M"}${p.x} ${p.y}`;
    })
    .join(" ");

  return (
    <div>
      <Sidetittel tittel="Anbudsprotokoller" under="Hva konkurrentene bød — på jobber vi vant og tapte" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <Stat etikett="Treffrate" verdi={`${Math.round(38 * tall)} %`} hint="11 av 29 anbud" />
        <Stat etikett="Over vinner når vi taper" verdi={pst(4.2 * tall)} hint={`i snitt ${nok(61800 * tall)}`} farge="#b91c1c" />
        <Stat etikett="Igjen på bordet når vi vinner" verdi={pst(3.1 * tall)} hint={`kunne tatt ${nok(24900 * tall)} mer og fortsatt vunnet`} farge="#b45309" />
        <Stat
          etikett="Snittplassering"
          verdi={
            <>
              {(1.9 * tall).toFixed(1).replace(".", ",")}
              <span style={{ fontSize: 16, fontWeight: 400, color: app.dempetTekst }}> av 4,6</span>
            </>
          }
          hint="spredning i anbudene: 14,8 %"
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <Kort>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Avstand til vinneren over tid</div>
          <div style={{ fontSize: 12, color: app.dempetTekst, marginBottom: 12 }}>0 % betyr at vi vant. Faller kurven, nærmer vi oss.</div>
          <svg width={lb} height={lh} style={{ display: "block", overflow: "visible" }}>
            {[0, 5, 10].map((t) => (
              <g key={t}>
                <line x1={36} x2={lb - 14} y1={8 + (1 - t / 10) * (lh - 54)} y2={8 + (1 - t / 10) * (lh - 54)} stroke={app.kant} strokeDasharray="3 3" />
                <text x={30} y={12 + (1 - t / 10) * (lh - 54)} fontSize="11" textAnchor="end" fill={app.dempetTekst}>
                  {t} %
                </text>
              </g>
            ))}
            <path d={sti} fill="none" stroke="#dc2626" strokeWidth={2.2} strokeLinejoin="round" />
            {pts.map((p, i) =>
              i <= synligeUt ? <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#fff" stroke="#dc2626" strokeWidth={2} /> : null,
            )}
            {UTVIKLING.map((d, i) => (
              <text
                key={d.navn}
                x={pts[i].x}
                y={lh - 22}
                fontSize="10.5"
                fill={app.dempetTekst}
                textAnchor="end"
                transform={`rotate(-20 ${pts[i].x} ${lh - 22})`}
              >
                {d.navn}
              </text>
            ))}
          </svg>
        </Kort>
        <Kort>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Hvordan de andre priser seg</div>
          <div style={{ fontSize: 12, color: app.dempetTekst, marginBottom: 12 }}>Snitt i prosent mot vårt bud på samme jobb. Negativt = billigere enn oss.</div>
          <Soyler data={KONKURRENTER} tegnet={klamp(tegnet, 0.15, 1, ease.lineaer)} bredde={560} hoyde={200} />
        </Kort>
      </div>
      <Kort stil={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Hvordan vi har priset oss mot</div>
          <div
            style={{
              height: 32,
              width: 256,
              borderRadius: 7,
              border: `1px solid ${app.input}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 12px",
              fontSize: 14,
              background: "#fff",
            }}
          >
            Kvernvik Graving (9 møter)
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={app.dempetTekst} strokeWidth="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
        <div style={{ fontSize: 12, color: app.dempetTekst, marginBottom: 10 }}>Hver stolpe er ett anbud, eldst til venstre. Over null betyr at de lå over oss.</div>
        <Soyler
          data={DUELL.map((v, i) => ({ navn: `Anbud ${i + 1}`, pst: v }))}
          tegnet={klamp(tegnet, 0.3, 1, ease.lineaer)}
          bredde={1180}
          hoyde={160}
          etiketter={false}
        />
      </Kort>
    </div>
  );
};
