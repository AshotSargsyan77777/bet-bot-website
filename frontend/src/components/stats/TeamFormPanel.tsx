import type { TeamForm } from "../../types/form";

export function TeamFormPanel({ title, form }: { title: string; form?: TeamForm | null }) {
  if (!form) {
    return (
      <div className="card">
        <h3>{title}</h3>
        <p className="muted">Տվյալներ չկան</p>
      </div>
    );
  }

  const w = form.wins ?? 0;
  const d = form.draws ?? 0;
  const l = form.losses ?? 0;
  const winPct = form.win_pct ?? 0;

  return (
    <div className="card card--interactive team-form-panel">
      <h3>{title}</h3>
      {form.team_name && <p className="team-form-panel__name">{form.team_name}</p>}
      <div className="team-form-panel__record">
        <span className="chip chip--win">Հ {w}</span>
        <span className="chip chip--draw">Ո {d}</span>
        <span className="chip chip--loss">Պ {l}</span>
      </div>
      <div className="form-bars">
        <span className="form-bars__label">Հաղթանակ %</span>
        <div className="form-bars__track">
          <div className="form-bars__fill form-bars__fill--win" style={{ width: `${winPct}%` }} />
        </div>
        <span className="form-bars__stat">{winPct}%</span>
      </div>
      <div className="stat-grid">
        <div className="stat-grid__item">
          <span className="stat-grid__val">{form.avg_goals_for ?? "—"}</span>
          <span className="stat-grid__lbl">GF / խաղ</span>
        </div>
        <div className="stat-grid__item">
          <span className="stat-grid__val">{form.avg_goals_against ?? "—"}</span>
          <span className="stat-grid__lbl">GA / խաղ</span>
        </div>
        <div className="stat-grid__item">
          <span className="stat-grid__val">{form.btts_rate != null ? `${form.btts_rate}%` : "—"}</span>
          <span className="stat-grid__lbl">BTTS</span>
        </div>
        <div className="stat-grid__item">
          <span className="stat-grid__val">{form.clean_sheet_rate != null ? `${form.clean_sheet_rate}%` : "—"}</span>
          <span className="stat-grid__lbl">Չ. գոլ</span>
        </div>
      </div>
      {form.matches && form.matches.length > 0 && (
        <>
          <h4 className="team-form-panel__sub">Վերջին խաղեր</h4>
          <ul className="match-history">
            {form.matches.map((m, i) => (
              <li key={i} className="match-history__row">
                <span className="match-history__date">{m.date?.slice(0, 10) ?? "—"}</span>
                <span className="match-history__teams">{m.home} — {m.away}</span>
                <span className="match-history__score">{m.score}</span>
                <span className={`match-history__venue match-history__venue--${m.venue}`}>
                  {m.venue === "home" ? "Տ" : m.venue === "away" ? "Հ" : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
