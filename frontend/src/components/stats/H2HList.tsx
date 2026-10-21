import type { H2HMatch } from "../../types/form";

export function H2HList({ matches }: { matches: H2HMatch[] }) {
  if (!matches.length) {
    return (
      <div className="card">
        <h3>Ուղիղ հանդիպումներ</h3>
        <p className="muted">Տվյալներ չկան</p>
      </div>
    );
  }

  return (
    <div className="card card--interactive">
      <h3>Ուղիղ հանդիպումներ (H2H)</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ամսաթիվ</th>
              <th>Խաղ</th>
              <th>Հաշիվ</th>
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
