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
}
LINE = "━━━━━━━━━━━━━━"


def _num(reasons: str, pattern: str) -> list[float] | None:
    m = re.search(pattern, reasons)
    if not m:
        return None
    return [float(x) if "." in x else int(x) for x in m.groups()]


def explain_selection(s: dict[str, Any]) -> str:
    reasons = " | ".join(s.get("reasons") or []) if isinstance(s.get("reasons"), list) else ""
    xg = _num(reasons, r"xG\s+([\d.]+)/([\d.]+)") or _num(
        reasons, r"Expected goals \(shrunk\):\s*([\d.]+)\s*-\s*([\d.]+)"
    )
    xg_total = _num(reasons, r"xG total\s+([\d.]+)")
    form = _num(reasons, r"Form: home\s+([\d.]+)%\s+vs away\s+([\d.]+)%")
    h2h = _num(reasons, r"H2H\s+(\d+)-(\d+)-(\d+)\s+in\s+(\d+)")
    mkt = _num(reasons, r"Market \(no margin\):\s*(\d+)/(\d+)/(\d+)")
    prob = s.get("probability")
    p = round(prob * 100) if isinstance(prob, (int, float)) else None
    sel = str(s.get("selection") or "")
    parts = str(s.get("fixture") or "").split(" - ")
    home_name = parts[0] if parts else ""
    away_name = parts[1] if len(parts) > 1 else ""
    market = s.get("market")

    if market == "BTTS":
        if not xg:
            return ""
        if re.search(r"Yes$", sel, re.I):
            return (
                f"Երկու թիմի շուկայի և թիմերի ցուցանիշներով էլ ակնկալվում են գոլեր "
                f"({xg[0]} և {xg[1]}), ուստի երկուսի գոլ խփելը հավանական է։"
            )
        weak_is_home = xg[0] <= xg[1]
        weak_name = home_name if weak_is_home else away_name
        weak_xg = xg[0] if weak_is_home else xg[1]
        return (
            f"{weak_name}-ի հարձակումը շուկայի և թիմերի ցուցանիշներով թույլ է "
            f"(ակնկալվում է ընդամենը {weak_xg} գոլ), ուստի երկուսի գոլ խփելը քիչ հավանական է։"
        )

    if market == "OU":
        lm = re.search(r"(\d+(?:\.\d+)?)", sel)
        if not xg_total or not lm:
            return ""
        if re.search(r"over", sel, re.I):
            return f"Ակնկալվում է գոլային խաղ՝ ընդհանուր մոտ {xg_total[0]} գոլ (գիծը՝ {lm.group(1)})։"
        return (
            f"Ակնկալվում է փակ խաղ՝ ընդհանուր մոտ {xg_total[0]} գոլ, "
            f"ինչը {lm.group(1)}-ից ցածր է։"
        )

    if market in ("TEAM_TOTAL_HOME", "TEAM_TOTAL_AWAY"):
        is_h = market == "TEAM_TOTAL_HOME"
        team = home_name if is_h else away_name
        lm = re.search(r"(Over|Under)\s+(\d+(?:\.\d+)?)", sel, re.I)
        if not xg or not lm:
            return ""
        tx = xg[0] if is_h else xg[1]
        if re.search(r"over", lm.group(1), re.I):
            return f"{team}-ի ակնկալվող գոլերը՝ {tx} (գիծը՝ {lm.group(2)})։"
        return (
            f"{team}-ի հարձակումը սահմանափակ է (ակնկալվում է ~{tx} գոլ), "
            f"ուստի {lm.group(2)} գիծը հավանաբար չի գերազանցվի։"
        )

    if market == "OU_1H":
        lm = re.search(r"(?:Over|Under)\s+(\d+(?:\.\d+)?)", sel, re.I)
        if not xg_total or not lm:
            return ""
        return f"Առաջին խաղակեսում ակնկալվում է մոտ {(xg_total[0] * 0.45):.2f} գոլ (գիծը՝ {lm.group(1)})։"

    if market in (
        "CLEAN_SHEET_HOME",
        "CLEAN_SHEET_AWAY",
        "WIN_TO_NIL_HOME",
        "WIN_TO_NIL_AWAY",
    ):
        is_h = market.endswith("_HOME")
        team = home_name if is_h else away_name
        opp = away_name if is_h else home_name
        if not xg:
            return ""
        ox = xg[1] if is_h else xg[0]
        yes = bool(re.search(r"Yes$", sel, re.I))
        if yes:
            return f"{opp}-ի ակնկալվող գոլերը ցածր են ({ox}), ուստի {team}-ը կարող է մնալ առանց բաց թողնված գոլի։"
        return f"{opp}-ից ակնկալվում է ~{ox} գոլ, ուստի {team}-ի դարպասը անխախտ մնալը քիչ հավանական է։"

    if market == "ODD_EVEN":
        return f"Մոդելը այս ելքին տալիս է ~{p}% հավանականություն։" if p is not None else ""

    if market == "DNB":
        name = re.sub(r"^Draw No Bet\s*—\s*", "", sel)
        return f"Ոչ-ոքիի դեպքում գումարը վերադարձվում է, ուստի {name}-ը չպարտվելու դեպքում ռիսկը փոքր է։"

    if market in ("MATCH_WINNER", "DOUBLE_CHANCE"):
        is_dc = market == "DOUBLE_CHANCE"
        name = re.sub(r"\s*\((Home|Away) Win\)$", "", sel)
        name = re.sub(r" or Draw$", "", name)
        is_home = bool(re.search(r"\(Home Win\)$", sel)) or (is_dc and name == home_name)
        reasons_list: list[str] = []

        if form:
            fav = form[0] if is_home else form[1]
            opp_f = form[1] if is_home else form[0]
            if fav > opp_f + 5:
                reasons_list.append("վերջին խաղերում ավելի լավ ձևի մեջ է")
        if h2h and h2h[3] > 0:
            fav_w = h2h[0] if is_home else h2h[2]
            opp_w = h2h[2] if is_home else h2h[0]
            if fav_w > opp_w:
                reasons_list.append(
                    f"անմիջական հանդիպումներում առավելություն ունի ({int(fav_w)} հաղթանակ {int(h2h[3])} խաղից)"
                )
        if mkt:
            side = mkt[0] if is_home else mkt[2]
            if side >= max(mkt):
                reasons_list.append("նաև շուկայի կողմից համարվում է ֆավորիտ")

        if is_dc:
            head = f"Երկակի շանս. {name}-ը չպարտվելու դեպքում խաղադրույքը հաղթում է։"
            return f"{head} {name}-ը {', '.join(reasons_list)}։" if reasons_list else head
        if reasons_list:
            return f"{name}-ը {', '.join(reasons_list)}։"
        if p is not None:
            return f"Մոդելը այս ելքին տալիս է ~{p}% հավանականություն։"

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
