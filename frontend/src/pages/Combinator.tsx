import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Paginated } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { CheckPreview } from "../components/stats/CheckPreview";

type Tier = { key: string; label: string; price: number; min: number; max: number; upto: number };
type PoolInfo = { count: number; tiers: Tier[]; card_number: string };
type Offer = { token: string; combined_odds: number; legs_count: number; hit_chance: number | null; tier: string; price: number };
type SearchResponse = { results: Offer[]; pool_size: number; timed_out: boolean };
type ComboOrder = {
  id: number;
  label: string;
  price: number;
  combined_odds: string;
  hit_chance: number | null;
  legs_count: number;
  body_text: string;
  status: "pending" | "paid" | "rejected";
  created_at: string;
};

const MAX_MB = 5;
const statusText: Record<ComboOrder["status"], string> = {
  pending: "⏳ Սպասում է հաստատման",
  paid: "✅ Վճարված",
  rejected: "❌ Մերժված",
};

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function tierFor(tiers: Tier[], max: number | null): Tier | undefined {
  if (max == null) return undefined;
  return tiers.find((t) => max <= t.upto);
}

function BuyBox({ offer, cardNumber, onDone }: { offer: Offer; cardNumber: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const buy = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("token", offer.token);
      fd.append("receipt", file as File);
      return api<ComboOrder>("/api/combinator/orders/", { method: "POST", body: fd });
    },
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <div style={{ marginTop: "0.75rem" }}>
      <p className="pkg-card__price">{offer.price.toLocaleString()} դրամ</p>
      {cardNumber && (
        <p>
          Քարտ: <code className="check-preview" style={{ display: "inline", padding: "0.2rem 0.5rem" }}>{cardNumber}</code>
        </p>
      )}
      <div className="field">
        <span className="field__label">Կտրոնի նկար (max {MAX_MB} MB)</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setErr(f && f.size > MAX_MB * 1024 * 1024 ? `Նկարը չափազանց մեծ է (max ${MAX_MB} MB)` : "");
            setFile(f);
          }}
        />
      </div>
      {err && <p className="field__error">{err}</p>}
      <button type="button" disabled={!file || buy.isPending || !!err} onClick={() => buy.mutate()}>
        {buy.isPending ? "Ուղարկվում է…" : "Ուղարկել հաստատման"}
      </button>
    </div>
  );
}

export function Combinator() {
  const qc = useQueryClient();
  const pool = useQuery({ queryKey: ["combinator-pool"], queryFn: () => api<PoolInfo>("/api/combinator/pool/") });
  const orders = useQuery({
    queryKey: ["combo-orders"],
    queryFn: () => api<Paginated<ComboOrder>>("/api/combinator/orders/?page_size=20"),
  });

  const [targetMin, setTargetMin] = useState("9.5");
  const [targetMax, setTargetMax] = useState("10.5");
  const [maxLegs, setMaxLegs] = useState("7");
  const [formError, setFormError] = useState("");
  const [buying, setBuying] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const tiers = pool.data?.tiers ?? [];
  const tier = tierFor(tiers, parseNum(targetMax));

  const search = useMutation({
    mutationFn: (p: { min: number; max: number; legs: number }) =>
      api<SearchResponse>("/api/combinator/search/", {
        method: "POST",
        json: { target_odds_min: p.min, target_odds_max: p.max, max_legs: p.legs },
      }),
    onMutate: () => {
      setBuying(null);
      setSent(false);
    },
  });

  const run = (minS = targetMin, maxS = targetMax, legsS = maxLegs) => {
    const min = parseNum(minS);
    const max = parseNum(maxS);
    const legs = parseInt(legsS, 10);
    let err = "";
    if (min == null || max == null || !Number.isFinite(legs)) err = "Լրացրեք բոլոր դաշտերը թվերով";
    else if (min < 1.5 || min > max) err = "Գործակցի «սկսած»-ը պետք է լինի ≥ 1.5 և ≤ «մինչև»-ից";
    else if (max > 21) err = "Ընդհանուր գործակիցը՝ առավելագույնը 21";
    else if (legs < 2 || legs > 12) err = "Խաղերի քանակը՝ 2-ից 12";
    setFormError(err);
    if (!err) search.mutate({ min: min!, max: max!, legs });
  };

  const results = search.data?.results ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="VIP"
        title="🎯 Կոնստրուկտոր չեկի"
        subtitle="Ընտրեք ցանկալի գործակիցը. կայքը կկազմի տարբերակներ օրվա վերլուծված խաղերից։ Խաղերը բացվում են վճարումից հետո։"
      />
      <div className="card card--glass">
        <p>
          Այսօրվա ընտրանքներ: <strong className="gradient-text">{pool.isLoading ? "…" : pool.data?.count ?? 0}</strong>
        </p>
        {pool.isError && <p className="field__error">{pool.error.message}</p>}
        {pool.data && pool.data.count === 0 && (
          <p className="field__hint">Այսօրվա ընտրանքները դեռ պատրաստ չեն — կոմբինացիաները հասանելի կլինեն չեկերի թարմացումից հետո։</p>
        )}
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", margin: "1rem 0" }}>
          {tiers.map((t) => {
            const active = tier?.key === t.key;
            return (
              <button
                key={t.key}
                type="button"
                className={active ? "" : "secondary"}
                disabled={search.isPending}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem", padding: "0.9rem" }}
                onClick={() => {
                  setTargetMin(String(t.min));
                  setTargetMax(String(t.max));
                  run(String(t.min), String(t.max), maxLegs);
                }}
              >
                <strong style={{ fontSize: "1.3rem" }}>{t.key.replace("combo_", "")}</strong>
                <span>{t.price.toLocaleString()} դր.</span>
              </button>
            );
          })}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", alignItems: "end" }}>
            <div className="field">
              <span className="field__label">Գործակից՝ սկսած</span>
              <input type="text" inputMode="decimal" value={targetMin} onChange={(e) => setTargetMin(e.target.value)} />
            </div>
            <div className="field">
              <span className="field__label">Գործակից՝ մինչև</span>
              <input type="text" inputMode="decimal" value={targetMax} onChange={(e) => setTargetMax(e.target.value)} />
            </div>
            <div className="field">
              <span className="field__label">Մինչև քանի խաղ</span>
              <input type="number" min={2} max={12} value={maxLegs} onChange={(e) => setMaxLegs(e.target.value)} />
            </div>
          </div>
          <div className="filters-toolbar" style={{ marginTop: "1rem" }}>
            <button type="submit" disabled={search.isPending}>{search.isPending ? "Որոնում…" : "Կազմել տարբերակներ"}</button>
            {tier && <span className="filters-count">Գինը՝ {tier.price.toLocaleString()} դրամ</span>}
          </div>
        </form>
        {formError && <p className="field__error">{formError}</p>}
        {search.isError && <p className="field__error">{search.error.message}</p>}
        {search.data && results.length === 0 && (
          <p className="field__hint">Տարբերակներ չգտնվեցին։ Փորձեք այլ գործակից կամ ավելացրեք խաղերի քանակը։</p>
        )}
        {sent && <p>✅ Կտրոնն ուղարկվեց։ Ադմինի հաստատումից հետո չեկը կբացվի ներքևում և կգա Telegram-ով։</p>}
      </div>

      {results.map((o, i) => (
        <article key={o.token} className="combo-result combo-card">
          <header className="combo-card__head" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <span className="muted">#{i + 1}</span>
            <span className="combo-result__odds">{Number(o.combined_odds).toFixed(2)}x</span>
            <span className="muted">{o.legs_count} խաղ</span>
            {o.hit_chance != null && <span className="chip chip--win">Հավանականություն ~{Math.round(o.hit_chance * 100)}%</span>}
            <span className="chip">{o.price.toLocaleString()} դր.</span>
          </header>
          <p className="muted" style={{ marginTop: "0.5rem" }}>🔒 Խաղերը կբացվեն վճարման հաստատումից հետո</p>
          {buying === o.token ? (
            <BuyBox
              offer={o}
              cardNumber={pool.data?.card_number ?? ""}
              onDone={() => {
                setBuying(null);
                setSent(true);
                search.reset();
                qc.invalidateQueries({ queryKey: ["combo-orders"] });
              }}
            />
          ) : (
            <button type="button" style={{ marginTop: "0.5rem" }} onClick={() => setBuying(o.token)}>
              Գնել — {o.price.toLocaleString()} դր.
            </button>
          )}
        </article>
      ))}

      <div className="card">
        <h3>Իմ կոմբինացիաները</h3>
        {orders.isError && <p className="field__error">{orders.error.message}</p>}
        {orders.data && !orders.data.results.length && <p className="muted">Դեռ գնումներ չկան</p>}
        {orders.data?.results.map((o) => (
          <div key={o.id} className="combo-result">
            <p>
              <strong>{o.label}</strong> · {Number(o.combined_odds).toFixed(2)}x · {o.legs_count} խաղ ·{" "}
              <span className="muted">{new Date(o.created_at).toLocaleString()}</span> · {statusText[o.status]}
            </p>
            {o.status === "paid" && o.body_text && <CheckPreview text={o.body_text} />}
          </div>
        ))}
      </div>
    </div>
  );
}
