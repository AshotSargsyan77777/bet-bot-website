import { Link } from "react-router-dom";
import { LIVE_STATUSES, type GameRow } from "../types/game";
import { useT } from "../i18n";
import { FormBars } from "./FormBars";
import { TeamLogo } from "./TeamLogo";
import { isUpcoming, kickoffTime, statusKey } from "../utils/matchStatus";

function statusClass(status: string) {
  if (LIVE_STATUSES.includes(status)) return "game-card--live";
  if (["FT", "AET", "PEN"].includes(status)) return "game-card--ft";
  return "game-card--upcoming";
}

export function GameCard({ game, compact }: { game: GameRow; compact?: boolean }) {
  const { t } = useT();
  const hasScore = game.score[0] != null && game.score[1] != null;
  const upcoming = isUpcoming(game.status) || !hasScore;
  const statusLabel = statusKey(game.status);
  const date = new Date(game.kickoff).toLocaleDateString([], { day: "numeric", month: "short" });

  return (
    <article className={`game-card ${statusClass(game.status)} ${compact ? "game-card--compact" : ""}`}>
      {LIVE_STATUSES.includes(game.status) && (
        <span className="pill pill--live"><span className="live-dot" /> LIVE</span>
      )}
      <header className="game-card__league">
        <TeamLogo src={game.league_logo} size={16} />
        {game.league}
        {game.analysis && <span className="chip chip--win game-card__badge">{t("games.badge")}</span>}
      </header>
      <div className="game-card__teams">
        <span className="game-card__team">
          <TeamLogo src={game.home_logo} size={32} />
          {game.home}
        </span>
        {upcoming ? (
          <span className="game-card__kickoff">{kickoffTime(game.kickoff)}</span>
        ) : (
          <span className="game-card__score">{`${game.score[0]} : ${game.score[1]}`}</span>
        )}
        <span className="game-card__team game-card__team--away">
          <TeamLogo src={game.away_logo} size={32} />
          {game.away}
        </span>
      </div>
      <footer className="game-card__meta">
        <span>{date}</span>
        <span>{statusLabel ? t(statusLabel) : game.status}</span>
      </footer>
      {!compact && (
        <div className="game-card__forms">
          <FormBars form={game.home_form} label={t("games.homeL5")} />
          <FormBars form={game.away_form} label={t("games.awayL5")} />
        </div>
      )}
      <Link className="game-card__link" to={`/games/${game.id}`}>{t("games.details")}</Link>
    </article>
  );
}
