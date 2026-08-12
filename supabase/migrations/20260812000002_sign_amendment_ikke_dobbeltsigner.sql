-- sign_amendment sjekket bare om selve tokenet var brukt, ikke om kravet
-- allerede var signert. Ba man om en ny signeringslenke på en ferdig signert
-- endringsmelding, fikk man et ubrukt token, og en ny signering ville
-- overskrevet customer_signed_at og signaturen som allerede lå der.
--
-- Erstatter funksjonen med en som også avviser når kravet er signert fra før.
-- Nullstilling ("Nullstill signatur") setter customer_signed_at = null igjen,
-- og da slipper en ny signering gjennom som forventet.

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

  select * into a from amendments where id = t.amendment_id for update;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;
  if a.customer_signed_at is not null then
    raise exception 'Denne endringen er allerede signert';
  end if;

  update amendment_signing_tokens
     set used_at = now(),
         signer_name = btrim(p_signer_name),
         signer_signature = p_signer_signature
   where id = t.id;

  -- Triggeren setter status til 'endringsmelding'
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

revoke all on function public.sign_amendment(text, text, text) from public;
grant execute on function public.sign_amendment(text, text, text) to anon, authenticated;
