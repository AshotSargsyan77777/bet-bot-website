import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { GameCard } from "../components/GameCard";
import { PageHeader } from "../components/PageHeader";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { LIVE_STATUSES, type GamesResponse } from "../types/game";
import { emptyGameFilters, gameQueryParams, type GameFilters } from "../utils/gameFilters";
import { useT } from "../i18n";

const PAGE_SIZE = 24;

export function Games() {
  const { t } = useT();
  const [filters, setFilters] = useState<GameFilters>(emptyGameFilters);
  const [page, setPage] = useState(1);

  const debouncedQ = useDebouncedValue(filters.q, 300);
  const debouncedMinWin = useDebouncedValue(filters.minHomeWinPct, 400);
  const effective = { ...filters, q: debouncedQ, minHomeWinPct: debouncedMinWin };
  const params = gameQueryParams(effective, page, PAGE_SIZE).toString();

  const { data, isFetching, isError, error, isLoading } = useQuery({
    queryKey: ["games", params],
    queryFn: () => api<GamesResponse>(`/api/games/?${params}`),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const games = query.state.data?.results || [];
      return games.some((g) => LIVE_STATUSES.includes(g.status)) ? 60000 : 300000;
    },
  });

  const update = <K extends keyof GameFilters>(key: K, value: GameFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(emptyGameFilters);
    setPage(1);
  };

  const games = data?.results ?? [];
  const leagues = data?.leagues ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="API-Football"
        title={t("games.title")}
        subtitle={data ? t("games.date", { date: data.date }) : t("games.subtitle")}
      />
      {data && !data.provider_configured && (
        <p className="field__error">{t("games.noProvider")}</p>
      )}
      {data?.provider_error && <p className="field__error">{t("games.syncFailed")}</p>}
      <div className="card card--glass">
        <div className="filters">
          <div className="field">
            <span className="field__label">{t("games.fDate")}</span>
            <input type="date" value={filters.date} onChange={(e) => update("date", e.target.value)} />
          </div>
          <div className="field">
            <span className="field__label">{t("games.fSearch")}</span>
            <input type="search" value={filters.q} onChange={(e) => update("q", e.target.value)} placeholder={t("games.fSearchPh")} />
          </div>
          <div className="field">
            <span className="field__label">{t("games.fLeague")}</span>
            <select value={filters.league} onChange={(e) => update("league", e.target.value)}>
              <option value="">{t("common.all")}</option>
              {leagues.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.name} ({l.count})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field__label">{t("games.fStatus")}</span>
            <select value={filters.status} onChange={(e) => update("status", e.target.value as GameFilters["status"])}>
              <option value="">{t("common.all")}</option>
              <option value="live">Live</option>
              <option value="upcoming">{t("games.upcoming")}</option>
              <option value="finished">{t("games.finished")}</option>
            </select>
          </div>
          <div className="field">
            <span className="field__label">{t("games.fSort")}</span>
            <select value={filters.sort} onChange={(e) => update("sort", e.target.value as GameFilters["sort"])}>
              <option value="kickoff">{t("games.sortTime")}</option>
              <option value="form_diff">{t("games.sortForm")}</option>
            </select>
          </div>
          <div className="field">
            <span className="field__label">{t("games.fMinWin")}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={filters.minHomeWinPct}
              onChange={(e) => update("minHomeWinPct", e.target.value)}
              placeholder={t("games.fMinWinPh")}
            />
          </div>
        </div>
        <div className="filters-toolbar">
          <span className="filters-count">
            {t("games.found", { n: data?.count ?? 0 })}
            {data && data.form_pending > 0 ? t("games.formPending", { n: data.form_pending }) : ""}
          </span>
          <button type="button" className="secondary" onClick={resetFilters}>{t("games.reset")}</button>
        </div>
        {isFetching && <div className="loading-shimmer" />}
        {isError && <p className="field__error">{error.message}</p>}
        <div className="games-grid">
          {games.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
        {!isLoading && !isError && games.length === 0 && (
          <p className="muted">{t("games.none")}</p>
        )}
        {data && data.total_pages > 1 && (
          <div className="filters-toolbar" style={{ justifyContent: "center", marginTop: "1rem" }}>
            <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("common.prev")}
            </button>
            <span className="filters-count">{data.page} / {data.total_pages}</span>
            <button
              type="button"
              className="secondary"
              disabled={page >= data.total_pages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("common.next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
