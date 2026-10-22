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

export const resultLabel: Record<string, { text: string; chip: string; icon: string }> = {
  won: { text: "Անցել է", chip: "chip--win", icon: "✅" },
  lost: { text: "Չի անցել", chip: "chip--loss", icon: "❌" },
  void: { text: "Վերադարձ", chip: "chip--draw", icon: "↩️" },
  pending: { text: "Սպասվում է", chip: "chip--draw", icon: "⏳" },
};
