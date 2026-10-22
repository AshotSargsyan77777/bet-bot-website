import type { Paginated } from "../api/client";

export type FormSlice = {
  win_pct: number;
  avg_goals_for: number;
  avg_goals_against?: number;
  btts_rate?: number;
  clean_sheet_rate?: number;
};

export type AnalysisInfo = { id: number; access: "open" | "pending" | "locked"; price: number };

export type GameRow = {
  id: number;
  league: string;
  league_id?: number | null;
  league_logo?: string | null;
  home: string;
  away: string;
  home_logo?: string | null;
  away_logo?: string | null;
  analysis?: AnalysisInfo | null;
  kickoff: string;
  status: string;
  score: [number | null, number | null];
  home_form?: FormSlice | null;
  away_form?: FormSlice | null;
  form_diff?: number | null;
};

export type GamesResponse = Paginated<GameRow> & {
  date: string;
  leagues: { id: number; name: string; count: number }[];
  provider_configured: boolean;
  provider_error: string | null;
  form_pending: number;
};

export const LIVE_STATUSES = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"];
