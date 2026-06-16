-- Security definer function so admin can upsert app_settings for any tenant
create or replace function save_app_settings(
  p_tenant_id      uuid,
  p_company_name   text,
  p_company_tagline text,
  p_primary_color  text,
  p_logo_url       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only allow admins (users who have role='admin' in any tenant_users row)
  if not exists (
    select 1 from tenant_users
    where user_id = auth.uid() and role = 'admin'
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
