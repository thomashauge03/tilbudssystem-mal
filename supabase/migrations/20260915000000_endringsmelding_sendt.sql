-- Når ble kravet sendt til kunden?
--
-- «Send på e-post» åpner e-postprogrammet med alt utfylt, og så er det ikke
-- flere spor i systemet. På et prosjekt med tolv endringer er det ingen måte å
-- se hvilke byggherren faktisk har fått, og hvilke som fortsatt ligger her.
-- Det er ikke en liten sak: et krav om endring som aldri ble sendt, er et krav
-- som ikke er varslet.
--
-- Feltene sier hva som faktisk er kjent, ikke mer. E-postprogrammet forteller
-- oss aldri om brukeren trykket «Send» til slutt, så dette er «vi klargjorde og
-- regnet den som sendt» — og derfor må den også kunne fjernes igjen fra appen.

alter table public.amendments
  add column if not exists sent_at timestamptz,
  add column if not exists sent_to text,
  add column if not exists sent_count integer not null default 0;

comment on column public.amendments.sent_at is
  'Siste gang kravet ble sendt til kunden. Settes når e-posten klargjøres, og kan nullstilles av brukeren hvis sendingen ble avbrutt.';
comment on column public.amendments.sent_to is
  'Adressen den sist gikk til. Kunden kan ha byttet e-post underveis, og da sier datoen alene for lite.';
comment on column public.amendments.sent_count is
  'Antall ganger den er sendt. En endring som er sendt på nytt etter en prisjustering, er noe annet enn en som er sendt én gang.';

-- Lista over endringer filtreres på «ikke sendt ennå». Uten indeksen må hele
-- tabellen leses for å finne dem; med den er det bare radene som mangler dato.
create index if not exists amendments_sent_at_idx
  on public.amendments (tenant_id, sent_at);
