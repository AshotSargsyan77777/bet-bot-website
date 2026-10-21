import type { ComboResult } from "../../types/form";

const marketLabel: Record<string, string> = {
  MATCH_WINNER: "🏆 Հաղթող",
  BTTS: "🥅 Երկու գոլ",
  OU: "⚽ Գոլեր",
  DOUBLE_CHANCE: "🛡 Երկակի շանս",
};

export function ComboResultCard({ result, index }: { result: ComboResult; index?: number }) {
  return (
    <article className="combo-result combo-card">
      <header className="combo-card__head">
        {index != null && <span className="muted">#{index + 1}</span>}
        <span className="combo-result__odds">{result.combined_odds}x</span>
        <span className="muted">{result.legs?.length ?? 0} ող</span>
      </header>
      <ol className="combo-card__legs">
        {(result.legs || []).map((leg, i) => (
          <li key={i} className="combo-card__leg">
            <div className="combo-card__fixture">{leg.fixture_name}</div>
            <div className="combo-card__pick">
              <span>{marketLabel[leg.market ?? ""] || leg.market}</span>
              <span>{leg.selection}</span>
            </div>
            <div className="combo-card__odd">{leg.odd?.toFixed?.(2) ?? leg.odd}</div>
            {leg.why && <p className="combo-card__why">{leg.why}</p>}
          </li>
        ))}
      </ol>
    </article>
  );
}
