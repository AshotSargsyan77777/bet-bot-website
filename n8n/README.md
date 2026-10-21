# n8n workflow: daily check generation (ArmOdds Packages v2)

Source of the Code nodes used in the n8n workflow that builds the daily checks and posts them to the
bot (`/internal/packages`) and the website (`/api/internal/packages/`).
The workflow export itself is not committed because it contains API keys.

| File | n8n node | Purpose |
|---|---|---|
| `nodes/parse_odds.js` | Code in JavaScript2 | Odds parsing, incl. corners / cards / Asian handicap markets |
| `nodes/prepare_predictions.js` | Prepare Predictions | Keeps fixtures that have odds |
| `nodes/parse_predictions.js` | Parse Predictions | Predictions + full-season team stats |
| `nodes/deep_stats.js` | Deep Stats | Last 8 matches per team (xG, shots, corners, cards), injuries, standings; cached in workflow static data. Replace `__API_KEY__` with the API-Football key |
| `nodes/analyze.js` | Analyze Matches | Analysis-first probability model (goals, AH, corners, cards); market weight 25% |
| `nodes/generate_packages.js` | Generate Packages | Package search; corners/cards at most half of the legs (max 2) |

Test the chain locally with mocked API responses: `node n8n/test_harness.js`
