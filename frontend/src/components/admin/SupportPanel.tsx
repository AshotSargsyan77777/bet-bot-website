import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Paginated } from "../../api/client";

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

function TicketRow({ t }: { t: Ticket }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const update = useMutation({
    mutationFn: (body: { reply?: string; is_read?: boolean }) =>
      api<Ticket>(`/api/admin/support/${t.id}/`, { method: "PATCH", json: body }),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["admin-support"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  return (
    <div className="combo-result">
      <p>
        <strong>{t.user}</strong> <span className="muted">· {new Date(t.created_at).toLocaleString()}</span>
        {!t.is_read && <span className="chip chip--loss" style={{ marginLeft: "0.5rem" }}>նոր</span>}
      </p>
      <p style={{ whiteSpace: "pre-wrap" }}>{t.message}</p>
      {t.reply && (
        <p style={{ whiteSpace: "pre-wrap" }}>
          📩 {t.reply} <span className="muted">— {t.replied_by}</span>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reply.trim()) update.mutate({ reply });
        }}
      >
        <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Պատասխան…" maxLength={4000} />
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
          <button type="submit" disabled={update.isPending || !reply.trim()}>{t.reply ? "Թարմացնել պատասխանը" : "Պատասխանել"}</button>
          {!t.is_read && (
            <button type="button" className="secondary" disabled={update.isPending} onClick={() => update.mutate({ is_read: true })}>
              Նշել կարդացված
            </button>
          )}
        </div>
        {update.isError && <p className="field__error">{update.error.message}</p>}
      </form>
    </div>
  );
}

export function SupportPanel() {
  const [state, setState] = useState("unanswered");
  const tickets = useQuery({
    queryKey: ["admin-support", state],
    queryFn: () => api<Paginated<Ticket>>(`/api/admin/support/?state=${state}`),
  });

  return (
    <div className="card">
      <h3>🆘 Support</h3>
      <select value={state} onChange={(e) => setState(e.target.value)} style={{ maxWidth: 220, marginBottom: "1rem" }}>
        <option value="unanswered">Չպատասխանված</option>
        <option value="unread">Չկարդացված</option>
        <option value="all">Բոլորը</option>
      </select>
      {tickets.isError && <p className="field__error">{tickets.error.message}</p>}
      {tickets.data?.results.map((t) => <TicketRow key={t.id} t={t} />)}
      {tickets.data && !tickets.data.results.length && <p className="muted">Հարցեր չկան</p>}
    </div>
  );
}
