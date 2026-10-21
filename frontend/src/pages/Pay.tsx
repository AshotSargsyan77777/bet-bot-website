import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import type { Catalog } from "../types/catalog";

const MAX_MB = 5;

export function Pay() {
  const { packageKey } = useParams<{ packageKey: string }>();
  const nav = useNavigate();
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
      setErr("Ընտրեք նկար (JPEG, PNG, WEBP)");
      return;
    }
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setErr(`Նկարը չափազանց մեծ է (max ${MAX_MB} MB)`);
      return;
    }
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!file || !packageKey) throw new Error("Ընտրեք նկար");
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
        <p className="muted">Փաթեթը չի գտնվել</p>
        <Link to="/checks" className="btn btn--secondary">Հետ</Link>
      </div>
    );
  }
  const available = pkg.ready || pkg.key === "pkg_vip";

  return (
    <div>
      <PageHeader title={`💳 ${pkg.label}`} subtitle="Ուղարկեք կտրոնի նկարը հաստատման համար" />
      <div className="card card--glass" style={{ maxWidth: 480 }}>
        <p className="pkg-card__price">{pkg.price.toLocaleString()} դրամ</p>
        {!available && <p className="field__error">Այս փաթեթի չեկը այսօր հասանելի չէ</p>}
        {catalog.data?.card_number ? (
          <p style={{ marginTop: "1rem" }}>
            Քարտ: <code className="check-preview" style={{ display: "inline", padding: "0.2rem 0.5rem" }}>{catalog.data.card_number}</code>
          </p>
        ) : (
          <p className="field__hint">Քարտի համարը դեռ նշված չէ — կապվեք <Link to="/help">support</Link>-ի հետ։</p>
        )}
        <div className="field">
          <span className="field__label">Կտրոնի նկար (max {MAX_MB} MB)</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => onFile(e.target.files?.[0] || null)} />
        </div>
        {previewUrl && <img className="receipt-preview" src={previewUrl} alt="Նախադիտում" />}
        {err && <p className="field__error">{err}</p>}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button type="button" disabled={submit.isPending || !file || !available} onClick={() => submit.mutate()}>
            {submit.isPending ? "Ուղարկվում է…" : "Ուղարկել"}
          </button>
          <Link to="/checks" className="btn btn--secondary">Հետ</Link>
        </div>
        {catalog.data?.disclaimer && (
          <p className="field__hint" style={{ marginTop: "1.25rem" }}>{catalog.data.disclaimer}</p>
        )}
      </div>
    </div>
  );
}
