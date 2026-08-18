import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Paperclip, X, ExternalLink, Download } from "lucide-react";

export interface Attachment {
  name: string;
  url: string;
}

// Alle vedlegg ligger i den samme bøtta. Den heter offer-attachments av
// historiske grunner, men brukes nå også av endringsmeldinger — stien skiller
// dem. Å opprette en ny bøtte ville krevd nye storage-policyer.
const BUCKET = "offer-attachments";

export function AttachmentField({
  value,
  onChange,
  pathPrefix,
  label = "Vedlegg (PDF)",
}: {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  /** Mappe i bøtta, f.eks. `${tenantId}/amendment/${id}` */
  pathPrefix: string;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const uploadFiles = async (files: File[]) => {
    const pdfs = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (files.length && !pdfs.length) { toast.error("Bare PDF-filer kan legges ved"); return; }
    if (!pdfs.length) return;
    setUploading(true);
    try {
      // Samles opp lokalt og sendes videre i én oppdatering, slik at flere filer
      // i samme slipp ikke overskriver hverandre.
      const lagtTil: Attachment[] = [];
      for (const file of pdfs) {
        if (file.size > 20 * 1024 * 1024) { toast.error(`${file.name} er for stor (maks 20 MB)`); continue; }
        const path = `${pathPrefix}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
        if (error) { toast.error(error.message); continue; }
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        lagtTil.push({ name: file.name, url: data.publicUrl });
        toast.success(`${file.name} lagt til`);
      }
      if (lagtTil.length) onChange([...(value ?? []), ...lagtTil]);
    } finally {
      setUploading(false);
    }
  };

  const downloadAttachment = async (att: Attachment) => {
    try {
      const res = await fetch(att.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blobUrl = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = att.name;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(att.url, "_blank", "noopener");
    }
  };

  // Filen blir liggende i bøtta med vilje: her fjernes den bare fra listen, og
  // først når skjemaet lagres forsvinner referansen. Slettet vi den med én gang,
  // ville et avbrutt lagringsforsøk latt basen peke på en fil som ikke finnes,
  // og kunden ville fått 404 på vedlegget.
  const remove = (i: number) => {
    const att = (value ?? [])[i];
    if (!att) return;
    if (!window.confirm(`Fjerne vedlegget «${att.name}»?`)) return;
    onChange((value ?? []).filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="space-y-2">
        {(value ?? []).map((att, i) => (
          <div
            key={i}
            draggable
            title="Dra til skrivebordet eller Outlook-programmet. Webmail (Gmail o.l.) kan ikke ta imot filen — bruk nedlastingsknappen."
            onDragStart={(e) => {
              // Bare DownloadURL: nettleseren henter da filen og leverer den som en
              // ekte fil til mottakere UTENFOR nettleseren. En nettside kan ikke
              // levere en fil til en annen nettside via drag, og setter vi
              // text/plain her, limer webmail inn navnet i stedet.
              e.dataTransfer.setData("DownloadURL", `application/pdf:${att.name}:${att.url}`);
              e.dataTransfer.effectAllowed = "copy";
            }}
            className="flex cursor-grab items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm active:cursor-grabbing"
          >
            <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{att.name}</span>
            <button
              type="button"
              onClick={() => void downloadAttachment(att)}
              title="Last ned – dra deretter filen fra nedlastingene inn i e-posten"
              className="text-muted-foreground hover:text-primary"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <a href={att.url} target="_blank" rel="noopener noreferrer" title="Åpne i ny fane" className="text-muted-foreground hover:text-primary">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button type="button" onClick={() => remove(i)} title="Fjern vedlegg" className="text-muted-foreground hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {/* Slippsone: dra PDF rett hit fra e-post eller utforskeren, eller lim inn med Ctrl+V */}
        <label
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDropActive(true); }}
          onDragEnter={(e) => { e.preventDefault(); setDropActive(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDropActive(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDropActive(false);
            void uploadFiles(Array.from(e.dataTransfer.files ?? []));
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files ?? []);
            if (files.length) { e.preventDefault(); void uploadFiles(files); }
          }}
          tabIndex={0}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-5 text-center text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
            dropActive ? "border-primary bg-primary/10 text-primary" : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/40"
          }`}
        >
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void uploadFiles(files);
            }}
          />
          <Paperclip className="h-5 w-5" />
          {uploading ? (
            <span className="font-medium">Laster opp…</span>
          ) : (
            <>
              <span className="font-medium">Slipp PDF her</span>
              <span>eller klikk for å velge fil · Ctrl+V limer inn</span>
            </>
          )}
        </label>
      </div>
    </div>
  );
}
