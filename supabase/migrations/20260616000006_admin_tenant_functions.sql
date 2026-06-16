-- Helper: check if current user is admin in any tenant
create or replace function is_system_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from tenant_users where user_id = auth.uid() and role = 'admin'
  );
$$;

-- Create a new tenant
create or replace function admin_create_tenant(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_system_admin() then raise exception 'Access denied'; end if;
  insert into tenants (name, slug) values (p_name, p_slug) returning id into v_id;
  return v_id;
end;
$$;

-- Delete a tenant (cascades to all data)
create or replace function admin_delete_tenant(p_tenant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_system_admin() then raise exception 'Access denied'; end if;
  delete from tenants where id = p_tenant_id;
end;
$$;

-- Link a user to a tenant with a role
create or replace function admin_link_user(p_user_id uuid, p_tenant_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_system_admin() then raise exception 'Access denied'; end if;
  insert into tenant_users (user_id, tenant_id, role)
  values (p_user_id, p_tenant_id, p_role)
  on conflict (user_id, tenant_id) do update set role = excluded.role;
end;
$$;

-- Assign admin role to a user within their tenant
create or replace function admin_set_role(p_tenant_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_system_admin() then raise exception 'Access denied'; end if;
  update tenant_users set role = p_role where id = p_tenant_user_id;
end;
$$;
