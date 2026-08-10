-- offers.forbehold blei oppretta som `text`, men appen lagrar ei liste med
-- objekt ({title, description}). Verdien kjem difor tilbake som JSON-streng i
-- staden for array, og avkryssinga i tilbodsskjemaet såg tom ut.
--
-- Konverter til jsonb. Køyrer trygt fleire gonger.

do $$
declare
  col_type text;
begin
  select data_type into col_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'offers' and column_name = 'forbehold';

  if col_type is null then
    raise notice 'offers.forbehold finst ikkje – hoppar over';
    return;
  end if;

  if col_type = 'jsonb' then
    raise notice 'offers.forbehold er alt jsonb – hoppar over';
    return;
  end if;

  -- Tomme/ugyldige verdiar blir til tom liste i staden for å stoppe migrasjonen
  alter table public.offers
    alter column forbehold type jsonb
    using case
      when forbehold is null or btrim(forbehold) = '' then '[]'::jsonb
      when btrim(forbehold) like '[%' then
        coalesce(
          (select forbehold::jsonb),
          '[]'::jsonb
        )
      else to_jsonb(array[forbehold])
    end;

  alter table public.offers alter column forbehold set default '[]'::jsonb;
end $$;
