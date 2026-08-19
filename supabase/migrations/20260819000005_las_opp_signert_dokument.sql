-- Endre et dokument kunden alt har signert.
--
-- Låsen fra 20260819000002 hindrer at linjene på en signert endringsmelding blir
-- rørt. Den skal bli stående — den er hele vernet mot at tall forsvinner i en
-- vanlig lagring, slik de gjorde på 1017-1.
--
-- Men av og til MÅ noe rettes etterpå: prisen ble justert i et møte, kunden
-- signerte på papir med en annen sum, en post ble glemt. Da er svaret ikke å
-- fjerne låsen, men å gjøre det til en bevisst og sporbar handling: brukeren
-- låser opp med passordet sitt, det står hvem som gjorde det og hvorfor, og
-- opplåsingen lukker seg selv etter en halvtime.
--
-- Selve endringene er allerede dekket: line_history arkiverer hver eneste
-- linjeendring, så det gamle tallet finnes uansett hva som skrives over det.

create table if not exists public.signature_unlocks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  parent_type  text not null check (parent_type in ('offers', 'amendments')),
  parent_id    uuid not null,
  reason       text,
  unlocked_by  uuid,
  unlocked_at  timestamptz not null default now(),
  expires_at   timestamptz not null,
  closed_at    timestamptz
);

create index if not exists signature_unlocks_aktiv_idx
  on public.signature_unlocks (parent_type, parent_id, expires_at desc);

alter table public.signature_unlocks enable row level security;

-- Lesing innen eget firma. Ingen skriverett: radene kommer bare fra funksjonene
-- under, som kjører med utvidede rettigheter — ellers kunne en bruker skrevet
-- seg selv en opplåsing uten å gå veien om passordet.
drop policy if exists "signature_unlocks_les" on public.signature_unlocks;
create policy "signature_unlocks_les" on public.signature_unlocks
  for select using (tenant_id = current_tenant_id());

/** Er dokumentet låst opp akkurat nå? */
create or replace function public.er_last_opp(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from signature_unlocks
     where parent_type = p_type
       and parent_id = p_id
       and closed_at is null
       and expires_at > now()
  );
$$;

-- ─── Låsen leser opplåsingen ───────────────────────────────────────────────
create or replace function public.hindre_endring_av_signert_melding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  signert timestamptz;
  mid uuid;
begin
  mid := coalesce(NEW.amendment_id, OLD.amendment_id);
  select customer_signed_at into signert from amendments where id = mid;

  if signert is not null and not er_last_opp('amendments', mid) then
    raise exception
      'Endringsmeldingen er signert av kunden %. Lås den opp for endring først — det krever passordet ditt.',
      to_char(signert, 'DD.MM.YYYY');
  end if;
  return coalesce(NEW, OLD);
end;
$$;

-- ─── Låse opp ──────────────────────────────────────────────────────────────
-- Passordet kontrolleres i nettleseren mot Supabase Auth før denne kalles.
-- Funksjonen selv kan ikke se passordet, så den kontrollerer det den kan:
-- at brukeren hører til firmaet, og at dokumentet finnes der.
create or replace function public.las_opp_signert(
  p_type text,
  p_id uuid,
  p_grunn text default null,
  p_minutter int default 30
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_finnes boolean;
  v_utloper timestamptz;
begin
  if p_type not in ('offers', 'amendments') then
    raise exception 'Ukjent dokumenttype: %', p_type;
  end if;

  v_tenant := current_tenant_id();
  if v_tenant is null then
    raise exception 'Ingen tilknyttet firma';
  end if;

  -- Uten denne kunne en bruker låst opp et dokument i et annet firma ved å
  -- gjette en id — funksjonen kjører jo forbi RLS.
  execute format('select exists (select 1 from %I where id = $1 and tenant_id = $2)', p_type)
    into v_finnes using p_id, v_tenant;
  if not v_finnes then
    raise exception 'Fant ikke dokumentet i ditt firma';
  end if;

  -- En halvtime er nok til å rette noe, og kort nok til at en glemt opplåsing
  -- ikke blir stående som en åpen dør.
  v_utloper := now() + make_interval(mins => least(greatest(p_minutter, 1), 120));

  -- En ny opplåsing avløser en som står åpen, så det ikke hoper seg opp rader
  -- som alle sier at dokumentet er åpent.
  update signature_unlocks
     set closed_at = now()
   where parent_type = p_type and parent_id = p_id and closed_at is null;

  insert into signature_unlocks (tenant_id, parent_type, parent_id, reason, unlocked_by, expires_at)
  values (v_tenant, p_type, p_id, nullif(trim(coalesce(p_grunn, '')), ''), auth.uid(), v_utloper);

  return v_utloper;
end;
$$;

/** Lukk igjen med en gang, i stedet for å vente på at tiden går ut. */
create or replace function public.las_igjen_signert(p_type text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update signature_unlocks
     set closed_at = now()
   where parent_type = p_type
     and parent_id = p_id
     and closed_at is null
     and tenant_id = current_tenant_id();
end;
$$;

revoke all on function public.las_opp_signert(text, uuid, text, int) from public;
revoke all on function public.las_igjen_signert(text, uuid) from public;
revoke all on function public.er_last_opp(text, uuid) from public;
grant execute on function public.las_opp_signert(text, uuid, text, int) to authenticated;
grant execute on function public.las_igjen_signert(text, uuid) to authenticated;
grant execute on function public.er_last_opp(text, uuid) to authenticated;
