import React from "react";
import { andreTilbud, dashbord, nok as nokRaa, tilbud, tilbudSum, kunde } from "../data";
import { app } from "../tema";
import { Ikon, IkonNavn, Kort, Sidetittel, Stolpe } from "./deler";

const Stat: React.FC<{
  ikon: IkonNavn;
  etikett: string;
  verdi: string;
  hint?: string;
  aksent?: { bg: string; fg: string };
  synlig?: number;
}> = ({ ikon, etikett, verdi, hint, aksent, synlig = 1 }) => (
  <Kort
    stil={{
      opacity: synlig,
      transform: `translateY(${(1 - synlig) * 14}px)`,
    }}
  >
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: app.dempetTekst }}>
          {etikett}
        </div>
        <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {verdi}
        </div>
        {hint && <div style={{ marginTop: 4, fontSize: 12, color: app.dempetTekst }}>{hint}</div>}
      </div>
      <div
        style={{
          borderRadius: 8,
          padding: 10,
          marginLeft: 12,
          background: aksent?.bg ?? "oklch(0.49 0.22 27 / 0.1)",
          color: aksent?.fg ?? app.primar,
          display: "flex",
        }}
      >
        <Ikon navn={ikon} storrelse={20} />
      </div>
    </div>
  </Kort>
);

const GRONN = { bg: "#d1fae5", fg: "#047857" };
const GUL = { bg: "#fef3c7", fg: "#b45309" };
const ROD = { bg: "#fee2e2", fg: "#b91c1c" };

/** Smultringen i dashbordet, tegnet som SVG-buer */
const Ring: React.FC<{ deler: { verdi: number; farge: string }[]; tegnet: number; midt: string; under: string; etikett: string }> = ({
  deler,
  tegnet,
  midt,
  under,
  etikett,
}) => {
  const total = deler.reduce((s, d) => s + d.verdi, 0);
  const r = 62;
  const omkrets = 2 * Math.PI * r;
  let brukt = 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: app.dempetTekst }}>
        {etikett}
      </div>
      <div style={{ position: "relative", width: 176, height: 176 }}>
        <svg width="176" height="176" viewBox="0 0 176 176" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="88" cy="88" r={r} fill="none" stroke="#e5e7eb" strokeWidth="20" />
          {deler.map((d, i) => {
            const andel = (d.verdi / total) * tegnet;
            const bue = Math.max(0, andel * omkrets - 3);
            const el = (
              <circle
                key={i}
                cx="88"
                cy="88"
                r={r}
                fill="none"
                stroke={d.farge}
                strokeWidth="20"
                strokeDasharray={`${bue} ${omkrets}`}
                strokeDashoffset={-brukt * omkrets}
              />
            );
            brukt += d.verdi / total;
            return el;
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{midt}</span>
          <span style={{ fontSize: 12, color: app.dempetTekst }}>{under}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Dashbordet. `p` (0–1) styrer hvor langt tallene har talt seg opp og hvor
 * mye av ringene som er tegnet, så skjermen kan «våkne» når den kommer inn.
 */
export const Dashbord: React.FC<{ p?: number; kortInn?: number }> = ({ p = 1, kortInn = 1 }) => {
  // Hele kroner mens tallene teller, ellers flimrer ørene
  const nok = (n: number) => nokRaa(Math.round(n));
  const fakturert = dashbord.fakturert * p;
  const gjenstar = (dashbord.kontraktssum - dashbord.fakturert) * p;
  const pst = (dashbord.fakturert / dashbord.kontraktssum) * 100;
  const k = (i: number) => Math.max(0, Math.min(1, kortInn * 4 - i * 0.35));
  const rader = [
    { nummer: tilbud.nummer, tittel: tilbud.tittel, kunde: kunde.navn, total: tilbudSum, andel: 0 },
    ...andreTilbud.slice(0, 4).map((t) => ({ nummer: t.nummer, tittel: t.tittel, kunde: t.kunde, total: t.total, andel: t.fakturert })),
  ];
  return (
    <div>
      <Sidetittel tittel="Dashboard" under="Oversikt over tilbud, fakturering og aktivitet" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <Stat synlig={k(0)} ikon="dollar" etikett="Total kontraktssum" verdi={nok(dashbord.kontraktssum * p)} hint="Godkjente og fullførte tilbud" />
        <Stat synlig={k(1)} ikon="sjekk" etikett="Fakturert" verdi={nok(fakturert)} hint={`${(pst * p).toFixed(1).replace(".", ",")} % av total`} aksent={GRONN} />
        <Stat synlig={k(2)} ikon="trend" etikett="Gjenstår" verdi={nok(gjenstar)} hint="Ikke fakturert ennå" aksent={GUL} />
        <Stat synlig={k(3)} ikon="utklipp" etikett="Endringsmeldinger" verdi={String(Math.round(dashbord.endringer * p))} hint={`${nok(dashbord.endringerSum * p)} total`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 16 }}>
        <Stat synlig={k(4)} ikon="fil" etikett="Åpne tilbud" verdi={String(Math.round(dashbord.apneTilbud * p))} hint="Godkjent, ikke ferdig fakturert" />
        <Stat synlig={k(5)} ikon="sjekk" etikett="Fullt fakturert" verdi={String(Math.round(dashbord.fullFakturert * p))} hint="100 % fakturert" aksent={GRONN} />
        <Stat synlig={k(6)} ikon="klokke" etikett="Delvis fakturert" verdi={String(Math.round(dashbord.delvisFakturert * p))} hint="Mellom 1–99 %" aksent={GUL} />
        <Stat synlig={k(7)} ikon="varsel" etikett="Utgåtte tilbud" verdi={String(Math.round(dashbord.utgatte * p))} hint="Frist utløpt uten godkjenning" aksent={ROD} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, marginTop: 24 }}>
        <Kort padding={24} stil={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Ring
            etikett="Fakturert av total"
            tegnet={p}
            midt={`${Math.round(pst * p)} %`}
            under="fakturert"
            deler={[
              { verdi: dashbord.fakturert, farge: "#16a34a" },
              { verdi: dashbord.kontraktssum - dashbord.fakturert, farge: "#f59e0b" },
            ]}
          />
        </Kort>
        <Kort padding={24} stil={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Ring
            etikett="Tilbud etter status"
            tegnet={p}
            midt={String(Math.round(dashbord.tilbudTotalt * p))}
            under="tilbud totalt"
            deler={[
              { verdi: dashbord.fullFakturert, farge: "#16a34a" },
              { verdi: dashbord.delvisFakturert, farge: "#f59e0b" },
              { verdi: 12, farge: "#94a3b8" },
            ]}
          />
        </Kort>
        <Kort padding={0}>
          <div style={{ borderBottom: `1px solid ${app.kant}`, padding: "16px 20px" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Utløper snart</div>
            <div style={{ fontSize: 12, color: app.dempetTekst, marginTop: 2 }}>Neste 14 dager</div>
          </div>
          {andreTilbud.slice(0, 3).map((t, i) => (
            <div
              key={t.nummer}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 20px",
                borderTop: i ? `1px solid ${app.kant}` : undefined,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  #{t.nummer} {t.tittel}
                </div>
                <div style={{ fontSize: 12, color: app.dempetTekst }}>{t.kunde}</div>
              </div>
              <span
                style={{
                  marginLeft: 12,
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: 12,
                  fontWeight: 500,
                  background: t.dager <= 3 ? "#fee2e2" : "#fef3c7",
                  color: t.dager <= 3 ? "#b91c1c" : "#b45309",
                }}
              >
                {t.dager + 2}d
              </span>
            </div>
          ))}
        </Kort>
      </div>
      <Kort padding={0} stil={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${app.kant}`, padding: "16px 24px" }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Siste godkjente tilbud</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 500, color: app.primar }}>
            Se alle <Ikon navn="pilHoyre" storrelse={12} />
          </div>
        </div>
        {rader.map((o, i) => {
          const andel = o.andel * p;
          return (
            <div
              key={o.nummer}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 24px", borderTop: i ? `1px solid ${app.kant}` : undefined }}
            >
              <div style={{ width: 56, fontSize: 14, color: app.dempetTekst, fontVariantNumeric: "tabular-nums" }}>#{o.nummer}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{o.tittel}</div>
                <div style={{ fontSize: 12, color: app.dempetTekst }}>{o.kunde}</div>
                <Stolpe pst={andel * 100} farge={andel >= 1 ? "#16a34a" : andel > 0 ? "#f59e0b" : "#e5e7eb"} stil={{ marginTop: 6 }} />
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{nok(o.total)}</div>
                <div style={{ fontSize: 12, color: app.dempetTekst }}>{Math.round(andel * 100)} % fakturert</div>
              </div>
            </div>
          );
        })}
      </Kort>
    </div>
  );
};
