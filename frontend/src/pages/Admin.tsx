import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { CandidatesPanel } from "../components/admin/CandidatesPanel";
import { ChecksPanel } from "../components/admin/ChecksPanel";
import { PaymentsPanel } from "../components/admin/PaymentsPanel";
import { PromoPanel } from "../components/admin/PromoPanel";
import { SupportPanel } from "../components/admin/SupportPanel";
import { PageHeader } from "../components/PageHeader";
import { AdminStatsGrid, type StatsPayload } from "../components/stats/AdminStatsGrid";

export function Admin() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api<StatsPayload>("/api/admin/stats/"),
    refetchInterval: 60000,
  });

  return (
    <div>
      <PageHeader title="🛠 Admin" eyebrow="Dashboard" />
      <div className="card card--glass">
        {stats.isError ? <p className="field__error">{stats.error.message}</p> : <AdminStatsGrid data={stats.data} />}
      </div>
      <PaymentsPanel />
      <SupportPanel />
      <ChecksPanel />
      <PromoPanel />
      <CandidatesPanel />
    </div>
  );
}
