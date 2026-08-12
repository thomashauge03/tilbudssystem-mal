-- Endringsmeldinger skal kunne ha PDF-vedlegg, på samme måte som tilbud.
--
-- offers.attachment_urls er jsonb, så amendments får samme type. Filene ligger
-- i den eksisterende bøtta offer-attachments; stien skiller tilbud fra
-- endringer, slik at vi slipper å opprette nye storage-policyer.

alter table public.amendments
  add column if not exists attachment_urls jsonb not null default '[]'::jsonb;
