import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Paginated } from "../../api/client";

type Candidate = {
  id: number;
  fixture_name: string;
  market: string;
  selection: string;
  odd: number;
  active: boolean;
};

const MARKETS = ["MATCH_WINNER", "DOUBLE_CHANCE", "DNB", "BTTS", "OU", "TEAM_TOTAL_HOME", "TEAM_TOTAL_AWAY", "OU_1H", "ODD_EVEN"];
const empty = { fixture_name: "", market: "MATCH_WINNER", selection: "", odd: "" };

export function CandidatesPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const list = useQuery({
    queryKey: ["admin-candidates"],
    queryFn: () => api<Paginated<Candidate>>("/api/admin/candidates/?page_size=100"),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-candidates"] });

  const create = useMutation({
    mutationFn: () =>
      api("/api/admin/candidates/", { method: "POST", json: { ...form, odd: Number(form.odd.replace(",", ".")) } }),
    onSuccess: () => {
      setForm(empty);
      invalidate();
    },
  });
  const toggle = useMutation({
    mutationFn: (c: Candidate) => api(`/api/admin/candidates/${c.id}/`, { method: "PATCH", json: { active: !c.active } }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/admin/candidates/${id}/`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="card">
      <h3>🎯 Կոնստրուկտորի լրացուցիչ ընտրանքներ</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="filters">
          <div className="field">
            <span className="field__label">Խաղ</span>
            <input value={form.fixture_name} onChange={set("fixture_name")} placeholder="Team A - Team B" required maxLength={255} />
          </div>
          <div className="field">
            <span className="field__label">Շուկա</span>
            <select value={form.market} onChange={set("market")}>
              {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="field__label">Ընտրանք</span>
            <input value={form.selection} onChange={set("selection")} placeholder="Over 2.5" required maxLength={255} />
          </div>
          <div className="field">
            <span className="field__label">Գործակից</span>
            <input value={form.odd} onChange={set("odd")} inputMode="decimal" placeholder="1.45" required />
          </div>
        </div>
        <button type="submit" disabled={create.isPending}>Ավելացնել</button>
        {create.isError && <p className="field__error">{create.error.message}</p>}
      </form>
      {(toggle.isError || remove.isError) && <p className="field__error">{(toggle.error ?? remove.error)?.message}</p>}
      <ul className="match-list" style={{ marginTop: "1rem" }}>
        {list.data?.results.map((c) => (
          <li key={c.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", opacity: c.active ? 1 : 0.5 }}>
            <span style={{ flex: 1 }}>
              {c.fixture_name} · {c.market} · {c.selection} @ {Number(c.odd).toFixed(2)}
            </span>
            <button type="button" className="secondary" onClick={() => toggle.mutate(c)}>
              {c.active ? "Անջատել" : "Միացնել"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (window.confirm("Ջնջե՞լ այս ընտրանքը")) remove.mutate(c.id);
              }}
            >
              Ջնջել
            </button>
          </li>
        ))}
        {list.data && !list.data.results.length && <li className="muted">Լրացուցիչ ընտրանքներ չկան</li>}
      </ul>
    </div>
  );
}
