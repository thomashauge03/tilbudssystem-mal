-- Fremdriftsplan: aktivitetene i et prosjekt lagt ut på tid.
--
-- Byggherren krever som regel en fremdriftsplan levert sammen med tilbudet, og
-- den revideres flere ganger gjennom prosjektet. Derfor er den et eget dokument
-- knyttet til tilbudet — ikke et felt på tilbudet.
--
-- Datoer, ikke ukenummer, lagres. Uke 12 betyr ikke det samme i 2026 og 2027,
-- og ukenummeret kan alltid regnes ut av datoen — den andre veien mister man
-- informasjon.

create table if not exists public.progress_plans (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  offer_id     uuid references public.offers(id) on delete set null,
  project_id   uuid references public.projects(id) on delete set null,
  title        text not null default '',
  -- Fremdriftsplaner revideres, og byggherren må se hvilken utgave han leser.
  revision     text not null default '',
  plan_date    date,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists progress_plans_tenant_idx
  on public.progress_plans (tenant_id, created_at desc);
create index if not exists progress_plans_offer_idx
  on public.progress_plans (offer_id);

create table if not exists public.progress_plan_activities (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  plan_id      uuid not null references public.progress_plans(id) on delete cascade,
  sort_order   int not null default 0,
  name         text not null default '',
  -- Hvem som utfører. Ofte et fag («Grunnarbeid», «Elektro») eller en
  -- underentreprenør, og byggherren leser den kolonnen like nøye som datoene.
  responsible  text not null default '',
  start_date   date,
  end_date     date,
  -- En milepæl er et tidspunkt, ikke en periode: overtakelse, ferdigattest,
  -- oppstart. Tegnes som et merke i stedet for en strek.
  is_milestone boolean not null default false,
  -- Fag eller fase: «Grunnarbeid», «Rør/VA», «Elektro». Byggherren leter etter
  -- sitt eget fag i planen, og fargen gjør at han finner det uten å lese hver rad.
  category     text not null default '',
  color        text not null default 'graa',
  notes        text not null default ''
);

create index if not exists progress_plan_activities_plan_idx
  on public.progress_plan_activities (plan_id, sort_order);

-- ─── Tilgang ───────────────────────────────────────────────────────────────
alter table public.progress_plans enable row level security;
alter table public.progress_plan_activities enable row level security;

drop policy if exists "progress_plans_tenant" on public.progress_plans;
create policy "progress_plans_tenant" on public.progress_plans
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

-- Aktivitetene arver tilgangen fra planen. tenant_id ligger også på raden, men
-- den alene ville latt en rad peke på en plan i et annet firma.
drop policy if exists "progress_plan_activities_tenant" on public.progress_plan_activities;
create policy "progress_plan_activities_tenant" on public.progress_plan_activities
  using (
    tenant_id = current_tenant_id()
    and exists (
      select 1 from public.progress_plans p
       where p.id = plan_id and p.tenant_id = current_tenant_id()
    )
  )
  with check (
    tenant_id = current_tenant_id()
    and exists (
      select 1 from public.progress_plans p
       where p.id = plan_id and p.tenant_id = current_tenant_id()
    )
  );

-- ─── updated_at ────────────────────────────────────────────────────────────
create or replace function public.progress_plans_ror_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists progress_plans_updated_at on public.progress_plans;
create trigger progress_plans_updated_at
  before update on public.progress_plans
  for each row execute function public.progress_plans_ror_updated_at();
