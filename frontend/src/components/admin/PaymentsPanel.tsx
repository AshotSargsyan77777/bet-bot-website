import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Paginated } from "../../api/client";
import { isPaymentStatus, paymentStatusKey } from "../../utils/packageMeta";
import { useT, usePkgLabel, type Key } from "../../i18n";
import { ReceiptImage } from "./ReceiptImage";

type PaymentRow = {
  id: number;
  username: string;
  package_key: string;
  package_label: string;
  status: string;
  receipt_url: string | null;
  created_at: string;
  reviewed_by: string | null;
};

const TABS: { key: string; label: Key | "Pending" }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "admin.tabApproved" },
  { key: "rejected", label: "admin.tabRejected" },
  { key: "all", label: "common.all" },
];

export function PaymentsPanel() {
  const qc = useQueryClient();
  const { t } = useT();
  const pkgLabel = usePkgLabel();
  const [tab, setTab] = useState("pending");
  const [page, setPage] = useState(1);
  const payments = useQuery({
    queryKey: ["admin-payments", tab, page],
    queryFn: () => api<Paginated<PaymentRow>>(`/api/admin/payments/?status=${tab}&page=${page}&page_size=10`),
  });

  const act = useMutation({
    mutationFn: (v: { payment_id: number; action: "approve" | "reject" }) =>
      api("/api/admin/payments/", { method: "POST", json: v }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  return (
    <div className="card">
      <h3>{t("admin.payments")}</h3>
      <div className="chip-row" style={{ marginBottom: "1rem" }}>
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            className={tab === tb.key ? "" : "secondary"}
            onClick={() => {
              setTab(tb.key);
              setPage(1);
            }}
          >
            {tb.label === "Pending" ? tb.label : t(tb.label)}
          </button>
        ))}
      </div>
      {act.isError && <p className="field__error">{act.error.message}</p>}
      {payments.isLoading && <div className="loading-shimmer" />}
      {payments.isError && <p className="field__error">{payments.error.message}</p>}
      {(payments.data?.results || []).map((p) => (
        <div key={p.id} className="combo-result">
          <p>
            <strong>{p.username}</strong> — {pkgLabel(p.package_key, p.package_label)}{" "}
            <span className="muted">· {new Date(p.created_at).toLocaleString()} · {isPaymentStatus(p.status) ? t(paymentStatusKey[p.status]) : p.status}</span>
            {p.reviewed_by && <span className="muted"> · {p.reviewed_by}</span>}
          </p>
          <ReceiptImage path={p.receipt_url} />
          {p.status === "pending" && (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button type="button" disabled={act.isPending} onClick={() => act.mutate({ payment_id: p.id, action: "approve" })}>
                {t("admin.approve")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={act.isPending}
                onClick={() => act.mutate({ payment_id: p.id, action: "reject" })}
              >
                {t("admin.reject")}
              </button>
            </div>
          )}
        </div>
      ))}
      {payments.data && !payments.data.results.length && <p className="muted">{t("admin.noPayments")}</p>}
      {payments.data && payments.data.total_pages > 1 && (
        <div className="filters-toolbar">
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>←</button>
          <span className="filters-count">{page} / {payments.data.total_pages}</span>
          <button type="button" className="secondary" disabled={page >= payments.data.total_pages} onClick={() => setPage((x) => x + 1)}>→</button>
        </div>
      )}
    </div>
  );
}
