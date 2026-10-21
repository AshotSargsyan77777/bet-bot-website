import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { H2HList } from "../components/stats/H2HList";
import { TeamFormPanel } from "../components/stats/TeamFormPanel";
import type { H2HMatch, TeamForm } from "../types/form";
import { LIVE_STATUSES } from "../types/game";

type DetailPayload = {
  fixture_id: number;
  league: string;
  home: string;
  away: string;
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

type Venue = "all" | "home" | "away";

export function GameDetail() {
  const { id } = useParams<{ id: string }>();
  const [lastN, setLastN] = useState(5);
  const [homeVenue, setHomeVenue] = useState<Venue>("all");
  const [awayVenue, setAwayVenue] = useState<Venue>("all");
  const valid = !!id && /^\d+$/.test(id);

  const { data, isFetching, isLoading, isError, error } = useQuery({
    queryKey: ["game", id, lastN, homeVenue, awayVenue],
    queryFn: () =>
      api<DetailPayload>(`/api/games/${id}/?last_n=${lastN}&home_venue=${homeVenue}&away_venue=${awayVenue}`),
    enabled: valid,
    retry: false,
    refetchInterval: (q) => (LIVE_STATUSES.includes(q.state.data?.live?.fixture?.status?.short ?? "") ? 60000 : false),
  });

  if (!valid) return <p className="field__error">Սխալ հղում</p>;
  if (isLoading) return <div className="loading-shimmer" />;
  if (isError || !data) {
    return (
      <div className="card">
        <PageHeader title="Խաղ" />
        <p className="field__error">{error?.message ?? "Խաղը չի գտնվել"}</p>
        <Link to="/games" className="btn btn--secondary">← Ետ խաղեր</Link>
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
        <p className="muted">{statusShort}</p>
        <div className="match-hero__score">
          {scoreHome ?? "—"} : {scoreAway ?? "—"}
        </div>
        <p className="muted">
          {data.league}
          {kickoff ? ` · ${new Date(kickoff).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ""}
        </p>
      </div>
      <div className="card card--glass">
        <div className="filters">
          <div className="field">
            <span className="field__label">Վերջին խաղեր</span>
            <select value={lastN} onChange={(e) => setLastN(Number(e.target.value))}>
              {[3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="field__label">Տան թիմ</span>
            <select value={homeVenue} onChange={(e) => setHomeVenue(e.target.value as Venue)}>
              <option value="all">Բոլոր խաղերը</option>
              <option value="home">Միայն տանը</option>
              <option value="away">Միայն արտագնա</option>
            </select>
          </div>
          <div className="field">
            <span className="field__label">Հյուր թիմ</span>
            <select value={awayVenue} onChange={(e) => setAwayVenue(e.target.value as Venue)}>
              <option value="all">Բոլոր խաղերը</option>
              <option value="home">Միայն տանը</option>
              <option value="away">Միայն արտագնա</option>
            </select>
          </div>
        </div>
      </div>
      {isFetching && <p className="muted">Թարմացում…</p>}
      {data.stats_error && <p className="field__error">{data.stats_error}</p>}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <TeamFormPanel title={`Տուն — վերջին ${lastN}`} form={data.home_form} />
        <TeamFormPanel title={`Հյուր — վերջին ${lastN}`} form={data.away_form} />
      </div>
      <H2HList matches={data.h2h ?? []} />
      <Link to="/games" className="btn btn--secondary" style={{ marginTop: "1rem" }}>← Ետ խաղեր</Link>
    </div>
  );
}
