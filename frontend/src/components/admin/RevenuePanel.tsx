import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";

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

const amd = (n: number) => `${n.toLocaleString()} դր.`;

export function RevenuePanel() {
  const [days, setDays] = useState(30);
  const rev = useQuery({ queryKey: ["admin-revenue", days], queryFn: () => api<Revenue>(`/api/admin/revenue/?days=${days}`) });
  const r = rev.data;
  const max = Math.max(1, ...(r?.by_day.map((d) => d.amount) ?? [1]));
  // only days with income, newest first
  const activeDays = [...(r?.by_day ?? [])].reverse().filter((d) => d.amount > 0);

  return (
    <div className="card">
      <h3>💵 Եկամուտ</h3>
      <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ maxWidth: 200, marginBottom: "1rem" }}>
        <option value={7}>Վերջին 7 օր</option>
        <option value={30}>Վերջին 30 օր</option>
        <option value={90}>Վերջին 90 օր</option>
      </select>
      {rev.isError && <p className="field__error">{rev.error.message}</p>}
      {r && (
        <>
          <div className="stat-grid stat-grid--wide">
            <div className="stat-tile"><div className="stat-tile__value">{r.total_amount.toLocaleString()}</div><div className="stat-tile__label">դրամ · {r.total_count} վճարում</div></div>
            <div className="stat-tile"><div className="stat-tile__value">{r.today_amount.toLocaleString()}</div><div className="stat-tile__label">դրամ այսօր ({r.today_count})</div></div>
            <div className="stat-tile"><div className="stat-tile__value">{r.total_count ? Math.round(r.total_amount / r.total_count).toLocaleString() : "—"}</div><div className="stat-tile__label">դրամ · միջին վճարում</div></div>
            <div className="stat-tile"><div className="stat-tile__value">{r.promo_redemptions}</div><div className="stat-tile__label">Պրոմո ակտիվացում</div></div>
          </div>
          <h4 style={{ marginTop: "1.25rem" }}>Ըստ փաթեթների</h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Փաթեթ</th><th>Վճարում</th><th>Գումար</th></tr></thead>
              <tbody>
                {r.by_package.map((p) => (
                  <tr key={p.key}><td>{p.label}</td><td>{p.count}</td><td>{amd(p.amount)}</td></tr>
                ))}
                {!r.by_package.length && <tr><td colSpan={3} className="muted">Դեռ վճարումներ չկան</td></tr>}
              </tbody>
            </table>
          </div>
          <h4 style={{ marginTop: "1.25rem" }}>Ըստ օրերի</h4>
          {!activeDays.length && <p className="muted">Այս ժամանակահատվածում վճարումներ չկան</p>}
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
