import { createFileRoute } from "@tanstack/react-router";
import { useDashboard } from "@/lib/dashboard-data";
import { DashboardVisning } from "@/components/dashboard/dashboard-visning";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

// Ruten henter bare tallene. Utregningen ligger i @/lib/dashboard-data og
// visningen i @/components/dashboard, så begge kan prøves hver for seg.
function Dashboard() {
  const { data, isLoading, error, refetch } = useDashboard();
  return (
    <DashboardVisning
      data={data}
      isLoading={isLoading}
      error={error}
      onRetry={() => {
        void refetch();
      }}
    />
  );
}
