import { createFileRoute } from "@tanstack/react-router";
import { AmendmentForm } from "@/components/amendment-form";

// ?offer=<id> settes når man oppretter kravet fra inne i et tilbud, slik at
// tilbudet og prosjektet blir fylt inn automatisk.
export const Route = createFileRoute("/endringsmeldinger/ny")({
  validateSearch: (search: Record<string, unknown>): { offer?: string } => ({
    offer: typeof search.offer === "string" ? search.offer : undefined,
  }),
  component: NewAmendment,
});

function NewAmendment() {
  const { offer } = Route.useSearch();
  return <AmendmentForm initialOfferId={offer} />;
}
