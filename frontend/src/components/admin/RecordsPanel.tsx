import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Paginated } from "../../api/client";
import { useT, usePkgLabel } from "../../i18n";
import { resultLabel, type CheckRecord } from "../../types/results";

export function RecordsPanel() {
  const qc = useQueryClient();
  const { t } = useT();
  const pkgLabel = usePkgLabel();
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
      <h3>{t("admin.records")}</h3>
      <div className="filters-toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="pending">{t("admin.recPending")}</option>
          <option value="won">{t("admin.recWon")}</option>
          <option value="lost">{t("admin.recLost")}</option>
          <option value="">{t("common.all")}</option>
        </select>
        <button type="button" disabled={settle.isPending} onClick={() => settle.mutate()}>
          {settle.isPending ? t("admin.checking") : t("admin.settleNow")}
        </button>
      </div>
      {settle.data && (
        <p className="field__hint">
          {settle.data.ok ? t("admin.settled", { checked: settle.data.checked ?? 0, settled: settle.data.settled }) : settle.data.error}
        </p>
      )}
      {(settle.isError || setResult.isError) && <p className="field__error">{(settle.error ?? setResult.error)?.message}</p>}
      <p className="muted">{t("admin.recInfo")}</p>
      {records.data?.results.map((r) => (
        <div key={r.id} className="combo-result">
          <p>
            <strong>{r.date}</strong> · {pkgLabel(r.package_key, r.label)} {r.combined_odds ? `· ${Number(r.combined_odds).toFixed(2)}x` : ""}{" "}
            <span className={`chip ${resultLabel[r.status].chip}`}>{resultLabel[r.status].icon} {t(resultLabel[r.status].key)}</span>
          </p>
          <ul className="match-list">
            {r.legs.map((l, i) => (
              <li key={i}>{resultLabel[l.result]?.icon ?? "⏳"} {l.fixture} · {l.selection}</li>
            ))}
            {!r.legs.length && <li className="muted">{t("admin.manualCheck")}</li>}
          </ul>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(["won", "lost", "void", "pending"] as const).filter((s) => s !== r.status).map((s) => (
              <button key={s} type="button" className="secondary" disabled={setResult.isPending}
                onClick={() => setResult.mutate({ id: r.id, status: s })}>
                {resultLabel[s].icon} {t(resultLabel[s].key)}
              </button>
            ))}
          </div>
        </div>
      ))}
      {records.data && !records.data.results.length && <p className="muted">{t("admin.noRecords")}</p>}
    </div>
  );
}
