import type { ComboResult } from "../types/form";
import { demoCombinatorResults } from "../data/demo";

export function filterDemoCombinatorResults(
  targetMin: number,
  targetMax: number,
  legsCount: number
): ComboResult[] {
  return demoCombinatorResults.filter((r) => {
    const n = r.legs?.length ?? 0;
    if (legsCount > 0 && n > legsCount + 2) return false;
    return r.combined_odds >= targetMin && r.combined_odds <= targetMax;
  });
}
