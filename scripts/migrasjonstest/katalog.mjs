// Spørringer mot systemkatalogen som kjøres likt mot produksjonen og mot PGlite,
// så resultatene kan sammenlignes rad for rad. Bare metadata, aldri innholdet i
// tabellene.

const ikkeUtvidelse = (oid) =>
  `not exists (select 1 from pg_depend d where d.objid = ${oid} and d.deptype = 'e')`;

export const sporringer = {
  tabeller: `
    select c.relname as navn, c.relkind::text as type, c.relrowsecurity as rls,
           c.relforcerowsecurity as force_rls,
           coalesce(c.relacl::text[], '{}'::text[]) as acl,
           obj_description(c.oid, 'pg_class') as kommentar,
           pg_get_userbyid(c.relowner) as eier,
           coalesce(c.reloptions, '{}'::text[]) as lagringsvalg,
           c.relreplident::text as replika_id, c.relpersistence::text as varighet
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p','v','m','f','S')
       and ${ikkeUtvidelse("c.oid")}
     order by 1`,

  kolonner: `
    select c.relname as tabell, a.attname as kolonne,
           (row_number() over (partition by c.oid order by a.attnum))::int as pos,
           format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as ikke_null,
           pg_get_expr(d.adbin, d.adrelid) as standard,
           a.attidentity::text as identitet, a.attgenerated::text as generert,
           col_description(c.oid, a.attnum) as kommentar,
           coalesce(a.attacl::text[], '{}'::text[]) as acl
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
       and a.attnum > 0 and not a.attisdropped
       and ${ikkeUtvidelse("c.oid")}
     order by 1, 3`,

  // contype 'n' er NOT NULL som egen begrensning, som bare finnes fra Postgres 18.
  // Den sammenlignes allerede gjennom kolonnene.
  begrensninger: `
    select c.relname as tabell, k.conname as navn, k.contype::text as type,
           pg_get_constraintdef(k.oid) as def
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and k.contype <> 'n'
     order by 1, 2`,

  indekser: `
    select t.relname as tabell, i.relname as navn, pg_get_indexdef(i.oid) as def,
           exists (select 1 from pg_constraint k
                    where k.conindid = i.oid and k.conrelid = t.oid
                      and k.contype in ('p','u','x')) as fra_begrensning
      from pg_index x
      join pg_class i on i.oid = x.indexrelid
      join pg_class t on t.oid = x.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
     order by 1, 2`,

  funksjoner: `
    select p.proname as navn, pg_get_function_identity_arguments(p.oid) as args,
           p.prokind::text as type,
           case when p.prokind in ('f','p') then pg_get_functiondef(p.oid) end as def,
           coalesce(p.proacl::text[], '{}'::text[]) as acl,
           pg_get_userbyid(p.proowner) as eier,
           obj_description(p.oid, 'pg_proc') as kommentar
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and ${ikkeUtvidelse("p.oid")}
     order by 1, 2`,

  triggere: `
    select n.nspname as skjema, c.relname as tabell, t.tgname as navn,
           pg_get_triggerdef(t.oid) as def, t.tgenabled::text as aktiv
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace pn on pn.oid = p.pronamespace
     where not t.tgisinternal and (n.nspname = 'public' or pn.nspname = 'public')
     order by 1, 2, 3`,

  policyer: `
    select schemaname::text as skjema, tablename::text as tabell, policyname::text as navn,
           permissive, roles::text[] as roller, cmd, qual, with_check
      from pg_policies
     where schemaname in ('public', 'storage')
     order by 1, 2, 3`,

  visninger: `
    select viewname::text as navn, definition as def, 'v' as type
      from pg_views where schemaname = 'public'
    union all
    select matviewname::text, definition, 'm'
      from pg_matviews where schemaname = 'public'
     order by 1`,

  sekvenser: `
    select c.relname as navn, format_type(s.seqtypid, null) as type,
           s.seqstart::text as start, s.seqincrement::text as steg,
           s.seqmin::text as min, s.seqmax::text as max, s.seqcycle as syklus,
           (select dc.relname || '.' || a.attname
              from pg_depend d
              join pg_class dc on dc.oid = d.refobjid
              join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
             where d.classid = 'pg_class'::regclass and d.objid = c.oid
               and d.deptype in ('a','i') limit 1) as eid_av,
           coalesce(c.relacl::text[], '{}'::text[]) as acl
      from pg_sequence s
      join pg_class c on c.oid = s.seqrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
     order by 1`,

  typer: `
    select t.typname::text as navn, t.typtype::text as type,
           (select array_agg(e.enumlabel::text order by e.enumsortorder)
              from pg_enum e where e.enumtypid = t.oid) as verdier,
           case when t.typtype = 'd' then format_type(t.typbasetype, t.typtypmod) end as basistype
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
       and (t.typtype in ('e','d')
            or (t.typtype = 'c' and exists (select 1 from pg_class c
                                             where c.oid = t.typrelid and c.relkind = 'c')))
       and ${ikkeUtvidelse("t.oid")}
     order by 1`,

  utvidelser: `
    select e.extname::text as navn, e.extversion as versjon, n.nspname::text as skjema
      from pg_extension e join pg_namespace n on n.oid = e.extnamespace
     order by 1`,

  skjemarettigheter: `
    select nspname::text as navn, coalesce(nspacl::text[], '{}'::text[]) as acl,
           pg_get_userbyid(nspowner) as eier
      from pg_namespace where nspname = 'public'`,

  publikasjoner: `
    select pubname::text as navn, tablename::text as tabell
      from pg_publication_tables where schemaname = 'public'
     order by 1, 2`,

  bøtter: `
    select id::text, name::text as navn, public as offentlig,
           file_size_limit::text as grense, allowed_mime_types::text[] as typer
      from storage.buckets
     order by 1`,
};
