import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { CheckPreview } from "../components/stats/CheckPreview";
import { useAuth } from "../context/AuthContext";
import type { Catalog, MyCheck } from "../types/catalog";
import { packageMeta } from "../utils/packageMeta";
import { useT, usePkgLabel } from "../i18n";

export function Checks() {
  const { user } = useAuth();
  const { t } = useT();
  const pkgLabel = usePkgLabel();
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
        <PageHeader title={t("checks.title")} />
        <p className="field__error">{t("checks.loadError", { msg: catalog.error.message })}</p>
        <button type="button" onClick={() => catalog.refetch()}>{t("checks.retry")}</button>
      </div>
    );
  }

  const data = catalog.data!;
  const packages = data.packages.filter((p) => p.purchasable);
  const isToday = data.checks_date === data.today;

  return (
    <div>
      <PageHeader
        eyebrow={t("checks.eyebrow")}
        title={t("checks.title")}
        subtitle={t("checks.subtitle", {
          date: data.checks_date || "—",
          note: data.checks_date && !isToday ? t("checks.notTodayNote") : "",
        })}
      />
      <div className="card card--glass">
        <h3>{t("checks.yours")}</h3>
        {!user && (
          <p className="muted">
            <Link to="/login">{t("checks.loginToSee")}</Link>
          </p>
        )}
        {user && mine.isLoading && <div className="loading-shimmer" />}
        {user && mine.isError && <p className="field__error">{mine.error.message}</p>}
        {mine.data?.is_admin && !mine.data.checks?.length && <p className="muted">{t("checks.noneToday")}</p>}
        {user && mine.data && !mine.data.is_admin && !mine.data.active && (
          <p className="muted">
            {t("checks.noActive")} <Link to="/promo">{t("checks.enterPromo")}</Link>.
          </p>
        )}
        {mine.data?.checks?.map((c) => (
          <div key={c.package_key} style={{ marginBottom: "1rem" }}>
            <p>
              <strong>{pkgLabel(c.package_key, c.label)}</strong>
              {mine.data?.is_admin && <span className="chip" style={{ marginLeft: "0.5rem" }}>{t("common.adminFree")}</span>}
            </p>
            <CheckPreview text={mine.data?.is_admin ? c.text : `${c.text}\n\n${data.disclaimer}`} />
          </div>
        ))}
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
              <span className="muted" style={{ fontSize: "0.8rem" }}>{pkgLabel(p.key, p.label)}</span>
              <div className="pkg-card__mult">{meta?.multiplier ?? p.key}</div>
              <div className="pkg-card__price">{p.price ? `${p.price.toLocaleString()} ${t("common.amd")}` : t("common.free")}</div>
              <p className={`pkg-card__status ${canBuy ? "pkg-card__status--ready" : "pkg-card__status--off"}`}>
                {canBuy ? t("checks.available") : t("checks.unavailable")}
              </p>
              {!user ? (
                <Link to="/login" className="btn btn--secondary">{t("common.login")}</Link>
              ) : canBuy ? (
                <Link to={`/pay/${p.key}`} className="btn" style={{ display: "inline-block" }}>{t("checks.buy")}</Link>
              ) : (
                <button type="button" className="btn" disabled style={{ opacity: 0.45 }}>{t("checks.buy")}</button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
