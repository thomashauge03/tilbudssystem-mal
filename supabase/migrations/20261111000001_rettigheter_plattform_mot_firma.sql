-- Plattformeier og firma-admin er to forskjellige ting.
--
-- Da den første firma-admin-en utenfor Techauge ble utnevnt (Hauge Maskin,
-- 2026-11-11), viste det seg at «admin i eget firma» ga makt over hele
-- plattformen. Testet som hver rolle før denne migrasjonen:
--
--   firma-admin kunne      se e-posten til alle brukere i alle firmaer, lese
--                          innstillinger og SMS-nøkler i andre firmaer, melde
--                          seg inn i andre firmaer som admin, slette brukere,
--                          og laste opp logo for andre firmaer
--   vanlig bruker kunne    slette hele sitt eget firma, melde ut medlemmer i
--                          andre firmaer, og slå opp e-posten til hvem som helst
--
-- Roten var is_system_admin(): den betydde «admin i firmaet mitt», men ble
-- brukt i RLS og i admin-funksjonene som om den betydde plattformeier.
--
-- Etter denne migrasjonen:
--   plattformeier (platform_admins)  styrer firmaer, brukere og koblinger
--   firma-admin                      Tripletex-kobling, SMS-nøkkel, logo og
--                                    roller — bare i sitt eget firma
--   bruker                           arbeider i sitt eget firma

-- ─── 1. Systemadmin = plattformeier ─────────────────────────────────────────
-- Beholdes som navn fordi RLS-regler (admin_all_settings, admin_all_tenants,
-- admin_all_tenant_users) og list_*-funksjonene bruker det.
create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_platform_admin();
$$;

-- Funksjonene under hadde ingen search_path. En security definer-funksjon
-- uten den kan lures til å bruke en annen tabell med samme navn.
create or replace function public.list_auth_users()
returns table(id uuid, email text, confirmed_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then raise exception 'Access denied'; end if;
  return query
    select u.id, u.email::text, u.email_confirmed_at, u.created_at
      from auth.users u
     order by u.created_at desc;
end;
$$;

create or replace function public.list_tenant_users()
returns table(id uuid, tenant_id uuid, user_id uuid, role text)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then raise exception 'Access denied'; end if;
  return query select tu.id, tu.tenant_id, tu.user_id, tu.role from public.tenant_users tu;
end;
$$;

create or replace function public.list_tenants()
returns table(id uuid, name text, slug text, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then raise exception 'Access denied'; end if;
  return query select t.id, t.name, t.slug, t.created_at from public.tenants t order by t.name;
end;
$$;

create or replace function public.confirm_user_email(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then raise exception 'Access denied'; end if;
  update auth.users set email_confirmed_at = now()
   where id = target_user_id and email_confirmed_at is null;
end;
$$;

create or replace function public.delete_auth_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then raise exception 'Access denied'; end if;
  delete from auth.users where id = target_user_id;
end;
$$;

-- Hadde ingen sjekk i det hele tatt, og kunne kalles uten innlogging.
create or replace function public.delete_tenant_user(tenant_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then raise exception 'Access denied'; end if;
  delete from public.tenant_users where id = tenant_user_id;
end;
$$;

-- ─── 2. Firmaet kan leses av sine egne, ikke endres eller slettes ───────────
-- tenants_self gjaldt ALL, så enhver bruker kunne slette sitt eget firma — og
-- med det alt som henger på det. Firmaer opprettes og slettes av plattform-
-- eieren gjennom admin_create_tenant / admin_delete_tenant.
drop policy if exists tenants_self on public.tenants;
drop policy if exists tenants_self_les on public.tenants;
create policy tenants_self_les on public.tenants
  for select using (id = public.current_tenant_id());

-- ─── 3. Navnet på den som godkjente: bare i eget firma ─────────────────────
-- Ga e-posten til hvilken som helst bruker man hadde id-en til.
create or replace function public.manuell_godkjenner(p_id uuid)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(
           u.raw_user_meta_data->>'full_name',
           u.raw_user_meta_data->>'name',
           u.email,
           'Ukjent bruker')
    from auth.users u
   where u.id = p_id
     and (public.is_platform_admin()
          or exists (select 1 from public.tenant_users tu
                      where tu.user_id = p_id
                        and tu.tenant_id = public.current_tenant_id()));
$$;

-- ─── 4. Filer: hvert firma i sin egen mappe ─────────────────────────────────
-- Logo: admin i firmaet som eier mappa (første del av stien er tenant-id),
-- eller plattformeieren. Før kunne en admin i ett firma bytte logoen til et
-- annet.
drop policy if exists "admin upload logos" on storage.objects;
drop policy if exists "admin update logos" on storage.objects;
drop policy if exists "admin delete logos" on storage.objects;

create policy "admin upload logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (public.is_platform_admin()
         or exists (select 1 from public.tenant_users tu
                     where tu.user_id = auth.uid() and tu.role = 'admin'
                       and tu.tenant_id::text = (storage.foldername(name))[1]))
  );

create policy "admin update logos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and (public.is_platform_admin()
         or exists (select 1 from public.tenant_users tu
                     where tu.user_id = auth.uid() and tu.role = 'admin'
                       and tu.tenant_id::text = (storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'logos'
    and (public.is_platform_admin()
         or exists (select 1 from public.tenant_users tu
                     where tu.user_id = auth.uid() and tu.role = 'admin'
                       and tu.tenant_id::text = (storage.foldername(name))[1]))
  );

create policy "admin delete logos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and (public.is_platform_admin()
         or exists (select 1 from public.tenant_users tu
                     where tu.user_id = auth.uid() and tu.role = 'admin'
                       and tu.tenant_id::text = (storage.foldername(name))[1]))
  );

-- Vedlegg: stien starter med tenant-id (tilbud og endringer) eller med id-en
-- til et tilbud (fremdriftsplaner). Før kunne enhver innlogget laste opp til
-- og slette fra alle firmaers mapper.
drop policy if exists "auth upload offer-attachments" on storage.objects;
drop policy if exists "auth delete offer-attachments" on storage.objects;

create policy "auth upload offer-attachments" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'offer-attachments'
    and ((storage.foldername(name))[1] = public.current_tenant_id()::text
         or exists (select 1 from public.offers o
                     where o.id::text = (storage.foldername(name))[1]
                       and o.tenant_id = public.current_tenant_id()))
  );

create policy "auth delete offer-attachments" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'offer-attachments'
    and ((storage.foldername(name))[1] = public.current_tenant_id()::text
         or exists (select 1 from public.offers o
                     where o.id::text = (storage.foldername(name))[1]
                       and o.tenant_id = public.current_tenant_id()))
  );

-- Opplasting med upsert oppdaterer en eksisterende fil, og trenger en
-- update-regel med samme grense. Uten den feilet det å laste opp en fil med
-- samme navn på nytt.
drop policy if exists "auth update offer-attachments" on storage.objects;
create policy "auth update offer-attachments" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'offer-attachments'
    and ((storage.foldername(name))[1] = public.current_tenant_id()::text
         or exists (select 1 from public.offers o
                     where o.id::text = (storage.foldername(name))[1]
                       and o.tenant_id = public.current_tenant_id()))
  );

-- ─── 5. Ingen admin-funksjoner uten innlogging ──────────────────────────────
-- Funksjonene sjekker selv, men det er ingen grunn til at anon skal kunne
-- kalle dem i det hele tatt. current_tenant_id, is_platform_admin og
-- is_system_admin blir stående: RLS-reglene kaller dem også for anon.
do $$
declare f text;
begin
  foreach f in array array[
    'admin_create_tenant(text,text)', 'admin_delete_tenant(uuid)',
    'admin_link_user(uuid,uuid,text)', 'admin_set_role(uuid,text)',
    'confirm_user_email(uuid)', 'delete_auth_user(uuid)', 'delete_tenant_user(uuid)',
    'list_auth_users()', 'list_tenant_users()', 'list_tenants()',
    'manuell_godkjenner(uuid)', 'rotate_sms_token()',
    'save_app_settings(uuid,text,text,text,text)',
    'las_opp_signert(text,uuid,text,integer)', 'las_igjen_signert(text,uuid)',
    'er_last_opp(text,uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
