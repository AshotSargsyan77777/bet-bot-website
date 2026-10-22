export type LegResult = {
  fixture?: string;
  market?: string;
  selection?: string;
  odd?: number | string;
  result: "won" | "lost" | "void" | "pending";
};

export type CheckRecord = {
  id: number;
  package_key: string;
  label: string;
  date: string;
  combined_odds: string | number | null;
  quality: string;
  status: "won" | "lost" | "void" | "pending";
  body_text: string;
  legs: LegResult[];
  settled_at: string | null;
};

export type ResultsStats = {
  days: number;
  won: number;
  lost: number;
  void: number;
  pending: number;
  settled: number;
  win_rate: number | null;
  by_package: { key: string; label: string; won: number; lost: number }[];
};

/** `key` is the i18n key of the result's name. */
export const resultLabel: Record<string, { key: "result.won" | "result.lost" | "result.void" | "result.pending"; chip: string; icon: string }> = {
  won: { key: "result.won", chip: "chip--win", icon: "✅" },
  lost: { key: "result.lost", chip: "chip--loss", icon: "❌" },
  void: { key: "result.void", chip: "chip--draw", icon: "↩️" },
  pending: { key: "result.pending", chip: "chip--draw", icon: "⏳" },
};
