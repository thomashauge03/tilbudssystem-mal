-- En post kan merkes fullført selv om ikke alt er fakturert.
--
-- Mengdene i et tilbud er et anslag. Ble det 95 m³ og ikke 100, er posten
-- ferdig på 95 %, og resten skal aldri faktureres. Uten et merke ville den
-- stått som 95 % for alltid og sett ut som noe som gjensto.
--
-- Egen tabell og ikke en kolonne på offer_lines: et godkjent tilbud er låst,
-- og linjene skrives om (slett og sett inn) når tilbudet lagres. Merket skal
-- verken stoppes av låsen eller forsvinne med en lagring. Derfor heller ingen
-- fremmednøkkel til offer_lines — den ville slettet merket ved neste lagring.

create table if not exists public.delpost_fullfort (
  offer_line_id uuid primary key,
  offer_id      uuid not null references public.offers(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  -- Hvor mye av posten som var fakturert da den ble merket. Til visning:
  -- «fullført på 95 %».
  andel         numeric not null default 0 check (andel between 0 and 100),
  merket_av     uuid default auth.uid(),
  merket_at     timestamptz not null default now()
);

comment on table public.delpost_fullfort is
  'Poster (tilbudslinjer) merket fullført på Status-siden. Tas ikke med i flere delordre.';

create index if not exists delpost_fullfort_offer on public.delpost_fullfort (offer_id);

alter table public.delpost_fullfort enable row level security;

drop policy if exists delpost_fullfort_tenant on public.delpost_fullfort;
create policy delpost_fullfort_tenant on public.delpost_fullfort
  for all
  using (tenant_id = public.current_tenant_id())
  with check (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.offers o
                 where o.id = offer_id and o.tenant_id = public.current_tenant_id())
  );

notify pgrst, 'reload schema';
