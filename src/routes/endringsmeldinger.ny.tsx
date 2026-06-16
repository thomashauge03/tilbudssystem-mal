import { createFileRoute } from "@tanstack/react-router";
import { AmendmentForm } from "@/components/amendment-form";

export const Route = createFileRoute("/endringsmeldinger/ny")({
  component: () => <AmendmentForm />,
});
