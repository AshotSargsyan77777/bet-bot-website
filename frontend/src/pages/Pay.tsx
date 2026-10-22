import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import type { Catalog } from "../types/catalog";
import { useT, usePkgLabel } from "../i18n";

const MAX_MB = 5;

export function Pay() {
  const { packageKey } = useParams<{ packageKey: string }>();
  const nav = useNavigate();
  const { t } = useT();
  const pkgLabel = usePkgLabel();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [err, setErr] = useState("");

  // Release the object URL when the preview changes or the page unmounts.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api<Catalog>("/api/checks/catalog/"),
  });

  const pkg = catalog.data?.packages.find((p) => p.key === packageKey && p.purchasable);

  const onFile = (f: File | null) => {
    setErr("");
    if (f && !f.type.startsWith("image/")) {
      setErr(t("common.pickImage"));
      return;
    }
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setErr(t("common.tooBig", { mb: MAX_MB }));
      return;
    }
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!file || !packageKey) throw new Error(t("common.pickImageShort"));
      const fd = new FormData();
      fd.append("package_key", packageKey);
      fd.append("receipt", file);
      return api("/api/payments/", { method: "POST", body: fd });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["status"] });
      nav("/status");
    },
    onError: (e: Error) => setErr(e.message),
  });

  if (catalog.isLoading) return <div className="loading-shimmer" />;
  if (catalog.isError) return <p className="field__error">{catalog.error.message}</p>;
  if (!pkg) {
    return (
      <div className="card">
        <p className="muted">{t("pay.notFound")}</p>
        <Link to="/checks" className="btn btn--secondary">{t("common.back")}</Link>
      </div>
    );
  }
  const available = pkg.ready || pkg.key === "pkg_vip";

  return (
    <div>
      <PageHeader title={`💳 ${pkgLabel(pkg.key, pkg.label)}`} subtitle={t("pay.subtitle")} />
      <div className="card card--glass" style={{ maxWidth: 480 }}>
        <p className="pkg-card__price">{pkg.price.toLocaleString()} {t("common.amd")}</p>
        {!available && <p className="field__error">{t("pay.unavailable")}</p>}
        {catalog.data?.card_number ? (
          <p style={{ marginTop: "1rem" }}>
            {t("common.card")}: <code className="check-preview" style={{ display: "inline", padding: "0.2rem 0.5rem" }}>{catalog.data.card_number}</code>
          </p>
        ) : (
          <p className="field__hint"><Link to="/help">{t("pay.noCard")}</Link></p>
        )}
        <div className="field">
          <span className="field__label">{t("common.receipt", { mb: MAX_MB })}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => onFile(e.target.files?.[0] || null)} />
        </div>
        {previewUrl && <img className="receipt-preview" src={previewUrl} alt={t("pay.preview")} />}
        {err && <p className="field__error">{err}</p>}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button type="button" disabled={submit.isPending || !file || !available} onClick={() => submit.mutate()}>
            {submit.isPending ? t("common.sending") : t("common.send")}
          </button>
          <Link to="/checks" className="btn btn--secondary">{t("common.back")}</Link>
        </div>
        {catalog.data?.disclaimer && (
          <p className="field__hint" style={{ marginTop: "1.25rem" }}>{t("pkg.disclaimer")}</p>
        )}
      </div>
    </div>
  );
}
