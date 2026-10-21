import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../api/client";
import { DemoBanner } from "../components/DemoBanner";
import { GameCard } from "../components/GameCard";
import { PageHeader } from "../components/PageHeader";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import type { GameRow } from "../types/game";
import {
  applyGameFilters,
  uniqueLeagues,
  type GameFilters,
} from "../utils/gameFilters";
import { mergeGames } from "../utils/mergeDemo";

export function Games() {
  const [date, setDate] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<GameFilters["status"]>("");
  const [sort, setSort] = useState<GameFilters["sort"]>("kickoff");
  const [minWinStr, setMinWinStr] = useState("");
  const [league, setLeague] = useState("");

  const debouncedQ = useDebouncedValue(q, 300);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["games", date],
    queryFn: () => {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      return api<{ games: GameRow[]; date: string }>(`/api/games/?${params}`);
    },
    retry: false,
    enabled: true,
    refetchInterval: (query) => {
      const games = query.state.data?.games || [];
      const live = games.some((g) => ["1H", "2H", "HT", "LIVE"].includes(g.status));
      return live ? 60000 : 300000;
    },
  });

  const { games: rawGames, showDemoBanner } = mergeGames(isError ? undefined : data?.games);

  const filters: GameFilters = useMemo(
    () => ({
      q: debouncedQ,
      status,
      sort,
      league,
      minHomeWinPct: minWinStr.trim() === "" ? null : Number(minWinStr),
    }),
    [debouncedQ, status, sort, league, minWinStr]
  );

  const sorted = useMemo(() => applyGameFilters(rawGames, filters), [rawGames, filters]);
  const leagues = useMemo(() => uniqueLeagues(rawGames), [rawGames]);

  const resetFilters = () => {
    setQ("");
    setStatus("");
    setSort("kickoff");
    setMinWinStr("");
    setLeague("");
    setDate("");
  };

  return (
    <div>
      <PageHeader
        eyebrow="API-Football"
        title="⚽ Խաղեր և վիճակագրություն"
        subtitle="Ֆիլտրերը աշխատում են նաև demo ռեժիմում, մինչ API բանալին միացնեք։"
      />
      {showDemoBanner && <DemoBanner />}
      <div className="card card--glass">
        <div className="filters">
          <div className="field">
            <span className="field__label">Ամսաթիվ</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <span className="field__label">Որոնում</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Թիմ կամ լիգա" />
          </div>
          <div className="field">
            <span className="field__label">Լիգա</span>
            <select value={league} onChange={(e) => setLeague(e.target.value)}>
              <option value="">Բոլորը</option>
              {leagues.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field__label">Կարգավիճակ</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as GameFilters["status"])}>
              <option value="">Բոլորը</option>
              <option value="live">Live</option>
              <option value="upcoming">Առաջիկա</option>
            </select>
          </div>
          <div className="field">
            <span className="field__label">Տեսակավորում</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as GameFilters["sort"])}>
              <option value="kickoff">Ժամ</option>
              <option value="form_diff">Ձևի տարբերություն</option>
            </select>
          </div>
          <div className="field">
            <span className="field__label">Min win % (տուն)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={minWinStr}
              onChange={(e) => setMinWinStr(e.target.value)}
              placeholder="օր. 50"
            />
          </div>
        </div>
        <div className="filters-toolbar">
          <span className="filters-count">
            Ցուցադրված {sorted.length} / {rawGames.length}
          </span>
          <button type="button" className="secondary" onClick={resetFilters}>Մաքրել ֆիլտրերը</button>
        </div>
        {isFetching && !showDemoBanner && <div className="loading-shimmer" />}
        <div className="games-grid">
          {sorted.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
        {sorted.length === 0 && (
          <p className="muted">Խաղեր չեն գտնվել — սեղմեք «Մաքրել ֆիլտրերը»։</p>
        )}
      </div>
    </div>
  );
}
