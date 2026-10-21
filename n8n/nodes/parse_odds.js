const TARGET_BOOKMAKER_NAME = 'William Hill';
const MAX_BOOKS = 15;

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const MARKET_MAP = {
  'match winner': 'MATCH_WINNER',
  '1x2': 'MATCH_WINNER',
  'double chance': 'DOUBLE_CHANCE',
  'both teams score': 'BTTS',
  'both teams to score': 'BTTS',
  'goals over/under': 'OU',
  'home/away': 'DNB',
  'total - home': 'TEAM_TOTAL_HOME',
  'total - away': 'TEAM_TOTAL_AWAY',
  'goals over/under first half': 'OU_1H',
  'clean sheet - home': 'CLEAN_SHEET_HOME',
  'clean sheet - away': 'CLEAN_SHEET_AWAY',
  'win to nil - home': 'WIN_TO_NIL_HOME',
  'win to nil - away': 'WIN_TO_NIL_AWAY',
  'asian handicap': 'ASIAN_HANDICAP',
};

// ՆՈՐ: corners / cards շուկաները բուքմեյքերները տարբեր անուններով են գրում, ճանաչում ենք ըստ բառերի
function patternMarket(name) {
  const n = norm(name);
  const half = /(1st|first|2nd|second) half|half time/.test(n);
  const asian = /asian|handicap|1x2|3 way|odd|even|race|first|last|exact/.test(n);
  if (half) return null;
  if (n.includes('corner') && !asian && /over|under|total/.test(n)) {
    if (/\bhome\b/.test(n)) return 'CORNERS_HOME';
    if (/\baway\b/.test(n)) return 'CORNERS_AWAY';
    return 'CORNERS_OU';
  }
  if ((n.includes('card') || n.includes('booking')) && !asian && /over|under|total/.test(n)) {
    if (/\bhome\b|\baway\b|player/.test(n)) return null;
    return 'CARDS_OU';
  }
  return null;
}

function findOddsEnvelope(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node.response) && node.response[0]?.bookmakers) return node;
  for (const key of Object.keys(node)) {
    const found = findOddsEnvelope(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

const marketOf = (bet) => MARKET_MAP[norm(bet.name)] || patternMarket(bet.name);
const mappedCount = (b) => (b.bets || []).filter(marketOf).length;
const hasMatchWinner = (b) => (b.bets || []).some((bet) => marketOf(bet) === 'MATCH_WINNER');

function pickBookmaker(list) {
  const arr = list || [];
  const wh = arr.find((b) => b.name === TARGET_BOOKMAKER_NAME);
  if (wh && hasMatchWinner(wh)) return wh;
  const withMW = arr.filter(hasMatchWinner);
  const pool = withMW.length ? withMW : arr;
  return pool.slice().sort((a, b) => mappedCount(b) - mappedCount(a))[0] || null;
}

function flatten(bookmaker) {
  const out = [];
  for (const bet of bookmaker?.bets || []) {
    const market = marketOf(bet);
    if (!market) continue;
    for (const v of bet.values || []) {
      const odd = parseFloat(v.odd);
      if (Number.isFinite(odd)) out.push({ market, selection: String(v.value), odd });
    }
  }
  return out;
}

// Նախընտրած բուքմեյքերը կարող է corners/cards չունենալ. այդ շուկաները լրացնում ենք այլ բուքմեյքերից
const EXTRA_MARKETS = ['CORNERS_OU', 'CORNERS_HOME', 'CORNERS_AWAY', 'CARDS_OU', 'ASIAN_HANDICAP'];
function fillMissingMarkets(preferredOdds, bookmakers) {
  const have = new Set(preferredOdds.map((o) => o.market));
  const out = preferredOdds.slice();
  for (const market of EXTRA_MARKETS) {
    if (have.has(market)) continue;
    for (const b of bookmakers) {
      const rows = flatten(b).filter((o) => o.market === market);
      if (rows.length) { out.push(...rows); break; }
    }
  }
  return out;
}

const meta = {};
for (const it of $('Select Matches').all()) meta[String(it.json.fixture_id)] = it.json;

const output = [];

for (const item of $input.all()) {
  const fx = item.json.parameters?.fixture ?? null;
  const m = fx ? meta[String(fx)] : null;
  const base = {
    fixtureId: m?.fixture_id ?? (fx ? Number(fx) : null),
    leagueId: m?.league_id ?? null,
    homeTeam: m?.home ?? null,
    awayTeam: m?.away ?? null,
    homeId: m?.home_id ?? null,
    awayId: m?.away_id ?? null,
  };

  const envelope = findOddsEnvelope(item.json);
  if (!envelope) {
    output.push({ json: { ...base, bookmaker: null, odds: [], books: {}, oddsParseError: 'ODDS_PAYLOAD_NOT_FOUND' } });
    continue;
  }

  const bookmakers = envelope.response[0]?.bookmakers || [];
  const preferred = pickBookmaker(bookmakers);

  const books = {};
  for (const b of bookmakers.filter(hasMatchWinner).slice(0, MAX_BOOKS)) books[b.name] = flatten(b);

  const allBetNames = [...new Set(bookmakers.flatMap((b) => (b.bets || []).map((x) => x.name)))];
  output.push({
    json: {
      ...base,
      bookmaker: preferred?.name ?? null,
      odds: fillMissingMarkets(flatten(preferred), bookmakers),
      books,
      betNames: (preferred?.bets || []).map((b) => b.name),
      // ստուգման համար. corners/cards անունները, որոնք չճանաչվեցին
      unmappedCornerCardBets: allBetNames.filter((n) => /corner|card|booking/i.test(n) && !marketOf({ name: n })),
    },
  });
}

return output;
