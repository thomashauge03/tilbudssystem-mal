-- ---------------------------------------------------------------------------
-- Tenant-isolasjon: tetter selvforfremmelse og kryssing mellom tenants
-- ---------------------------------------------------------------------------
--
-- Malen SKAL kunne kjøre flere tenants i samme base. Den skal IKKE la data
-- eller rettigheter lekke mellom dem. To hull sto igjen:
--
--   1. tenant_users_self hadde ingen FOR-klausul, altså FOR ALL, og
--      WITH CHECK låste bare user_id. En vanlig bruker kunne dermed kjøre
--
--          update tenant_users set role = 'admin' where user_id = auth.uid();
--
--      og bli admin, eller bytte sin egen tenant_id og lese et annet firmas
--      data — fordi current_tenant_id() nettopp leser tenant_id fra denne
--      raden. Én policy uten kolonnelås åpnet hele modellen.
--
--   2. is_system_admin() svarer «er du admin i NOEN tenant». Den vokter
--      admin_create_tenant, admin_delete_tenant og admin_link_user. En admin
--      hos kunde A kunne derfor slette kunde B sin tenant, eller gi seg selv
--      en rad hos B. Tenant-admin og plattform-eier var samme rolle.
--
-- Fiksene under er additive og bevarer dagens oppførsel for den som eier
-- systemet. Ingen klientkode skriver til tenant_users — alt medlemskap går
-- allerede gjennom SECURITY DEFINER-funksjonene — så innstrammingen til
-- FOR SELECT tar ikke bort funksjonalitet.

-- ---------------------------------------------------------------------------
-- 1. tenant_users: lesbar for eier av raden, aldri skrivbar direkte
-- ---------------------------------------------------------------------------
drop policy if exists "tenant_users_self" on tenant_users;

create policy "tenant_users_self_les" on tenant_users
  for select
  using (user_id = auth.uid());

-- Ingen insert/update/delete-policy med vilje. RLS nekter alt som ikke er
-- eksplisitt tillatt, så rollen og tenant_id kan bare endres gjennom
-- admin-funksjonene nedenfor, som kjører SECURITY DEFINER med egen vakt.

-- ---------------------------------------------------------------------------
-- 2. Skill plattform-eier fra tenant-admin
-- ---------------------------------------------------------------------------
create table if not exists platform_admins (
  user_id    uuid primary key,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

-- Ingen policy = ingen tilgang for anon eller authenticated. Tabellen leses
-- kun av SECURITY DEFINER-funksjoner og av service_role.
revoke all on platform_admins from anon, authenticated;

-- Bootstrap: alle som er admin i dag beholder dagens rettigheter, slik at
-- migrasjonen ikke låser ute eieren. Trim denne tabellen manuelt etterpå til
-- kun de som faktisk skal kunne opprette og slette tenants:
--     delete from platform_admins where user_id <> '<eier-uuid>';
insert into platform_admins (user_id)
  select distinct user_id from tenant_users where role = 'admin'
  on conflict (user_id) do nothing;

create or replace function is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 3. current_tenant_id(): deterministisk ved flere medlemskap
-- ---------------------------------------------------------------------------
-- «limit 1» uten order by ga vilkårlig tenant dersom en bruker var medlem av
-- to. Med flere tenants i samme base er det en reell feilkilde, ikke bare et
-- skjønnhetsproblem: hvilken kunde sine data du så var opp til planleggeren.
create or replace function current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id
  from tenant_users
  where user_id = auth.uid()
  order by created_at, id
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. Tenant-livssyklus krever plattform-eier, ikke bare «en admin et sted»
-- ---------------------------------------------------------------------------
create or replace function admin_create_tenant(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_platform_admin() then raise exception 'Access denied'; end if;
  insert into tenants (name, slug) values (p_name, p_slug) returning id into v_id;
  return v_id;
end;
$$;

create or replace function admin_delete_tenant(p_tenant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Access denied'; end if;
  delete from tenants where id = p_tenant_id;
end;
$$;

create or replace function admin_link_user(p_user_id uuid, p_tenant_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Access denied'; end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Ugyldig rolle';
  end if;
  insert into tenant_users (user_id, tenant_id, role)
  values (p_user_id, p_tenant_id, p_role)
  on conflict (user_id, tenant_id) do update set role = excluded.role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. admin_set_role: tenant-admin får styre sine egne, men ikke andres
-- ---------------------------------------------------------------------------
create or replace function admin_set_role(p_tenant_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if p_role not in ('admin', 'member') then
    raise exception 'Ugyldig rolle';
  end if;

  select tenant_id into v_tenant from tenant_users where id = p_tenant_user_id;
  if v_tenant is null then raise exception 'Ukjent medlem'; end if;

  -- Plattform-eier kan sette rolle hvor som helst. En tenant-admin kan bare
  -- gjøre det innenfor sin egen tenant — ellers var vi like langt.
  if not (
    is_platform_admin()
    or (v_tenant = current_tenant_id()
        and exists (select 1 from tenant_users
                    where user_id = auth.uid()
                      and tenant_id = v_tenant
                      and role = 'admin'))
  ) then
    raise exception 'Access denied';
  end if;

  update tenant_users set role = p_role where id = p_tenant_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. is_system_admin(): «admin i din egen tenant», ikke «admin et sted»
-- ---------------------------------------------------------------------------
create or replace function is_system_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_users
    where user_id = auth.uid()
      and role = 'admin'
      and tenant_id = current_tenant_id()
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. save_app_settings: tenant_id fra parameter må valideres
-- ---------------------------------------------------------------------------
-- Funksjonen tok p_tenant_id fra kalleren, men sjekket bare «har du role=admin
-- i en eller annen rad». En admin hos kunde A kunne dermed sende inn kunde B
-- sin tenant_id og overskrive deres firmanavn, logo og farger. Klassisk IDOR:
-- rettigheten ble sjekket, men ikke mot objektet den gjaldt.
--
-- Signaturen må være identisk med originalen i 20260616000005, ellers lager
-- create or replace en ny overload og lar den sårbare stå igjen.
create or replace function save_app_settings(
  p_tenant_id      uuid,
  p_company_name   text,
  p_company_tagline text,
  p_primary_color  text,
  p_logo_url       text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    is_platform_admin()
    or (exists (select 1 from tenant_users
                where user_id = auth.uid()
                  and tenant_id = p_tenant_id
                  and role = 'admin'))
  ) then
    raise exception 'Access denied: admin only';
  end if;

  insert into app_settings (tenant_id, company_name, company_tagline, primary_color, logo_url, updated_at)
  values (p_tenant_id, p_company_name, p_company_tagline, p_primary_color, p_logo_url, now())
  on conflict (tenant_id) do update set
    company_name    = excluded.company_name,
    company_tagline = excluded.company_tagline,
    primary_color   = excluded.primary_color,
    logo_url        = excluded.logo_url,
    updated_at      = excluded.updated_at;
end;
$$;
