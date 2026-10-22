import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Paginated } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";

type Ticket = { id: number; message: string; created_at: string; reply: string; replied_at: string | null };

export function Help() {
  const { user } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const tickets = useQuery({
    queryKey: ["support-tickets"],
    queryFn: () => api<Paginated<Ticket>>("/api/support/"),
    enabled: !!user,
  });

  const send = useMutation({
    mutationFn: () => api<Ticket>("/api/support/", { method: "POST", json: { message } }),
    onSuccess: () => {
      setMessage("");
      setSent(true);
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
  });

  if (!user) {
    return (
      <div className="card">
        <PageHeader title={t("help.title")} subtitle={t("help.loginNeeded")} />
        <Link to="/login" className="btn">{t("common.login")}</Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("help.title")} subtitle={t("help.subtitle")} />
      <form
        className="card card--glass"
        style={{ maxWidth: 560 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (message.trim()) send.mutate();
        }}
      >
        {sent && <p>{t("help.sent")}</p>}
        <label>
          {t("help.question")}
          <textarea
            rows={5}
            value={message}
            maxLength={4000}
            required
            onChange={(e) => {
              setMessage(e.target.value);
              setSent(false);
            }}
          />
        </label>
        {send.isError && <p className="field__error">{send.error.message}</p>}
        <button type="submit" style={{ marginTop: "1rem" }} disabled={send.isPending || !message.trim()}>
          {send.isPending ? t("common.sending") : t("common.send")}
        </button>
      </form>
      <div className="card" style={{ maxWidth: 560 }}>
        <h3>{t("help.mine")}</h3>
        {tickets.isLoading && <div className="loading-shimmer" />}
        {tickets.isError && <p className="field__error">{tickets.error.message}</p>}
        {tickets.data?.results.length === 0 && <p className="muted">{t("help.none")}</p>}
        {tickets.data?.results.map((tk) => (
          <div key={tk.id} className="combo-result">
            <p className="muted" style={{ fontSize: "0.8rem" }}>{new Date(tk.created_at).toLocaleString()}</p>
            <p style={{ whiteSpace: "pre-wrap" }}>{tk.message}</p>
            {tk.reply ? (
              <p style={{ whiteSpace: "pre-wrap" }}>📩 <strong>{t("help.answer")}</strong> {tk.reply}</p>
            ) : (
              <p className="muted">{t("help.waiting")}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
