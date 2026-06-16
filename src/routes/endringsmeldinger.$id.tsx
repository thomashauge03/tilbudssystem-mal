import { createFileRoute } from "@tanstack/react-router";
import { AmendmentForm } from "@/components/amendment-form";

export const Route = createFileRoute("/endringsmeldinger/$id")({
  component: EditAmendment,
});

function EditAmendment() {
  const { id } = Route.useParams();
  return <AmendmentForm amendmentId={id} />;
}
