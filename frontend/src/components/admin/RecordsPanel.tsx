import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Paginated } from "../../api/client";
import { resultLabel, type CheckRecord } from "../../types/results";

export function RecordsPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const records = useQuery({
    queryKey: ["admin-records", status],
    queryFn: () => api<Paginated<CheckRecord>>(`/api/admin/records/?page_size=30${status ? `&status=${status}` : ""}`),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-records"] });
    qc.invalidateQueries({ queryKey: ["results-stats"] });
  };
  const settle = useMutation({
    mutationFn: () => api<{ ok: boolean; checked?: number; settled: number; error?: string }>("/api/admin/records/", { method: "POST" }),
    onSuccess: refresh,
  });
  const setResult = useMutation({
    mutationFn: (v: { id: number; status: string }) =>
      api(`/api/admin/records/${v.id}/`, { method: "PATCH", json: { status: v.status } }),
    onSuccess: refresh,
  });

  return (
    <div className="card">
      <h3>📈 Չեկերի արդյունքներ</h3>
      <div className="filters-toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="pending">⏳ Սպասվող</option>
          <option value="won">✅ Անցած</option>
          <option value="lost">❌ Չանցած</option>
          <option value="">Բոլորը</option>
        </select>
        <button type="button" disabled={settle.isPending} onClick={() => settle.mutate()}>
          {settle.isPending ? "Ստուգվում է…" : "Ստուգել արդյունքները հիմա"}
        </button>
      </div>
      {settle.data && (
        <p className="field__hint">
          {settle.data.ok ? `Ստուգվեց ${settle.data.checked}, որոշվեց ${settle.data.settled}` : settle.data.error}
        </p>
      )}
      {(settle.isError || setResult.isError) && <p className="field__error">{(settle.error ?? setResult.error)?.message}</p>}
      <p className="muted">Արդյունքները ավտոմատ ստուգվում են ամեն ժամ (n8n)։ Ձեռքով չեկերը (առանց խաղերի տվյալների) նշեք ներքևում։</p>
      {records.data?.results.map((r) => (
        <div key={r.id} className="combo-result">
          <p>
            <strong>{r.date}</strong> · {r.label} {r.combined_odds ? `· ${Number(r.combined_odds).toFixed(2)}x` : ""}{" "}
            <span className={`chip ${resultLabel[r.status].chip}`}>{resultLabel[r.status].icon} {resultLabel[r.status].text}</span>
          </p>
          <ul className="match-list">
            {r.legs.map((l, i) => (
              <li key={i}>{resultLabel[l.result]?.icon ?? "⏳"} {l.fixture} · {l.selection}</li>
            ))}
            {!r.legs.length && <li className="muted">Ձեռքով չեկ</li>}
          </ul>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(["won", "lost", "void", "pending"] as const).filter((s) => s !== r.status).map((s) => (
              <button key={s} type="button" className="secondary" disabled={setResult.isPending}
                onClick={() => setResult.mutate({ id: r.id, status: s })}>
                {resultLabel[s].icon} {resultLabel[s].text}
              </button>
            ))}
          </div>
        </div>
      ))}
      {records.data && !records.data.results.length && <p className="muted">Չեկեր չկան</p>}
    </div>
  );
}
