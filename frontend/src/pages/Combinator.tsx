import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { ComboResultCard } from "../components/stats/ComboResultCard";
import type { ComboResult } from "../types/form";

// Խաղերի քանակը ընտրված է այնպես, որ միջին գործակիցը մնա ~1.3–1.4 (ավելի հավանական ընտրանքներ)
const PRESETS = [
  { label: "x5", min: 4.8, max: 5.3, legs: 5 },
  { label: "x10", min: 9.5, max: 10.5, legs: 7 },
  { label: "x15", min: 14.3, max: 15.8, legs: 8 },
  { label: "x20", min: 19, max: 21, legs: 9 },
];

type SearchParams = { targetMin: string; targetMax: string; legs: string; legMin: string; legMax: string };
type SearchResponse = { results: ComboResult[]; candidates_used: number; timed_out: boolean; pool_size: number };

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function validate(p: SearchParams): string | null {
  const tMin = parseNum(p.targetMin);
  const tMax = parseNum(p.targetMax);
  const lMin = parseNum(p.legMin);
  const lMax = parseNum(p.legMax);
  const legs = parseInt(p.legs, 10);
  if (tMin == null || tMax == null || lMin == null || lMax == null || !Number.isFinite(legs)) {
    return "Լրացրեք բոլոր դաշտերը թվերով";
  }
  if (tMin < 1.01 || tMin > tMax) return "Ընդհանուր գործակցի «սկսած»-ը պետք է լինի ≥ 1.01 և ≤ «մինչև»-ից";
  if (lMin < 1 || lMin > lMax) return "Մեկ խաղի գործակցի «սկսած»-ը պետք է լինի ≥ 1 և ≤ «մինչև»-ից";
  if (legs < 1 || legs > 20) return "Խաղերի քանակը՝ 1-ից 20";
  return null;
}

export function Combinator() {
  const pool = useQuery({
    queryKey: ["combinator-pool"],
    queryFn: () => api<{ count: number }>("/api/combinator/pool/"),
  });

  const [form, setForm] = useState<SearchParams>({
    targetMin: "9.5",
    targetMax: "10.5",
    legs: "7",
    legMin: "1.1",
    legMax: "1.5",
  });
  const [formError, setFormError] = useState("");

  const search = useMutation({
    mutationFn: (p: SearchParams) =>
      api<SearchResponse>("/api/combinator/search/", {
        method: "POST",
        json: {
          target_odds_min: parseNum(p.targetMin),
          target_odds_max: parseNum(p.targetMax),
          legs_count: parseInt(p.legs, 10),
          leg_odds_min: parseNum(p.legMin),
          leg_odds_max: parseNum(p.legMax),
          max_results: 10,
        },
      }),
  });

  const run = (p: SearchParams) => {
    const err = validate(p);
    setFormError(err ?? "");
    if (!err) search.mutate(p);
  };

  const set = (key: keyof SearchParams) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const poolCount = pool.data?.count ?? 0;
  const results = search.data?.results ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Հավելվածներ"
        title="🎯 Կոնստրուկտոր չեկի"
        subtitle="Ընտրեք պատրաստի տարբերակ կամ նշեք ցանկալի ընդհանուր գործակիցը և չեկում խաղերի քանակը։"
      />
      <div className="card card--glass">
        <p>
          Այսօրվա ընտրանքներ: <strong className="gradient-text">{pool.isLoading ? "…" : poolCount}</strong>
        </p>
        {pool.isError && <p className="field__error">{pool.error.message}</p>}
        {pool.data && poolCount === 0 && (
          <p className="field__hint">Այսօրվա ընտրանքները դեռ պատրաստ չեն — կոմբինացիաները հասանելի կլինեն չեկերի թարմացումից հետո։</p>
        )}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="secondary"
              disabled={search.isPending}
              onClick={() => {
                const next = { ...form, targetMin: String(p.min), targetMax: String(p.max), legs: String(p.legs) };
                setForm(next);
                run(next);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(form);
          }}
        >
          <div className="filters">
            <div className="field">
              <span className="field__label">Ընդհանուր գործակից՝ սկսած</span>
              <input type="text" inputMode="decimal" value={form.targetMin} onChange={set("targetMin")} />
            </div>
            <div className="field">
              <span className="field__label">Ընդհանուր գործակից՝ մինչև</span>
              <input type="text" inputMode="decimal" value={form.targetMax} onChange={set("targetMax")} />
            </div>
            <div className="field">
              <span className="field__label">Խաղերի քանակ չեկում</span>
              <input type="text" inputMode="numeric" value={form.legs} onChange={set("legs")} />
            </div>
            <div className="field">
              <span className="field__label">Մեկ խաղի գործակից՝ սկսած</span>
              <input type="text" inputMode="decimal" value={form.legMin} onChange={set("legMin")} />
            </div>
            <div className="field">
              <span className="field__label">Մեկ խաղի գործակից՝ մինչև</span>
              <input type="text" inputMode="decimal" value={form.legMax} onChange={set("legMax")} />
            </div>
          </div>
          <div className="filters-toolbar">
            <button type="submit" disabled={search.isPending}>
              {search.isPending ? "Որոնում…" : "Որոնել"}
            </button>
          </div>
        </form>
        {formError && <p className="field__error">{formError}</p>}
        {search.isError && <p className="field__error">{search.error.message}</p>}
        {search.data && results.length === 0 && (
          <p className="field__hint">
            Կոմբինացիաներ չգտնվեցին ({search.data.candidates_used} ընտրանքից)։ Փորձեք լայնացնել գործակիցների միջակայքը կամ
            փոքրացնել խաղերի քանակը։
          </p>
        )}
        {search.data?.timed_out && <p className="field__hint">Որոնումը կանգնեցվեց ժամանակի սահմանափակման պատճառով — ցուցադրվում են գտնվածները։</p>}
      </div>
      {results.map((r, i) => (
        <ComboResultCard key={i} result={r} index={i} />
      ))}
    </div>
  );
}
