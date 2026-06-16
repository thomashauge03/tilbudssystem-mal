import { createFileRoute } from "@tanstack/react-router";
import { OfferForm } from "@/components/offer-form";

export const Route = createFileRoute("/tilbud/ny")({
  component: () => <OfferForm />,
});
