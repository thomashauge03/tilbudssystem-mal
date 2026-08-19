-- Anbudsprotokoller: hva konkurrentene bød, både på jobber vi vant og tapte.
--
-- Protokollene kommer som SMS med fritekst. Rådteksten lagres sammen med de
-- tolkede budene, slik at en feiltolking kan rettes opp senere uten at
-- originalen er tapt.

create table if not exists public.tenders (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  title        text not null,
  opened_on    date,
  -- Valgfri kobling: en protokoll kan gjelde et prosjekt vi har, eller et
  -- tilbud vi ga. Begge kan mangle for jobber vi ikke la inn på forhånd.
  project_id   uuid references public.projects(id) on delete set null,
  offer_id     uuid references public.offers(id) on delete set null,
  source_text  text,
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.tender_bids (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  tender_id   uuid not null references public.tenders(id) on delete cascade,
  company     text not null,
  amount      numeric(14,2) not null,
  -- Settes når navnet er kjent igjen som vårt eget firma. Lagres i stedet for å
  -- gjettes på nytt hver gang, siden firmanavnet i innstillingene kan endres.
  is_us       boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists tender_bids_tender_idx on public.tender_bids(tender_id);
create index if not exists tenders_opened_idx on public.tenders(opened_on desc);

alter table public.tenders     enable row level security;
alter table public.tender_bids enable row level security;

drop policy if exists "tenders_tenant_isolation" on public.tenders;
create policy "tenders_tenant_isolation" on public.tenders
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

drop policy if exists "tender_bids_tenant_isolation" on public.tender_bids;
create policy "tender_bids_tenant_isolation" on public.tender_bids
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
