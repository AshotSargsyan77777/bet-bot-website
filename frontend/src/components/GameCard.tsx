import { Link } from "react-router-dom";
import type { GameRow } from "../types/game";
import { FormBars } from "./FormBars";

function statusClass(status: string) {
  if (["LIVE", "1H", "2H", "HT"].includes(status)) return "game-card--live";
  if (status === "FT") return "game-card--ft";
  return "game-card--upcoming";
}

export function GameCard({ game, compact }: { game: GameRow; compact?: boolean }) {
  const score =
    game.score[0] != null && game.score[1] != null
      ? `${game.score[0]} : ${game.score[1]}`
      : "vs";
  const time = new Date(game.kickoff).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <article className={`game-card ${statusClass(game.status)} ${compact ? "game-card--compact" : ""}`}>
      {game.is_demo && <span className="pill pill--demo">Demo</span>}
      {["LIVE", "1H", "2H", "HT"].includes(game.status) && (
        <span className="pill pill--live"><span className="live-dot" /> LIVE</span>
      )}
      <header className="game-card__league">{game.league}</header>
      <div className="game-card__teams">
        <span className="game-card__team">{game.home}</span>
        <span className="game-card__score">{score}</span>
        <span className="game-card__team game-card__team--away">{game.away}</span>
      </div>
      <footer className="game-card__meta">
        <span>{time}</span>
        <span>{game.status}</span>
      </footer>
      {!compact && (
        <div className="game-card__forms">
          <FormBars form={game.home_form} label="Տուն L5" />
          <FormBars form={game.away_form} label="Հյուր L5" />
        </div>
      )}
      <Link className="game-card__link" to={`/games/${game.id}`}>Մանրամասն →</Link>
    </article>
  );
}
