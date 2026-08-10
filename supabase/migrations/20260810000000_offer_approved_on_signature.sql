-- Set tilbodsstatus til 'godkjent' automatisk når kunden signerer.
--
-- Signeringa skjer via RPC-en sign_offer, som set offers.customer_signed_at.
-- Vi legg logikken i ein trigger i staden for i sign_offer, slik at statusen
-- følgjer signaturen uansett kva veg han blir sett (RPC, dashboard, backfill).

create or replace function public.set_offer_approved_on_signature()
returns trigger
language plpgsql
as $$
begin
  -- Berre når ein signatur kjem inn (ikkje når han blir nullstilt)
  if new.customer_signed_at is not null
     and old.customer_signed_at is distinct from new.customer_signed_at
     and coalesce(new.status, '') <> 'godkjent' then
    new.status := 'godkjent';
  end if;
  return new;
end;
$$;

drop trigger if exists offers_approve_on_signature on public.offers;

create trigger offers_approve_on_signature
  before update of customer_signed_at on public.offers
  for each row
  execute function public.set_offer_approved_on_signature();

-- Rett opp tilbod som alt er signerte, men framleis står som utkast/sendt
update public.offers
   set status = 'godkjent'
 where customer_signed_at is not null
   and coalesce(status, '') <> 'godkjent';
