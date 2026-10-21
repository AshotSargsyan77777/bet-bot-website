import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";

export function Vip() {
  const { user } = useAuth();
  const vip = useQuery({
    queryKey: ["vip", user?.id],
    queryFn: () => api<{ is_vip: boolean; link: string; price: number }>("/api/vip/status/"),
  });

  return (
    <div>
      <PageHeader title="👑 VIP Կանալ" subtitle="Էքսկլուզիվ հղում Telegram-ում + կոնստրուկտոր" />
      <div className="card pkg-card--vip card--glass" style={{ maxWidth: 520 }}>
        {vip.isLoading && <div className="loading-shimmer" />}
        {vip.isError && <p className="field__error">{vip.error.message}</p>}
        {vip.data?.is_vip ? (
          <>
            {vip.data.link ? (
              <p>
                🎉 VIP հղումը՝{" "}
                <a href={vip.data.link} target="_blank" rel="noreferrer" className="gradient-text">{vip.data.link}</a>
              </p>
            ) : (
              <p>🎉 Դուք VIP եք։ Հղումը ստանալու համար գրեք <Link to="/help">support</Link>-ին։</p>
            )}
            <Link to="/combinator" className="btn" style={{ marginTop: "1rem", display: "inline-block" }}>🎯 Կոնստրուկտոր</Link>
          </>
        ) : vip.data ? (
          <>
            <p className="pkg-card__price">{vip.data.price.toLocaleString()} դրամ</p>
            <p className="muted">Մուտք VIP խումբ — հաստատում ադմինից վճարումից հետո</p>
            {user ? (
              <Link to="/pay/pkg_vip" className="btn btn--lg" style={{ marginTop: "1rem", display: "inline-block" }}>
                💎 Գնել մուտք
              </Link>
            ) : (
              <Link to="/login" className="btn">Մուտք</Link>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
