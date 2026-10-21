import type { GameRow } from "../types/game";

export const DEMO_MODE_BADGE = "Demo preview";

export const demoGames: GameRow[] = [
  {
    id: 90001,
    league: "UEFA Champions League",
    home: "Real Madrid",
    away: "Manchester City",
    kickoff: new Date(Date.now() + 3600000).toISOString(),
    status: "LIVE",
    score: [1, 1],
    home_form: { win_pct: 72, avg_goals_for: 2.4, btts_rate: 60, clean_sheet_rate: 20 },
    away_form: { win_pct: 68, avg_goals_for: 2.1, btts_rate: 55, clean_sheet_rate: 25 },
    form_diff: 4,
    is_demo: true,
  },
  {
    id: 90002,
    league: "Premier League",
    home: "Arsenal",
    away: "Liverpool",
    kickoff: new Date(Date.now() + 7200000).toISOString(),
    status: "NS",
    score: [null, null],
    home_form: { win_pct: 65, avg_goals_for: 2.0, btts_rate: 50, clean_sheet_rate: 30 },
    away_form: { win_pct: 58, avg_goals_for: 1.8, btts_rate: 48, clean_sheet_rate: 28 },
    form_diff: 7,
    is_demo: true,
  },
  {
    id: 90003,
    league: "La Liga",
    home: "Barcelona",
    away: "Atlético Madrid",
    kickoff: new Date(Date.now() - 1800000).toISOString(),
    status: "2H",
    score: [2, 0],
    home_form: { win_pct: 70, avg_goals_for: 2.3, btts_rate: 52, clean_sheet_rate: 35 },
    away_form: { win_pct: 45, avg_goals_for: 1.2, btts_rate: 40, clean_sheet_rate: 40 },
    form_diff: 25,
    is_demo: true,
  },
  {
    id: 90004,
    league: "Serie A",
    home: "Inter",
    away: "Napoli",
    kickoff: new Date(Date.now() + 14400000).toISOString(),
    status: "NS",
    score: [null, null],
    home_form: { win_pct: 62, avg_goals_for: 1.9, btts_rate: 45, clean_sheet_rate: 32 },
    away_form: { win_pct: 55, avg_goals_for: 1.7, btts_rate: 42, clean_sheet_rate: 30 },
    form_diff: 7,
    is_demo: true,
  },
  {
    id: 90005,
    league: "Armenian Premier League",
    home: "Pyunik",
    away: "Ararat-Armenia",
    kickoff: new Date(Date.now() + 10800000).toISOString(),
    status: "NS",
    score: [null, null],
    home_form: { win_pct: 50, avg_goals_for: 1.5, btts_rate: 38, clean_sheet_rate: 22 },
    away_form: { win_pct: 54, avg_goals_for: 1.6, btts_rate: 40, clean_sheet_rate: 24 },
    form_diff: -4,
    is_demo: true,
  },
];

function makeDemoDetail(
  id: number,
  home: string,
  away: string,
  gh: number,
  ga: number,
  status: string,
  elapsed: number
) {
  return {
    fixture_id: id,
    home_form: {
      team_name: home,
      wins: 3,
      draws: 1,
      losses: 1,
      win_pct: 60,
      avg_goals_for: 2.0,
      avg_goals_against: 1.0,
      btts_rate: 50,
      clean_sheet_rate: 30,
      matches: [
        { date: "2026-03-01", home, away: "Team X", score: "2-1", venue: "home" },
        { date: "2026-02-22", home: "Team Y", away: home, score: "0-1", venue: "away" },
        { date: "2026-02-15", home, away: "Team Z", score: "1-1", venue: "home" },
      ],
    },
    away_form: {
      team_name: away,
      wins: 2,
      draws: 2,
      losses: 1,
      win_pct: 40,
      avg_goals_for: 1.5,
      avg_goals_against: 1.2,
      btts_rate: 45,
      clean_sheet_rate: 25,
      matches: [
        { date: "2026-03-01", home: away, away: "Rival A", score: "1-0", venue: "home" },
        { date: "2026-02-20", home: "Rival B", away, score: "2-2", venue: "away" },
      ],
    },
    h2h: [
      { date: "2025-11-10", home, away, goals: { home: gh, away: ga } },
      { date: "2025-05-02", home: away, away: home, goals: { home: 1, away: 2 } },
    ],
    live: {
      goals: { home: gh, away: ga },
      fixture: { status: { short: status, elapsed } },
    },
  };
}

export const demoGameDetails: Record<number, object> = {
  90001: {
    fixture_id: 90001,
    home_form: {
      team_name: "Real Madrid",
      wins: 4,
      draws: 0,
      losses: 1,
      win_pct: 80,
      avg_goals_for: 2.6,
      avg_goals_against: 0.8,
      btts_rate: 60,
      clean_sheet_rate: 40,
      matches: [
        { date: "2026-03-01", home: "Real Madrid", away: "Getafe", score: "3-0", venue: "home" },
        { date: "2026-02-22", home: "Osasuna", away: "Real Madrid", score: "1-2", venue: "away" },
        { date: "2026-02-15", home: "Real Madrid", away: "Girona", score: "2-1", venue: "home" },
        { date: "2026-02-08", home: "Atlético", away: "Real Madrid", score: "1-1", venue: "away" },
        { date: "2026-02-01", home: "Real Madrid", away: "Valencia", score: "4-1", venue: "home" },
      ],
    },
    away_form: {
      team_name: "Manchester City",
      wins: 3,
      draws: 1,
      losses: 1,
      win_pct: 60,
      avg_goals_for: 2.2,
      avg_goals_against: 1.0,
      btts_rate: 55,
      matches: [
        { date: "2026-03-02", home: "Man City", away: "Brighton", score: "2-0", venue: "home" },
        { date: "2026-02-23", home: "Tottenham", away: "Man City", score: "2-2", venue: "away" },
        { date: "2026-02-16", home: "Man City", away: "Newcastle", score: "3-1", venue: "home" },
        { date: "2026-02-09", home: "Liverpool", away: "Man City", score: "2-1", venue: "away" },
        { date: "2026-02-02", home: "Man City", away: "Chelsea", score: "1-0", venue: "home" },
      ],
    },
    h2h: [
      { date: "2025-04-17", home: "Man City", away: "Real Madrid", goals: { home: 1, away: 2 } },
      { date: "2024-04-09", home: "Real Madrid", away: "Man City", goals: { home: 3, away: 3 } },
    ],
    live: { goals: { home: 1, away: 1 }, fixture: { status: { short: "LIVE", elapsed: 67 } } },
  },
  90002: makeDemoDetail(90002, "Arsenal", "Liverpool", 0, 0, "NS", 0),
  90003: makeDemoDetail(90003, "Barcelona", "Atlético Madrid", 2, 0, "2H", 78),
  90004: makeDemoDetail(90004, "Inter", "Napoli", 0, 0, "NS", 0),
  90005: makeDemoDetail(90005, "Pyunik", "Ararat-Armenia", 0, 0, "NS", 0),
};

export const demoCheckPreview = `⚽ GOALKING ՉԵԿ
🎯 Ընդհանուր գործակից՝ 9.84x
━━━━━━━━━━━━━━

1️⃣ 🏟 Arsenal - Liverpool
🏆 Arsenal (Home Win)
💰 Գործակից՝ 1.42
💡 Arsenal-ը վերջին խաղերում ավելի լավ ձևի մեջ է, նաև շուկայի կողմից համարվում է ֆավորիտ։

2️⃣ 🏟 Real Madrid - Manchester City
🥅 Both Teams To Score — Yes
💰 Գործակից՝ 1.38

3️⃣ 🏟 Barcelona - Atlético Madrid
⚽ Over 2.5
💰 Գործակից՝ 1.35

… (+7 legs)

━━━━━━━━━━━━━━`;

export const demoCatalogPackages = [
  { key: "standard_3x", label: "Գործակից x3", price: 2000, ready: true, purchasable: true, multiplier: "3x", tier: "standard" },
  { key: "standard_5x", label: "Գործակից x5", price: 3000, ready: true, purchasable: true, multiplier: "5x", tier: "standard" },
  { key: "standard_10x", label: "Գործակից x10", price: 5000, ready: true, purchasable: true, multiplier: "10x", tier: "hot" },
  { key: "standard_20x", label: "Գործակից x20", price: 7000, ready: false, purchasable: true, multiplier: "20x", tier: "elite" },
  { key: "champions_3x", label: "🏆 Champions League x3", price: 2000, ready: true, purchasable: true, multiplier: "CL 3x", tier: "cl" },
  { key: "champions_10x", label: "🏆 Champions League x10", price: 7000, ready: true, purchasable: true, multiplier: "CL 10x", tier: "cl" },
  { key: "pkg_vip", label: "👑 VIP Կանալ", price: 5000, ready: true, purchasable: true, multiplier: "VIP", tier: "vip" },
];

export const demoCombinatorResults = [
  {
    combined_odds: 9.92,
    legs: [
      { fixture_name: "Arsenal - Liverpool", market: "MATCH_WINNER", selection: "Arsenal", odd: 1.42 },
      { fixture_name: "Real Madrid - Man City", market: "BTTS", selection: "Yes", odd: 1.38 },
      { fixture_name: "Barcelona - Atlético", market: "OU", selection: "Over 2.5", odd: 1.35 },
    ],
  },
  {
    combined_odds: 10.05,
    legs: [
      { fixture_name: "Inter - Napoli", market: "DOUBLE_CHANCE", selection: "Inter or Draw", odd: 1.28 },
      { fixture_name: "Pyunik - Ararat", market: "OU", selection: "Over 1.5", odd: 1.32 },
    ],
  },
];

export const landingStats = [
  { label: "Օրվա չեկեր", value: "8+" },
  { label: "L5 վիճակագրություն", value: "Live" },
  { label: "Կոնստրուկտոր", value: "x3–x20" },
  { label: "Թարմացում", value: "24/7" },
];
