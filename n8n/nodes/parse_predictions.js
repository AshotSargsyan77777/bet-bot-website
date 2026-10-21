function deepFindApiEnvelope(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node.response) && node.parameters) return node;
  for (const key of Object.keys(node)) {
    const found = deepFindApiEnvelope(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function parseFormString(form) {
  if (typeof form !== 'string' || form.length === 0) return null;
  const points = { W: 3, D: 1, L: 0 };
  let total = 0, count = 0;
  for (const ch of form.toUpperCase()) {
    if (points[ch] === undefined) continue;
    total += points[ch];
    count++;
  }
  if (count === 0) return null;
  return { raw: form, score: Math.round((total / (count * 3)) * 1000) / 10, gamesConsidered: count };
}

function parsePercent(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const num = parseFloat(String(val).replace('%', '').trim());
  return Number.isFinite(num) ? num : null;
}

function parseAvgGoals(teamLast5) {
  const forAvg = parseFloat(teamLast5?.goals?.for?.average);
  const againstAvg = parseFloat(teamLast5?.goals?.against?.average);
  return { for: Number.isFinite(forAvg) ? forAvg : null, against: Number.isFinite(againstAvg) ? againstAvg : null };
}

// ՆՈՐ: վերջին 5 խաղի գոլերի գումարները (խփած/բաց թողած) և ձևի տառերը (WWDWW)
function parseLast5Stats(teamBlock) {
  const l5 = teamBlock?.last_5 ?? null;
  const played = Number(l5?.played) || 5;
  const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };

  let gf = num(l5?.goals?.for?.total);
  let ga = num(l5?.goals?.against?.total);
  if (gf === null) { const avg = num(l5?.goals?.for?.average); if (avg !== null) gf = Math.round(avg * played); }
  if (ga === null) { const avg = num(l5?.goals?.against?.average); if (avg !== null) ga = Math.round(avg * played); }

  const letters = (s) => (typeof s === 'string' ? s.toUpperCase().replace(/[^WDL]/g, '') : '');
  // last_5.form երբեմն տոկոս է ("80%"), այդ դեպքում վերցնում ենք league.form-ի վերջին 5 տառը
  let form = letters(l5?.form);
  if (!form) form = letters(teamBlock?.league?.form).slice(-5);

  return { played, goalsFor: gf, goalsAgainst: ga, formLetters: form || null };
}

// ՆՈՐ: ամբողջ մրցաշրջանի վիճակագրություն (predictions-ի teams.X.league բլոկից, առանց լրացուցիչ հարցման)
function parseSeasonStats(lg) {
  if (!lg || typeof lg !== 'object') return null;
  const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
  const triple = (o) => ({ home: num(o?.home), away: num(o?.away), total: num(o?.total) });
  const sumBuckets = (obj) => Object.values(obj || {}).reduce((s, b) => s + (Number(b?.total) || 0), 0);
  const played = triple(lg.fixtures?.played);
  if (!played.total) return null;
  return {
    played,
    goalsForAvg: triple(lg.goals?.for?.average),
    goalsAgainstAvg: triple(lg.goals?.against?.average),
    cleanSheet: triple(lg.clean_sheet),
    failedToScore: triple(lg.failed_to_score),
    yellowCards: sumBuckets(lg.cards?.yellow),
    redCards: sumBuckets(lg.cards?.red),
    form: typeof lg.form === 'string' ? lg.form.slice(-10) : null,
  };
}

function parseH2H(h2hArray, homeTeamId, awayTeamId) {
  const empty = { available: false, matches: 0, home_wins: 0, away_wins: 0, draws: 0 };
  if (!Array.isArray(h2hArray) || h2hArray.length === 0) return empty;
  let homeWins = 0, awayWins = 0, draws = 0, counted = 0;
  for (const match of h2hArray) {
    const gh = match?.goals?.home;
    const ga = match?.goals?.away;
    const th = match?.teams?.home?.id;
    const ta = match?.teams?.away?.id;
    if (gh === null || gh === undefined || ga === null || ga === undefined) continue;
    counted++;
    if (gh === ga) { draws++; continue; }
    const winnerTeamId = gh > ga ? th : ta;
    if (winnerTeamId === homeTeamId) homeWins++;
    else if (winnerTeamId === awayTeamId) awayWins++;
  }
  if (counted === 0) return empty;
  return { available: true, matches: counted, home_wins: homeWins, away_wins: awayWins, draws };
}

function parseApiPercentTriplet(percent) {
  if (!percent) return null;
  const home = parsePercent(percent.home);
  const draw = parsePercent(percent.draw);
  const away = parsePercent(percent.away);
  if (home === null && draw === null && away === null) return null;
  return { home, draw, away };
}

// Նախորդ քայլի տվյալները (odds, leagueId, անուններ) վերցնում ենք Prepare Predictions-ից
const ctx = {};
for (const it of $('Prepare Predictions').all()) {
  ctx[String(it.json.fixtureId)] = it.json;
}

const results = [];

for (const item of $input.all()) {
  const fx = item.json.parameters?.fixture ?? null;
  const c = (fx && ctx[String(fx)]) || {};
  const envelope = deepFindApiEnvelope(item.json);

  if (!envelope || !Array.isArray(envelope.response) || envelope.response.length === 0) {
    results.push({ json: { ...c, parseError: 'PREDICTIONS_PAYLOAD_NOT_FOUND' } });
    continue;
  }

  const payload = envelope.response[0];
  const fixtureId = c.fixtureId ?? (fx ? Number(fx) : null);

  const homeTeamId = payload?.teams?.home?.id ?? null;
  const awayTeamId = payload?.teams?.away?.id ?? null;
  const homeTeamName = payload?.teams?.home?.name ?? c.homeTeam ?? null;
  const awayTeamName = payload?.teams?.away?.name ?? c.awayTeam ?? null;

  const homeLast5 = payload?.teams?.home?.last_5 ?? null;
  const awayLast5 = payload?.teams?.away?.last_5 ?? null;

  const homeForm = parseFormString(homeLast5?.form);
  const awayForm = parseFormString(awayLast5?.form);
  const homeAttack = parsePercent(homeLast5?.att);
  const homeDefense = parsePercent(homeLast5?.def);
  const awayAttack = parsePercent(awayLast5?.att);
  const awayDefense = parsePercent(awayLast5?.def);
  const homeGoals = parseAvgGoals(homeLast5);
  const awayGoals = parseAvgGoals(awayLast5);

  // ՆՈՐ
  const homeStats = parseLast5Stats(payload?.teams?.home);
  const awayStats = parseLast5Stats(payload?.teams?.away);

  const comparison = payload?.comparison ?? null;
  const h2h = parseH2H(payload?.h2h, homeTeamId, awayTeamId);

  const apiWinnerId = payload?.predictions?.winner?.id ?? null;
  const apiWinnerName = payload?.predictions?.winner?.name ?? null;
  const apiWinnerComment = payload?.predictions?.winner?.comment ?? null;
  const apiWinOrDraw = payload?.predictions?.win_or_draw ?? null;
  const apiAdvice = payload?.predictions?.advice ?? null;
  const apiPercent = parseApiPercentTriplet(payload?.predictions?.percent);
  const rawApiGoalsAdvice = payload?.predictions?.goals ?? null;

  let modelExpectedGoalsHome = null;
  let modelExpectedGoalsAway = null;
  if (homeGoals.for !== null && awayGoals.against !== null) {
    modelExpectedGoalsHome = Math.round(((homeGoals.for + awayGoals.against) / 2) * 100) / 100;
  }
  if (awayGoals.for !== null && homeGoals.against !== null) {
    modelExpectedGoalsAway = Math.round(((awayGoals.for + homeGoals.against) / 2) * 100) / 100;
  }

  results.push({
    json: {
      ...c, // odds, leagueId, homeTeam, awayTeam, bookmaker
      leagueId: c.leagueId ?? payload?.league?.id ?? null,
      fixtureId, homeTeamId, awayTeamId, homeTeamName, awayTeamName,
      season: payload?.league?.season ?? null,
      analysis: {
        home: { form: homeForm, attack: homeAttack, defense: homeDefense, goals: homeGoals, last5: homeStats, season: parseSeasonStats(payload?.teams?.home?.league) },
        away: { form: awayForm, attack: awayAttack, defense: awayDefense, goals: awayGoals, last5: awayStats, season: parseSeasonStats(payload?.teams?.away?.league) },
        comparison,
        h2h,
        modelEstimate: {
          expectedGoalsHome: modelExpectedGoalsHome,
          expectedGoalsAway: modelExpectedGoalsAway,
          note: 'Ոչ թե API-ի պաշտոնական prediction, հաշվարկված last_5 միջիններից',
        },
        apiPrediction: {
          winnerId: apiWinnerId, winnerName: apiWinnerName, winnerComment: apiWinnerComment,
          winOrDraw: apiWinOrDraw, advice: apiAdvice, percent: apiPercent,
          rawGoalsAdviceIgnored: rawApiGoalsAdvice,
        },
      },
    },
  });
}

return results;