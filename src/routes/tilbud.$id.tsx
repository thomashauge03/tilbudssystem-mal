import { createFileRoute } from "@tanstack/react-router";
import { OfferForm } from "@/components/offer-form";

export const Route = createFileRoute("/tilbud/$id")({
  component: EditOffer,
});

function EditOffer() {
  const { id } = Route.useParams();
  return <OfferForm offerId={id} />;
}
