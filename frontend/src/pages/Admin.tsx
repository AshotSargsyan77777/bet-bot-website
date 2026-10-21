import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { AdminStatsGrid } from "../components/stats/AdminStatsGrid";
import { useAuth } from "../context/AuthContext";
import { mediaUrl } from "../utils/mediaUrl";

type PaymentRow = {
  id: number;
  username: string;
  package_key: string;
  receipt_url: string | null;
  receipt_path?: string | null;
};

export function Admin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const payments = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () => api<PaymentRow[]>("/api/admin/payments/"),
    enabled: !!user?.is_admin,
  });
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api<Record<string, unknown>>("/api/admin/stats/"),
    enabled: !!user?.is_admin,
  });

  if (!user?.is_admin) {
    return (
      <div className="card">
        <PageHeader title="Admin" subtitle="Մուտք միայն ադմինի համար" />
      </div>
    );
  }

  const act = async (payment_id: number, action: "approve" | "reject") => {
    await api("/api/admin/payments/", { method: "POST", json: { payment_id, action } });
    qc.invalidateQueries({ queryKey: ["admin-payments"] });
  };

  const genPromo = async () => {
    const r = await api<{ codes: string[] }>("/api/admin/promo/", { method: "POST", json: { n: 5 } });
    alert(r.codes.join("\n"));
  };

  return (
    <div>
      <PageHeader title="🛠 Admin" eyebrow="Dashboard" />
      <div className="card card--glass">
        <button type="button" onClick={genPromo}>Գեներացնել 5 պրոմո</button>
        <div style={{ marginTop: "1.25rem" }}>
          <AdminStatsGrid data={stats.data as Parameters<typeof AdminStatsGrid>[0]["data"]} />
        </div>
      </div>
      <div className="card">
        <h3>Վճարումներ (pending)</h3>
        {(payments.data || []).map((p) => {
          const src = mediaUrl(p.receipt_path) ?? mediaUrl(p.receipt_url);
          return (
            <div key={p.id} className="combo-result">
              <p><strong>{p.username}</strong> — {p.package_key}</p>
              {src ? (
                <img className="receipt-preview" src={src} alt="Կտրոն" />
              ) : (
                <p className="muted">նկար չկա</p>
              )}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button type="button" onClick={() => act(p.id, "approve")}>Հաստատել</button>
                <button type="button" className="secondary" onClick={() => act(p.id, "reject")}>Մերժել</button>
              </div>
            </div>
          );
        })}
        {!payments.data?.length && <p className="muted">Չկա pending</p>}
      </div>
    </div>
  );
}
