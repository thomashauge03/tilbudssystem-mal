-- Grunnlinje, del 1: det som ble laget rett i produksjonsbasen og aldri sto i
-- en migrasjon, men som resten av kjeden bygger på.
--
-- Kjeden kunne ikke bygge en tom base. 20260810000000 bruker
-- offers.customer_signed_at, og 20260915000001 og 20260915000004 deklarerer
-- variabler av typen offer_signing_tokens, men ingen migrasjon før dem lager
-- kolonnen eller tabellen. Kartleggingen 7. oktober 2026 fant mer av samme
-- slag: kolonner i app_settings og offers, nummereringen av tilbud, seks
-- adminfunksjoner, fire policyer, åtte indekser og begge lagringsbøttene med
-- policyene sine. Hele lista står i docs/migrasjoner-grunnlinje.md.
--
-- Alt er hentet fra produksjonens systemkatalog 7. oktober 2026, skrivebeskyttet.
-- Filen lager bare det som mangler: kolonner og indekser med if not exists,
-- policyer og triggere bak en sjekk, og funksjonene med samme tekst som i basen.
-- I produksjon finnes alt fra før, så der registreres filen som kjørt uten å
-- kjøres (se docs/migrasjoner-grunnlinje.md).
--
-- Hvorfor her og ikke før 20260616000000: alt som mangler henger på tabellene
-- 20260616000000 lager (tenants, tenant_users, app_settings, offers). Før den
-- finnes det ingenting å legge kolonner, policyer eller triggere på. Den første
-- migrasjonen som trenger noe herfra er 20260810000000, og de åtte første er de
-- som står registrert i produksjonens migrasjonshistorikk.
--
-- Kolonnene legges til i samme rekkefølge som i basen, så en ny base får
-- kolonnene i samme rekkefølge som produksjon.

-- ─── Firmaoppsett ──────────────────────────────────────────────────────────
-- units og email_subject_template står med erstatningstegnet U+FFFD i
-- produksjon, der det skulle stått m², m³ og et skilletegn i emnet. Tegnene ble
-- ødelagt da kolonnene ble laget. De gjengis slik de står (U& viser hvor), og
-- rettes i en egen migrasjon.
alter table public.app_settings
  add column if not exists logo_url               text,
  add column if not exists primary_color          text default '#dc2626',
  add column if not exists company_tagline        text not null default '',
  add column if not exists our_refs               jsonb not null default '[]'::jsonb,
  add column if not exists units                  jsonb not null
    default U&'["stk", "m", "m\FFFD", "m\FFFD", "tonn", "time", "dag", "ls"]'::jsonb,
  add column if not exists forbehold              jsonb not null default '[]'::jsonb,
  add column if not exists payment_terms          text not null default '30 dager netto',
  add column if not exists default_offer_text     text not null default '',
  add column if not exists email_subject_template text not null
    default U&'Tilbud #{nr} \FFFD {tittel}',
  add column if not exists vat_pct                numeric(5,2) not null default 25,
  add column if not exists closing_page_offset_mm integer not null default 90,
  add column if not exists company_org_nr         text default '';

-- ─── Tilbud ────────────────────────────────────────────────────────────────
alter table public.offers
  add column if not exists customer_signed_at timestamptz,
  add column if not exists contract_signed    boolean not null default false,
  add column if not exists attachment_urls    jsonb default '[]'::jsonb;

-- Tilbudsnummeret settes av en trigger, fortløpende per firma fra 1001, og ikke
-- av sekvensen offer_number_seq fra 20260616000000. Sekvensen står igjen ubrukt,
-- som i produksjon.
alter table public.offers alter column offer_number drop default;

CREATE OR REPLACE FUNCTION public.set_offer_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN IF NEW.offer_number IS NULL THEN PERFORM pg_advisory_xact_lock(hashtext(coalesce(NEW.tenant_id::text, ''))); SELECT COALESCE(MAX(offer_number), 1000) + 1 INTO NEW.offer_number FROM offers WHERE tenant_id = NEW.tenant_id; END IF; RETURN NEW; END; $function$;

do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.offers'::regclass
                    and tgname = 'trg_set_offer_number'
                    and not tgisinternal) then
    create trigger trg_set_offer_number
      before insert on public.offers
      for each row execute function public.set_offer_number();
  end if;
end $$;

create unique index if not exists offers_tenant_offer_number_uniq
  on public.offers (tenant_id, offer_number);

-- ─── Signeringslenker for tilbud ───────────────────────────────────────────
-- Samme tabell som i 20261007000000, som lager den med if not exists. Den må
-- finnes her fordi 20260915000001 og 20260915000004 bruker radtypen. Indeksene
-- og policyen kommer i 20261007000000, men RLS slås på med en gang, så tabellen
-- aldri står åpen.
create table if not exists public.offer_signing_tokens (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  offer_id         uuid not null references public.offers(id) on delete cascade,
  token            text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  used_at          timestamptz,
  signer_name      text,
  signer_ip        text,
  created_at       timestamptz default now(),
  signer_signature text
);

alter table public.offer_signing_tokens enable row level security;

-- ─── Adminfunksjoner ───────────────────────────────────────────────────────
-- Brukes av adminsiden (src/routes/admin.tsx). Teksten er kopiert ordrett fra
-- basen.
--
-- NB: delete_tenant_user sjekker ikke is_system_admin() slik de andre gjør, og
-- kan kjøres av anon. Den gjengis slik den står, og strammes inn i en egen
-- migrasjon.
CREATE OR REPLACE FUNCTION public.list_tenants()
 RETURNS TABLE(id uuid, name text, slug text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ BEGIN IF NOT is_system_admin() THEN RAISE EXCEPTION 'Access denied'; END IF; RETURN QUERY SELECT t.id, t.name, t.slug, t.created_at FROM tenants t ORDER BY t.name; END; $function$;

CREATE OR REPLACE FUNCTION public.list_tenant_users()
 RETURNS TABLE(id uuid, tenant_id uuid, user_id uuid, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ BEGIN IF NOT is_system_admin() THEN RAISE EXCEPTION 'Access denied'; END IF; RETURN QUERY SELECT tu.id, tu.tenant_id, tu.user_id, tu.role FROM tenant_users tu; END; $function$;

CREATE OR REPLACE FUNCTION public.list_auth_users()
 RETURNS TABLE(id uuid, email text, confirmed_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ BEGIN IF NOT is_system_admin() THEN RAISE EXCEPTION 'Access denied'; END IF; RETURN QUERY SELECT u.id, u.email::text, u.email_confirmed_at, u.created_at FROM auth.users u ORDER BY u.created_at DESC; END; $function$;

CREATE OR REPLACE FUNCTION public.confirm_user_email(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ BEGIN IF NOT is_system_admin() THEN RAISE EXCEPTION 'Access denied'; END IF; UPDATE auth.users SET email_confirmed_at = now() WHERE id = target_user_id AND email_confirmed_at IS NULL; END; $function$;

CREATE OR REPLACE FUNCTION public.delete_auth_user(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ BEGIN IF NOT is_system_admin() THEN RAISE EXCEPTION 'Access denied'; END IF; DELETE FROM auth.users WHERE id = target_user_id; END; $function$;

CREATE OR REPLACE FUNCTION public.delete_tenant_user(tenant_user_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  delete from tenant_users where id = tenant_user_id;
$function$;

-- ─── Policyer ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                    and tablename = 'tenants' and policyname = 'admin_all_tenants') then
    create policy admin_all_tenants on public.tenants
      using (public.is_system_admin()) with check (public.is_system_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                    and tablename = 'tenant_users' and policyname = 'admin_all_tenant_users') then
    create policy admin_all_tenant_users on public.tenant_users
      using (public.is_system_admin()) with check (public.is_system_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                    and tablename = 'tenant_users' and policyname = 'tenant_users_self_read') then
    create policy tenant_users_self_read on public.tenant_users
      for select using (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                    and tablename = 'app_settings' and policyname = 'admin_all_settings') then
    create policy admin_all_settings on public.app_settings
      using (public.is_system_admin()) with check (public.is_system_admin());
  end if;
end $$;

-- ─── Indekser ──────────────────────────────────────────────────────────────
create index if not exists idx_amendments_tenant_id
  on public.amendments (tenant_id);
create index if not exists idx_offers_tenant_status
  on public.offers (tenant_id, status);
create index if not exists idx_offers_valid_until_godkjent
  on public.offers (valid_until) where status = 'godkjent';
create index if not exists idx_payments_amendment_id
  on public.payments (amendment_id);
create index if not exists idx_payments_offer_id
  on public.payments (offer_id);
create index if not exists idx_potential_customers_tenant_status
  on public.potential_customers (tenant_id, status);
create index if not exists idx_tenant_users_user_id
  on public.tenant_users (user_id);

-- ─── Lagring ───────────────────────────────────────────────────────────────
-- Bøttene til logoer og vedlegg, og policyene på storage.objects, slik de står.
--
-- NB: policyene skiller ikke mellom firmaer. En admin i ett firma kan endre og
-- slette logoene til alle, en innlogget bruker kan slette alle vedlegg, og alle
-- (også anon) kan liste filene i begge bøttene. Det tas i en egen migrasjon.
insert into storage.buckets (id, name, public, file_size_limit)
values ('logos', 'logos', true, null),
       ('offer-attachments', 'offer-attachments', true, 20971520)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage'
                    and tablename = 'objects' and policyname = 'public read logos') then
    create policy "public read logos" on storage.objects
      for select using (bucket_id = 'logos');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                    and tablename = 'objects' and policyname = 'admin upload logos') then
    create policy "admin upload logos" on storage.objects
      for insert with check (
        bucket_id = 'logos'
        and exists (select 1 from public.tenant_users
                     where tenant_users.user_id = auth.uid()
                       and tenant_users.role = 'admin'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                    and tablename = 'objects' and policyname = 'admin update logos') then
    create policy "admin update logos" on storage.objects
      for update using (
        bucket_id = 'logos'
        and exists (select 1 from public.tenant_users
                     where tenant_users.user_id = auth.uid()
                       and tenant_users.role = 'admin'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                    and tablename = 'objects' and policyname = 'admin delete logos') then
    create policy "admin delete logos" on storage.objects
      for delete using (
        bucket_id = 'logos'
        and exists (select 1 from public.tenant_users
                     where tenant_users.user_id = auth.uid()
                       and tenant_users.role = 'admin'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                    and tablename = 'objects' and policyname = 'public read offer-attachments') then
    create policy "public read offer-attachments" on storage.objects
      for select using (bucket_id = 'offer-attachments');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                    and tablename = 'objects' and policyname = 'auth upload offer-attachments') then
    create policy "auth upload offer-attachments" on storage.objects
      for insert to authenticated with check (bucket_id = 'offer-attachments');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                    and tablename = 'objects' and policyname = 'auth delete offer-attachments') then
    create policy "auth delete offer-attachments" on storage.objects
      for delete to authenticated using (bucket_id = 'offer-attachments');
  end if;
end $$;
