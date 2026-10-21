// ====== ANALYZE MATCHES (վերլուծությունը առաջնային է, գործակիցը՝ երկրորդական) ======
// Հավանականությունները հաշվարկվում են թիմերի իրական ցուցանիշներից (մրցաշրջան + վերջին խաղերի xG, հարվածներ,
// անկյունայիններ, քարտեր, վնասվածքներ)։ Բուքմեյքերների շուկան օգտագործվում է միայն որպես ստուգում (W_MARKET)։
const LEAGUE_HOME_GOALS = 1.52;
const LEAGUE_AWAY_GOALS = 1.20;
const LEAGUE_TEAM_GOALS = (LEAGUE_HOME_GOALS + LEAGUE_AWAY_GOALS) / 2;
const W_MARKET = 0.25;            // նախկինում 0.7. շուկան այժմ միայն ճշգրտում է մոդելը
const W_MARKET_LAMBDA = 0.25;     // շուկայից վերականգնված գոլերի կշիռը վերջնական λ-ում
const SOT_CONVERSION = 0.30;      // դարպասին ուղղված հարվածից գոլի միջին հավանականություն (xG չլինելու դեպքում)
const INJURY_ATTACK_PENALTY = 0.015, INJURY_MAX_PENALTY = 0.08;
const DC_RHO = -0.08;             // Dixon-Coles ճշգրտում (0-0, 1-1 և այլն)
const FIRST_HALF_SHARE = 0.45;
const MAXG = 10;
const CORNERS_DISPERSION = 14;    // negative binomial r (անկյունայինների ցրվածություն)
const CARDS_DISPERSION = 9;
const MIN_DEEP_MATCHES = 4;       // corners/cards միայն եթե յուրաքանչյուր թիմ ունի ≥4 խաղի վիճակագրություն
const TOP_TEAMS = new Set([33, 40, 42, 49, 47, 50, 541, 529, 530, 157, 165, 505, 489, 496, 492, 85]);

const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const isNum = (v) => v !== null && v !== undefined && Number.isFinite(v);
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const pct = (p) => `${(p * 100).toFixed(0)}%`;

function wmean(parts) {
  let s = 0, w = 0;
  for (const [v, wt] of parts) if (isNum(v) && wt > 0) { s += v * wt; w += wt; }
  return w ? s / w : null;
}

function normalizeList(list) {
  return (Array.isArray(list) ? list : [])
    .map((o) => ({ market: o.market, selection: String(o.selection ?? '').replace(/(\d+)\.0+\b/g, '$1'), odd: parseFloat(o.odd) }))
    .filter((o) => Number.isFinite(o.odd) && o.odd > 1.0);
}
const getOdd = (list, market, name) => { const f = list.find((o) => o.market === market && norm(o.selection) === norm(name)); return f ? f.odd : null; };
function devig(odds) {
  if (odds.some((o) => !o)) return null;
  const raw = odds.map((o) => 1 / o), sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => r / sum);
}
function consensus(books, market, names) {
  const all = [];
  for (const list of Object.values(books)) { const d = devig(names.map((n) => getOdd(list, market, n))); if (d) all.push(d); }
  return all.length ? names.map((_, k) => avg(all.map((p) => p[k]))) : null;
}
// շուկայում առկա գծերը (Over X / Under X)
function linesOf(list, market) {
  const set = new Set();
  for (const o of list) {
    if (o.market !== market) continue;
    const m = /^(over|under)\s+(\d+(?:\.\d+)?)$/i.exec(o.selection.trim());
    if (m) set.add(parseFloat(m[2]));
  }
  return [...set].sort((a, b) => a - b);
}

// ---------- բաշխումներ ----------
function poissonPmf(lambda, n) {
  const arr = [Math.exp(-lambda)];
  for (let k = 1; k <= n; k++) arr.push(arr[k - 1] * lambda / k);
  const s = arr.reduce((a, b) => a + b, 0);
  return arr.map((x) => x / s);
}
// negative binomial (mean mu, dispersion r) — անկյունայիններ/քարտեր (ցրվածությունն ավելի մեծ է, քան Poisson-ում)
function nbPmf(mu, r, n) {
  const p = r / (r + mu);
  const arr = [Math.pow(p, r)];
  for (let k = 1; k <= n; k++) arr.push(arr[k - 1] * ((k - 1 + r) / k) * (1 - p));
  const s = arr.reduce((a, b) => a + b, 0);
  return arr.map((x) => x / s);
}
const overFrom = (pmf, line) => pmf.reduce((s, p, k) => s + (k > line ? p : 0), 0);

function goalModel(lh, la) {
  const ph = poissonPmf(lh, MAXG), pa = poissonPmf(la, MAXG);
  const grid = [];
  let tot = 0;
  for (let i = 0; i <= MAXG; i++) {
    grid.push([]);
    for (let j = 0; j <= MAXG; j++) {
      let tau = 1;
      if (i === 0 && j === 0) tau = 1 - lh * la * DC_RHO;
      else if (i === 0 && j === 1) tau = 1 + lh * DC_RHO;
      else if (i === 1 && j === 0) tau = 1 + la * DC_RHO;
      else if (i === 1 && j === 1) tau = 1 - DC_RHO;
      const p = Math.max(0, ph[i] * pa[j] * tau);
      grid[i].push(p); tot += p;
    }
  }
  let pH = 0, pD = 0, pA = 0, btts = 0, wnH = 0, wnA = 0, csH = 0, csA = 0;
  const total = new Array(2 * MAXG + 1).fill(0);
  const diff = {};
  const homeG = new Array(MAXG + 1).fill(0), awayG = new Array(MAXG + 1).fill(0);
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
    const p = grid[i][j] / tot;
    total[i + j] += p; homeG[i] += p; awayG[j] += p;
    diff[i - j] = (diff[i - j] || 0) + p;
    if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
    if (i > 0 && j > 0) btts += p;
    if (j === 0) csH += p;
    if (i === 0) csA += p;
    if (j === 0 && i > 0) wnH += p;
    if (i === 0 && j > 0) wnA += p;
  }
  return {
    pH, pD, pA, btts, wnH, wnA, csHome: csH, csAway: csA,
    over: (line) => overFrom(total, line),
    pTotal: (k) => total[k] ?? 0,
    homeOver: (line) => overFrom(homeG, line),
    awayOver: (line) => overFrom(awayG, line),
    // Asian handicap. h՝ տան թիմին կիրառվող handicap. վերադարձնում է {win, push}
    ah: (h, side) => {
      let win = 0, push = 0;
      for (const [dStr, p] of Object.entries(diff)) {
        const d = Number(dStr) * (side === 'H' ? 1 : -1) + h;
        if (d > 0) win += p; else if (d === 0) push += p;
      }
      return { win, push };
    },
  };
}

function fitMarketLambdas(mk1x2, pOver25) {
  let best = null;
  for (let lh = 0.2; lh <= 4.0; lh += 0.05) for (let la = 0.2; la <= 4.0; la += 0.05) {
    const s = goalModel(lh, la);
    let err = (s.pH - mk1x2[0]) ** 2 + (s.pD - mk1x2[1]) ** 2 + (s.pA - mk1x2[2]) ** 2;
    if (pOver25 !== null) err += (s.over(2.5) - pOver25) ** 2;
    if (!best || err < best.err) best = { lh, la, err };
  }
  return best;
}

// ---------- թիմի հարձակում / պաշտպանություն ----------
// վերջին խաղերի հարձակման ցուցանիշ. xG (եթե կա) + իրական գոլեր + դարպասին հարվածներ
function recentAttack(p) {
  if (!p) return null;
  const sotXg = isNum(p.sotFor) ? p.sotFor * SOT_CONVERSION : null;
  return wmean([[p.xgCount >= 3 ? p.xgFor : null, 0.5], [p.goalsFor, 0.3], [sotXg, 0.2]]);
}
function recentDefence(p) {
  if (!p) return null;
  const sotXg = isNum(p.sotAgainst) ? p.sotAgainst * SOT_CONVERSION : null;
  return wmean([[p.xgCount >= 3 ? p.xgAgainst : null, 0.5], [p.goalsAgainst, 0.3], [sotXg, 0.2]]);
}

function buildLambdas(a, deep) {
  const sh = a.home.season, sa = a.away.season;
  const parts = { home: [], away: [] };
  const notes = [];

  // 1) մրցաշրջան. տան թիմը տանը, հյուրը՝ արտագնա (փոքր նմուշը կծկվում է լիգայի միջինին)
  if (sh?.goalsForAvg?.home !== null && sa?.goalsAgainstAvg?.away !== null && sh && sa) {
    const nH = sh.played.home || 0, nA = sa.played.away || 0;
    const shrink = (v, n, base) => (isNum(v) ? (v * n + base * 4) / (n + 4) : base);
    const hAtt = shrink(sh.goalsForAvg.home, nH, LEAGUE_HOME_GOALS) / LEAGUE_HOME_GOALS;
    const aDefWeak = shrink(sa.goalsAgainstAvg.away, nA, LEAGUE_HOME_GOALS) / LEAGUE_HOME_GOALS;
    const aAtt = shrink(sa.goalsForAvg.away, nA, LEAGUE_AWAY_GOALS) / LEAGUE_AWAY_GOALS;
    const hDefWeak = shrink(sh.goalsAgainstAvg.home, nH, LEAGUE_AWAY_GOALS) / LEAGUE_AWAY_GOALS;
    const w = 0.45 * Math.min(1, (nH + nA) / 10);
    parts.home.push([LEAGUE_HOME_GOALS * hAtt * aDefWeak, w]);
    parts.away.push([LEAGUE_AWAY_GOALS * aAtt * hDefWeak, w]);
    notes.push('season');
  }

  // 2) վերջին խաղերի խորը վիճակագրություն (xG / հարվածներ)
  const hp = deep?.home, ap = deep?.away;
  const hAttR = recentAttack(hp), hDefR = recentDefence(hp), aAttR = recentAttack(ap), aDefR = recentDefence(ap);
  if (isNum(hAttR) && isNum(aDefR) && isNum(aAttR) && isNum(hDefR)) {
    const w = 0.45 * Math.min(1, (hp.played + ap.played) / (2 * 6));
    parts.home.push([(hAttR * aDefR / LEAGUE_TEAM_GOALS) * 1.10, w]);
    parts.away.push([(aAttR * hDefR / LEAGUE_TEAM_GOALS) * 0.90, w]);
    notes.push('recent');
  }

  // 3) predictions-ի last_5 միջինները (թույլ ազդանշան)
  const eh = a.modelEstimate?.expectedGoalsHome, ea = a.modelEstimate?.expectedGoalsAway;
  if (isNum(eh) && isNum(ea)) { parts.home.push([eh, 0.10]); parts.away.push([ea, 0.10]); notes.push('last5'); }

  let lh = wmean(parts.home), la = wmean(parts.away);
  if (!isNum(lh) || !isNum(la)) return null;

  // 4) վնասվածքներ. բացակա խաղացողները թուլացնում են թիմի հարձակումը
  const injH = deep?.injuries?.home?.length ?? 0, injA = deep?.injuries?.away?.length ?? 0;
  lh *= 1 - Math.min(INJURY_MAX_PENALTY, injH * INJURY_ATTACK_PENALTY);
  la *= 1 - Math.min(INJURY_MAX_PENALTY, injA * INJURY_ATTACK_PENALTY);

  return { lh: clip(lh, 0.2, 4), la: clip(la, 0.2, 4), sources: notes };
}

function cornersModel(deep) {
  const h = deep?.home, a = deep?.away;
  if (!h || !a || h.cornersCount < MIN_DEEP_MATCHES || a.cornersCount < MIN_DEEP_MATCHES) return null;
  if (![h.cornersFor, h.cornersAgainst, a.cornersFor, a.cornersAgainst].every(isNum)) return null;
  const muH = (0.55 * h.cornersFor + 0.45 * a.cornersAgainst) * 1.05;
  const muA = (0.55 * a.cornersFor + 0.45 * h.cornersAgainst) * 0.95;
  const n = 30;
  return {
    muH, muA, mu: muH + muA,
    total: nbPmf(muH + muA, CORNERS_DISPERSION, n),
    home: nbPmf(muH, CORNERS_DISPERSION, n),
    away: nbPmf(muA, CORNERS_DISPERSION, n),
  };
}

function cardsModel(deep, a) {
  const h = deep?.home, aw = deep?.away;
  if (!h || !aw || h.cardsCount < MIN_DEEP_MATCHES || aw.cardsCount < MIN_DEEP_MATCHES) return null;
  if (![h.cardsFor, h.cardsAgainst, aw.cardsFor, aw.cardsAgainst].every(isNum)) return null;
  const seasonRate = (s) => (s && s.played?.total ? (s.yellowCards + s.redCards) / s.played.total : null);
  const muH = wmean([[0.6 * h.cardsFor + 0.4 * aw.cardsAgainst, 0.7], [seasonRate(a.home.season), 0.3]]);
  const muA = wmean([[0.6 * aw.cardsFor + 0.4 * h.cardsAgainst, 0.7], [seasonRate(a.away.season), 0.3]]);
  if (!isNum(muH) || !isNum(muA)) return null;
  return { muH, muA, mu: muH + muA, total: nbPmf(muH + muA, CARDS_DISPERSION, 25) };
}

function classifyRisk(confidence, compatibility, dataQuality) {
  if (confidence < 45 || compatibility < 45 || dataQuality < 25) return 'HIGH';
  if (confidence < 65 || compatibility < 60 || dataQuality < 50) return 'MEDIUM';
  return 'LOW';
}

function dataQualityOf(a, deep, nBooks) {
  let q = 0;
  if (a.home.season && a.away.season) q += 20;
  if (deep?.home && deep?.away) {
    q += 15 * Math.min(1, (deep.home.played + deep.away.played) / 12);
    q += 20 * Math.min(1, (deep.home.statsAvailable + deep.away.statsAvailable) / 10);
    if (deep.home.xgCount >= 3 && deep.away.xgCount >= 3) q += 10;
  }
  if (deep?.injuries) q += 5;
  if (deep?.table?.home && deep?.table?.away) q += 5;
  if (a.h2h?.available) q += 5;
  if (a.apiPrediction?.percent) q += 5;
  q += 15 * Math.min(nBooks / 3, 1);
  return clip(q, 0, 100);
}

function buildCandidates(item) {
  const a = item.json.analysis;
  if (!a) return [];
  const deep = item.json.deep || {};
  const pref = normalizeList(item.json.odds);
  if (!pref.length) return [];
  let books = {};
  for (const [name, list] of Object.entries(item.json.books || {})) books[name] = normalizeList(list);
  if (!Object.keys(books).length) books = { preferred: pref };
  const nBooks = Object.keys(books).length;

  const home = item.json.homeTeamName, away = item.json.awayTeamName;
  const star = (TOP_TEAMS.has(Number(item.json.homeTeamId)) ? 1 : 0) + (TOP_TEAMS.has(Number(item.json.awayTeamId)) ? 1 : 0);
  const dataQuality = dataQualityOf(a, deep, nBooks);

  // ---- գոլերի մոդել ----
  const built = buildLambdas(a, deep);
  const mk = consensus(books, 'MATCH_WINNER', ['Home', 'Draw', 'Away']);
  const mkOver25 = consensus(books, 'OU', ['Over 2.5', 'Under 2.5']);
  let lh = built?.lh ?? null, la = built?.la ?? null;
  let marketFit = null;
  if (mk) {
    marketFit = fitMarketLambdas(mk, mkOver25 ? mkOver25[0] : null);
    if (isNum(lh)) { lh = (1 - W_MARKET_LAMBDA) * lh + W_MARKET_LAMBDA * marketFit.lh; la = (1 - W_MARKET_LAMBDA) * la + W_MARKET_LAMBDA * marketFit.la; }
  }
  // վերլուծության տվյալ չկա՝ խաղը բաց ենք թողնում (միայն գործակցով չենք ընտրում)
  if (!isNum(lh) || !isNum(la)) return [];
  const model = goalModel(lh, la);

  // 1X2. Poisson + API prediction-ի տոկոսներ (թեթև կշռով)
  let apiPercent = a.apiPrediction?.percent;
  if (apiPercent && apiPercent.home === 10 && apiPercent.draw === 45 && apiPercent.away === 45) apiPercent = null;
  let p1x2 = [model.pH, model.pD, model.pA];
  if (apiPercent && [apiPercent.home, apiPercent.draw, apiPercent.away].every(isNum)) {
    const t = apiPercent.home + apiPercent.draw + apiPercent.away;
    if (t > 0) p1x2 = p1x2.map((p, k) => 0.88 * p + 0.12 * ([apiPercent.home, apiPercent.draw, apiPercent.away][k] / t));
  }

  // ---- բացատրություններ (formatting-ը կարդում է այս ձևաչափերը) ----
  const hf = a.home.form?.score ?? null, af = a.away.form?.score ?? null;
  const base = [`xG ${lh.toFixed(2)}/${la.toFixed(2)}`, `xG total ${(lh + la).toFixed(2)}`];
  if (isNum(hf) && isNum(af)) base.push(`Form: home ${hf}% vs away ${af}%`);
  const h2h = a.h2h;
  if (h2h?.available) base.push(`H2H ${h2h.home_wins}-${h2h.draws}-${h2h.away_wins} in ${h2h.matches}`);
  if (mk) base.push(`Market (no margin): ${(mk[0] * 100).toFixed(0)}/${(mk[1] * 100).toFixed(0)}/${(mk[2] * 100).toFixed(0)}`);
  const hp = deep.home, ap = deep.away;
  if (hp && ap) {
    if (hp.xgCount >= 3 && ap.xgCount >= 3) base.push(`Recent xG for/against: H ${hp.xgFor}/${hp.xgAgainst} | A ${ap.xgFor}/${ap.xgAgainst}`);
    if (isNum(hp.sotFor) && isNum(ap.sotFor)) base.push(`Shots on target: H ${hp.sotFor}/${hp.sotAgainst} | A ${ap.sotFor}/${ap.sotAgainst}`);
    base.push(`Recent results: H ${hp.results || '-'} | A ${ap.results || '-'}`);
  }
  if (deep.injuries) base.push(`Injuries: home ${deep.injuries.home.length} / away ${deep.injuries.away.length}`);
  if (deep.table?.home && deep.table?.away) base.push(`Table: home #${deep.table.home.rank} / away #${deep.table.away.rank}`);

  const out = [];
  const add = (market, selection, odd, pModel, pMarket, reasons) => {
    if (!odd || !isNum(pModel)) return;
    const hasMkt = isNum(pMarket);
    const p = clip(hasMkt ? (1 - W_MARKET) * pModel + W_MARKET * pMarket : pModel, 0, 1);
    // մոդելի և շուկայի համաձայնություն. մեծ տարբերությունը հաճախ նշանակում է, որ ինչ-որ բան բաց ենք թողել
    const agreement = hasMkt ? 1 - Math.min(Math.abs(pModel - pMarket) / 0.20, 1) : 0.5;
    const compatibility = p * 100;
    const confidence = clip(compatibility * 0.65 + dataQuality * 0.25 + agreement * 10, 0, 100);
    out.push({
      fixtureId: item.json.fixtureId, leagueId: item.json.leagueId ?? null,
      fixtureLabel: `${home} - ${away}`, bookmaker: item.json.bookmaker ?? null,
      market, selection, odd,
      probability: Math.round(p * 1000) / 1000,
      modelProbability: Math.round(pModel * 1000) / 1000,
      marketProbability: hasMkt ? Math.round(pMarket * 1000) / 1000 : null,
      edge: Math.round((p - 1 / odd) * 1000) / 1000,
      compatibility: round1(compatibility),
      confidence: round1(confidence),
      dataQuality: round1(dataQuality),
      agreement: Math.round(agreement * 100) / 100,
      risk: classifyRisk(confidence, compatibility, dataQuality),
      star,
      reasons,
    });
  };

  // ---- 1X2 / երկակի շանս / DNB ----
  const [pH, pD, pA] = p1x2;
  const r1 = (p) => [...base, `Final prob ${(p * 100).toFixed(1)}%`];
  add('MATCH_WINNER', `${home} (Home Win)`, getOdd(pref, 'MATCH_WINNER', 'Home'), pH, mk ? mk[0] : null, r1(pH));
  add('MATCH_WINNER', `${away} (Away Win)`, getOdd(pref, 'MATCH_WINNER', 'Away'), pA, mk ? mk[2] : null, r1(pA));
  const oHD = getOdd(pref, 'DOUBLE_CHANCE', 'Home/Draw');
  const oAD = getOdd(pref, 'DOUBLE_CHANCE', 'Draw/Away') || getOdd(pref, 'DOUBLE_CHANCE', 'Away/Draw');
  add('DOUBLE_CHANCE', `${home} or Draw`, oHD, pH + pD, mk ? mk[0] + mk[1] : null, r1(pH + pD));
  add('DOUBLE_CHANCE', `${away} or Draw`, oAD, pA + pD, mk ? mk[2] + mk[1] : null, r1(pA + pD));
  const mDnb = consensus(books, 'DNB', ['Home', 'Away']);
  add('DNB', `Draw No Bet — ${home}`, getOdd(pref, 'DNB', 'Home'), pH / (pH + pA), mDnb ? mDnb[0] : null, r1(pH / (pH + pA)));
  add('DNB', `Draw No Bet — ${away}`, getOdd(pref, 'DNB', 'Away'), pA / (pH + pA), mDnb ? mDnb[1] : null, r1(pA / (pH + pA)));

  // ---- Asian handicap (միայն .0 և .5 գծեր) ----
  for (const o of pref.filter((x) => x.market === 'ASIAN_HANDICAP')) {
    const m = /^(home|away)\s*([+-]?\d+(?:\.\d+)?)$/i.exec(o.selection.trim());
    if (!m) continue;
    const h = parseFloat(m[2]);
    if (!Number.isInteger(h * 2)) continue;              // quarter գծերը (.25/.75) բաց ենք թողնում
    const side = m[1].toLowerCase() === 'home' ? 'H' : 'A';
    const team = side === 'H' ? home : away;
    const { win, push } = model.ah(h, side);
    const sign = h > 0 ? '+' : h < 0 ? '−' : '';
    const why = push > 0.005 ? `AH ${sign}${Math.abs(h)}: win ${pct(win)}, push ${pct(push)}` : `AH ${sign}${Math.abs(h)}: win ${pct(win)}`;
    add('ASIAN_HANDICAP', `${team} ${sign}${Math.abs(h)} (Asian Handicap)`, o.odd, win, null, [why, ...base]);
  }

  // ---- BTTS ----
  const mB = consensus(books, 'BTTS', ['Yes', 'No']);
  const bttsR = [`Poisson BTTS ${pct(model.btts)}`, ...base];
  add('BTTS', 'Both Teams To Score - Yes', getOdd(pref, 'BTTS', 'Yes'), model.btts, mB ? mB[0] : null, bttsR);
  add('BTTS', 'Both Teams To Score - No', getOdd(pref, 'BTTS', 'No'), 1 - model.btts, mB ? mB[1] : null, bttsR);

  // ---- գոլերի տոտալներ (գծերը՝ ըստ իրական շուկայի) ----
  for (const line of linesOf(pref, 'OU')) {
    const mO = consensus(books, 'OU', [`Over ${line}`, `Under ${line}`]);
    const po = model.over(line);
    const r = [`Poisson over ${line}: ${pct(po)}`, ...base];
    add('OU', `Over ${line}`, getOdd(pref, 'OU', `Over ${line}`), po, mO ? mO[0] : null, r);
    add('OU', `Under ${line}`, getOdd(pref, 'OU', `Under ${line}`), 1 - po, mO ? mO[1] : null, r);
  }
  for (const [mkt, team, fn] of [['TEAM_TOTAL_HOME', home, (l) => model.homeOver(l)], ['TEAM_TOTAL_AWAY', away, (l) => model.awayOver(l)]]) {
    for (const line of linesOf(pref, mkt)) {
      const mT = consensus(books, mkt, [`Over ${line}`, `Under ${line}`]);
      const po = fn(line);
      const r = [`Team goals over ${line}: ${pct(po)}`, ...base];
      add(mkt, `${team} Over ${line} Goals`, getOdd(pref, mkt, `Over ${line}`), po, mT ? mT[0] : null, r);
      add(mkt, `${team} Under ${line} Goals`, getOdd(pref, mkt, `Under ${line}`), 1 - po, mT ? mT[1] : null, r);
    }
  }
  const m1 = goalModel(lh * FIRST_HALF_SHARE, la * FIRST_HALF_SHARE);
  for (const line of linesOf(pref, 'OU_1H')) {
    const mH = consensus(books, 'OU_1H', [`Over ${line}`, `Under ${line}`]);
    const isPush = Number.isInteger(line);
    const pOverWin = m1.over(line);
    const pUnderWin = isPush ? 1 - m1.over(line - 1) : 1 - m1.over(line);
    const pPush = isPush ? m1.pTotal(line) : 0;
    const why = isPush ? `1st half over/under ${line}: push ${pct(pPush)}` : `1st half over ${line}: ${pct(pOverWin)}`;
    add('OU_1H', `1st Half Over ${line}`, getOdd(pref, 'OU_1H', `Over ${line}`), pOverWin, mH ? mH[0] * (1 - pPush) : null, [why, ...base]);
    add('OU_1H', `1st Half Under ${line}`, getOdd(pref, 'OU_1H', `Under ${line}`), pUnderWin, mH ? mH[1] * (1 - pPush) : null, [why, ...base]);
  }
  for (const [mkt, team, p] of [['CLEAN_SHEET_HOME', home, model.csHome], ['CLEAN_SHEET_AWAY', away, model.csAway]]) {
    const mC = consensus(books, mkt, ['Yes', 'No']);
    add(mkt, `${team} Clean Sheet - Yes`, getOdd(pref, mkt, 'Yes'), p, mC ? mC[0] : null, base);
    add(mkt, `${team} Clean Sheet - No`, getOdd(pref, mkt, 'No'), 1 - p, mC ? mC[1] : null, base);
  }
  for (const [mkt, team, p] of [['WIN_TO_NIL_HOME', home, model.wnH], ['WIN_TO_NIL_AWAY', away, model.wnA]]) {
    const mW = consensus(books, mkt, ['Yes', 'No']);
    add(mkt, `${team} Win To Nil - Yes`, getOdd(pref, mkt, 'Yes'), p, mW ? mW[0] : null, base);
    add(mkt, `${team} Win To Nil - No`, getOdd(pref, mkt, 'No'), 1 - p, mW ? mW[1] : null, base);
  }

  // ---- անկյունայիններ ----
  const cm = cornersModel(deep);
  if (cm) {
    const cr = [`Corners exp ${cm.mu.toFixed(1)} (home ${cm.muH.toFixed(1)} / away ${cm.muA.toFixed(1)})`,
      `Corners avg for/against: H ${hp.cornersFor}/${hp.cornersAgainst} | A ${ap.cornersFor}/${ap.cornersAgainst} (n=${hp.cornersCount}/${ap.cornersCount})`];
    for (const line of linesOf(pref, 'CORNERS_OU')) {
      const mc = consensus(books, 'CORNERS_OU', [`Over ${line}`, `Under ${line}`]);
      const po = overFrom(cm.total, line);
      add('CORNERS_OU', `Corners Over ${line}`, getOdd(pref, 'CORNERS_OU', `Over ${line}`), po, mc ? mc[0] : null, [`Corners over ${line}: ${pct(po)}`, ...cr]);
      add('CORNERS_OU', `Corners Under ${line}`, getOdd(pref, 'CORNERS_OU', `Under ${line}`), 1 - po, mc ? mc[1] : null, [`Corners over ${line}: ${pct(po)}`, ...cr]);
    }
    for (const [mkt, team, pmf] of [['CORNERS_HOME', home, cm.home], ['CORNERS_AWAY', away, cm.away]]) {
      for (const line of linesOf(pref, mkt)) {
        const mc = consensus(books, mkt, [`Over ${line}`, `Under ${line}`]);
        const po = overFrom(pmf, line);
        add(mkt, `${team} Corners Over ${line}`, getOdd(pref, mkt, `Over ${line}`), po, mc ? mc[0] : null, [`Team corners over ${line}: ${pct(po)}`, ...cr]);
        add(mkt, `${team} Corners Under ${line}`, getOdd(pref, mkt, `Under ${line}`), 1 - po, mc ? mc[1] : null, [`Team corners over ${line}: ${pct(po)}`, ...cr]);
      }
    }
  }

  // ---- քարտեր ----
  const km = cardsModel(deep, a);
  if (km) {
    const kr = [`Cards exp ${km.mu.toFixed(1)} (home ${km.muH.toFixed(1)} / away ${km.muA.toFixed(1)})`,
      `Cards avg for/against: H ${hp.cardsFor}/${hp.cardsAgainst} | A ${ap.cardsFor}/${ap.cardsAgainst}`];
    for (const line of linesOf(pref, 'CARDS_OU')) {
      const mc = consensus(books, 'CARDS_OU', [`Over ${line}`, `Under ${line}`]);
      const po = overFrom(km.total, line);
      add('CARDS_OU', `Cards Over ${line}`, getOdd(pref, 'CARDS_OU', `Over ${line}`), po, mc ? mc[0] : null, [`Cards over ${line}: ${pct(po)}`, ...kr]);
      add('CARDS_OU', `Cards Under ${line}`, getOdd(pref, 'CARDS_OU', `Under ${line}`), 1 - po, mc ? mc[1] : null, [`Cards over ${line}: ${pct(po)}`, ...kr]);
    }
  }

  // ֆավորիտ և ընտրության կողմը (որ չեկի ընտրությունները իրար չհակասեն)
  const fav = pH >= pA ? 'H' : 'A';
  const sideOf = (c) => {
    const s = c.selection;
    if (c.market === 'MATCH_WINNER') return s.includes('(Home Win)') ? 'H' : 'A';
    if (c.market === 'DOUBLE_CHANCE') return s.startsWith(home) ? 'H' : 'A';
    if (c.market === 'DNB') return s.endsWith(home) ? 'H' : 'A';
    if (c.market === 'ASIAN_HANDICAP') return s.startsWith(home) ? 'H' : 'A';
    if (/^(WIN_TO_NIL|CLEAN_SHEET)_HOME$/.test(c.market) && /Yes$/i.test(s)) return 'H';
    if (/^(WIN_TO_NIL|CLEAN_SHEET)_AWAY$/.test(c.market) && /Yes$/i.test(s)) return 'A';
    return null;
  };
  for (const c of out) { c.fav = fav; c.side = sideOf(c); }

  // L5 ձևի տողը (բոտը կարդում է)
  const sH = a.home.last5, sA = a.away.last5;
  if (sH && sA && [sH.goalsFor, sH.goalsAgainst, sA.goalsFor, sA.goalsAgainst].every(isNum) && sH.played === sA.played) {
    const line = `L5 n=${sH.played} H gf=${sH.goalsFor} ga=${sH.goalsAgainst} form=${sH.formLetters || '-'} | A gf=${sA.goalsFor} ga=${sA.goalsAgainst} form=${sA.formLetters || '-'}`;
    for (const c of out) c.reasons = [...c.reasons, line];
  }
  return { candidates: out, model: { lh: r2(lh), la: r2(la), sources: built?.sources ?? [], corners: cm ? r2(cm.mu) : null, cards: km ? r2(km.mu) : null, dataQuality: round1(dataQuality) } };
}

const output = [];
for (const item of $input.all()) {
  if (item.json.parseError) continue;
  const res = buildCandidates(item);
  output.push({
    json: {
      fixtureId: item.json.fixtureId,
      leagueId: item.json.leagueId ?? null,
      homeTeamName: item.json.homeTeamName,
      awayTeamName: item.json.awayTeamName,
      model: res.model ?? null,
      candidates: res.candidates ?? [],
    },
  });
}
return output;
