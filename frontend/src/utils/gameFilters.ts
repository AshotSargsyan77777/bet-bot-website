import type { GameRow } from "../types/game";

export type GameFilters = {
  q: string;
  status: "" | "live" | "upcoming";
  sort: "kickoff" | "form_diff";
  minHomeWinPct: number | null;
  league: string;
};

export const emptyGameFilters: GameFilters = {
  q: "",
  status: "",
  sort: "kickoff",
  minHomeWinPct: null,
  league: "",
};

const LIVE = ["1H", "2H", "HT", "ET", "P", "LIVE"];

export function applyGameFilters(games: GameRow[], f: GameFilters): GameRow[] {
  let list = [...games];
  const q = f.q.trim().toLowerCase();
  if (q) {
    list = list.filter((g) => `${g.home} ${g.away} ${g.league}`.toLowerCase().includes(q));
  }
  if (f.league) {
    list = list.filter((g) => g.league === f.league);
  }
  if (f.status === "live") {
    list = list.filter((g) => LIVE.includes(g.status));
  } else if (f.status === "upcoming") {
    list = list.filter((g) => !LIVE.includes(g.status) && g.status !== "FT");
  }
  if (f.minHomeWinPct != null && !Number.isNaN(f.minHomeWinPct)) {
    list = list.filter((g) => (g.home_form?.win_pct ?? 0) >= f.minHomeWinPct!);
  }
  if (f.sort === "form_diff") {
    list.sort((a, b) => (b.form_diff ?? 0) - (a.form_diff ?? 0));
  } else {
    list.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  }
  return list;
}

export function uniqueLeagues(games: GameRow[]): string[] {
  return [...new Set(games.map((g) => g.league).filter(Boolean))].sort();
}
