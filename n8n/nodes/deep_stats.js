// ====== DEEP STATS: խաղերի խորը ուսումնասիրություն ======
// Յուրաքանչյուր թիմի վերջին ավարտված խաղերի վիճակագրություն (xG, հարվածներ, անկյունայիններ, քարտեր),
// վնասվածքներ և աղյուսակ։ Պատասխանները պահվում են workflow-ի static data-ում (cache), որպեսզի
// ժամային գործարկումները նույն տվյալը կրկին չհարցնեն։
const API_KEY = '__API_KEY__';
const BASE_URL = 'https://v3.football.api-sports.io';
const MAX_NEW_CALLS = 250;   // մեկ գործարկման նոր հարցումների առավելագույնը (cache-ը լցվում է մի քանի ժամում)
const CALL_GAP_MS = 220;     // Pro պլան՝ max 300 հարցում/րոպե
const LAST_N = 8;            // ամեն թիմի քանի վերջին խաղ ուսումնասիրել
const HOUR = 3600 * 1000;
const TTL = { teamFixtures: 6 * HOUR, injuries: 3 * HOUR, standings: 12 * HOUR };
const FIXTURE_STATS_KEEP_DAYS = 150;
const FINISHED = new Set(['FT', 'AET', 'PEN']);

const helpers = this.helpers;
const store = $getWorkflowStaticData('global');
store.cache = store.cache || {};       // { key: { t, v } }
store.fxStats = store.fxStats || {};   // { fixtureId: { t, teams: { teamId: {...} } } } — ավարտված խաղերը չեն փոխվում
const now = Date.now();

// հին գրառումների մաքրում
for (const [k, e] of Object.entries(store.cache)) if (!e || now - e.t > 2 * 24 * HOUR) delete store.cache[k];
for (const [k, e] of Object.entries(store.fxStats)) if (!e || now - e.t > FIXTURE_STATS_KEEP_DAYS * 24 * HOUR) delete store.fxStats[k];

let calls = 0, failures = 0, budgetHit = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, qs) {
  if (calls >= MAX_NEW_CALLS) { budgetHit = true; return null; }
  calls++;
  await sleep(CALL_GAP_MS);
  try {
    const res = await helpers.httpRequest({
      method: 'GET', url: BASE_URL + path, qs,
      headers: { 'x-apisports-key': API_KEY }, json: true, timeout: 20000,
    });
    const errs = res?.errors;
    if (errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length)) { failures++; return null; }
    return Array.isArray(res?.response) ? res.response : null;
  } catch (e) {
    failures++;
    return null;
  }
}

async function cached(key, ttl, fetcher) {
  const hit = store.cache[key];
  if (hit && now - hit.t < ttl) return hit.v;
  const v = await fetcher();
  if (v !== null) store.cache[key] = { t: now, v };
  return v ?? hit?.v ?? null;   // հարցումը ձախողվեց՝ օգտագործում ենք հին տվյալը, եթե կա
}

const num = (v) => { if (v === null || v === undefined) return null; const x = parseFloat(String(v).replace('%', '')); return Number.isFinite(x) ? x : null; };

function compactStats(response) {
  const teams = {};
  for (const t of response || []) {
    const s = {};
    for (const row of t.statistics || []) s[String(row.type).toLowerCase()] = row.value;
    teams[t.team?.id] = {
      shots: num(s['total shots']),
      sot: num(s['shots on goal']),
      corners: num(s['corner kicks']),
      yellow: num(s['yellow cards']) ?? 0,
      red: num(s['red cards']) ?? 0,
      fouls: num(s['fouls']),
      poss: num(s['ball possession']),
      xg: num(s['expected_goals']),
    };
  }
  return Object.keys(teams).length ? teams : null;
}

async function fixtureStats(fixtureId) {
  const hit = store.fxStats[fixtureId];
  if (hit) return hit.teams;
  const resp = await api('/fixtures/statistics', { fixture: fixtureId });
  const teams = resp ? compactStats(resp) : null;
  if (teams) store.fxStats[fixtureId] = { t: now, teams };
  return teams;
}

async function teamProfile(teamId) {
  if (!teamId) return null;
  const list = await cached(`tf:${teamId}`, TTL.teamFixtures, async () => {
    const resp = await api('/fixtures', { team: teamId, last: LAST_N + 4 });
    if (!resp) return null;
    return resp
      .filter((f) => FINISHED.has(f.fixture?.status?.short) && f.goals?.home !== null && f.goals?.away !== null)
      .map((f) => {
        const isHome = f.teams?.home?.id === teamId;
        return {
          id: f.fixture.id, date: f.fixture.date, isHome,
          gf: isHome ? f.goals.home : f.goals.away,
          ga: isHome ? f.goals.away : f.goals.home,
          oppId: isHome ? f.teams?.away?.id : f.teams?.home?.id,
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  });
  if (!list || !list.length) return null;

  const matches = list.slice(0, LAST_N);
  const rows = [];
  for (const m of matches) {
    const st = await fixtureStats(m.id);
    const mine = st?.[teamId] ?? null;
    const opp = st?.[m.oppId] ?? null;
    rows.push({ ...m, mine, opp });
  }

  // ժամանակով կշռված միջին (ավելի թարմ խաղերն ավելի կարևոր են)
  const wavg = (pick) => {
    let s = 0, w = 0;
    rows.forEach((r, i) => {
      const v = pick(r);
      if (v === null || v === undefined || !Number.isFinite(v)) return;
      const wt = Math.pow(0.85, i);
      s += v * wt; w += wt;
    });
    return w ? Math.round((s / w) * 100) / 100 : null;
  };
  const count = (pick) => rows.filter((r) => { const v = pick(r); return v !== null && v !== undefined && Number.isFinite(v); }).length;
  const cards = (x) => (x ? (x.yellow ?? 0) + (x.red ?? 0) : null);

  return {
    played: rows.length,
    statsAvailable: count((r) => r.mine?.sot),
    goalsFor: wavg((r) => r.gf),
    goalsAgainst: wavg((r) => r.ga),
    homeGoalsFor: wavg((r) => (r.isHome ? r.gf : null)),
    awayGoalsFor: wavg((r) => (!r.isHome ? r.gf : null)),
    xgFor: wavg((r) => r.mine?.xg), xgAgainst: wavg((r) => r.opp?.xg), xgCount: count((r) => r.mine?.xg),
    sotFor: wavg((r) => r.mine?.sot), sotAgainst: wavg((r) => r.opp?.sot),
    shotsFor: wavg((r) => r.mine?.shots), shotsAgainst: wavg((r) => r.opp?.shots),
    cornersFor: wavg((r) => r.mine?.corners), cornersAgainst: wavg((r) => r.opp?.corners), cornersCount: count((r) => r.mine?.corners),
    cardsFor: wavg((r) => cards(r.mine)), cardsAgainst: wavg((r) => cards(r.opp)), cardsCount: count((r) => r.mine && r.mine.yellow !== null ? 1 : null),
    fouls: wavg((r) => r.mine?.fouls),
    possession: wavg((r) => r.mine?.poss),
    results: rows.map((r) => (r.gf > r.ga ? 'W' : r.gf < r.ga ? 'L' : 'D')).join(''),
  };
}

async function injuries(fixtureId, homeId, awayId) {
  const resp = await cached(`inj:${fixtureId}`, TTL.injuries, () => api('/injuries', { fixture: fixtureId }));
  if (!resp) return null;
  const pick = (tid) => resp
    .filter((r) => r.team?.id === tid && /missing/i.test(r.player?.type || ''))
    .map((r) => r.player?.name)
    .filter(Boolean);
  return { home: pick(homeId), away: pick(awayId) };
}

async function standings(leagueId, season) {
  if (!leagueId || !season) return null;
  const resp = await cached(`st:${leagueId}:${season}`, TTL.standings, () => api('/standings', { league: leagueId, season }));
  const groups = resp?.[0]?.league?.standings;
  if (!Array.isArray(groups)) return null;
  const table = {};
  for (const group of groups) {
    for (const row of group || []) {
      table[row.team?.id] = { rank: row.rank, points: row.points, played: row.all?.played ?? null, size: group.length, goalsDiff: row.goalsDiff };
    }
  }
  return table;
}

const out = [];
for (const item of $input.all()) {
  const j = item.json;
  if (j.parseError) { out.push(item); continue; }
  const homeId = j.homeTeamId ?? j.homeId, awayId = j.awayTeamId ?? j.awayId;
  const home = await teamProfile(homeId);
  const away = await teamProfile(awayId);
  const inj = await injuries(j.fixtureId, homeId, awayId);
  const table = await standings(j.leagueId, j.season);
  out.push({
    json: {
      ...j,
      deep: {
        home, away,
        injuries: inj,
        table: table ? { home: table[homeId] ?? null, away: table[awayId] ?? null } : null,
      },
    },
  });
}

if (out.length) out[0].json.deepRunInfo = { apiCalls: calls, failures, budgetHit, cachedFixtures: Object.keys(store.fxStats).length };
return out;
