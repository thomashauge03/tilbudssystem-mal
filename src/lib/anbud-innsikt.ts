// Regelbaserte observasjoner om anbudene — ikke gjetting.
//
// Hvert råd bygger på tall som står i protokollen, og teksten sier hvilke.
// Da kan du etterprøve konklusjonen i stedet for å måtte stole på den.
// Terskelverdiene ligger som konstanter øverst, så de kan justeres når dere
// har flere protokoller å se på.

export interface AnbudForAnalyse {
  title: string;
  opened_on?: string | null;
  bids: Array<{ company: string; amount: number; is_us: boolean }>;
}

export interface Innsikt {
  alvor: "advarsel" | "bra" | "info";
  tittel: string;
  tekst: string;
  /** Hvilket anbud observasjonen gjelder. Tomt betyr på tvers av alle. */
  anbud?: string;
}

const TETT_LOP_PST = 3;       // tapt med mindre enn dette var innen rekkevidde
const STOR_MARGIN_PST = 12;   // vunnet med mer enn dette = penger igjen på bordet
const UTELIGGER_PST = 15;     // avvik fra klyngen som regnes som markant
const KLYNGE_PST = 12;        // resten regnes som tett når de ligger innenfor dette
const SYSTEMATISK_PST = 15;   // snitt over vinner som tyder på nivå, ikke uflaks

const pstAv = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);
const snitt = (t: number[]) => (t.length ? t.reduce((s, x) => s + x, 0) / t.length : 0);

export function lagInnsikt(anbud: AnbudForAnalyse[]): Innsikt[] {
  const ut: Innsikt[] = [];
  const med = anbud.filter((a) => a.bids.some((b) => b.is_us) && a.bids.length >= 2);
  if (!med.length) return ut;

  const beregnet = med.map((a) => {
    const sortert = [...a.bids].sort((x, y) => x.amount - y.amount);
    const vaart = sortert.find((b) => b.is_us)!;
    const plass = sortert.indexOf(vaart) + 1;
    return { a, sortert, vaart, plass, vant: plass === 1, overVinner: pstAv(vaart.amount, sortert[0].amount) };
  });

  for (const r of beregnet) {
    const { sortert, vaart, a } = r;
    const n = sortert.length;

    // Vinnerbudet brøt med en ellers tett gruppe. Da er det som regel de som
    // har regnet noe annet — ikke vi som priset for høyt.
    if (n >= 3) {
      const resten = sortert.slice(1);
      const restSpread = pstAv(resten[resten.length - 1].amount, resten[0].amount);
      const gap = pstAv(sortert[1].amount, sortert[0].amount);
      if (gap > UTELIGGER_PST && restSpread < KLYNGE_PST) {
        // Er det vi selv som er utliggeren, snus rådet på hodet. Da er ikke
        // poenget at konkurrenten regnet feil — da bør vi se etter om det er
        // noe vi har glemt å ta med, for vi skal utføre jobben til den prisen.
        ut.push(
          sortert[0].is_us
            ? {
                alvor: "advarsel",
                anbud: a.title,
                tittel: "Vi lå langt under hele feltet",
                tekst:
                  `Vi lå ${gap.toFixed(0)} % under nest laveste, mens de øvrige ${resten.length} ` +
                  `lå innenfor ${restSpread.toFixed(0)} % av hverandre. Når hele markedet ligger ` +
                  `samlet et godt stykke over oss, er det verdt å gå gjennom kalkylen — det kan ` +
                  `mangle en post.`,
              }
            : {
                alvor: "info",
                anbud: a.title,
                tittel: "Vinnerbudet skilte seg kraftig ut",
                tekst:
                  `${sortert[0].company} lå ${gap.toFixed(0)} % under nest laveste, mens de øvrige ` +
                  `${resten.length} lå innenfor ${restSpread.toFixed(0)} % av hverandre. Når ett bud ` +
                  `bryter så tydelig med resten, har de som regel regnet noe annet — det er ikke ` +
                  `nødvendigvis vårt prisnivå som var feil.`,
              },
        );
      }
    }

    // Motsatt tilfelle: vi var den som stakk av gårde oppover.
    if (!r.vant && n >= 3) {
      const andre = sortert.filter((b) => !b.is_us);
      const andreSpread = pstAv(andre[andre.length - 1].amount, andre[0].amount);
      const over = pstAv(vaart.amount, andre[andre.length - 1].amount);
      if (over > UTELIGGER_PST && andreSpread < KLYNGE_PST) {
        ut.push({
          alvor: "advarsel",
          anbud: a.title,
          tittel: "Vi lå langt over hele feltet",
          tekst:
            `Budet vårt lå ${over.toFixed(0)} % over det høyeste av de andre, og de lå alle ` +
            `innenfor ${andreSpread.toFixed(0)} % av hverandre. Det tyder på at vi har regnet ` +
            `med noe de andre ikke har — verdt å sjekke om omfanget ble misforstått, eller ` +
            `om et påslag kom med to ganger.`,
        });
      }
    }

    if (!r.vant && r.overVinner <= TETT_LOP_PST) {
      ut.push({
        alvor: "advarsel",
        anbud: a.title,
        tittel: "Tapt på en hårsbredd",
        tekst:
          `Vi lå bare ${r.overVinner.toFixed(1)} % bak ${sortert[0].company}. Denne var innen ` +
          `rekkevidde — små justeringer i påslag eller rigg hadde vært nok.`,
      });
    }

    if (r.vant && n >= 2) {
      const margin = pstAv(sortert[1].amount, vaart.amount);
      if (margin > STOR_MARGIN_PST) {
        const kroner = sortert[1].amount - vaart.amount;
        ut.push({
          alvor: "bra",
          anbud: a.title,
          tittel: "Vunnet med god margin",
          tekst:
            `Nest laveste lå ${margin.toFixed(0)} % over oss. Vi kunne tatt rundt ` +
            `${Math.round(kroner / 1000)} 000 kr mer og likevel vunnet jobben.`,
        });
      }
    }

    const spread = pstAv(sortert[n - 1].amount, sortert[0].amount);
    if (n >= 4 && spread > 40) {
      ut.push({
        alvor: "info",
        anbud: a.title,
        tittel: "Stor spredning mellom budene",
        tekst:
          `Høyeste bud lå ${spread.toFixed(0)} % over laveste. Så stor forskjell betyr som ` +
          `regel at grunnlaget var tvetydig og at tilbyderne har lagt ulike forutsetninger ` +
          `til grunn. Slike jobber bærer ekstra risiko.`,
      });
    }
  }

  // ─── På tvers av alle anbud ─────────────────────────────────────────────
  const tap = beregnet.filter((r) => !r.vant);

  if (tap.length >= 3) {
    const snittOver = snitt(tap.map((r) => r.overVinner));
    if (snittOver > SYSTEMATISK_PST) {
      ut.push({
        alvor: "advarsel",
        tittel: "Prisnivået ligger systematisk over markedet",
        tekst:
          `I de ${tap.length} tapte anbudene lå vi i snitt ${snittOver.toFixed(0)} % over vinneren. ` +
          `Når avviket er så jevnt, er det ikke uflaks i enkeltjobber — det er nivået på ` +
          `kalkylen eller påslagene som ligger høyt.`,
      });
    }
  }

  const motstand = new Map<string, { moter: number; slo: number }>();
  for (const r of beregnet) {
    for (const b of r.sortert) {
      if (b.is_us) continue;
      const m = motstand.get(b.company) ?? { moter: 0, slo: 0 };
      m.moter++;
      if (b.amount < r.vaart.amount) m.slo++;
      motstand.set(b.company, m);
    }
  }
  const verstinger = [...motstand.entries()]
    .filter(([, m]) => m.moter >= 2 && m.slo / m.moter >= 0.6)
    .sort((a, b) => b[1].slo - a[1].slo);
  if (verstinger.length) {
    const [navn, m] = verstinger[0];
    ut.push({
      alvor: "info",
      tittel: `${navn} er den tøffeste konkurrenten`,
      tekst:
        `Møtt ${m.moter} ganger, og lå lavere enn oss i ${m.slo} av dem. Det er dem ` +
        `prisnivået bør måles mot.`,
    });
  }

  if (beregnet.length >= 4) {
    const etterStorrelse = [...beregnet].sort((a, b) => a.vaart.amount - b.vaart.amount);
    const halv = Math.floor(etterStorrelse.length / 2);
    const smaa = etterStorrelse.slice(0, halv);
    const store = etterStorrelse.slice(halv);
    const rateSmaa = smaa.filter((r) => r.vant).length / smaa.length;
    const rateStore = store.filter((r) => r.vant).length / store.length;
    if (Math.abs(rateSmaa - rateStore) >= 0.4) {
      const bedre = rateSmaa > rateStore ? "små" : "store";
      ut.push({
        alvor: "info",
        tittel: `Vi treffer best på ${bedre} jobber`,
        tekst:
          `Treffraten er ${(Math.max(rateSmaa, rateStore) * 100).toFixed(0)} % på ${bedre} jobber ` +
          `mot ${(Math.min(rateSmaa, rateStore) * 100).toFixed(0)} % på de andre. Det kan være ` +
          `verdt å prioritere deretter.`,
      });
    }
  }

  const rekkefolge = { advarsel: 0, bra: 1, info: 2 };
  return ut.sort((a, b) => rekkefolge[a.alvor] - rekkefolge[b.alvor]);
}
