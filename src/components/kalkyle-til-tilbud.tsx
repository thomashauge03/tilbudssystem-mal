import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FilePlus, Search, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { kalkyleImportNokkel, type KalkyleImport } from "@/lib/kalkyle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface TilbudRad {
  id: string;
  offer_number: number | null;
  title: string | null;
  customer_name: string | null;
  status: string | null;
}

/**
 * Legger kalkylens linjer inn i et tilbud. Linjene skrives ikke rett i basen.
 * De legges i sessionStorage, og tilbudsskjemaet henter dem når det er lastet
 * (se offer-form.tsx). Et ulagret utkast for samme tilbud ville ellers slettet
 * dem ved neste lagring, og et nytt tilbud trenger kunde fra kunderegisteret.
 */
export function KalkyleTilTilbud({ data, forOpen }: {
  data: KalkyleImport;
  /** Kalles når knappen trykkes. Dialogen åpnes bare når den gir true. */
  forOpen?: () => Promise<boolean>;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [aapner, setAapner] = useState(false);
  const [sok, setSok] = useState("");

  const { data: tilbud, isLoading } = useQuery({
    queryKey: ["offers-unsigned"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id, offer_number, title, customer_name, status")
        .is("customer_signed_at" as never, null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as TilbudRad[];
    },
  });

  const synlige = useMemo(() => {
    const q = sok.trim().toLowerCase();
    return (tilbud ?? []).filter((t) => !q ||
      String(t.offer_number ?? "").includes(q) ||
      (t.title ?? "").toLowerCase().includes(q) ||
      (t.customer_name ?? "").toLowerCase().includes(q));
  }, [tilbud, sok]);

  const send = (offerId?: string) => {
    sessionStorage.setItem(kalkyleImportNokkel(offerId), JSON.stringify(data));
    setOpen(false);
    if (offerId) navigate({ to: "/tilbud/$id", params: { id: offerId } });
    else navigate({ to: "/tilbud/ny" });
  };

  const aapne = async () => {
    if (forOpen) {
      setAapner(true);
      try {
        if (!(await forOpen())) return;
      } finally {
        setAapner(false);
      }
    }
    setOpen(true);
  };

  return (
    <>
      <Button variant="outline" onClick={aapne} disabled={!data.linjer.length || aapner}>
        <Send className="mr-1 h-4 w-4" />Legg til i tilbud
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Legg til i tilbud</DialogTitle>
            <DialogDescription>
              Postene legges sist i tilbudet under overskriften «{data.navn}», uten kalkylepåslaget. Tilbudet bruker sin egen adm.kost.
              Trykk Lagre i tilbudet etterpå.
            </DialogDescription>
          </DialogHeader>
          <Button className="w-full justify-start" variant="secondary" onClick={() => send()}>
            <FilePlus className="mr-2 h-4 w-4" />Nytt tilbud
          </Button>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Søk tilbudsnummer, tittel eller kunde…" value={sok} onChange={(e) => setSok(e.target.value)} />
          </div>
          <div className="max-h-80 overflow-y-auto rounded border">
            {isLoading ? <p className="p-3 text-muted-foreground">Laster…</p>
              : synlige.length === 0 ? <p className="p-3 text-muted-foreground">Ingen tilbud som kan endres.</p>
              : synlige.map((t) => (
                <button key={t.id} type="button" className="flex w-full items-baseline gap-3 border-b px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => send(t.id)}>
                  <span className="w-14 shrink-0 tabular-nums text-muted-foreground">#{t.offer_number}</span>
                  <span className="flex-1 font-medium">{t.title}</span>
                  <span className="text-muted-foreground">{t.customer_name}</span>
                  <span className="w-20 text-right text-xs text-muted-foreground">{t.status}</span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
