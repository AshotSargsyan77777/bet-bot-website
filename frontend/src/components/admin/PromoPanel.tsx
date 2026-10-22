import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { useT } from "../../i18n";

export function PromoPanel() {
  const qc = useQueryClient();
  const { t } = useT();
  const [n, setN] = useState("5");
  const promo = useQuery({
    queryKey: ["admin-promo"],
    queryFn: () => api<{ free: number; used: number; free_codes: string[] }>("/api/admin/promo/"),
  });
  const gen = useMutation({
    mutationFn: () => api<{ codes: string[] }>("/api/admin/promo/", { method: "POST", json: { n: Number(n) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-promo"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  return (
    <div className="card">
      <h3>{t("admin.promo")}</h3>
      <form
        className="filters-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          gen.mutate();
        }}
      >
        <input type="number" min={1} max={50} value={n} onChange={(e) => setN(e.target.value)} style={{ maxWidth: 90 }} />
        <button type="submit" disabled={gen.isPending}>{t("admin.generate")}</button>
      </form>
      {gen.isError && <p className="field__error">{gen.error.message}</p>}
      {gen.data && (
        <p>
          {t("admin.newCodes")} <code>{gen.data.codes.join(" ")}</code>
        </p>
      )}
      {promo.data && (
        <>
          <p className="muted">{t("admin.promoCounts", { free: promo.data.free, used: promo.data.used })}</p>
          <div className="chip-row">
            {promo.data.free_codes.map((c) => (
              <span key={c} className="chip">{c}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
