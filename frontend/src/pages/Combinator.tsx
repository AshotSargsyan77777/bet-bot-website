import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type Paginated } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { CheckPreview } from "../components/stats/CheckPreview";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useT, usePkgLabel, type Key } from "../i18n";

const LEGS_KEY = "combinator.legs";

/** The chosen number of matches is remembered in this browser (page reloads, coming back after paying). */
function savedLegs(): string {
  try {
    return localStorage.getItem(LEGS_KEY) || "3";
  } catch {
    return "3";
  }
}

type Tier = { key: string; label: string; price: number; min: number; max: number };
type PoolInfo = {
  count: number;
  fixtures: number; // matches available today = the most matches a variant can have
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
const statusKey: Record<ComboOrder["status"], Key> = {
  pending: "payStatus.pending",
  paid: "payStatus.paid",
  rejected: "payStatus.rejected",
};
const short = (key: string) => key.replace("combo_", "");

function BuyBox({ tier, cardNumber, onDone }: { tier: Tier; cardNumber: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const { t } = useT();
  const x = short(tier.key);
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
      <h3>{t("comb.buyTitle", { x })}</h3>
      <p className="pkg-card__price">{tier.price.toLocaleString()} {t("common.amd")}</p>
      <p className="muted">{t("comb.buyText", { x })}</p>
      {cardNumber && (
        <p>
          {t("common.card")}: <code className="check-preview" style={{ display: "inline", padding: "0.2rem 0.5rem" }}>{cardNumber}</code>
        </p>
      )}
      <div className="field">
        <span className="field__label">{t("common.receipt", { mb: MAX_MB })}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setErr(f && f.size > MAX_MB * 1024 * 1024 ? t("common.tooBig", { mb: MAX_MB }) : "");
            setFile(f);
          }}
        />
      </div>
      {err && <p className="field__error">{err}</p>}
      <button type="button" disabled={!file || buy.isPending || !!err} onClick={() => buy.mutate()}>
        {buy.isPending ? t("common.sending") : t("comb.sendForApproval")}
      </button>
    </div>
  );
}

export function Combinator() {
  const qc = useQueryClient();
  const { t } = useT();
  const pkgLabel = usePkgLabel();
  const pool = useQuery({ queryKey: ["combinator-pool"], queryFn: () => api<PoolInfo>("/api/combinator/pool/") });
  const orders = useQuery({
    queryKey: ["combo-orders"],
    queryFn: () => api<Paginated<ComboOrder>>("/api/combinator/orders/?page_size=20"),
  });

  const [tierKey, setTierKey] = useState("combo_x10");
  const [maxLegs, setMaxLegs] = useState(savedLegs);
  const maxFixtures = pool.data?.fixtures ?? 0;
  const debouncedLegs = useDebouncedValue(maxLegs, 500);
  const [formError, setFormError] = useState("");

  const tiers = pool.data?.tiers ?? [];
  const tier = tiers.find((tr) => tr.key === tierKey);

  const search = useMutation({
    mutationFn: (p: { tier: string; legs: number }) =>
      api<SearchResponse>("/api/combinator/search/", { method: "POST", json: { tier: p.tier, legs: p.legs } }),
  });

  const run = (key = tierKey, legsS = maxLegs) => {
    const legs = parseInt(legsS, 10);
    const err =
      !Number.isFinite(legs) || legs < 1 || (maxFixtures > 0 && legs > maxFixtures)
        ? t("comb.legsError", { max: maxFixtures || 1 })
        : "";
    setFormError(err);
    if (!err) search.mutate({ tier: key, legs });
  };

  const searchedLegs = search.variables?.legs;
  // After the number of matches changes, search again (variants for the old number must not stay on screen).
  useEffect(() => {
    try {
      localStorage.setItem(LEGS_KEY, debouncedLegs);
    } catch {
      // not remembered (private mode); the search still works
    }
    if (search.variables && String(search.variables.legs) !== debouncedLegs) run(search.variables.tier, debouncedLegs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the number of matches settles
  }, [debouncedLegs]);

  // results are shown only for the number currently in the field
  const data = searchedLegs != null && String(searchedLegs) === maxLegs.trim() ? search.data : undefined;
  const results = data?.results ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Goalking"
        title={t("comb.title")}
        subtitle={t("comb.subtitle")}
      />
      <div className="card card--glass">
        <p>
          {t("comb.picks")} <strong className="gradient-text">{pool.isLoading ? "…" : pool.data?.count ?? 0}</strong>
          {pool.data?.is_admin && <span className="chip" style={{ marginLeft: "0.5rem" }}>{t("common.adminFree")}</span>}
        </p>
        {pool.isError && <p className="field__error">{pool.error.message}</p>}
        {pool.data && pool.data.count === 0 && (
          <p className="field__hint">{t("comb.notReady")}</p>
        )}
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", margin: "1rem 0" }}>
          {tiers.map((tr) => {
            const open = pool.data?.unlocked.includes(tr.key);
            const pending = pool.data?.pending.includes(tr.key);
            return (
              <button
                key={tr.key}
                type="button"
                className={tierKey === tr.key ? "" : "secondary"}
                disabled={search.isPending}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem", padding: "0.9rem" }}
                onClick={() => {
                  setTierKey(tr.key);
                  run(tr.key, maxLegs);
                }}
              >
                <strong style={{ fontSize: "1.3rem" }}>{short(tr.key)}</strong>
                <span>{open ? t("comb.unlocked") : pending ? t("comb.pendingShort") : `${tr.price.toLocaleString()} ${t("common.amdShort")}`}</span>
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
              <span className="field__label">{t("comb.maxGames")}</span>
              <input type="number" min={1} max={maxFixtures || undefined} value={maxLegs} onChange={(e) => setMaxLegs(e.target.value)} />
              {maxFixtures > 0 && <span className="field__hint">{t("comb.fixturesToday", { n: maxFixtures })}</span>}
            </div>
          </div>
          <div className="filters-toolbar" style={{ marginTop: "1rem" }}>
            <button type="submit" disabled={search.isPending || !tier}>
              {search.isPending ? t("comb.searching") : t("comb.show", { x: tier ? short(tier.key) : "" })}
            </button>
            {tier && <span className="filters-count">{t("comb.odds", { min: tier.min, max: tier.max })}</span>}
          </div>
        </form>
        {formError && <p className="field__error">{formError}</p>}
        {search.isError && <p className="field__error">{search.error.message}</p>}
        {data && results.length === 0 && (
          <p className="field__hint">{t("comb.none")}</p>
        )}
        {data && results.length > 0 && (
          <p>
            {t("comb.found", { n: results.length, x: short(data.tier), legs: searchedLegs ?? "" })}
            {data.unlocked ? t("comb.pickAny") : ""}
          </p>
        )}
      </div>

      {data && !data.unlocked && results.length > 0 && (
        data.pending ? (
          <div className="card">
            <p>{t("comb.pendingLong")}</p>
          </div>
        ) : (
          tiers.find((tr) => tr.key === data.tier) && (
            <BuyBox
              tier={tiers.find((tr) => tr.key === data.tier)!}
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
            <span className="muted">{t("comb.variant", { n: i + 1 })}</span>
            <span className="combo-result__odds">{Number(v.combined_odds).toFixed(2)}x</span>
            <span className="muted">{t("comb.games", { n: v.legs_count })}</span>
            {v.hit_chance != null && <span className="chip chip--win">{t("comb.chance", { n: Math.round(v.hit_chance * 100) })}</span>}
          </header>
          {v.body_text ? (
            <CheckPreview text={v.body_text} />
          ) : (
            <p className="muted" style={{ marginTop: "0.5rem" }}>{t("comb.locked")}</p>
          )}
        </article>
      ))}

      <div className="card">
        <h3>{t("comb.purchases")}</h3>
        {orders.isError && <p className="field__error">{orders.error.message}</p>}
        {orders.data && !orders.data.results.length && <p className="muted">{t("comb.noPurchases")}</p>}
        {orders.data?.results.map((o) => (
          <div key={o.id} className="combo-result">
            <p>
              <strong>{pkgLabel(o.tier, o.label)}</strong> · {o.valid_date || new Date(o.created_at).toLocaleDateString()} · {t(statusKey[o.status])}
            </p>
            {o.status === "paid" && o.body_text && <CheckPreview text={o.body_text} />}
          </div>
        ))}
      </div>
    </div>
  );
}
