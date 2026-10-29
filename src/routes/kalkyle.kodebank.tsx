import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Plus, Search, Save, ShieldAlert } from "lucide-react";
import { db } from "@/lib/kalkyle-db";
import { nsLenke, sammenlignKoder, type NsKode } from "@/lib/kalkyle";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/kalkyle/kodebank")({
  component: Kodebank,
});

function Kodebank() {
  const qc = useQueryClient();
  const { tenantId } = useAuth();
  const [sok, setSok] = useState("");
  const [visInaktive, setVisInaktive] = useState(false);
  const [ny, setNy] = useState({ part: "", code: "", title: "", unit: "", unit_price: "" });
  const [legger, setLegger] = useState(false);

  const { data: koder, isLoading, error } = useQuery({
    queryKey: ["ns-codes"],
    queryFn: async () => {
      const { data, error } = await db.from("ns_codes").select("*");
      if (error) throw error;
      return ((data ?? []) as NsKode[]).sort(sammenlignKoder);
    },
  });

  const grupper = useMemo(() => {
    const q = sok.trim().toLowerCase();
    const synlige = (koder ?? []).filter((k) =>
      (visInaktive || k.active) &&
      (!q || k.code.toLowerCase().includes(q) || k.title.toLowerCase().includes(q)));
    const perDel = new Map<string, NsKode[]>();
    for (const k of synlige) perDel.set(k.part, [...(perDel.get(k.part) ?? []), k]);
    return [...perDel.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }, [koder, sok, visInaktive]);

  const leggInnStartpakke = async () => {
    setLegger(true);
    const { data, error } = await db.rpc("seed_ns_codes");
    setLegger(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${data} koder lagt inn`);
    qc.invalidateQueries({ queryKey: ["ns-codes"] });
  };

  const leggTil = async () => {
    // Samme form som kodene i startpakken, så « fd2.13 » ikke blir en egen kode.
    const code = ny.code.trim().toUpperCase().replace(/\s+/g, "");
    if (!ny.part.trim() || !code || !ny.title.trim()) { toast.error("Del, kode og tittel må fylles inn"); return; }
    const { error } = await db.from("ns_codes").insert({
      tenant_id: tenantId,
      part: ny.part.trim().toUpperCase(),
      code,
      title: ny.title.trim(),
      unit: ny.unit.trim(),
      unit_price: ny.unit_price === "" ? null : Number(ny.unit_price),
    });
    if (error) {
      toast.error(error.code === "23505" ? `Koden ${code} finnes allerede i kodebanken` : error.message);
      return;
    }
    setNy({ part: "", code: "", title: "", unit: "", unit_price: "" });
    toast.success(`${code} lagt til`);
    qc.invalidateQueries({ queryKey: ["ns-codes"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/kalkyle"><ArrowLeft className="mr-1 h-4 w-4" />Kalkyler</Link></Button>
        <h1 className="text-2xl font-semibold">Kodebank</h1>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Kodene i startpakken er hentet fra offentlige anbudsgrunnlag (NS 3420, utgave 2017–2022) og bør kontrolleres mot
        gjeldende utgave av standarden. Titlene er våre egne. Kilder: <code>docs/ns3420-startliste.md</code>.
        Koder slettes ikke, de settes som inaktive, slik at gamle kalkyler fortsatt gir mening.
      </p>

      {isLoading ? <p className="text-muted-foreground">Laster…</p>
        : error ? <p className="text-destructive">Kunne ikke hente kodebanken: {(error as Error).message}</p>
        : !koder?.length ? (
          <div className="rounded-lg border p-6 text-center">
            <p className="mb-3 text-muted-foreground">Kodebanken er tom.</p>
            <Button onClick={leggInnStartpakke} disabled={legger}>Legg inn startpakken</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Søk på kode eller tittel…" value={sok} onChange={(e) => setSok(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={visInaktive} onCheckedChange={(v) => setVisInaktive(!!v)} />Vis inaktive
              </label>
            </div>

            <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[5rem_8rem_1fr_6rem_8rem_auto]">
              <Input placeholder="Del" value={ny.part} onChange={(e) => setNy({ ...ny, part: e.target.value })} />
              <Input placeholder="Kode" value={ny.code} onChange={(e) => setNy({ ...ny, code: e.target.value })} />
              <Input placeholder="Tittel (egne ord)" value={ny.title} onChange={(e) => setNy({ ...ny, title: e.target.value })} />
              <Input placeholder="Enhet" value={ny.unit} onChange={(e) => setNy({ ...ny, unit: e.target.value })} />
              <Input placeholder="Enhetspris" type="number" className="no-spinner" value={ny.unit_price} onChange={(e) => setNy({ ...ny, unit_price: e.target.value })} />
              <Button onClick={leggTil}><Plus className="mr-1 h-4 w-4" />Ny kode</Button>
            </div>

            {grupper.map(([del, liste]) => (
              <section key={del} className="space-y-1">
                <h2 className="mt-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Del {del}</h2>
                {liste.map((k) => <KodeRad key={k.id} kode={k} />)}
              </section>
            ))}
          </>
        )}
    </div>
  );
}

/** Én kode med egne felt. Lagres med knappen, som bare er aktiv når noe er endret. */
function KodeRad({ kode }: { kode: NsKode }) {
  const qc = useQueryClient();
  const [k, setK] = useState(kode);
  const endret = JSON.stringify(k) !== JSON.stringify(kode);

  // Det lagrede legges rett i lista før den hentes på nytt, så raden og lista
  // er like med en gang og Lagre-knappen blir inaktiv.
  const oppdaterLista = (lagret: Partial<NsKode>) => {
    qc.setQueryData<NsKode[]>(["ns-codes"], (liste) =>
      liste?.map((x) => (x.id === kode.id ? { ...x, ...lagret } : x)));
    qc.invalidateQueries({ queryKey: ["ns-codes"] });
  };

  const lagre = async () => {
    if (!k.title.trim()) { toast.error("Tittelen kan ikke være tom"); return; }
    const lagret = {
      title: k.title.trim(),
      unit: k.unit.trim(),
      unit_price: k.unit_price === null || (k.unit_price as unknown) === "" ? null : Number(k.unit_price),
      edition: k.edition?.trim() || null,
      note: k.note?.trim() || null,
      active: k.active,
      maa_kontrolleres: k.maa_kontrolleres,
    };
    const { error } = await db.from("ns_codes").update(lagret).eq("id", kode.id);
    if (error) { toast.error(error.message); return; }
    setK({ ...k, ...lagret });
    oppdaterLista(lagret);
  };

  // Skjoldet lagrer bare kontrollmerket. Andre ulagrede endringer i raden blir
  // stående til brukeren trykker Lagre.
  const merkKontrollert = async () => {
    setK((f) => ({ ...f, maa_kontrolleres: false }));
    const { error } = await db.from("ns_codes").update({ maa_kontrolleres: false }).eq("id", kode.id);
    if (error) {
      setK((f) => ({ ...f, maa_kontrolleres: true }));
      toast.error(error.message);
      return;
    }
    oppdaterLista({ maa_kontrolleres: false });
  };

  return (
    <div className={`grid items-center gap-2 rounded border px-2 py-1.5 md:grid-cols-[7rem_1fr_5rem_7rem_7rem_1fr_auto_auto] ${k.active ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-1 font-mono text-sm">
        {k.code}
        <a href={nsLenke(k.code, [k])!} target="_blank" rel="noopener noreferrer" title="Se hele beskrivelsen i NS 3420 hos Standard Online (krever tilgang)" className="text-muted-foreground hover:text-foreground">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {k.maa_kontrolleres && (
          <button type="button" title="Finnes bare hos én byggherre. Trykk når koden er kontrollert mot standarden." onClick={merkKontrollert}>
            <ShieldAlert className="h-4 w-4 text-amber-600" />
          </button>
        )}
      </div>
      <Input value={k.title} onChange={(e) => setK({ ...k, title: e.target.value })} />
      <Input value={k.unit} onChange={(e) => setK({ ...k, unit: e.target.value })} placeholder="Enhet" />
      <Input type="number" className="no-spinner text-right" placeholder="Pris" value={k.unit_price ?? ""} onChange={(e) => setK({ ...k, unit_price: e.target.value === "" ? null : Number(e.target.value) })} />
      <Input value={k.edition ?? ""} onChange={(e) => setK({ ...k, edition: e.target.value })} placeholder="Utgave" />
      <Input value={k.note ?? ""} onChange={(e) => setK({ ...k, note: e.target.value })} placeholder="Merknad" />
      <label className="flex items-center gap-1 text-xs"><Checkbox checked={k.active} onCheckedChange={(v) => setK({ ...k, active: !!v })} />Aktiv</label>
      <Button size="sm" variant={endret ? "default" : "ghost"} disabled={!endret} onClick={() => lagre()}><Save className="h-4 w-4" /></Button>
    </div>
  );
}
