export type FormSlice = {
  win_pct: number;
  avg_goals_for: number;
  btts_rate?: number;
  clean_sheet_rate?: number;
};

export type GameRow = {
  id: number;
  league: string;
  home: string;
  away: string;
  kickoff: string;
  status: string;
  score: [number | null, number | null];
  home_form?: FormSlice;
  away_form?: FormSlice;
  form_diff?: number;
  is_demo?: boolean;
};
