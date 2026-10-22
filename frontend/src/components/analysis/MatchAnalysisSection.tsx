import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useT } from "../../i18n";
import type { Catalog } from "../../types/catalog";
import type { AnalysisInfo } from "../../types/game";
import { AnalysisBuyBox } from "./AnalysisBuyBox";
import { AnalysisReport, type Pick, type Report } from "./AnalysisReport";

type Detail = { id: number; home: string; away: string; started: boolean; access: AnalysisInfo["access"]; report?: Report; picks?: Pick[] };

/** Paid match analysis block on the match page: buy → pending → full analysis. */
export function MatchAnalysisSection({ info }: { info: AnalysisInfo }) {
  const { t } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [buying, setBuying] = useState(false);
  const detail = useQuery({
    queryKey: ["analysis", info.id, user?.id],
    queryFn: () => api<Detail>(`/api/analysis/${info.id}/`),
    enabled: !!user,
  });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/checks/catalog/"), enabled: buying });
  const d = detail.data;
  const price = info.price.toLocaleString();

  if (d?.report) {
    return (
      <section className="card card--glass">
        <h2 style={{ marginTop: 0 }}>{t("an.title")}</h2>
        <AnalysisReport home={d.home} away={d.away} report={d.report} picks={d.picks} />
      </section>
    );
  }
  return (
    <section className="card card--glass">
      <h2 style={{ marginTop: 0 }}>{t("an.title")}</h2>
      <p className="muted">{t("an.teaser")}</p>
      {!user ? (
        <Link to="/login" className="btn">{t("an.loginToBuy")}</Link>
      ) : detail.isLoading ? (
        <div className="loading-shimmer" />
      ) : d?.access === "pending" ? (
        <p>{t("an.pending")}</p>
      ) : d?.started ? (
        <p className="muted">{t("an.started")}</p>
      ) : buying ? (
        <AnalysisBuyBox
          id={info.id}
          price={info.price}
          cardNumber={catalog.data?.card_number ?? ""}
          onDone={() => {
            setBuying(false);
            qc.invalidateQueries({ queryKey: ["analysis", info.id] });
            qc.invalidateQueries({ queryKey: ["games"] });
          }}
        />
      ) : (
        <button type="button" onClick={() => setBuying(true)}>{t("an.buy", { price })}</button>
      )}
      {detail.isError && <p className="field__error">{detail.error.message}</p>}
    </section>
  );
}
