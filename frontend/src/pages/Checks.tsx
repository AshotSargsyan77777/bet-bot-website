import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { DemoBanner } from "../components/DemoBanner";
import { PageHeader } from "../components/PageHeader";
import { CheckPreview } from "../components/stats/CheckPreview";
import { demoCatalogPackages, demoCheckPreview } from "../data/demo";
import { useAuth } from "../context/AuthContext";

type Catalog = {
  packages: { key: string; label: string; price: number; ready: boolean; purchasable: boolean }[];
  checks_date: string | null;
  disclaimer: string;
  card_number: string;
};

type Mine = { active: boolean; text?: string; package_key?: string };

type DisplayPkg = (typeof demoCatalogPackages)[0] & { key: string; label: string; price: number; ready: boolean; purchasable: boolean };

function mergeCatalog(api?: Catalog): { packages: DisplayPkg[]; showDemo: boolean; checks_date: string | null; disclaimer: string } {
  const apiPkgs = api?.packages ?? [];
  const readyCount = apiPkgs.filter((p) => p.ready).length;
  const showDemo = apiPkgs.length === 0 || readyCount < 2;
  if (!showDemo) {
    return {
      packages: apiPkgs.map((p) => {
        const meta = demoCatalogPackages.find((d) => d.key === p.key);
        return { ...p, ...meta, key: p.key, label: p.label, price: p.price, ready: p.ready, purchasable: p.purchasable };
      }) as DisplayPkg[],
      showDemo: false,
      checks_date: api?.checks_date ?? null,
      disclaimer: api?.disclaimer ?? "",
    };
  }
  return {
    packages: demoCatalogPackages as DisplayPkg[],
    showDemo: true,
    checks_date: api?.checks_date ?? new Date().toISOString().slice(0, 10),
    disclaimer: api?.disclaimer ?? "",
  };
}

export function Checks() {
  const { user } = useAuth();
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api<Catalog>("/api/checks/catalog/"),
    retry: false,
  });
  const mine = useQuery({
    queryKey: ["mine-check"],
    queryFn: () => api<Mine>("/api/checks/mine/"),
    enabled: !!user,
  });

  const merged = mergeCatalog(catalog.data);
  const checkText = mine.data?.active && mine.data.text ? mine.data.text : demoCheckPreview;

  if (catalog.isLoading) return <div className="loading-shimmer" />;

  return (
    <div>
      <PageHeader
        eyebrow="Օրվա փաթեթներ"
        title="📊 Օրվա չեկերը"
        subtitle={`Ամսաթիվ: ${merged.checks_date || "—"} · Գնեք կամ մուտքագրեք պրոմո`}
      />
      {merged.showDemo && <DemoBanner />}
      <div className="card card--glass">
        <h3>Ձեր / demo չեկ</h3>
        <CheckPreview text={`${checkText}${merged.disclaimer}`} />
      </div>
      <div className="grid">
        {merged.packages
          .filter((p) => p.purchasable || p.key === "pkg_vip")
          .map((p) => (
            <article
              key={p.key}
              className={`pkg-card card--interactive ${p.tier === "hot" ? "pkg-card--hot" : ""} ${p.tier === "vip" ? "pkg-card--vip" : ""}`}
            >
              <span className="muted" style={{ fontSize: "0.8rem" }}>{p.label}</span>
              <div className="pkg-card__mult">{p.multiplier}</div>
              <div className="pkg-card__price">{p.price ? `${p.price.toLocaleString()} դրամ` : "Անվճար"}</div>
              <p className={`pkg-card__status ${p.ready ? "pkg-card__status--ready" : "pkg-card__status--off"}`}>
                {p.ready ? "✅ Հասանելի" : "⛔ Այսօր հասանելի չէ"}
              </p>
              {user ? (
                <Link
                  to={`/pay/${p.key}`}
                  className="btn"
                  style={{
                    display: "inline-block",
                    pointerEvents: p.ready || p.key === "pkg_vip" ? "auto" : "none",
                    opacity: p.ready || p.key === "pkg_vip" ? 1 : 0.45,
                  }}
                >
                  Գնել
                </Link>
              ) : (
                <Link to="/login" className="btn btn--secondary">Մուտք</Link>
              )}
            </article>
          ))}
      </div>
    </div>
  );
}
