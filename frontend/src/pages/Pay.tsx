import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, getToken } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { demoCatalogPackages } from "../data/demo";

type Catalog = {
  packages: { key: string; label: string; price: number }[];
  card_number: string;
  disclaimer: string;
};

function formatPaymentError(body: unknown): string {
  if (!body || typeof body !== "object") return "Վճարումը չհաջողվեց";
  const o = body as Record<string, unknown>;
  if (typeof o.detail === "string") return o.detail;
  if (Array.isArray(o.package_key)) return String(o.package_key[0]);
  if (typeof o.package_key === "string") return o.package_key;
  if (typeof o.error === "string") return o.error;
  return "Ստուգեք փաթեթը և նկարը";
}

export function Pay() {
  const { packageKey } = useParams<{ packageKey: string }>();
  const nav = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api<Catalog>("/api/checks/catalog/"),
    retry: false,
  });

  const pkg =
    catalog.data?.packages.find((p) => p.key === packageKey) ??
    demoCatalogPackages.find((p) => p.key === packageKey);

  const submit = useMutation({
    mutationFn: async () => {
      if (!file || !packageKey) throw new Error("Ընտրեք նկար");
      const fd = new FormData();
      fd.append("package_key", packageKey);
      fd.append("receipt", file);
      const res = await fetch("/api/payments/", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(formatPaymentError(j));
      }
      return res.json();
    },
    onSuccess: () => nav("/status"),
    onError: (e: Error) => setErr(e.message),
  });

  if (!pkg) return <p className="muted">Փաթեթը չի գտնվել</p>;

  return (
    <div>
      <PageHeader title={`💳 ${pkg.label}`} subtitle="Ուղարկեք կտրոնի նկարը հաստատման համար" />
      <div className="card card--glass" style={{ maxWidth: 480 }}>
        <p className="pkg-card__price">{pkg.price.toLocaleString()} դրամ</p>
        {catalog.data?.card_number && (
          <p style={{ marginTop: "1rem" }}>
            Քարտ: <code className="check-preview" style={{ display: "inline", padding: "0.2rem 0.5rem" }}>{catalog.data.card_number}</code>
          </p>
        )}
        <div className="field">
          <span className="field__label">Կտրոնի նկար</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        {previewUrl && <img className="receipt-preview" src={previewUrl} alt="Նախադիտում" />}
        {err && <p className="field__error">{err}</p>}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button type="button" disabled={submit.isPending || !file} onClick={() => submit.mutate()}>Ուղարկել</button>
          <Link to="/checks" className="btn btn--secondary">Հետ</Link>
        </div>
        {catalog.data?.disclaimer && (
          <p className="field__hint" style={{ marginTop: "1.25rem" }}>{catalog.data.disclaimer}</p>
        )}
      </div>
    </div>
  );
}
