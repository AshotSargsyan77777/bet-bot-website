import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";

export function Vip() {
  const { user } = useAuth();
  const { t } = useT();
  const vip = useQuery({
    queryKey: ["vip", user?.id],
    queryFn: () => api<{ is_vip: boolean; link: string; price: number }>("/api/vip/status/"),
  });

  return (
    <div>
      <PageHeader title={t("pkg.pkg_vip")} subtitle={t("vip.subtitle")} />
      <div className="card pkg-card--vip card--glass" style={{ maxWidth: 520 }}>
        {vip.isLoading && <div className="loading-shimmer" />}
        {vip.isError && <p className="field__error">{vip.error.message}</p>}
        {vip.data?.is_vip ? (
          <>
            {vip.data.link ? (
              <p>
                {t("vip.link")}{" "}
                <a href={vip.data.link} target="_blank" rel="noreferrer" className="gradient-text">{vip.data.link}</a>
              </p>
            ) : (
              <p><Link to="/help">{t("vip.noLink")}</Link></p>
            )}
            <Link to="/combinator" className="btn" style={{ marginTop: "1rem", display: "inline-block" }}>{t("home.ctaCombinator")}</Link>
          </>
        ) : vip.data ? (
          <>
            <p className="pkg-card__price">{vip.data.price.toLocaleString()} {t("common.amd")}</p>
            <p className="muted">{t("vip.desc")}</p>
            {user ? (
              <Link to="/pay/pkg_vip" className="btn btn--lg" style={{ marginTop: "1rem", display: "inline-block" }}>
                {t("vip.buy")}
              </Link>
            ) : (
              <Link to="/login" className="btn">{t("common.login")}</Link>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
