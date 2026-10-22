import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Paginated } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { CheckPreview } from "../components/stats/CheckPreview";

type Tier = { key: string; label: string; price: number; min: number; max: number };
type PoolInfo = {
  count: number;
  tiers: Tier[];
  unlocked: string[];
  pending: string[];
  is_admin: boolean;
  card_number: string;
};
type Variant = { combined_odds: number; legs_count: number; hit_chance: number | null; body_text?: string };
type SearchResponse = {
  tier: string;
  price: number;
  unlocked: boolean;
  pending: boolean;
  results: Variant[];
  pool_size: number;
  timed_out: boolean;
};
type ComboOrder = {
  id: number;
  tier: string;
  label: string;
  price: number;
  valid_date: string;
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
const short = (key: string) => key.replace("combo_", "");

function BuyBox({ tier, cardNumber, onDone }: { tier: Tier; cardNumber: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const buy = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("tier", tier.key);
      fd.append("receipt", file as File);
      return api<ComboOrder>("/api/combinator/orders/", { method: "POST", body: fd });
    },
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <div className="card card--glass">
      <h3>🔒 Բացել այսօրվա բոլոր {short(tier.key)} տարբերակները</h3>
      <p className="pkg-card__price">{tier.price.toLocaleString()} դրամ</p>
      <p className="muted">Վճարումը հաստատվելուց հետո կտեսնեք այսօրվա բոլոր {short(tier.key)} տարբերակները և կընտրեք ցանկացածը։</p>
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

  const [tierKey, setTierKey] = useState("combo_x10");
  const [maxLegs, setMaxLegs] = useState("7");
  const [formError, setFormError] = useState("");

  const tiers = pool.data?.tiers ?? [];
  const tier = tiers.find((t) => t.key === tierKey);

  const search = useMutation({
    mutationFn: (p: { tier: string; legs: number }) =>
      api<SearchResponse>("/api/combinator/search/", { method: "POST", json: { tier: p.tier, max_legs: p.legs } }),
  });

  const run = (key = tierKey, legsS = maxLegs) => {
    const legs = parseInt(legsS, 10);
    const err = !Number.isFinite(legs) || legs < 2 || legs > 12 ? "Խաղերի քանակը՝ 2-ից 12" : "";
    setFormError(err);
    if (!err) search.mutate({ tier: key, legs });
  };

  const data = search.data;
  const results = data?.results ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="VIP"
        title="🎯 Կոնստրուկտոր չեկի"
        subtitle="Ընտրեք գործակիցը (x5–x20). վճարելուց հետո բացվում են այսօրվա բոլոր տարբերակները, և դուք ընտրում եք ցանկացածը։"
      />
      <div className="card card--glass">
        <p>
          Այսօրվա ընտրանքներ: <strong className="gradient-text">{pool.isLoading ? "…" : pool.data?.count ?? 0}</strong>
          {pool.data?.is_admin && <span className="chip" style={{ marginLeft: "0.5rem" }}>Ադմին՝ անվճար</span>}
        </p>
        {pool.isError && <p className="field__error">{pool.error.message}</p>}
        {pool.data && pool.data.count === 0 && (
          <p className="field__hint">Այսօրվա ընտրանքները դեռ պատրաստ չեն — կոմբինացիաները հասանելի կլինեն չեկերի թարմացումից հետո։</p>
        )}
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", margin: "1rem 0" }}>
          {tiers.map((t) => {
            const open = pool.data?.unlocked.includes(t.key);
            const pending = pool.data?.pending.includes(t.key);
            return (
              <button
                key={t.key}
                type="button"
                className={tierKey === t.key ? "" : "secondary"}
                disabled={search.isPending}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem", padding: "0.9rem" }}
                onClick={() => {
                  setTierKey(t.key);
                  run(t.key, maxLegs);
                }}
              >
                <strong style={{ fontSize: "1.3rem" }}>{short(t.key)}</strong>
                <span>{open ? "✅ Բացված" : pending ? "⏳ Սպասում" : `${t.price.toLocaleString()} դր.`}</span>
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
              <span className="field__label">Մինչև քանի խաղ</span>
              <input type="number" min={2} max={12} value={maxLegs} onChange={(e) => setMaxLegs(e.target.value)} />
            </div>
          </div>
          <div className="filters-toolbar" style={{ marginTop: "1rem" }}>
            <button type="submit" disabled={search.isPending || !tier}>
              {search.isPending ? "Որոնում…" : `Ցույց տալ ${tier ? short(tier.key) : ""} տարբերակները`}
            </button>
            {tier && <span className="filters-count">Գործակից՝ {tier.min}–{tier.max}</span>}
          </div>
        </form>
        {formError && <p className="field__error">{formError}</p>}
        {search.isError && <p className="field__error">{search.error.message}</p>}
        {data && results.length === 0 && (
          <p className="field__hint">Տարբերակներ չգտնվեցին։ Փորձեք այլ գործակից կամ ավելացրեք խաղերի քանակը։</p>
        )}
        {data && results.length > 0 && (
          <p>
            Գտնվել է <strong>{results.length}</strong> տարբերակ ({short(data.tier)})
            {data.unlocked ? " — ընտրեք ցանկացածը։" : ""}
          </p>
        )}
      </div>

      {data && !data.unlocked && results.length > 0 && (
        data.pending ? (
          <div className="card">
            <p>⏳ Վճարումը սպասում է հաստատման։ Հաստատումից հետո այստեղ կբացվեն բոլոր տարբերակները, և կգա Telegram հաղորդագրություն։</p>
          </div>
        ) : (
          tiers.find((t) => t.key === data.tier) && (
            <BuyBox
              tier={tiers.find((t) => t.key === data.tier)!}
              cardNumber={pool.data?.card_number ?? ""}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["combinator-pool"] });
                qc.invalidateQueries({ queryKey: ["combo-orders"] });
                run(data.tier, maxLegs);
              }}
            />
          )
        )
      )}

      {results.map((v, i) => (
        <article key={i} className="combo-result combo-card">
          <header className="combo-card__head" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <span className="muted">Տարբերակ #{i + 1}</span>
            <span className="combo-result__odds">{Number(v.combined_odds).toFixed(2)}x</span>
            <span className="muted">{v.legs_count} խաղ</span>
            {v.hit_chance != null && <span className="chip chip--win">Հավանականություն ~{Math.round(v.hit_chance * 100)}%</span>}
          </header>
          {v.body_text ? (
            <CheckPreview text={v.body_text} />
          ) : (
            <p className="muted" style={{ marginTop: "0.5rem" }}>🔒 Խաղերը կբացվեն վճարման հաստատումից հետո</p>
          )}
        </article>
      ))}

      <div className="card">
        <h3>Իմ գնումները</h3>
        {orders.isError && <p className="field__error">{orders.error.message}</p>}
        {orders.data && !orders.data.results.length && <p className="muted">Դեռ գնումներ չկան</p>}
        {orders.data?.results.map((o) => (
          <div key={o.id} className="combo-result">
            <p>
              <strong>{o.label}</strong> · {o.valid_date || new Date(o.created_at).toLocaleDateString()} · {statusText[o.status]}
            </p>
            {o.status === "paid" && o.body_text && <CheckPreview text={o.body_text} />}
          </div>
        ))}
      </div>
    </div>
  );
}
