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
  goals?: { home: number | null; away: number | null } | null;
};
