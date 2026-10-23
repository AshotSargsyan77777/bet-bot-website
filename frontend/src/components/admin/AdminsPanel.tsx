import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useT } from "../../i18n";

type AdminRow = { id: number; username: string; email: string; is_superuser: boolean; telegram: string };

/** Who has admin rights; any admin can give them to an existing account (by username or email). */
export function AdminsPanel() {
  const { t } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [login, setLogin] = useState("");
  const admins = useQuery({ queryKey: ["admin-admins"], queryFn: () => api<{ results: AdminRow[] }>("/api/admin/admins/") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-admins"] });
  const add = useMutation({
    mutationFn: () => api<AdminRow>("/api/admin/admins/", { method: "POST", json: { login } }),
    onSuccess: () => {
      setLogin("");
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/admin/admins/${id}/`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  return (
    <div className="card">
      <h3>{t("admin.adminsTitle")}</h3>
      <p className="muted">{t("admin.adminsHint")}</p>
      <form
        className="filters-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          if (login.trim()) add.mutate();
        }}
      >
        <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder={t("reset.login")} style={{ maxWidth: 320 }} />
        <button type="submit" disabled={add.isPending || !login.trim()}>{t("admin.makeAdmin")}</button>
      </form>
      {add.isSuccess && <p>{t("admin.adminAdded", { username: add.data.username })}</p>}
      {(add.error ?? remove.error) && <p className="field__error">{(add.error ?? remove.error)?.message}</p>}
      <ul className="match-list" style={{ marginTop: "1rem" }}>
        {admins.data?.results.map((a) => (
          <li key={a.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: 1 }}>
              <strong>{a.username}</strong>
              {a.email ? ` · ${a.email}` : ""}
              {a.telegram ? ` · @${a.telegram}` : ""}
              {a.is_superuser ? " · 👑" : ""}
            </span>
            {a.id !== user?.id && !a.is_superuser && (
              <button
                type="button"
                className="secondary"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(t("admin.confirmRemoveAdmin", { username: a.username }))) remove.mutate(a.id);
                }}
              >
                {t("admin.removeAdmin")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
