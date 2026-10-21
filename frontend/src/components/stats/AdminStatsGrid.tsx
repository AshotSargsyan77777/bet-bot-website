export type StatsPayload = {
  promo?: { free?: number; used?: number };
  active_subscriptions?: number;
  vip_members?: number;
  pending_payments?: number;
  unread_support?: number;
  checks_date?: string | null;
  ready_packages?: string[];
  today?: string;
};

export function AdminStatsGrid({ data }: { data?: StatsPayload | null }) {
  if (!data) return <p className="muted">Բեռնվում է…</p>;

  const cards = [
    { label: "Pending վճարումներ", value: data.pending_payments ?? 0 },
    { label: "Նոր հարցեր", value: data.unread_support ?? 0 },
    { label: "Պրոմո ազատ", value: data.promo?.free ?? 0 },
    { label: "Պրոմո օգտ.", value: data.promo?.used ?? 0 },
    { label: "Ակտիվ չեկեր", value: data.active_subscriptions ?? 0 },
    { label: "VIP", value: data.vip_members ?? 0 },
    { label: "Չեկերի օր", value: data.checks_date || "—" },
    { label: "Այսօր (Yerevan)", value: data.today || "—" },
  ];

  return (
    <div>
      <div className="stat-grid stat-grid--admin">
        {cards.map((c) => (
          <div key={c.label} className="stat-tile">
            <div className="stat-tile__value">{c.value}</div>
            <div className="stat-tile__label">{c.label}</div>
          </div>
        ))}
      </div>
      {data.ready_packages && data.ready_packages.length > 0 && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h4>Պատրաստ փաթեթներ</h4>
          <div className="chip-row">
            {data.ready_packages.map((p) => (
              <span key={p} className="chip chip--win">{p}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
