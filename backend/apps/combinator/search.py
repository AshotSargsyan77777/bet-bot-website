import time
from typing import Any

from apps.checks.services.formatting import explain_selection

MAX_CANDIDATES = 300
MAX_RESULTS = 20
TIMEOUT_SEC = 2.0


def _dedupe_key(c: dict) -> tuple:
    fid = c.get("fixture_id") or c.get("fixture_name") or c.get("fixture") or ""
    return (str(fid), c.get("market", ""), c.get("selection", ""))


def _fixture_key(c: dict) -> str:
    return str(c.get("fixture_id") or c.get("fixture_name") or "")


def _prob(value) -> float | None:
    try:
        p = float(value)
    except (TypeError, ValueError):
        return None
    return p if 0 < p <= 1 else None


def hit_chance(legs: list[dict]) -> float | None:
    probs = [leg.get("probability") for leg in legs]
    if not probs or any(p is None for p in probs):
        return None
    out = 1.0
    for p in probs:
        out *= p
    return out


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
                "probability": _prob(s.get("probability")),
            }
            pool[_dedupe_key(item)] = item
    admin_pool: dict[tuple, dict] = {}
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
            "probability": _prob(c.get("probability")),
        }
        admin_pool[_dedupe_key(item)] = item
    # admin picks are never cut off by the size limit
    rest = [v for k, v in pool.items() if k not in admin_pool]
    return (list(admin_pool.values()) + rest)[:MAX_CANDIDATES]


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
    # most likely picks first: the first variants found (before the time limit) are the best ones
    filtered.sort(key=lambda c: -(c.get("probability") or 0))
    odd_lo = min((c["odd"] for c in filtered), default=1.0)
    odd_hi = max((c["odd"] for c in filtered), default=1.0)

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
                chance = hit_chance(chosen)
                results.append({
                    "combined_odds": round(product, 3), "legs": legs, "legs_count": n,
                    "hit_chance": round(chance, 4) if chance is not None else None,
                })
        if n >= k_max:
            return
        left = k_max - n
        if product * odd_hi ** left < target_min:  # even the highest odds can't reach the target
            return
        if product * odd_lo ** max(k_min - n, 0) > target_max:  # even the lowest odds overshoot
            return
        used_fixtures = {_fixture_key(c) for c in chosen}
        for i in range(start_idx, len(filtered)):
            if len(results) >= max_results:
                break
            leg = filtered[i]
            if _fixture_key(leg) in used_fixtures:  # one pick per match (correlated picks are not allowed)
                continue
            new_prod = product * leg["odd"]
            if new_prod > target_max * 1.5:
                continue
            backtrack(i + 1, chosen + [leg], new_prod)

    wanted = max_results
    max_results = min(wanted * 5, 100)  # collect more, then keep the most likely ones
    backtrack(0, [], 1.0)

    timed_out = time.monotonic() - start > TIMEOUT_SEC
    results.sort(key=lambda r: (-(r["hit_chance"] or 0), r["legs_count"]))
    return {
        "results": results[:wanted],
        "candidates_used": len(filtered),
        "timed_out": timed_out,
    }
