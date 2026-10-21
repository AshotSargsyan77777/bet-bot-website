import re
from typing import Any

NUM_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]
MARKET_EMOJI = {
    "MATCH_WINNER": "🏆",
    "DOUBLE_CHANCE": "🛡",
    "DNB": "🏆",
    "BTTS": "🥅",
    "OU": "⚽",
    "TEAM_TOTAL_HOME": "⚽",
    "TEAM_TOTAL_AWAY": "⚽",
    "OU_1H": "⏱",
    "ODD_EVEN": "🔢",
    "CLEAN_SHEET_HOME": "🧤",
    "CLEAN_SHEET_AWAY": "🧤",
    "WIN_TO_NIL_HOME": "💪",
    "WIN_TO_NIL_AWAY": "💪",
    "ASIAN_HANDICAP": "⚖️",
    "CORNERS_OU": "🚩",
    "CORNERS_HOME": "🚩",
    "CORNERS_AWAY": "🚩",
    "CARDS_OU": "🟨",
}
LINE = "━━━━━━━━━━━━━━"


def _num(reasons: str, pattern: str) -> list[float] | None:
    m = re.search(pattern, reasons)
    if not m:
        return None
    return [float(x) if "." in x else int(x) for x in m.groups()]


def _line(sel: str) -> str | None:
    m = re.search(r"(\d+(?:\.\d+)?)", sel)
    return m.group(1) if m else None


def explain_selection(s: dict[str, Any]) -> str:
    """One short, plain-Armenian reason for a selection (probability is shown on its own row)."""
    reasons = " | ".join(s.get("reasons") or []) if isinstance(s.get("reasons"), list) else ""
    xg = _num(reasons, r"xG\s+([\d.]+)/([\d.]+)") or _num(
        reasons, r"Expected goals \(shrunk\):\s*([\d.]+)\s*-\s*([\d.]+)"
    )
    xg_total = _num(reasons, r"xG total\s+([\d.]+)")
    if not xg_total and xg:
        xg_total = [round(xg[0] + xg[1], 2)]
    form = _num(reasons, r"Form: home\s+([\d.]+)%\s+vs away\s+([\d.]+)%")
    h2h = _num(reasons, r"H2H\s+(\d+)-(\d+)-(\d+)\s+in\s+(\d+)")
    injuries = _num(reasons, r"Injuries: home\s+(\d+)\s*/\s*away\s+(\d+)")
    sel = str(s.get("selection") or "")
    parts = str(s.get("fixture") or "").split(" - ")
    home_name = parts[0] if parts else ""
    away_name = parts[1] if len(parts) > 1 else ""
    market = s.get("market")
    over = bool(re.search(r"\bover\b", sel, re.I))
    yes = bool(re.search(r"Yes$", sel, re.I))
    line = _line(sel)

    if market == "BTTS" and xg:
        if yes:
            return f"Երկու թիմն էլ գոլային է. սպասվում է {xg[0]} և {xg[1]} գոլ։"
        weak_home = xg[0] <= xg[1]
        weak = home_name if weak_home else away_name
        return f"{weak}-ի հարձակումը թույլ է. սպասվում է ~{xg[0] if weak_home else xg[1]} գոլ։"

    if market == "OU" and xg_total and line:
        if over:
            return f"Սպասվում է ~{xg_total[0]} գոլ, գծից ({line}) բարձր։"
        return f"Սպասվում է ~{xg_total[0]} գոլ, գծից ({line}) ցածր։"

    if market in ("TEAM_TOTAL_HOME", "TEAM_TOTAL_AWAY") and xg and line:
        is_h = market == "TEAM_TOTAL_HOME"
        team = home_name if is_h else away_name
        return f"{team}-ից սպասվում է ~{xg[0] if is_h else xg[1]} գոլ (գիծը՝ {line})։"

    if market == "OU_1H" and xg_total and line:
        return f"1-ին խաղակեսում սպասվում է ~{xg_total[0] * 0.45:.1f} գոլ (գիծը՝ {line})։"

    if market in ("CLEAN_SHEET_HOME", "CLEAN_SHEET_AWAY", "WIN_TO_NIL_HOME", "WIN_TO_NIL_AWAY") and xg:
        is_h = market.endswith("_HOME")
        opp = away_name if is_h else home_name
        ox = xg[1] if is_h else xg[0]
        if yes:
            return f"{opp}-ից սպասվում է ընդամենը ~{ox} գոլ։"
        return f"{opp}-ը սովորաբար գոլ է խփում (~{ox})։"

    if market in ("CORNERS_OU", "CORNERS_HOME", "CORNERS_AWAY"):
        exp = _num(reasons, r"Corners exp\s+([\d.]+)\s+\(home\s+([\d.]+)\s*/\s*away\s+([\d.]+)\)")
        if exp and line:
            if market == "CORNERS_OU":
                return f"Սպասվում է ~{exp[0]} անկյունային (գիծը՝ {line})։"
            team = home_name if market == "CORNERS_HOME" else away_name
            return f"{team}-ից սպասվում է ~{exp[1] if market == 'CORNERS_HOME' else exp[2]} անկյունային (գիծը՝ {line})։"

    if market == "CARDS_OU":
        exp = _num(reasons, r"Cards exp\s+([\d.]+)")
        if exp and line:
            return f"Թիմերի կարգապահությամբ սպասվում է ~{exp[0]} քարտ (գիծը՝ {line})։"

    if market == "ASIAN_HANDICAP":
        m = re.search(r"AH\s+[^:]+:\s*win\s+(\d+)%(?:,\s*push\s+(\d+)%)?", reasons)
        if m and m.group(2):
            return f"Հաղթանակ՝ ~{m.group(1)}%, գումարի վերադարձ՝ ~{m.group(2)}%։"

    if market == "DNB":
        name = re.sub(r"^Draw No Bet\s*—\s*", "", sel)
        return f"Ոչ-ոքիի դեպքում գումարը վերադարձվում է. {name}-ը ֆավորիտ է։"

    if market in ("MATCH_WINNER", "DOUBLE_CHANCE", "ASIAN_HANDICAP"):
        name = re.sub(r"\s*\((Home|Away) Win\)$", "", sel)
        name = re.sub(r" or Draw$", "", name)
        name = re.sub(r"\s*[+−-]?\d+(?:\.\d+)?\s*\(Asian Handicap\)$", "", name)
        is_home = name == home_name or "(Home Win)" in sel
        facts: list[str] = []
        if form:
            mine, theirs = (form[0], form[1]) if is_home else (form[1], form[0])
            if mine > theirs + 5:
                facts.append("ավելի լավ ձև")
        if h2h and h2h[3] > 0:
            mine_w, theirs_w = (h2h[0], h2h[2]) if is_home else (h2h[2], h2h[0])
            if mine_w > theirs_w:
                facts.append(f"H2H՝ {int(mine_w)}/{int(h2h[3])} հաղթանակ")
        if xg:
            mine_x, theirs_x = (xg[0], xg[1]) if is_home else (xg[1], xg[0])
            if mine_x > theirs_x:
                facts.append(f"սպասվող գոլեր {mine_x}–{theirs_x}")
        if injuries:
            mine_i, theirs_i = (injuries[0], injuries[1]) if is_home else (injuries[1], injuries[0])
            if theirs_i > mine_i:
                facts.append(f"մրցակիցն ունի {int(theirs_i)} բացակա")
        if facts:
            return f"{name}-ի օգտին՝ {', '.join(facts[:3])}։"
        if market == "DOUBLE_CHANCE":
            return f"{name}-ը չպարտվելու դեպքում խաղադրույքը հաղթում է։"

    return ""


def format_package(pkg: dict[str, Any]) -> str:
    selections = pkg.get("selections") or []

    def build(with_why: bool) -> str:
        blocks = []
        for i, s in enumerate(selections):
            num = NUM_EMOJI[i] if i < len(NUM_EMOJI) else f"{i + 1}."
            odd = float(s["odd"]) if s.get("odd") is not None else None
            rows = [
                f"{num} 🏟 {s.get('fixture', '')}",
                f"{MARKET_EMOJI.get(s.get('market'), '🎯')} {s.get('selection', '')}",
                f"💰 Գործակից՝ {odd:.2f}" if odd is not None else f"💰 Գործակից՝ {s.get('odd')}",
            ]
            if with_why:
                why = explain_selection(s)
                if why:
                    rows.append(f"💡 {why}")
                prob = s.get("probability")
                if isinstance(prob, (int, float)) and 0 < prob <= 1:
                    rows.append(f"📊 Հավանականություն՝ {round(prob * 100)}%")
            blocks.append("\n".join(rows))
        return "\n\n".join(blocks)

    body = build(True)
    if len(body) > 3000:
        body = build(False)
    total = pkg.get("combined_odds")
    try:
        total_f = float(total)
        total_str = f"{total_f:.2f}"
    except (TypeError, ValueError):
        total_str = str(total)
    text = (
        f"⚽ GOALKING ՉԵԿ\n🎯 Ընդհանուր գործակից՝ {total_str}x\n{LINE}\n\n{body}\n\n{LINE}"
    )
    bks = list({x.get("bookmaker") for x in selections if x.get("bookmaker")})
    if len(bks) == 1:
        text += f"\nℹ️ Գործակիցները՝ {bks[0]}"
    quality = pkg.get("quality")
    if quality == "stretch":
        text += "\n⚠️ Բարձր ռիսկի փաթեթ"
    elif quality == "relaxed":
        text += "\n⚠️ Միջին ռիսկի փաթեթ"
    return text
