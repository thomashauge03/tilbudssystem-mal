import { createFileRoute } from "@tanstack/react-router";
import { ProgressPlanForm } from "@/components/progress-plan-form";

export const Route = createFileRoute("/fremdriftsplan/$id")({
  component: PlanPage,
});

function PlanPage() {
  const { id } = Route.useParams();
  return <ProgressPlanForm planId={id} />;
}
