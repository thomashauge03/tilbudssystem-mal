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

  -- Ein tekst-default kan ikkje castast automatisk, så den må vekk først
  alter table public.offers alter column forbehold drop default;

  -- pg_input_is_valid (PG16+) lar oss sjekke JSON utan at castet kastar feil.
  -- Gamle verdiar som ikkje er JSON blir pakka som eitt element.
  alter table public.offers
    alter column forbehold type jsonb
    using case
      when forbehold is null or btrim(forbehold) = '' then '[]'::jsonb
      when pg_input_is_valid(forbehold, 'jsonb') then
        case
          when jsonb_typeof(forbehold::jsonb) = 'array' then forbehold::jsonb
          else jsonb_build_array(forbehold::jsonb)
        end
      else jsonb_build_array(to_jsonb(forbehold))
    end;

  alter table public.offers alter column forbehold set default '[]'::jsonb;
end $$;
