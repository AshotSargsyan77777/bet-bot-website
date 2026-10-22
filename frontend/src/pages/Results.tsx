import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Paginated } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { CheckPreview } from "../components/stats/CheckPreview";
import type { Catalog } from "../types/catalog";
import { resultLabel, type CheckRecord, type ResultsStats } from "../types/results";
import { useT, usePkgLabel } from "../i18n";

function RecordCard({ r }: { r: CheckRecord }) {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  const pkgLabel = usePkgLabel();
  const st = resultLabel[r.status];
  return (
    <article className="combo-result">
      <header className="combo-card__head" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <span className="muted">{r.date}</span>
        <strong>{pkgLabel(r.package_key, r.label)}</strong>
        {r.combined_odds && <span className="combo-result__odds">{Number(r.combined_odds).toFixed(2)}x</span>}
        <span className={`chip ${st.chip}`}>{st.icon} {t(st.key)}</span>
      </header>
      {r.legs.length > 0 && (
        <ul className="match-list" style={{ marginTop: "0.75rem" }}>
          {r.legs.map((l, i) => (
            <li key={i}>
              {resultLabel[l.result]?.icon ?? "⏳"} {l.fixture} · {l.selection}
              {l.odd ? <span className="muted"> @ {Number(l.odd).toFixed(2)}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="secondary" style={{ marginTop: "0.75rem" }} onClick={() => setOpen((o) => !o)}>
        {open ? t("results.hide") : t("results.show")}
      </button>
      {open && <CheckPreview text={r.body_text} />}
    </article>
  );
}

export function Results() {
  const { t } = useT();
  const pkgLabel = usePkgLabel();
  const [days, setDays] = useState(30);
  const [pkg, setPkg] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const stats = useQuery({
    queryKey: ["results-stats", days],
    queryFn: () => api<ResultsStats>(`/api/checks/history/stats/?days=${days}`),
  });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/checks/catalog/") });
  const params = new URLSearchParams({ page: String(page), page_size: "10" });
  if (pkg) params.set("package", pkg);
  if (status) params.set("status", status);
  const history = useQuery({
    queryKey: ["results", params.toString()],
    queryFn: () => api<Paginated<CheckRecord>>(`/api/checks/history/?${params}`),
    placeholderData: keepPreviousData,
  });

  const s = stats.data;
  const tiles = [
    { label: t("results.passed", { n: days }), value: s ? `${s.won}/${s.settled}` : "—" },
    { label: t("results.rate"), value: s?.win_rate != null ? `${s.win_rate}%` : "—" },
    { label: t("results.failed"), value: s ? String(s.lost) : "—" },
    { label: t("results.waiting"), value: s ? String(s.pending) : "—" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={t("results.eyebrow")}
        title={t("results.title")}
        subtitle={t("results.subtitle")}
      />
      <div className="card card--glass">
        <div className="stat-grid stat-grid--wide">
          {tiles.map((t) => (
            <div key={t.label} className="stat-tile">
              <div className="stat-tile__value">{t.value}</div>
              <div className="stat-tile__label">{t.label}</div>
            </div>
          ))}
        </div>
        {stats.isError && <p className="field__error">{stats.error.message}</p>}
        {s && s.by_package.length > 0 && (
          <div className="chip-row" style={{ marginTop: "1rem" }}>
            {s.by_package.map((b) => (
              <span key={b.key} className="chip">{pkgLabel(b.key, b.label)}: {b.won}/{b.won + b.lost}</span>
            ))}
          </div>
        )}
      </div>
      <div className="card">
        <div className="filters">
          <div className="field">
            <span className="field__label">{t("results.period")}</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[7, 30, 90].map((n) => <option key={n} value={n}>{t("common.days", { n })}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="field__label">{t("results.package")}</span>
            <select value={pkg} onChange={(e) => { setPkg(e.target.value); setPage(1); }}>
              <option value="">{t("common.all")}</option>
              {(catalog.data?.packages ?? []).filter((p) => p.key !== "pkg_vip").map((p) => (
                <option key={p.key} value={p.key}>{pkgLabel(p.key, p.label)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field__label">{t("results.result")}</span>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">{t("common.all")}</option>
              <option value="won">✅ {t("result.won")}</option>
              <option value="lost">❌ {t("result.lost")}</option>
              <option value="pending">⏳ {t("result.pending")}</option>
            </select>
          </div>
        </div>
        {history.isLoading && <div className="loading-shimmer" />}
        {history.isError && <p className="field__error">{history.error.message}</p>}
        {history.data?.results.map((r) => <RecordCard key={r.id} r={r} />)}
        {history.data && history.data.results.length === 0 && <p className="muted">{t("results.none")}</p>}
        {history.data && history.data.total_pages > 1 && (
          <div className="filters-toolbar" style={{ justifyContent: "center" }}>
            <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("common.prev")}</button>
            <span className="filters-count">{page} / {history.data.total_pages}</span>
            <button type="button" className="secondary" disabled={page >= history.data.total_pages} onClick={() => setPage((p) => p + 1)}>{t("common.next")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
