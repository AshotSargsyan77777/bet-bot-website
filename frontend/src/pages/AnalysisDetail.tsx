import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { useT } from "../i18n";
import type { AnalysisRow } from "./Analysis";

type Lines = [number, number][]; // [line, probability of over]
type Extra = { exp: number; home: number; away: number; lines: Lines } | null;
type Report = {
  xg: [number, number];
  p1x2: [number, number, number];
  btts: number;
  cleanSheet?: [number, number];
  goals: Lines;
  homeGoals?: Lines;
  awayGoals?: Lines;
  firstHalf?: Lines;
  scores?: [number, number, number][];
  corners: Extra;
  cards: Extra;
  form?: [number, number] | null;
  h2h?: [number, number, number, number] | null;
  injuries?: [number, number] | null;
  table?: [number, number] | null;
  dataQuality?: number;
};
type Pick = { market: string; selection: string; odd: number; probability: number };
type Detail = AnalysisRow & { report?: Report; picks?: Pick[] };

const pct = (p: number) => `${Math.round(p * 100)}%`;

function Bar({ label, p }: { label: string; p: number }) {
  return (
    <div className="form-bars">
      <span className="form-bars__label">{label}</span>
      <div className="form-bars__track">
        <div className={`form-bars__fill ${p >= 0.5 ? "form-bars__fill--win" : ""}`} style={{ width: `${Math.round(p * 100)}%` }} />
      </div>
      <span className="form-bars__stat">{pct(p)}</span>
    </div>
  );
}

function LinesTable({ lines }: { lines: Lines }) {
  const { t } = useT();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>{t("an.colLine")}</th><th>{t("an.colOver")}</th><th>{t("an.colUnder")}</th></tr>
        </thead>
        <tbody>
          {lines.map(([line, over]) => (
            <tr key={line}>
              <td>{line}</td>
              <td style={{ fontWeight: over >= 0.5 ? 700 : 400 }}>{pct(over)}</td>
              <td style={{ fontWeight: over < 0.5 ? 700 : 400 }}>{pct(1 - over)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExtraCard({ title, data, home, away }: { title: string; data: Extra; home: string; away: string }) {
  const { t } = useT();
  return (
    <div className="card card--interactive">
      <h3>{title}</h3>
      {data ? (
        <>
          <p>{t("an.expectedTotal", { n: data.exp, home, h: data.home, away, a: data.away })}</p>
          <LinesTable lines={data.lines} />
        </>
      ) : (
        <p className="muted">{t("an.noStats")}</p>
      )}
    </div>
  );
}

export function AnalysisDetail() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["analysis", id], queryFn: () => api<Detail>(`/api/analysis/${id}/`), enabled: !!id && /^\d+$/.test(id) });
  const back = <Link to="/analysis" className="btn btn--secondary" style={{ marginTop: "1rem" }}>{t("an.back")}</Link>;

  if (q.isLoading) return <div className="loading-shimmer" />;
  if (q.isError || !q.data) {
    return (
      <div className="card">
        <p className="field__error">{q.error?.message ?? t("game.notFound")}</p>
        {back}
      </div>
    );
  }
  const d = q.data;
  const r = d.report;
  const header = (
    <PageHeader
      eyebrow={[d.league, d.kickoff ? new Date(d.kickoff).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : ""].filter(Boolean).join(" · ")}
      title={`${d.home} — ${d.away}`}
      subtitle={t("an.title")}
    />
  );
  if (!r) {
    return (
      <div>
        {header}
        <div className="card"><p>{d.access === "pending" ? t("an.pending") : t("an.locked")}</p></div>
        {back}
      </div>
    );
  }
  const [pH, pD, pA] = r.p1x2;

  return (
    <div>
      {header}
      <div className="match-hero">
        <p className="muted">{t("an.expected")}</p>
        <div className="match-hero__score">{r.xg[0].toFixed(1)} : {r.xg[1].toFixed(1)}</div>
        {!!r.scores?.length && (
          <>
            <p className="muted">{t("an.likelyScores")}</p>
            <div className="chip-row" style={{ justifyContent: "center" }}>
              {r.scores.map(([h, a, p]) => <span key={`${h}-${a}`} className="chip">{h}:{a} · {pct(p)}</span>)}
            </div>
          </>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div className="card card--interactive">
          <h3>{t("an.result")}</h3>
          <Bar label={t("an.win", { team: d.home })} p={pH} />
          <Bar label={t("an.draw")} p={pD} />
          <Bar label={t("an.win", { team: d.away })} p={pA} />
          <h4 style={{ marginTop: "1rem" }}>{t("an.doubleChance")}</h4>
          <Bar label={t("an.orDraw", { team: d.home })} p={pH + pD} />
          <Bar label={t("an.orDraw", { team: d.away })} p={pA + pD} />
          <Bar label={t("an.noDraw")} p={pH + pA} />
        </div>

        <div className="card card--interactive">
          <h3>{t("an.goals")}</h3>
          <h4>{t("an.totalGoals")}</h4>
          <LinesTable lines={r.goals} />
          <h4 style={{ marginTop: "1rem" }}>{t("an.btts")}</h4>
          <Bar label={t("an.yes")} p={r.btts} />
          <Bar label={t("an.no")} p={1 - r.btts} />
          {r.cleanSheet && (
            <>
              <Bar label={t("an.cleanSheet", { team: d.home })} p={r.cleanSheet[0]} />
              <Bar label={t("an.cleanSheet", { team: d.away })} p={r.cleanSheet[1]} />
            </>
          )}
        </div>

        {(r.homeGoals || r.awayGoals || r.firstHalf) && (
          <div className="card card--interactive">
            {r.homeGoals && (<><h4>{t("an.teamGoals", { team: d.home })}</h4><LinesTable lines={r.homeGoals} /></>)}
            {r.awayGoals && (<><h4 style={{ marginTop: "1rem" }}>{t("an.teamGoals", { team: d.away })}</h4><LinesTable lines={r.awayGoals} /></>)}
            {r.firstHalf && (<><h4 style={{ marginTop: "1rem" }}>{t("an.firstHalf")}</h4><LinesTable lines={r.firstHalf} /></>)}
          </div>
        )}

        <ExtraCard title={t("an.corners")} data={r.corners} home={d.home} away={d.away} />
        <ExtraCard title={t("an.cards")} data={r.cards} home={d.home} away={d.away} />

        <div className="card card--interactive">
          <h3>{t("an.context")}</h3>
          <ul className="match-list">
            {r.form && <li>{t("an.form", { home: d.home, h: r.form[0], away: d.away, a: r.form[1] })}</li>}
            {r.h2h && <li>{t("an.h2h", { hw: r.h2h[0], d: r.h2h[1], aw: r.h2h[2], n: r.h2h[3] })}</li>}
            {r.injuries && <li>{t("an.injuries", { home: d.home, h: r.injuries[0], away: d.away, a: r.injuries[1] })}</li>}
            {r.table && <li>{t("an.table", { home: d.home, h: r.table[0], away: d.away, a: r.table[1] })}</li>}
            {r.dataQuality != null && <li>{t("an.dataQuality", { n: r.dataQuality })}</li>}
          </ul>
        </div>
      </div>

      {!!d.picks?.length && (
        <div className="card card--glass">
          <h3>{t("an.picks")}</h3>
          <ul className="match-list">
            {d.picks.map((p, i) => (
              <li key={i}>
                <strong>{p.selection}</strong> · {pct(p.probability)}
                {p.odd ? <span className="muted"> · {t("an.odds", { n: Number(p.odd).toFixed(2) })}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="field__hint">{t("pkg.disclaimer")}</p>
      {back}
    </div>
  );
}
