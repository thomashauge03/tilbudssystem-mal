import { createFileRoute } from "@tanstack/react-router";
import { CalculationForm } from "@/components/calculation-form";

export const Route = createFileRoute("/kalkyle/ny")({
  component: () => <CalculationForm />,
});
