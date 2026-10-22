import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import type { Catalog } from "../types/catalog";

export type AnalysisRow = {
  id: number;
  date: string;
  home: string;
  away: string;
  league: string;
  kickoff: string | null;
  started: boolean;
  price: number;
  access: "open" | "pending" | "locked";
};
type ListResponse = { results: AnalysisRow[]; price: number };
type MineResponse = { results: { id: number; home: string; away: string; date: string; status: string }[] };

const MAX_MB = 5;

export function AnalysisBuyBox({ row, cardNumber, onDone }: { row: AnalysisRow; cardNumber: string; onDone: () => void }) {
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const buy = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("receipt", file as File);
      return api(`/api/analysis/${row.id}/buy/`, { method: "POST", body: fd });
    },
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <div style={{ marginTop: "0.75rem" }}>
      <p className="muted">{t("an.buyHint", { price: row.price.toLocaleString() })}</p>
      {cardNumber && (
        <p>
          {t("common.card")}: <code className="check-preview" style={{ display: "inline", padding: "0.2rem 0.5rem" }}>{cardNumber}</code>
        </p>
      )}
      <div className="field">
        <span className="field__label">{t("common.receipt", { mb: MAX_MB })}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setErr(f && f.size > MAX_MB * 1024 * 1024 ? t("common.tooBig", { mb: MAX_MB }) : "");
            setFile(f);
          }}
        />
      </div>
      {err && <p className="field__error">{err}</p>}
      <button type="button" disabled={!file || buy.isPending || !!err} onClick={() => buy.mutate()}>
        {buy.isPending ? t("common.sending") : t("comb.sendForApproval")}
      </button>
    </div>
  );
}

export function Analysis() {
  const { t } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [buying, setBuying] = useState<number | null>(null);
  const list = useQuery({ queryKey: ["analyses"], queryFn: () => api<ListResponse>("/api/analysis/") });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/checks/catalog/"), enabled: !!user });
  const mine = useQuery({ queryKey: ["analyses-mine"], queryFn: () => api<MineResponse>("/api/analysis/mine/"), enabled: !!user });
  const price = (list.data?.price ?? 1000).toLocaleString();
  const rows = list.data?.results ?? [];

  return (
    <div>
      <PageHeader eyebrow="Goalking" title={t("an.title")} subtitle={t("an.subtitle", { price })} />
      {list.isLoading && <div className="loading-shimmer" />}
      {list.isError && <p className="field__error">{list.error.message}</p>}
      {list.data && !rows.length && <div className="card"><p className="muted">{t("an.none")}</p></div>}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {rows.map((r) => (
          <article key={r.id} className="card card--interactive">
            <p className="muted" style={{ fontSize: "0.8rem" }}>
              {r.league}
              {r.kickoff ? ` · ${new Date(r.kickoff).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}` : ""}
            </p>
            <h3 style={{ margin: "0.25rem 0 0.75rem" }}>{r.home} — {r.away}</h3>
            {r.access === "open" ? (
              <Link to={`/analysis/${r.id}`} className="btn">{t("an.open")}</Link>
            ) : r.access === "pending" ? (
              <p>{t("an.pending")}</p>
            ) : r.started ? (
              <p className="muted">{t("an.started")}</p>
            ) : !user ? (
              <Link to="/login" className="btn btn--secondary">{t("an.loginToBuy")}</Link>
            ) : buying === r.id ? (
              <AnalysisBuyBox
                row={r}
                cardNumber={catalog.data?.card_number ?? ""}
                onDone={() => {
                  setBuying(null);
                  qc.invalidateQueries({ queryKey: ["analyses"] });
                  qc.invalidateQueries({ queryKey: ["analyses-mine"] });
                }}
              />
            ) : (
              <button type="button" onClick={() => setBuying(r.id)}>{t("an.buy", { price: r.price.toLocaleString() })}</button>
            )}
          </article>
        ))}
      </div>
      {!!mine.data?.results.length && (
        <div className="card">
          <h3>{t("an.mine")}</h3>
          <ul className="match-list">
            {mine.data.results.map((m, i) => (
              <li key={`${m.id}-${i}`}>
                {m.status === "paid" ? <Link to={`/analysis/${m.id}`}>{m.home} — {m.away}</Link> : `${m.home} — ${m.away}`}
                {" · "}{m.date} · {t(m.status === "paid" ? "payStatus.paid" : m.status === "pending" ? "payStatus.pending" : "payStatus.rejected")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
