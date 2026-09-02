import { createFileRoute } from "@tanstack/react-router";
import { ProgressPlanForm } from "@/components/progress-plan-form";

export const Route = createFileRoute("/fremdriftsplan/ny")({
  component: NyPlanPage,
  // Planen opprettes ofte fra et tilbud. Da følger tilbudet med som ?tilbud=…
  validateSearch: (search: Record<string, unknown>) => ({
    tilbud: typeof search.tilbud === "string" ? search.tilbud : undefined,
  }),
});

function NyPlanPage() {
  const { tilbud } = Route.useSearch();
  return <ProgressPlanForm initialOfferId={tilbud} />;
}
