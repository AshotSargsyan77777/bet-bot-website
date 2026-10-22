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

import { useT } from "../../i18n";

export function AdminStatsGrid({ data }: { data?: StatsPayload | null }) {
  const { t } = useT();
  if (!data) return <p className="muted">{t("common.loading")}</p>;

  const cards = [
    { label: t("admin.statPending"), value: data.pending_payments ?? 0 },
    { label: t("admin.statSupport"), value: data.unread_support ?? 0 },
    { label: t("admin.statPromoFree"), value: data.promo?.free ?? 0 },
    { label: t("admin.statPromoUsed"), value: data.promo?.used ?? 0 },
    { label: t("admin.statActive"), value: data.active_subscriptions ?? 0 },
    { label: "VIP", value: data.vip_members ?? 0 },
    { label: t("admin.statChecksDay"), value: data.checks_date || "—" },
    { label: t("admin.statToday"), value: data.today || "—" },
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
          <h4>{t("admin.readyPackages")}</h4>
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
