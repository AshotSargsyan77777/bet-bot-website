import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { CheckPreview } from "../stats/CheckPreview";

type AdminCheck = { package_key: string; label: string; ready: boolean; body_text: string; updated_at: string };
type ChecksPayload = { checks_date: string | null; today: string; checks: AdminCheck[] };

export function ChecksPanel() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("");
  const checks = useQuery({ queryKey: ["admin-checks"], queryFn: () => api<ChecksPayload>("/api/admin/checks/") });

  const save = useMutation({
    mutationFn: () => api<AdminCheck>("/api/admin/checks/", { method: "PATCH", json: { package_key: selected, body_text: text } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-checks"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
    },
  });

  const current = checks.data?.checks.find((c) => c.package_key === selected);

  return (
    <div className="card">
      <h3>📝 Չեկեր</h3>
      <p className="muted">
        Չեկերի ամսաթիվ՝ {checks.data?.checks_date ?? "—"} · Այսօր՝ {checks.data?.today ?? "—"}. Ձեռքով պահպանված չեկը
        համարվում է այսօրվանը (ինչպես բոտի /setcheck-ը)։
      </p>
      {checks.isError && <p className="field__error">{checks.error.message}</p>}
      <div className="chip-row" style={{ marginBottom: "1rem" }}>
        {checks.data?.checks.map((c) => (
          <button
            key={c.package_key}
            type="button"
            className={selected === c.package_key ? "" : "secondary"}
            onClick={() => {
              setSelected(c.package_key);
              setText(c.body_text);
              save.reset();
            }}
          >
            {c.ready ? "✅" : "⛔"} {c.label}
          </button>
        ))}
      </div>
      {current && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label>
            Տեքստ ({current.label})
            <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} required maxLength={10000} />
          </label>
          {save.isError && <p className="field__error">{save.error.message}</p>}
          {save.isSuccess && <p>✅ Պահպանվեց</p>}
          <button type="submit" style={{ marginTop: "0.75rem" }} disabled={save.isPending || !text.trim()}>
            Պահպանել
          </button>
          <h4 style={{ marginTop: "1rem" }}>Նախադիտում</h4>
          <CheckPreview text={text} />
        </form>
      )}
    </div>
  );
}
