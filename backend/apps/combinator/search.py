import time
from typing import Any

from apps.checks.services.formatting import explain_selection

MAX_CANDIDATES = 100
MAX_RESULTS = 20
TIMEOUT_SEC = 2.0


def _dedupe_key(c: dict) -> tuple:
    fid = c.get("fixture_id") or c.get("fixture_name") or c.get("fixture") or ""
    return (str(fid), c.get("market", ""), c.get("selection", ""))


def build_candidate_pool(daily_selections: list[list], admin_candidates: list[dict]) -> list[dict]:
    pool: dict[tuple, dict] = {}
    for selections in daily_selections:
        for s in selections:
            odd = float(s.get("odd", 0) or 0)
            if odd <= 1:
                continue
            item = {
                "fixture_name": s.get("fixture", ""),
                "fixture_id": str(s.get("fixture_id", "")),
                "market": s.get("market", ""),
                "selection": s.get("selection", ""),
                "odd": odd,
                "reasons": s.get("reasons") or [],
            }
            pool[_dedupe_key(item)] = item
    for c in admin_candidates:
        odd = float(c.get("odd", 0) or 0)
        if odd <= 1:
            continue
        item = {
            "fixture_name": c.get("fixture_name", ""),
            "fixture_id": str(c.get("fixture_id", "")),
            "market": c.get("market", ""),
            "selection": c.get("selection", ""),
            "odd": odd,
            "reasons": c.get("reasons") or [],
        }
        pool[_dedupe_key(item)] = item
    return list(pool.values())[:MAX_CANDIDATES]


def search_combinations(
    candidates: list[dict],
    target_min: float,
    target_max: float,
    legs_count: int | None = None,
    legs_min: int | None = None,
    legs_max: int | None = None,
    leg_odds_min: float = 1.01,
    leg_odds_max: float = 50.0,
    markets: list[str] | None = None,
    max_results: int = MAX_RESULTS,
) -> dict[str, Any]:
    start = time.monotonic()
    filtered = []
    for c in candidates:
        o = c["odd"]
        if o < leg_odds_min or o > leg_odds_max:
            continue
        if markets and c.get("market") not in markets:
            continue
        filtered.append(c)

    if len(filtered) > MAX_CANDIDATES:
        filtered = filtered[:MAX_CANDIDATES]

    if legs_count is not None:
        k_min = k_max = legs_count
    else:
        k_min = legs_min or 2
        k_max = legs_max or 10

    results: list[dict] = []

    def backtrack(start_idx: int, chosen: list[dict], product: float):
        if time.monotonic() - start > TIMEOUT_SEC:
            return
        if len(results) >= max_results:
            return
        n = len(chosen)
        if n >= k_min:
            if target_min <= product <= target_max and n <= k_max:
                legs = []
                for leg in chosen:
                    legs.append(
                        {
                            **leg,
                            "why": explain_selection(
                                {
                                    "fixture": leg.get("fixture_name"),
                                    "market": leg.get("market"),
                                    "selection": leg.get("selection"),
                                    "reasons": leg.get("reasons"),
                                }
                            ),
                        }
                    )
                results.append({"combined_odds": round(product, 3), "legs": legs, "legs_count": n})
        if n >= k_max:
            return
        for i in range(start_idx, len(filtered)):
            if len(results) >= max_results:
                break
            leg = filtered[i]
            new_prod = product * leg["odd"]
            if new_prod > target_max * 1.5:
                continue
            backtrack(i + 1, chosen + [leg], new_prod)

    backtrack(0, [], 1.0)

    timed_out = time.monotonic() - start > TIMEOUT_SEC
    return {
        "results": results[:max_results],
        "candidates_used": len(filtered),
        "timed_out": timed_out,
    }
