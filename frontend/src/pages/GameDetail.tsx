import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { H2HList } from "../components/stats/H2HList";
import { TeamFormPanel } from "../components/stats/TeamFormPanel";
import type { H2HMatch, TeamForm } from "../types/form";
import { LIVE_STATUSES, type AnalysisInfo } from "../types/game";
import { MatchAnalysisSection } from "../components/analysis/MatchAnalysisSection";
import { TeamLogo } from "../components/TeamLogo";
import { isUpcoming, kickoffTime, statusKey } from "../utils/matchStatus";
import { useT } from "../i18n";

type DetailPayload = {
  fixture_id: number;
  league: string;
  home: string;
  away: string;
  home_logo?: string | null;
  away_logo?: string | null;
  league_logo?: string | null;
  analysis?: AnalysisInfo | null;
  cached: { kickoff: string | null; status: string | null; score: [number | null, number | null] | null };
  home_form?: TeamForm | null;
  away_form?: TeamForm | null;
  h2h?: H2HMatch[] | null;
  stats_error?: string | null;
  live?: {
    goals?: { home?: number | null; away?: number | null };
    fixture?: { date?: string; status?: { short?: string; elapsed?: number | null } };
  } | null;
};

export function GameDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const [lastN, setLastN] = useState(5);
  const valid = !!id && /^\d+$/.test(id);

  const { data, isFetching, isLoading, isError, error } = useQuery({
    queryKey: ["game", id, lastN],
    queryFn: () =>
      api<DetailPayload>(`/api/games/${id}/?last_n=${lastN}`),
    enabled: valid,
    retry: false,
    refetchInterval: (q) => (LIVE_STATUSES.includes(q.state.data?.live?.fixture?.status?.short ?? "") ? 60000 : false),
  });

  if (!valid) return <p className="field__error">{t("game.badLink")}</p>;
  if (isLoading) return <div className="loading-shimmer" />;
  if (isError || !data) {
    return (
      <div className="card">
        <PageHeader title={t("game.title")} />
        <p className="field__error">{error?.message ?? t("game.notFound")}</p>
        <Link to="/games" className="btn btn--secondary">{t("game.back")}</Link>
      </div>
    );
  }

  const goals = data.live?.goals ?? {};
  const statusShort = data.live?.fixture?.status?.short ?? data.cached.status ?? "";
  const elapsed = data.live?.fixture?.status?.elapsed;
  const kickoff = data.live?.fixture?.date ?? data.cached.kickoff;
  const scoreHome = goals.home ?? data.cached.score?.[0];
  const scoreAway = goals.away ?? data.cached.score?.[1];

  return (
    <div>
      <PageHeader eyebrow={data.league || "Match"} title={`${data.home} — ${data.away}`} />
      <div className="match-hero">
        {LIVE_STATUSES.includes(statusShort) && (
          <p className="match-hero__live"><span className="live-dot" /> LIVE {elapsed != null ? `${elapsed}'` : ""}</p>
        )}
        <p className="muted">{statusKey(statusShort) ? t(statusKey(statusShort)!) : statusShort}</p>
        <div className="match-hero__teams">
          <span className="match-hero__team">
            <TeamLogo src={data.home_logo} size={56} alt={data.home} />
            {data.home}
          </span>
          <div className="match-hero__score">
            {isUpcoming(statusShort) && scoreHome == null ? kickoffTime(kickoff) : `${scoreHome ?? "—"} : ${scoreAway ?? "—"}`}
          </div>
          <span className="match-hero__team">
            <TeamLogo src={data.away_logo} size={56} alt={data.away} />
            {data.away}
          </span>
        </div>
        <p className="muted" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.35rem" }}>
          <TeamLogo src={data.league_logo} size={18} />
          {data.league}
          {kickoff ? ` · ${new Date(kickoff).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ""}
        </p>
      </div>
      {data.analysis && <MatchAnalysisSection info={data.analysis} />}
      <div className="card card--glass">
        <div className="filters">
          <div className="field">
            <span className="field__label">{t("game.lastGames")}</span>
            <select value={lastN} onChange={(e) => setLastN(Number(e.target.value))}>
              {[3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>
      {isFetching && <p className="muted">{t("game.refreshing")}</p>}
      {data.stats_error && <p className="field__error">{data.stats_error}</p>}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <TeamFormPanel title={t("game.homeLast", { n: lastN })} form={data.home_form} />
        <TeamFormPanel title={t("game.awayLast", { n: lastN })} form={data.away_form} />
      </div>
      <H2HList matches={data.h2h ?? []} />
      <Link to="/games" className="btn btn--secondary" style={{ marginTop: "1rem" }}>{t("game.back")}</Link>
    </div>
  );
}
