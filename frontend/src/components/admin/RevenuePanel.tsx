import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { useT, usePkgLabel } from "../../i18n";

type Revenue = {
  days: number;
  total_amount: number;
  total_count: number;
  today_amount: number;
  today_count: number;
  promo_redemptions: number;
  by_package: { key: string; label: string; count: number; amount: number }[];
  by_day: { date: string; count: number; amount: number }[];
};

export function RevenuePanel() {
  const { t } = useT();
  const pkgLabel = usePkgLabel();
  const amd = (n: number) => `${n.toLocaleString()} ${t("common.amdShort")}`;
  const [days, setDays] = useState(30);
  const rev = useQuery({ queryKey: ["admin-revenue", days], queryFn: () => api<Revenue>(`/api/admin/revenue/?days=${days}`) });
  const r = rev.data;
  const max = Math.max(1, ...(r?.by_day.map((d) => d.amount) ?? [1]));
  // only days with income, newest first
  const activeDays = [...(r?.by_day ?? [])].reverse().filter((d) => d.amount > 0);

  return (
    <div className="card">
      <h3>{t("admin.revenue")}</h3>
      <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ maxWidth: 200, marginBottom: "1rem" }}>
        {[7, 30, 90].map((n) => <option key={n} value={n}>{t("common.lastDays", { n })}</option>)}
      </select>
      {rev.isError && <p className="field__error">{rev.error.message}</p>}
      {r && (
        <>
          <div className="stat-grid stat-grid--wide">
            <div className="stat-tile"><div className="stat-tile__value">{r.total_amount.toLocaleString()}</div><div className="stat-tile__label">{t("admin.revTotal", { n: r.total_count })}</div></div>
            <div className="stat-tile"><div className="stat-tile__value">{r.today_amount.toLocaleString()}</div><div className="stat-tile__label">{t("admin.revToday", { n: r.today_count })}</div></div>
            <div className="stat-tile"><div className="stat-tile__value">{r.total_count ? Math.round(r.total_amount / r.total_count).toLocaleString() : "—"}</div><div className="stat-tile__label">{t("admin.revAvg")}</div></div>
            <div className="stat-tile"><div className="stat-tile__value">{r.promo_redemptions}</div><div className="stat-tile__label">{t("admin.revPromo")}</div></div>
          </div>
          <h4 style={{ marginTop: "1.25rem" }}>{t("admin.byPackage")}</h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t("admin.colPackage")}</th><th>{t("admin.colPayments")}</th><th>{t("admin.colAmount")}</th></tr></thead>
              <tbody>
                {r.by_package.map((p) => (
                  <tr key={p.key}><td>{pkgLabel(p.key, p.label)}</td><td>{p.count}</td><td>{amd(p.amount)}</td></tr>
                ))}
                {!r.by_package.length && <tr><td colSpan={3} className="muted">{t("status.noPayments")}</td></tr>}
              </tbody>
            </table>
          </div>
          <h4 style={{ marginTop: "1.25rem" }}>{t("admin.byDay")}</h4>
          {!activeDays.length && <p className="muted">{t("admin.noPaymentsPeriod")}</p>}
          {activeDays.map((d) => (
            <div key={d.date} className="form-bars">
              <span className="form-bars__label">{d.date.slice(5)}</span>
              <div className="form-bars__track">
                <div className="form-bars__fill form-bars__fill--win" style={{ width: `${(d.amount / max) * 100}%` }} />
              </div>
              <span className="form-bars__stat">{amd(d.amount)} · {d.count}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
