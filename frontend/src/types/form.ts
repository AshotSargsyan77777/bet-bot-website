export type FormMatch = {
  date?: string;
  home?: string;
  away?: string;
  score?: string;
  venue?: string;
};

export type TeamForm = {
  team_id?: number;
  team_name?: string;
  last_n?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goals_for?: number;
  goals_against?: number;
  win_pct?: number;
  avg_goals_for?: number;
  avg_goals_against?: number;
  btts_rate?: number;
  clean_sheet_rate?: number;
  matches?: FormMatch[];
};

export type H2HMatch = {
  date?: string;
  home?: string;
  away?: string;
  goals?: { home: number; away: number };
};

export type ComboLeg = {
  fixture_name?: string;
  market?: string;
  selection?: string;
  odd?: number;
  why?: string;
};

export type ComboResult = {
  combined_odds: number;
  legs: ComboLeg[];
  legs_count?: number;
};
