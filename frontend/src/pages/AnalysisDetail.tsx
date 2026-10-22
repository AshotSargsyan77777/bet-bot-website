import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useT } from "../i18n";

/** Old /analysis/:id links (e.g. in Telegram messages) open the match page, where the analysis lives. */
export function AnalysisDetail() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["analysis-redirect", id],
    queryFn: () => api<{ fixture_id: number }>(`/api/analysis/${id}/`),
    enabled: !!id && /^\d+$/.test(id),
  });
  if (q.data) return <Navigate to={`/games/${q.data.fixture_id}`} replace />;
  if (q.isError) {
    return (
      <div className="card">
        <p className="field__error">{q.error.message}</p>
        <Link to="/games" className="btn btn--secondary">{t("game.back")}</Link>
      </div>
    );
  }
  return <div className="loading-shimmer" />;
}
