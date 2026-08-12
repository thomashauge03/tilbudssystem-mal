-- Endringsmeldinger kunne ikke lagres i det hele tatt.
--
-- amendments.amendment_number ble opprettet som `int`
-- (20260616000002_add_missing_columns.sql), men appen genererer et sammensatt
-- nummer på formen "<prosjektnr>-<løpenummer>", f.eks. "1001-3". Innsettingen
-- feilet derfor med "invalid input syntax for type integer", og nextNumber()
-- sitt LIKE-søk mot kolonnen feilet på samme grunnlag.
--
-- Tabellen er tom (0 rader bekreftet 2026-08-12), så konverteringen er triviell.

do $$
declare
  col_type text;
begin
  select data_type into col_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'amendments' and column_name = 'amendment_number';

  if col_type is null then
    raise notice 'amendments.amendment_number finnes ikke – hopper over';
    return;
  end if;

  if col_type = 'text' then
    raise notice 'amendments.amendment_number er allerede text – hopper over';
    return;
  end if;

  alter table public.amendments alter column amendment_number drop default;
  alter table public.amendments
    alter column amendment_number type text
    using amendment_number::text;
end $$;
