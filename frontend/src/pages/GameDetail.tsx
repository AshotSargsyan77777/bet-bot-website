import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { DemoBanner } from "../components/DemoBanner";
import { PageHeader } from "../components/PageHeader";
import { H2HList } from "../components/stats/H2HList";
import { TeamFormPanel } from "../components/stats/TeamFormPanel";
import { demoGameDetails, demoGames } from "../data/demo";
import type { H2HMatch, TeamForm } from "../types/form";
import { isDemoFixtureId } from "../utils/mergeDemo";

type DetailPayload = {
  home_form?: TeamForm;
  away_form?: TeamForm;
  h2h?: H2HMatch[];
  live?: {
    goals?: { home?: number; away?: number };
    fixture?: { status?: { short?: string; elapsed?: number } };
  };
};

export function GameDetail() {
  const { id } = useParams<{ id: string }>();
  const fixtureId = Number(id);
  const demoGame = demoGames.find((g) => g.id === fixtureId);
  const isDemo = isDemoFixtureId(fixtureId);

  const { data, isFetching } = useQuery({
    queryKey: ["game", id],
    queryFn: () => api<DetailPayload>(`/api/games/${id}/`),
    enabled: !!id && !isDemo,
    retry: false,
    refetchInterval: 60000,
  });

  const demoDetail = demoGameDetails[fixtureId] as DetailPayload | undefined;
  const payload = (isDemo && demoDetail ? demoDetail : data) as DetailPayload | undefined;
  const live = payload?.live;
  const goals = live?.goals ?? {};
  const statusShort = live?.fixture?.status?.short ?? demoGame?.status;
  const elapsed = live?.fixture?.status?.elapsed;

  if (!payload && !demoGame && isFetching) {
    return <div className="loading-shimmer" />;
  }

  const title = demoGame ? `${demoGame.home} — ${demoGame.away}` : `Մատչ #${id}`;

  return (
    <div>
      {isDemo && <DemoBanner />}
      <PageHeader eyebrow={demoGame?.league ?? "Match"} title={title} />
      <div className="match-hero">
        {["LIVE", "1H", "2H", "HT"].includes(statusShort ?? "") && (
          <p className="match-hero__live"><span className="live-dot" /> LIVE {elapsed != null ? `${elapsed}'` : ""}</p>
        )}
        <p className="muted">{statusShort}</p>
        <div className="match-hero__score">
          {goals.home ?? demoGame?.score[0] ?? "—"} : {goals.away ?? demoGame?.score[1] ?? "—"}
        </div>
        <p className="muted">{demoGame?.league}</p>
      </div>
      {isFetching && !isDemo && <p className="muted">Live թարմացում…</p>}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <TeamFormPanel title="Տուն — վերջին 5" form={payload?.home_form} />
        <TeamFormPanel title="Հյուր — վերջին 5" form={payload?.away_form} />
      </div>
      <H2HList matches={payload?.h2h ?? []} />
      <Link to="/games" className="btn btn--secondary" style={{ marginTop: "1rem" }}>← Ետ խաղեր</Link>
    </div>
  );
}
