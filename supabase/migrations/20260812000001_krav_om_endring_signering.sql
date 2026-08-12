-- Livssyklus for endringer: "Krav om endring" -> kunden signerer -> "Endringsmelding"
--
-- Speiler signeringsflyten for tilbud (offer_signing_tokens + sign_offer), men
-- for amendments. Anonyme brukere kommer bare til via SECURITY DEFINER-funksjoner
-- som slår opp på et uglettbart token — tabellen selv er lukket med RLS.

-- ─── 1) Signaturkolonne ────────────────────────────────────────────────────
alter table public.amendments add column if not exists customer_signed_at timestamptz;

-- ─── 2) Statuslivssyklus ───────────────────────────────────────────────────
-- 'krav' ved oppretting, 'endringsmelding' når kunden har signert.
alter table public.amendments alter column status set default 'krav';

update public.amendments
   set status = 'endringsmelding'
 where customer_signed_at is not null
   and coalesce(status, '') <> 'endringsmelding';

update public.amendments
   set status = 'krav'
 where customer_signed_at is null
   and coalesce(status, '') in ('', 'utkast');

-- ─── 3) Signeringstokens ───────────────────────────────────────────────────
create table if not exists public.amendment_signing_tokens (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  amendment_id  uuid not null references public.amendments(id) on delete cascade,
  -- To sammenslåtte uuid-er = 64 hex-tegn. gen_random_uuid() bruker en CSPRNG i
  -- PG13+, så dette er uglettbart uten å kreve pgcrypto-utvidelsen.
  token         text not null unique
                default replace(gen_random_uuid()::text, '-', '') ||
                        replace(gen_random_uuid()::text, '-', ''),
  used_at       timestamptz,
  signer_name   text,
  signer_ip     text,
  signer_signature text,
  created_at    timestamptz not null default now()
);

create index if not exists amendment_signing_tokens_amendment_idx
  on public.amendment_signing_tokens(amendment_id);

alter table public.amendment_signing_tokens enable row level security;

drop policy if exists "amendment_signing_tokens_tenant_isolation" on public.amendment_signing_tokens;
create policy "amendment_signing_tokens_tenant_isolation" on public.amendment_signing_tokens
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

-- ─── 4) Signatur setter status automatisk ──────────────────────────────────
create or replace function public.set_amendment_signed_status()
returns trigger
language plpgsql
as $$
begin
  if new.customer_signed_at is not null
     and old.customer_signed_at is distinct from new.customer_signed_at
     and coalesce(new.status, '') <> 'endringsmelding' then
    new.status := 'endringsmelding';
  end if;
  return new;
end;
$$;

drop trigger if exists amendments_signed_becomes_endringsmelding on public.amendments;
create trigger amendments_signed_becomes_endringsmelding
  before update of customer_signed_at on public.amendments
  for each row
  execute function public.set_amendment_signed_status();

-- ─── 5) Anonym tilgang via token ───────────────────────────────────────────
-- Henter kravet for signeringssiden. Kaster ved ukjent token, så en anonym
-- bruker ikke kan skille "finnes ikke" fra "ikke din".
create or replace function public.get_amendment_by_token(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  a record;
begin
  select * into t from amendment_signing_tokens where token = p_token;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;

  select * into a from amendments where id = t.amendment_id;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;

  return json_build_object(
    'token_id',             t.id,
    'used_at',              t.used_at,
    'amendment_id',         a.id,
    'amendment_number',     a.amendment_number,
    'project_ref',          a.project_ref,
    'internal_description', a.internal_description,
    'change_description',   a.change_description,
    'reason',               a.reason,
    'other_notes',          a.other_notes,
    'notified_date',        a.notified_date,
    'status',               a.status,
    'company_name',         (select company_name from app_settings where tenant_id = a.tenant_id),
    'lines', coalesce(
      (select json_agg(json_build_object(
                'description', l.description,
                'quantity',    l.quantity,
                'unit',        l.unit,
                'unit_price',  l.unit_price)
              order by l.sort_order)
         from amendment_lines l where l.amendment_id = a.id),
      '[]'::json)
  );
end;
$$;

-- Signerer kravet. Engangslenke: andre forsøk avvises.
create or replace function public.sign_amendment(
  p_token text,
  p_signer_name text,
  p_signer_signature text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  a record;
begin
  if p_signer_name is null or btrim(p_signer_name) = '' then
    raise exception 'Navn er påkrevd';
  end if;

  -- for update låser raden, så to samtidige signeringer ikke begge slipper gjennom
  select * into t from amendment_signing_tokens where token = p_token for update;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;
  if t.used_at is not null then
    raise exception 'Denne lenken er allerede brukt';
  end if;

  update amendment_signing_tokens
     set used_at = now(),
         signer_name = btrim(p_signer_name),
         signer_signature = p_signer_signature
   where id = t.id;

  -- Triggeren over setter status til 'endringsmelding'
  update amendments
     set customer_signed_at = now()
   where id = t.amendment_id
  returning * into a;

  return json_build_object(
    'amendment_number', a.amendment_number,
    'project_ref',      a.project_ref,
    'status',           a.status
  );
end;
$$;

revoke all on function public.get_amendment_by_token(text) from public;
revoke all on function public.sign_amendment(text, text, text) from public;
grant execute on function public.get_amendment_by_token(text) to anon, authenticated;
grant execute on function public.sign_amendment(text, text, text) to anon, authenticated;
