import React from "react";
import { erOverskrift, kunde, Linje, linjeSum, nok, tilbud } from "../data";
import { app } from "../tema";
import { Etikett, Felt, Ikon, Knapp, Kort, Merke, Seksjon } from "./deler";

const num = (n: number) => new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(n);

/**
 * Tilbudsskjemaet (src/components/offer-form.tsx): tilbudsinfo til venstre,
 * tekst og linjer til høyre, sum nederst.
 *
 * `linjer` er hvor mange linjer som er skrevet inn; en brøkdel betyr at den
 * neste er på vei inn. `skriver` gir en skrivemarkør i beskrivelsen til den
 * siste linjen, med så mange tegn som er skrevet.
 */
export const TilbudSkjema: React.FC<{
  linjer?: number;
  skriver?: number;
  total?: number;
  status?: "Utkast" | "Sendt" | "Godkjent";
  trykket?: "send" | "pdf" | null;
  trykk?: number;
  bareLinjer?: boolean;
  /** Bare overskrift, knapper og linjer — til nærbilder */
  fokus?: boolean;
}> = ({ linjer = tilbud.linjer.length, skriver, total, status = "Utkast", trykket = null, trykk = 0, bareLinjer = false, fokus = false }) => {
  const hele = Math.floor(linjer);
  const delvis = linjer - hele;
  const synlige = tilbud.linjer.slice(0, Math.min(tilbud.linjer.length, hele + (delvis > 0 ? 1 : 0)));
  const sum = total ?? synlige.slice(0, hele).reduce((s, l) => s + linjeSum(l), 0);

  const rad = (l: Linje, i: number) => {
    const erNy = i === hele && delvis > 0;
    const inn = erNy ? delvis : 1;
    const sisteSkrevne = skriver !== undefined && i === synlige.length - 1;
    const stil: React.CSSProperties = {
      opacity: inn,
      transform: `translateY(${(1 - inn) * 10}px)`,
      background: erNy || sisteSkrevne ? "oklch(0.97 0.02 80 / 0.7)" : undefined,
    };
    if (erOverskrift(l)) {
      return (
        <tr key={i} style={{ borderBottom: `1px solid ${app.kant}`, ...stil }}>
          <td style={{ padding: "14px 4px 0", width: 24 }}>
            <Ikon navn="grep" storrelse={16} farge={app.dempetTekst} />
          </td>
          <td colSpan={7} style={{ padding: "8px 8px" }}>
            <div
              style={{
                height: 36,
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                borderBottom: `1px solid ${app.kant}`,
                background: "oklch(0.95 0.01 80 / 0.4)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.025em",
                fontSize: 14,
              }}
            >
              {l.overskrift}
            </div>
          </td>
        </tr>
      );
    }
    const tekst = sisteSkrevne ? l.tekst.slice(0, Math.floor(skriver ?? 0)) : l.tekst;
    return (
      <tr key={i} style={{ borderBottom: `1px solid ${app.kant}`, ...stil }}>
        <td style={{ padding: "14px 4px 0", width: 24, verticalAlign: "top" }}>
          <Ikon navn="grep" storrelse={16} farge={app.dempetTekst} />
        </td>
        <td style={{ padding: "8px 4px", width: 32, verticalAlign: "top" }}>
          <div
            style={{
              width: 16,
              height: 16,
              marginTop: 10,
              borderRadius: 4,
              background: app.tekst,
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
        </td>
        <td style={{ padding: "8px 8px" }}>
          <Felt verdi={tekst} markor={sisteSkrevne && (skriver ?? 0) < l.tekst.length} fokus={sisteSkrevne} />
        </td>
        <td style={{ padding: "8px 8px", width: 80 }}>
          <Felt verdi={num(l.antall)} hoyrejustert />
        </td>
        <td style={{ padding: "8px 8px", width: 96 }}>
          <Felt verdi={l.enhet} stil={{ justifyContent: "space-between" }} />
        </td>
        <td style={{ padding: "8px 8px", width: 128 }}>
          <Felt verdi={num(l.pris)} hoyrejustert />
        </td>
        <td style={{ padding: "8px 8px", width: 80 }}>
          <Felt plassholder="0" hoyrejustert />
        </td>
        <td style={{ padding: "8px 8px", width: 128, textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {nok(linjeSum(l))}
        </td>
      </tr>
    );
  };

  const linjeKort = (
    <Kort>
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Seksjon>Tilbudslinjer</Seksjon>
        <div style={{ display: "flex", gap: 8 }}>
          <Knapp liten ikon="overskrift">Ny overskrift</Knapp>
          <Knapp liten ikon="pluss">Ny linje</Knapp>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr
            style={{
              borderBottom: `1px solid ${app.kant}`,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: app.dempetTekst,
            }}
          >
            <th style={{ width: 24 }} />
            <th style={{ width: 32 }} />
            <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Beskrivelse</th>
            <th style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>Antall</th>
            <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Enhet</th>
            <th style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>Pris/enhet</th>
            <th style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>Rabatt %</th>
            <th style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>Sum eks. mva</th>
          </tr>
        </thead>
        <tbody>{synlige.map(rad)}</tbody>
      </table>
      <div style={{ marginTop: 16, marginLeft: "auto", maxWidth: 384, borderTop: `1px solid ${app.kant}`, paddingTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700 }}>
          <span>Totalt eks. mva</span>
          <span style={{ color: app.primar, fontVariantNumeric: "tabular-nums" }}>{nok(sum)}</span>
        </div>
      </div>
    </Kort>
  );

  if (bareLinjer) return linjeKort;

  const statusTone = status === "Utkast" ? "gra" : status === "Sendt" ? "gul" : "gronn";

  if (fokus) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, height: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>Tilbud #{tilbud.nummer}</div>
            <Merke tone={statusTone}>{status}</Merke>
            <div style={{ fontSize: 14, color: app.dempetTekst, whiteSpace: "nowrap" }}>
              {tilbud.tittel} · {kunde.navn}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Knapp ikon="filNed" trykket={trykket === "pdf" ? trykk : 0}>
              Last ned PDF
            </Knapp>
            <Knapp variant="primar" ikon="send" trykket={trykket === "send" ? trykk : 0}>
              Send på e-post
            </Knapp>
          </div>
        </div>
        {linjeKort}
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Knapp variant="spokelse" ikon="pilVenstre" liten>
            Tilbake
          </Knapp>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Tilbud #{tilbud.nummer}
          </div>
          <Merke tone={statusTone}>{status}</Merke>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Knapp ikon="kontrakt">Kontrakt PDF</Knapp>
          <Knapp ikon="lenke">Signeringslenke</Knapp>
          <Knapp ikon="send" trykket={trykket === "send" ? trykk : 0}>
            Send på e-post
          </Knapp>
          <Knapp ikon="filNed">Last ned PDF</Knapp>
          <Knapp variant="primar" ikon="lagre">
            Lagre tilbud
          </Knapp>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 24 }}>
        <Kort>
          <Seksjon stil={{ marginBottom: 16 }}>Tilbudsinfo</Seksjon>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <Etikett>Overskrift / beskrivelse *</Etikett>
              <Felt verdi={tilbud.tittel} />
            </div>
            <div>
              <Etikett>Prosjekt</Etikett>
              <Felt verdi={`${tilbud.tittel}`} stil={{ justifyContent: "space-between" }} />
            </div>
            <div>
              <Etikett>Kunde</Etikett>
              <Felt verdi={kunde.navn} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <Etikett>Tilbudsdato</Etikett>
                <Felt verdi={tilbud.dato} />
              </div>
              <div>
                <Etikett>Gyldig t.o.m.</Etikett>
                <Felt verdi={tilbud.gyldigTil} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <Etikett>Prosjektnr.</Etikett>
                <Felt verdi={tilbud.prosjekt} />
              </div>
              <div>
                <Etikett>Adm.påslag (%)</Etikett>
                <Felt verdi="0" />
              </div>
            </div>
            <div>
              <Etikett>Vår referanse</Etikett>
              <Felt verdi="Erik Fjordheim" />
            </div>
          </div>
        </Kort>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Kort>
            <Seksjon stil={{ marginBottom: 12 }}>Tilbudstekst</Seksjon>
            <div
              style={{
                border: `1px solid ${app.input}`,
                borderRadius: 7,
                padding: "8px 12px",
                fontSize: 14,
                lineHeight: 1.5,
                minHeight: 64,
              }}
            >
              {tilbud.tekst}
            </div>
          </Kort>
          {linjeKort}
        </div>
      </div>
    </div>
  );
};
