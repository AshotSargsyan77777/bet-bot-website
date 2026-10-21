import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { CheckPreview } from "../components/stats/CheckPreview";
import { useAuth } from "../context/AuthContext";

export function Status() {
  const { user } = useAuth();
  const status = useQuery({
    queryKey: ["status"],
    queryFn: () => api<{ has_active_check: boolean; package?: { label: string }; is_vip: boolean }>("/api/status/"),
    enabled: !!user,
  });
  const mine = useQuery({
    queryKey: ["mine-check"],
    queryFn: () => api<{ active: boolean; text?: string }>("/api/checks/mine/"),
    enabled: !!user,
  });
  const payments = useQuery({
    queryKey: ["payments"],
    queryFn: () => api<{ id: number; status: string; package_key: string }[]>("/api/payments/"),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="card">
        <PageHeader title="👤 Կարգավիճակ" subtitle="Մուտք գործեք հաշիվ դիտելու համար" />
        <Link to="/login" className="btn">Մուտք</Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="👤 Կարգավիճակ" />
      <div className="grid">
        <div className="card card--interactive">
          {status.data?.has_active_check ? (
            <p>✅ Ակտիվ չեկ: <strong>{status.data.package?.label}</strong></p>
          ) : (
            <p>❌ Ակտիվ չեկ չունես — <Link to="/checks">ընտրել փաթեթ</Link></p>
          )}
          {status.data?.is_vip && <p>👑 VIP Կանալ: Ակտիվ է</p>}
        </div>
        <div className="card card--interactive">
          <h3>Վճարումներ</h3>
          <ul className="match-list">
            {(payments.data || []).map((p) => (
              <li key={p.id}>{p.package_key} — <span className="gradient-text">{p.status}</span></li>
            ))}
            {!payments.data?.length && <li className="muted">Դեռ վճարումներ չկան</li>}
          </ul>
        </div>
      </div>
      {mine.data?.active && mine.data.text && (
        <div className="card">
          <h3>Ձեր չեկը</h3>
          <CheckPreview text={mine.data.text} />
        </div>
      )}
    </div>
  );
}
