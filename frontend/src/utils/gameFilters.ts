export type GameFilters = {
  date: string;
  q: string;
  status: "" | "live" | "upcoming" | "finished";
  sort: "kickoff" | "form_diff";
  minHomeWinPct: string;
  league: string;
};

export const emptyGameFilters: GameFilters = {
  date: "",
  q: "",
  status: "",
  sort: "kickoff",
  minHomeWinPct: "",
  league: "",
};

/** Filters are applied server-side (/api/games/), this only builds the query string. */
export function gameQueryParams(f: GameFilters, page: number, pageSize: number): URLSearchParams {
  const params = new URLSearchParams();
  if (f.date) params.set("date", f.date);
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.status) params.set("status", f.status);
  if (f.league) params.set("league", f.league);
  if (f.sort !== "kickoff") params.set("sort", f.sort);
  const minWin = Number(f.minHomeWinPct);
  if (f.minHomeWinPct.trim() !== "" && Number.isFinite(minWin)) {
    params.set("min_win_pct", String(Math.min(100, Math.max(0, minWin))));
  }
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  return params;
}
