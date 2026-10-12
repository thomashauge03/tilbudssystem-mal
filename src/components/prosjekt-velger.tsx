import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { sorterProsjekter, type Prosjektvalg } from "@/lib/prosjekter";

const KOLONNER = "id, name, project_number, customer_id, customer_name, status";

/**
 * Søkbar prosjektvelger for tilbud, endringsmeldinger og anbud.
 *
 * Hauge Maskin har over 70 aktive prosjekter fra SmartDok, og en vanlig
 * nedtrekksliste av den lengden er ikke til å finne fram i. Søket treffer nummer,
 * navn og kunde, fordi det er nummeret folk på anlegget kjenner prosjektene på.
 */
export function ProsjektVelger({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (prosjekt: Prosjektvalg | null) => void;
  className?: string;
}) {
  const { tenantId } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: aktive, isError } = useQuery({
    queryKey: ["projects-simple", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(KOLONNER)
        .eq("status", "aktiv");
      if (error) throw error;
      return sorterProsjekter((data ?? []) as Prosjektvalg[]);
    },
  });

  // Synken setter prosjekter som er borte fra SmartDok-lista til fullført. Et
  // eldre tilbud som peker på et slikt prosjekt, ville da sett ut som om det
  // ikke var knyttet til noe, og blitt koblet løs ved neste lagring.
  const iLista = (aktive ?? []).find((p) => p.id === value) ?? null;
  const { data: utenforLista } = useQuery({
    queryKey: ["project-simple", value],
    enabled: !!value && !!aktive && !iLista,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(KOLONNER)
        .eq("id", value!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Prosjektvalg | null;
    },
  });
  const valgt = iLista ?? (value ? (utenforLista ?? null) : null);

  const velg = (p: Prosjektvalg | null) => {
    onChange(p);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm hover:bg-accent/30 transition-colors",
            className,
          )}
        >
          {valgt ? (
            <span className="mr-2 flex min-w-0 flex-1 items-center gap-2 text-left">
              {valgt.project_number && (
                <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">
                  {valgt.project_number}
                </span>
              )}
              <span className="truncate">{valgt.name}</span>
              {valgt.status !== "aktiv" && (
                <span className="flex-shrink-0 text-xs text-muted-foreground">
                  ({valgt.status})
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Ikke knyttet til prosjekt</span>
          )}
          <ChevronsUpDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Søk på nummer, navn eller kunde…" />
          <CommandList>
            <CommandEmpty>
              {isError ? "Kunne ikke laste prosjektene." : "Ingen aktive prosjekter funnet."}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none" onSelect={() => velg(null)}>
                <Check className={cn("mr-2 h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                <span className="text-muted-foreground">Ikke knyttet til prosjekt</span>
              </CommandItem>
              {(aktive ?? []).map((p) => (
                <CommandItem
                  key={p.id}
                  // cmdk bruker value både til søk og til å skille radene, så id-en er
                  // med for at to prosjekter med samme navn ikke markeres samtidig.
                  value={`${p.project_number ?? ""} ${p.name} ${p.customer_name ?? ""} ${p.id}`}
                  onSelect={() => velg(p)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 flex-shrink-0",
                      value === p.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-baseline gap-2">
                      {p.project_number && (
                        <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">
                          {p.project_number}
                        </span>
                      )}
                      <span className="truncate">{p.name}</span>
                    </span>
                    {p.customer_name && (
                      <span className="truncate text-xs text-muted-foreground">
                        {p.customer_name}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
