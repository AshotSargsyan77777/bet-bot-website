import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { CheckPreview } from "../components/stats/CheckPreview";
import { useAuth } from "../context/AuthContext";
import type { Catalog, MyCheck } from "../types/catalog";
import { packageMeta } from "../utils/packageMeta";

export function Checks() {
  const { user } = useAuth();
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api<Catalog>("/api/checks/catalog/"),
  });
  const mine = useQuery({
    queryKey: ["mine-check"],
    queryFn: () => api<MyCheck>("/api/checks/mine/"),
    enabled: !!user,
  });

  if (catalog.isLoading) return <div className="loading-shimmer" />;
  if (catalog.isError) {
    return (
      <div className="card">
        <PageHeader title="📊 Օրվա չեկերը" />
        <p className="field__error">Չհաջողվեց բեռնել փաթեթները. {catalog.error.message}</p>
        <button type="button" onClick={() => catalog.refetch()}>Կրկին փորձել</button>
      </div>
    );
  }

  const data = catalog.data!;
  const packages = data.packages.filter((p) => p.purchasable);
  const isToday = data.checks_date === data.today;

  return (
    <div>
      <PageHeader
        eyebrow="Օրվա փաթեթներ"
        title="📊 Օրվա չեկերը"
        subtitle={`Ամսաթիվ: ${data.checks_date || "—"}${data.checks_date && !isToday ? " (այսօրվա չեկերը դեռ պատրաստ չեն)" : ""} · Գնեք կամ մուտքագրեք պրոմո`}
      />
      <div className="card card--glass">
        <h3>Ձեր չեկը</h3>
        {!user && (
          <p className="muted">
            <Link to="/login">Մուտք գործեք</Link>, որպեսզի տեսնեք ձեր գնված չեկը։
          </p>
        )}
        {user && mine.isLoading && <div className="loading-shimmer" />}
        {user && mine.isError && <p className="field__error">{mine.error.message}</p>}
        {mine.data?.is_admin && !mine.data.checks?.length && <p className="muted">Այսօրվա չեկերը դեռ պատրաստ չեն։</p>}
        {mine.data?.is_admin &&
          mine.data.checks?.map((c) => (
            <div key={c.package_key} style={{ marginBottom: "1rem" }}>
              <p>
                <strong>{c.label}</strong> <span className="chip">Ադմին՝ անվճար</span>
              </p>
              <CheckPreview text={c.text} />
            </div>
          ))}
        {user && mine.data && !mine.data.is_admin && !mine.data.active && (
          <p className="muted">
            Ակտիվ չեկ չունեք։ Ընտրեք փաթեթ ներքևում կամ <Link to="/promo">մուտքագրեք պրոմոկոդ</Link>։
          </p>
        )}
        {mine.data?.active && !mine.data.is_admin && mine.data.text && <CheckPreview text={`${mine.data.text}\n\n${data.disclaimer}`} />}
      </div>
      <div className="grid">
        {packages.map((p) => {
          const meta = packageMeta[p.key];
          const canBuy = p.ready || p.key === "pkg_vip";
          return (
            <article
              key={p.key}
              className={`pkg-card card--interactive ${meta?.tier === "hot" ? "pkg-card--hot" : ""} ${meta?.tier === "vip" ? "pkg-card--vip" : ""}`}
            >
              <span className="muted" style={{ fontSize: "0.8rem" }}>{p.label}</span>
              <div className="pkg-card__mult">{meta?.multiplier ?? p.key}</div>
              <div className="pkg-card__price">{p.price ? `${p.price.toLocaleString()} դրամ` : "Անվճար"}</div>
              <p className={`pkg-card__status ${canBuy ? "pkg-card__status--ready" : "pkg-card__status--off"}`}>
                {canBuy ? "✅ Հասանելի" : "⛔ Այսօր հասանելի չէ"}
              </p>
              {!user ? (
                <Link to="/login" className="btn btn--secondary">Մուտք</Link>
              ) : canBuy ? (
                <Link to={`/pay/${p.key}`} className="btn" style={{ display: "inline-block" }}>Գնել</Link>
              ) : (
                <button type="button" className="btn" disabled style={{ opacity: 0.45 }}>Գնել</button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
