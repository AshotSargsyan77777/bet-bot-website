import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Paginated } from "../../api/client";
import { useT } from "../../i18n";

type Ticket = {
  id: number;
  user: string;
  message: string;
  created_at: string;
  is_read: boolean;
  reply: string;
  replied_at: string | null;
  replied_by: string | null;
};

function TicketRow({ t: tk }: { t: Ticket }) {
  const qc = useQueryClient();
  const { t } = useT();
  const [reply, setReply] = useState("");
  const update = useMutation({
    mutationFn: (body: { reply?: string; is_read?: boolean }) =>
      api<Ticket>(`/api/admin/support/${tk.id}/`, { method: "PATCH", json: body }),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["admin-support"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  return (
    <div className="combo-result">
      <p>
        <strong>{tk.user}</strong> <span className="muted">· {new Date(tk.created_at).toLocaleString()}</span>
        {!tk.is_read && <span className="chip chip--loss" style={{ marginLeft: "0.5rem" }}>{t("admin.new")}</span>}
      </p>
      <p style={{ whiteSpace: "pre-wrap" }}>{tk.message}</p>
      {tk.reply && (
        <p style={{ whiteSpace: "pre-wrap" }}>
          📩 {tk.reply} <span className="muted">— {tk.replied_by}</span>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reply.trim()) update.mutate({ reply });
        }}
      >
        <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("admin.replyPh")} maxLength={4000} />
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
          <button type="submit" disabled={update.isPending || !reply.trim()}>{tk.reply ? t("admin.updateReply") : t("admin.reply")}</button>
          {!tk.is_read && (
            <button type="button" className="secondary" disabled={update.isPending} onClick={() => update.mutate({ is_read: true })}>
              {t("admin.markRead")}
            </button>
          )}
        </div>
        {update.isError && <p className="field__error">{update.error.message}</p>}
      </form>
    </div>
  );
}

export function SupportPanel() {
  const { t } = useT();
  const [state, setState] = useState("unanswered");
  const tickets = useQuery({
    queryKey: ["admin-support", state],
    queryFn: () => api<Paginated<Ticket>>(`/api/admin/support/?state=${state}`),
  });

  return (
    <div className="card">
      <h3>{t("admin.support")}</h3>
      <select value={state} onChange={(e) => setState(e.target.value)} style={{ maxWidth: 220, marginBottom: "1rem" }}>
        <option value="unanswered">{t("admin.unanswered")}</option>
        <option value="unread">{t("admin.unread")}</option>
        <option value="all">{t("common.all")}</option>
      </select>
      {tickets.isError && <p className="field__error">{tickets.error.message}</p>}
      {tickets.data?.results.map((tk) => <TicketRow key={tk.id} t={tk} />)}
      {tickets.data && !tickets.data.results.length && <p className="muted">{t("admin.noTickets")}</p>}
    </div>
  );
}
