const STANDARD_LEAGUE_IDS = new Set([39, 140, 135, 78, 61, 1, 4, 5]);
const CHAMPIONS_LEAGUE_ID = 2;
const EUROPA_IDS = new Set([3, 848]);

// Աստղային թիմի բոնուս (0 = անջատված)
const STAR_BONUS = 2;

// Տոտալների նախապատվություն
const TOTAL_MARKETS = new Set(['OU', 'TEAM_TOTAL_HOME', 'TEAM_TOTAL_AWAY', 'OU_1H']);
const TOTAL_BONUS = 0;         // 0 = անջատված (տոտալների առավելությունը հանված է)
const TOTAL_ODD_RELAX = 0;     // 0 = տոտալները նույն գործակցի շեմով, ինչ մյուսները
const isTotal = (c) => TOTAL_MARKETS.has(c.market);

// ՆՈՐ: անկյունայիններ / քարտեր — մեկ չեկում միասին առավելագույնը 2 (ավելի ցրված շուկաներ են)
const familyOf = (c) => (c.market.startsWith('CORNERS') || c.market.startsWith('CARDS') ? 'SPECIALS' : null);
const FAMILY_LIMIT = { SPECIALS: 2 };
// չեկի հիմքը գոլերի/ելքի վերլուծությունն է. corners/cards-ը չի կարող լինել ընտրանքների կեսից ավելին
const specialsOk = (sel) => sel.filter((c) => familyOf(c)).length * 2 <= sel.length;

const PACKAGE_DEFS = {
  standard: {
    '3x': { min: 3.00, max: 3.50, price: 2000 },
    '5x': { min: 5.00, max: 5.50, price: 3000 },
    '10x': { min: 10.00, max: 10.50, price: 5000 },
    '20x': { min: 20.00, max: 20.50, price: 7000 },
  },
  champions: {
    '3x': { min: 3.00, max: 3.50, price: 2000 },
    '5x': { min: 5.00, max: 5.50, price: 3000 },
    '10x': { min: 10.00, max: 10.50, price: 7000 },
  },
  europa: {
    '3x': { min: 3.00, max: 3.50, price: 2000 },
    '5x': { min: 5.00, max: 5.50, price: 3000 },
    '10x': { min: 10.00, max: 10.50, price: 5000 },
  },
  promo: {
    '5x': { min: 4.00, max: 4.95, price: 0 },
  },
};

// ՆՈՐ: minDQ — տվյալների որակի նվազագույն շեմ (առանց բավարար վերլուծության խաղը չի մտնում չեկի մեջ)
const STAGES = [
  { name: 'strict',  minConf: 58, minCompat: 58, minProb: 0.58, minDQ: 55, minOdd: 1.20, maxOdd: 2.60, minEdge: -0.10, rangePad: 0 },
  { name: 'relaxed', minConf: 52, minCompat: 53, minProb: 0.53, minDQ: 45, minOdd: 1.15, maxOdd: 3.50, minEdge: -0.12, rangePad: 0 },
  { name: 'stretch', minConf: 46, minCompat: 48, minProb: 0.50, minDQ: 35, minOdd: 1.10, maxOdd: 6.00, minEdge: -0.15, rangePad: 0.08 },
];

const MIN_SIZE = 2;
const MAX_SIZE = 12;
const PER_FIXTURE_POOL = 16;
const MAX_FIXTURES = 35;
const MAX_ITERATIONS = 800000;

function clip(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

function packageScore(sel) {
  const hit = sel.reduce((p, s) => p * (s.probability ?? 0), 1);
  const dq = avg(sel.map((s) => s.dataQuality));
  const riskPenalty = avg(sel.map((s) => (s.risk === 'MEDIUM' ? 1 : 0)));
  const starSum = sel.reduce((n, s) => n + (s.star || 0), 0);
  const totalsCount = sel.reduce((n, s) => n + (isTotal(s) ? 1 : 0), 0);
  return hit * 100 + dq * 0.01 - riskPenalty * 0.2 + starSum * STAR_BONUS + totalsCount * TOTAL_BONUS;
}

function centerBonus(odds, range) {
  const mid = (range.min + range.max) / 2;
  const half = (range.max - range.min) / 2 || 1;
  return clip(0.3 * (1 - Math.abs(odds - mid) / half), 0, 0.3);
}

// ՆՈՐ: հիմնական կշիռը՝ հավանականություն, վստահություն և տվյալների որակ. գործակցի առավելությունը (edge)՝ թեթև
function candScore(c) {
  return c.confidence * 1.5 + c.compatibility + (c.dataQuality ?? 0) * 0.3 + (c.agreement ?? 0.5) * 10
    + (c.edge ?? 0) * 30
    + (c.star || 0) * STAR_BONUS * 2
    + (isTotal(c) ? TOTAL_BONUS * 3 : 0);
}

function buildGroups(pool, st) {
  const byFx = new Map();
  for (const c of pool) {
    if (c.risk === 'HIGH') continue;
    if (c.side && c.fav && c.side !== c.fav) continue;   // միայն ֆավորիտի կողմը
    if (!(c.probability >= st.minProb)) continue;        // միայն հավանական ընտրություններ
    if (!(c.confidence >= st.minConf)) continue;
    if (!(c.compatibility >= st.minCompat)) continue;
    if (!((c.dataQuality ?? 0) >= st.minDQ)) continue;
    const minOdd = isTotal(c) ? st.minOdd - TOTAL_ODD_RELAX : st.minOdd;
    if (!(c.odd >= minOdd && c.odd <= st.maxOdd)) continue;
    if (!((c.edge ?? 0) >= st.minEdge)) continue;
    if (!byFx.has(c.fixtureId)) byFx.set(c.fixtureId, []);
    byFx.get(c.fixtureId).push(c);
  }
  const groups = [...byFx.values()].map((arr) =>
    arr.sort((a, b) => candScore(b) - candScore(a)).slice(0, PER_FIXTURE_POOL)
  );
  groups.sort((a, b) => candScore(b[0]) - candScore(a[0]));
  return groups.slice(0, MAX_FIXTURES);
}

function maxReachable(groups) {
  return groups.reduce((p, g) => p * Math.max(...g.map((c) => c.odd)), 1);
}

function search(groups, range) {
  const n = groups.length;
  const maxOdd = groups.map((g) => Math.max(...g.map((c) => c.odd)));
  const sufMax = new Array(n + 1).fill(1);
  for (let i = n - 1; i >= 0; i--) sufMax[i] = sufMax[i + 1] * maxOdd[i];

  let best = null, iterations = 0, hitLimit = false;

  function dfs(gi, chosen, product) {
    if (++iterations > MAX_ITERATIONS) { hitLimit = true; return; }
    if (chosen.length >= MIN_SIZE && product >= range.min && product <= range.max && specialsOk(chosen)) {
      const score = packageScore(chosen) + centerBonus(product, range);
      if (!best || score > best.score) best = { selections: chosen.slice(), combinedOdds: product, score };
    }
    if (gi >= n || chosen.length >= MAX_SIZE) return;
    if (product * sufMax[gi] < range.min) return;
    for (const c of groups[gi]) {
      const np = product * c.odd;
      if (np > range.max * 1.0001) continue;
      const fam = familyOf(c);
      if (fam && chosen.filter((x) => familyOf(x) === fam).length >= FAMILY_LIMIT[fam]) continue;
      chosen.push(c);
      dfs(gi + 1, chosen, np);
      chosen.pop();
      if (hitLimit) return;
    }
    dfs(gi + 1, chosen, product);
  }

  dfs(0, [], 1);
  return { best, iterations, hitLimit };
}

const allCandidates = [];
for (const item of $input.all()) {
  if (Array.isArray(item.json.candidates)) allCandidates.push(...item.json.candidates);
}

const pools = {
  standard: allCandidates.filter((c) => STANDARD_LEAGUE_IDS.has(c.leagueId)),
  champions: allCandidates.filter((c) => c.leagueId === CHAMPIONS_LEAGUE_ID),
  europa: allCandidates.filter((c) => EUROPA_IDS.has(c.leagueId)),
  promo: allCandidates.filter((c) => STANDARD_LEAGUE_IDS.has(c.leagueId) || c.leagueId === CHAMPIONS_LEAGUE_ID || EUROPA_IDS.has(c.leagueId)),
};

const outputItems = [];

for (const tier of ['standard', 'champions', 'europa', 'promo']) {
  const pool = pools[tier];

  for (const [name, range] of Object.entries(PACKAGE_DEFS[tier])) {
    let found = null;
    const stageLog = [];

    for (const st of STAGES) {
      const pad = tier === 'promo' ? 0 : st.rangePad;
      const groups = buildGroups(pool, st);
      const r = { min: range.min * (1 - pad), max: range.max * (1 + pad) };

      const res = search(groups, r);
      stageLog.push({
        stage: st.name, fixtures: groups.length,
        candidates: groups.reduce((s, g) => s + g.length, 0),
        max_reachable_odds: groups.length ? Math.round(maxReachable(groups) * 100) / 100 : 0,
        iterations: res.iterations, hitLimit: res.hitLimit,
      });
      if (res.best) { found = { ...res, stage: st.name }; break; }
    }

    if (!found) {
      const last = stageLog[stageLog.length - 1];
      let reason = 'no_combo_in_range';
      if (pool.length === 0) reason = 'no_candidates';
      else if (last.fixtures === 0) reason = 'below_threshold_or_high_risk';
      else if (last.max_reachable_odds < range.min * (1 - 0.08)) reason = 'not_enough_fixtures_for_target_odds';
      else if (stageLog.some((s) => s.hitLimit)) reason = 'dfs_iteration_limit';

      outputItems.push({ json: {
        tier, package: name, available: false, price: range.price, reason,
        max_reachable_odds: last.max_reachable_odds,
        debug: { allCandidates: allCandidates.length, tierCandidates: pool.length, stages: stageLog },
      } });
      continue;
    }

    const sel = found.best.selections;
    const hitChance = sel.reduce((p, s) => p * (s.probability ?? 0), 1);
    outputItems.push({ json: {
      tier, package: name, available: true, price: range.price,
      quality: found.stage,
      combined_odds: Math.round(found.best.combinedOdds * 100) / 100,
      estimated_hit_chance: Math.round(hitChance * 1000) / 10,
      package_score: Math.round(found.best.score * 100) / 100,
      selection_count: sel.length,
      selections: sel.map((s) => ({
        fixture: s.fixtureLabel, fixture_id: s.fixtureId, league: s.leagueId, bookmaker: s.bookmaker, market: s.market, selection: s.selection,
        odd: s.odd, probability: s.probability, model_probability: s.modelProbability, market_probability: s.marketProbability,
        edge: s.edge, data_quality: s.dataQuality,
        confidence: s.confidence, compatibility: s.compatibility, risk: s.risk, reasons: s.reasons,
      })),
    } });
  }
}

// ՆՈՐ: ընտրանքներ միայն կայքի կոնստրուկտորի համար (չեկերի վրա չեն ազդում, լրացուցիչ API հարցում չկա).
// Ամեն խաղից լավագույն 3-ը՝ «relaxed» շեմերով և 1.10–3.00 գործակցով։
const COMBINATOR_PER_FIXTURE = 3;
const comboStage = { ...STAGES[1], minOdd: 1.10, maxOdd: 3.00 };
const combinatorSelections = buildGroups(pools.promo, comboStage)
  .flatMap((g) => g.slice(0, COMBINATOR_PER_FIXTURE))
  .map((s) => ({
    fixture: s.fixtureLabel, fixture_id: s.fixtureId, market: s.market, selection: s.selection,
    odd: s.odd, probability: s.probability, reasons: s.reasons,
  }));
outputItems.push({ json: { combinator_selections: combinatorSelections } });

return outputItems;