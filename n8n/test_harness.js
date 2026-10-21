const fs = require('fs');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const node = (f) => fs.readFileSync(__dirname + '/nodes/' + f, 'utf8').replace('__API_KEY__', 'TEST');

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const outputs = {};
const staticData = {};
let apiCalls = 0;
const helpers = {
  async httpRequest({ url, qs }) {
    apiCalls++;
    const path = url.replace('https://v3.football.api-sports.io', '');
    if (path === '/fixtures') {
      const team = qs.team;
      return { errors: [], response: Array.from({ length: qs.last }, (_, i) => {
        const home = i % 2 === 0;
        return { fixture: { id: team * 1000 + i, date: new Date(Date.now() - (i + 1) * 7 * 864e5).toISOString(), status: { short: 'FT' } },
          teams: { home: { id: home ? team : 999 }, away: { id: home ? 999 : team } }, goals: { home: ri(0, 3), away: ri(0, 3) } };
      }) };
    }
    if (path === '/fixtures/statistics') {
      const fid = qs.fixture; const team = Math.floor(fid / 1000);
      const mk = (id) => ({ team: { id }, statistics: [
        { type: 'Shots on Goal', value: ri(2, 8) }, { type: 'Total Shots', value: ri(8, 18) }, { type: 'Corner Kicks', value: ri(2, 9) },
        { type: 'Yellow Cards', value: ri(0, 4) }, { type: 'Red Cards', value: rnd() < 0.05 ? 1 : null }, { type: 'Fouls', value: ri(8, 15) },
        { type: 'Ball Possession', value: `${ri(35, 65)}%` }, { type: 'expected_goals', value: (rnd() * 2.5).toFixed(2) } ] });
      return { errors: [], response: [mk(team), mk(999)] };
    }
    if (path === '/injuries') return { errors: [], response: [{ team: { id: 33 }, player: { name: 'X Player', type: 'Missing Fixture' } }] };
    if (path === '/standings') return { errors: [], response: [{ league: { standings: [[33, 34, 40, 42, 49, 50, 529, 530].map((id, i) => ({ rank: i + 1, team: { id }, points: 30 - i * 2, all: { played: 12 }, goalsDiff: 10 - i })) ] } }] };
    throw new Error('unexpected ' + path);
  },
};

async function run(name, file, input) {
  const $input = { all: () => input, first: () => input[0] };
  const $ = (n) => ({ all: () => outputs[n], first: () => outputs[n][0] });
  const fn = new AsyncFunction('$input', '$', '$getWorkflowStaticData', node(file));
  const t = Date.now();
  const out = await fn.call({ helpers }, $input, $, () => staticData);
  console.log(`${name}: ${out.length} items, ${Date.now() - t} ms`);
  outputs[name] = out;
  return out;
}

const teams = [[33, 'Man United', 34, 'Newcastle', 39], [40, 'Liverpool', 42, 'Arsenal', 39], [529, 'Barcelona', 530, 'Atletico', 140],
  [49, 'Chelsea', 50, 'Man City', 2], [157, 'Bayern', 165, 'Dortmund', 78], [541, 'Real Madrid', 505, 'Inter', 2]];
const select = teams.map(([h, hn, a, an, lg], i) => ({ json: { fixture_id: 5000 + i, league_id: lg, home: hn, away: an, home_id: h, away_id: a } }));
outputs['Select Matches'] = select;

const bet = (name, values) => ({ name, values: values.map(([value, odd]) => ({ value, odd: String(odd) })) });
function bookmaker(name, f) {
  const j = (x) => +(x * (0.95 + rnd() * 0.1)).toFixed(2);
  return { name, bets: [
    bet('Match Winner', [['Home', j(1.9)], ['Draw', j(3.5)], ['Away', j(4.0)]]),
    bet('Double Chance', [['Home/Draw', j(1.25)], ['Draw/Away', j(1.85)], ['Home/Away', 1.3]]),
    bet('Home/Away', [['Home', j(1.4)], ['Away', j(2.8)]]),
    bet('Both Teams Score', [['Yes', j(1.75)], ['No', j(2.0)]]),
    bet('Goals Over/Under', [['Over 1.5', j(1.3)], ['Under 1.5', j(3.4)], ['Over 2.5', j(1.9)], ['Under 2.5', j(1.9)], ['Over 3.5', j(3.2)], ['Under 3.5', j(1.33)]]),
    bet('Goals Over/Under First Half', [['Over 0.5', j(1.4)], ['Under 0.5', j(2.8)], ['Over 1.5', j(2.9)], ['Under 1.5', j(1.4)]]),
    bet('Total - Home', [['Over 0.5', j(1.2)], ['Under 0.5', j(4.2)], ['Over 1.5', j(2.1)], ['Under 1.5', j(1.7)]]),
    bet('Asian Handicap', [['Home -1', j(2.6)], ['Away +1', j(1.5)], ['Home -0.5', j(1.9)], ['Away +0.5', j(1.9)], ['Home -0.75', 2.2]]),
    bet('Corners Over Under', [['Over 8.5', j(1.6)], ['Under 8.5', j(2.2)], ['Over 9.5', j(1.9)], ['Under 9.5', j(1.85)], ['Over 10.5', j(2.4)], ['Under 10.5', j(1.55)]]),
    bet('Home Corners Over/Under', [['Over 4.5', j(1.8)], ['Under 4.5', j(1.9)]]),
    bet('Cards Over/Under', [['Over 3.5', j(1.7)], ['Under 3.5', j(2.0)], ['Over 4.5', j(2.3)], ['Under 4.5', j(1.55)]]),
    bet('Total Corners (3 way)', [['Over 9', 2.0]]),
    bet('Corners 1x2', [['Home', 1.7]]),
  ] };
}
const oddsResp = select.map((s) => ({ json: { parameters: { fixture: String(s.json.fixture_id) }, response: [{ bookmakers: ['William Hill', 'Bet365', 'Unibet', '1xBet'].map((n) => bookmaker(n)) }] } }));
const seasonLg = () => ({ form: 'WWDLW', fixtures: { played: { home: 6, away: 6, total: 12 } },
  goals: { for: { average: { home: (1 + rnd() * 1.5).toFixed(1), away: (0.8 + rnd()).toFixed(1), total: '1.5' } }, against: { average: { home: (0.6 + rnd()).toFixed(1), away: (0.9 + rnd()).toFixed(1), total: '1.2' } } },
  clean_sheet: { home: 2, away: 1, total: 3 }, failed_to_score: { home: 1, away: 2, total: 3 },
  cards: { yellow: { '0-15': { total: 3 }, '76-90': { total: 12 } }, red: { '46-60': { total: 1 } } } });

(async () => {
  await run('Code in JavaScript2', 'parse_odds.js', oddsResp);
  const o = outputs['Code in JavaScript2'][0].json;
  console.log('  markets:', [...new Set(o.odds.map((x) => x.market))].join(','), '| unmapped:', o.unmappedCornerCardBets);
  await run('Prepare Predictions', 'prepare_predictions.js', outputs['Code in JavaScript2']);
  const predResp = outputs['Prepare Predictions'].map((it) => {
    const [h, hn, a, an] = teams.find((t) => t[1] === it.json.homeTeam);
    return { json: { parameters: { fixture: String(it.json.fixtureId) }, response: [{
      league: { id: it.json.leagueId, season: 2026 },
      teams: { home: { id: h, name: hn, last_5: { form: '80%', att: '70%', def: '60%', goals: { for: { total: 9, average: '1.8' }, against: { total: 5, average: '1.0' } } }, league: seasonLg() },
               away: { id: a, name: an, last_5: { form: '40%', att: '50%', def: '40%', goals: { for: { total: 6, average: '1.2' }, against: { total: 8, average: '1.6' } } }, league: seasonLg() } },
      predictions: { winner: { id: h, name: hn }, percent: { home: '50%', draw: '25%', away: '25%' }, advice: 'x' },
      comparison: {}, h2h: [{ teams: { home: { id: h }, away: { id: a } }, goals: { home: 2, away: 1 } }],
    }] } };
  });
  await run('Parse Predictions', 'parse_predictions.js', predResp);
  console.log('  season stats:', JSON.stringify(outputs['Parse Predictions'][0].json.analysis.home.season).slice(0, 160));
  await run('Deep Stats', 'deep_stats.js', outputs['Parse Predictions']);
  console.log('  api calls (cold):', apiCalls, JSON.stringify(outputs['Deep Stats'][0].json.deepRunInfo));
  console.log('  home profile:', JSON.stringify(outputs['Deep Stats'][0].json.deep.home).slice(0, 300));
  console.log('  injuries/table:', JSON.stringify(outputs['Deep Stats'][0].json.deep.injuries), JSON.stringify(outputs['Deep Stats'][0].json.deep.table));
  const before = apiCalls;
  await run('Deep Stats (warm)', 'deep_stats.js', outputs['Parse Predictions']);
  console.log('  api calls (warm run):', apiCalls - before);
  await run('Analyze Matches', 'analyze.js', outputs['Deep Stats']);
  for (const it of outputs['Analyze Matches']) {
    const byM = {};
    for (const c of it.json.candidates) byM[c.market] = (byM[c.market] || 0) + 1;
    console.log(`  ${it.json.homeTeamName}-${it.json.awayTeamName}`, JSON.stringify(it.json.model), JSON.stringify(byM));
  }
  const c0 = outputs['Analyze Matches'][0].json.candidates.find((c) => c.market === 'CORNERS_OU');
  console.log('  sample corners cand:', JSON.stringify(c0));
  const bad = outputs['Analyze Matches'].flatMap((i) => i.json.candidates).filter((c) => !(c.probability >= 0 && c.probability <= 1) || !Number.isFinite(c.confidence));
  console.log('  invalid candidates:', bad.length);
  await run('Generate Packages', 'generate_packages.js', outputs['Analyze Matches']);
  for (const p of outputs['Generate Packages']) {
    const j = p.json;
    console.log(`  ${j.tier}_${j.package}: ${j.available ? `OK ${j.quality} odds=${j.combined_odds} hit=${j.estimated_hit_chance}% legs=${j.selection_count} [${j.selections.map((s) => s.market).join(',')}]` : 'N/A ' + j.reason}`);
  }
  ;
})().catch((e) => { console.error(e); process.exit(1); });
