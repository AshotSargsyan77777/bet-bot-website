import { demoGames } from "../data/demo";
import type { GameRow } from "../types/game";

export function mergeGames(apiGames: GameRow[] | undefined): { games: GameRow[]; showDemoBanner: boolean } {
  const api = apiGames ?? [];
  if (api.length > 0) {
    return { games: api, showDemoBanner: false };
  }
  return { games: demoGames, showDemoBanner: true };
}

export function isDemoFixtureId(id: number): boolean {
  return id >= 90000;
}
