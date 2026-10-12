import { createFileRoute } from "@tanstack/react-router";
import { CalculationForm } from "@/components/calculation-form";

export const Route = createFileRoute("/kalkyle/$id")({
  component: EditCalculation,
});

function EditCalculation() {
  const { id } = Route.useParams();
  // key: et nytt skjema når man går fra én kalkyle til en annen
  return <CalculationForm key={id} calculationId={id} />;
}
