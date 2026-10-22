import type { H2HMatch } from "../../types/form";
import { useT } from "../../i18n";

export function H2HList({ matches }: { matches: H2HMatch[] }) {
  const { t } = useT();
  if (!matches.length) {
    return (
      <div className="card">
        <h3>{t("game.h2h")}</h3>
        <p className="muted">{t("common.noData")}</p>
      </div>
    );
  }

  return (
    <div className="card card--interactive">
      <h3>{t("game.h2hFull")}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("game.colDate")}</th>
              <th>{t("game.colMatch")}</th>
              <th>{t("game.colScore")}</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m, i) => (
              <tr key={i}>
                <td>{m.date?.slice(0, 10) ?? "—"}</td>
                <td>{m.home} vs {m.away}</td>
                <td>
                  {m.goals ? `${m.goals.home} : ${m.goals.away}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
