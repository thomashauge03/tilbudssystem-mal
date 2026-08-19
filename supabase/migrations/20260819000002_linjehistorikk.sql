-- Vern mot stille datatap på tilbuds- og endringslinjer.
--
-- Bakgrunn: både tilbud og endringsmeldinger lagres ved å SLETTE alle linjer og
-- sette dem inn på nytt. Da holder det at ett felt er tømt i skjemaet før tall
-- er borte for godt. Det skjedde 18.08.2026 på endring 1017-1, der antallet ble
-- nullet på fem linjer. Uten sikkerhetskopier fantes ingen vei tilbake.
--
-- To lag, begge i databasen — de virker uansett hva grensesnittet gjør:
--   1) all endring og sletting av linjer arkiveres
--   2) linjene på en signert endringsmelding kan ikke røres

-- ─── 1) Arkiv ──────────────────────────────────────────────────────────────
create table if not exists public.line_history (
  id          bigserial primary key,
  tenant_id   uuid,
  table_name  text not null,
  parent_id   uuid,
  operation   text not null,
  row_data    jsonb not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid default auth.uid()
);

create index if not exists line_history_parent_idx
  on public.line_history(table_name, parent_id, changed_at desc);

alter table public.line_history enable row level security;

-- Bare lesing for innloggede i eget firma. Ingen skriverett: radene kommer
-- utelukkende fra triggeren, som kjører med utvidede rettigheter.
drop policy if exists "line_history_les" on public.line_history;
create policy "line_history_les" on public.line_history
  for select using (tenant_id = current_tenant_id());

create or replace function public.logg_linjeendring()
returns trigger
language plpgsql
security definer
set search_path = public
as $$$$
declare
  rad jsonb;
begin
  rad := to_jsonb(OLD);
  -- Feltnavnet leses ut av jsonb, ikke med OLD.<felt>. Et CASE over OLD.offer_id
  -- feiler nemlig på amendment_lines selv om grenen aldri velges: plpgsql sjekker
  -- at feltet finnes uansett hvilken gren som er aktuell, og da blokkeres ALL
  -- lagring av linjer.
  insert into line_history (tenant_id, table_name, parent_id, operation, row_data)
  values (
    (rad->>'tenant_id')::uuid,
    TG_TABLE_NAME,
    coalesce(rad->>'offer_id', rad->>'amendment_id')::uuid,
    lower(TG_OP),
    rad
  );
  return null; -- AFTER-trigger, returverdien brukes ikke
end;
$$$$;

drop trigger if exists offer_lines_historikk on public.offer_lines;
create trigger offer_lines_historikk
  after update or delete on public.offer_lines
  for each row execute function public.logg_linjeendring();

drop trigger if exists amendment_lines_historikk on public.amendment_lines;
create trigger amendment_lines_historikk
  after update or delete on public.amendment_lines
  for each row execute function public.logg_linjeendring();

-- ─── 2) Signert endringsmelding er låst ────────────────────────────────────
-- Kunden har signert på bestemte tall. Da skal de tallene ikke kunne endres i
-- ettertid — verken ved et uhell eller med vilje. Vil man likevel rette noe,
-- må signaturen nullstilles først, og det er en bevisst handling.
create or replace function public.hindre_endring_av_signert_melding()
returns trigger
language plpgsql
as $$
declare
  signert timestamptz;
  mid uuid;
begin
  mid := coalesce(NEW.amendment_id, OLD.amendment_id);
  select customer_signed_at into signert from amendments where id = mid;
  if signert is not null then
    raise exception
      'Endringsmeldingen er signert av kunden %, og linjene kan ikke endres. Nullstill signaturen først.',
      to_char(signert, 'DD.MM.YYYY');
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists amendment_lines_laast_ved_signatur on public.amendment_lines;
create trigger amendment_lines_laast_ved_signatur
  before insert or update or delete on public.amendment_lines
  for each row execute function public.hindre_endring_av_signert_melding();
