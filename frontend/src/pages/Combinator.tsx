import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { DemoBanner } from "../components/DemoBanner";
import { PageHeader } from "../components/PageHeader";
import { ComboResultCard } from "../components/stats/ComboResultCard";
import { demoCombinatorResults } from "../data/demo";
import type { ComboResult } from "../types/form";
import { filterDemoCombinatorResults } from "../utils/demoCombinatorSearch";

const PRESETS = [
  { label: "x9", min: 8.5, max: 9.5, legs: 9 },
  { label: "x10", min: 9.5, max: 10.5, legs: 10 },
  { label: "x20", min: 18, max: 22, legs: 12 },
];

function parseNum(s: string, fallback: number): number {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function Combinator() {
  const pool = useQuery({
    queryKey: ["combinator-pool"],
    queryFn: () => api<{ count: number }>("/api/combinator/pool/"),
    retry: false,
  });

  const [targetMinStr, setTargetMinStr] = useState("9");
  const [targetMaxStr, setTargetMaxStr] = useState("10");
  const [legsStr, setLegsStr] = useState("10");
  const [legMinStr, setLegMinStr] = useState("1.1");
  const [legMaxStr, setLegMaxStr] = useState("1.5");
  const [results, setResults] = useState<ComboResult[]>(demoCombinatorResults);
  const [searchError, setSearchError] = useState("");
  const [usedDemo, setUsedDemo] = useState(true);

  const search = useMutation({
    mutationFn: async () => {
      const targetMin = parseNum(targetMinStr, 9);
      const targetMax = parseNum(targetMaxStr, 10);
      const legs = parseInt(legsStr, 10) || 10;
      return api<{ results: ComboResult[] }>("/api/combinator/search/", {
        method: "POST",
        json: {
          target_odds_min: targetMin,
          target_odds_max: targetMax,
          legs_count: legs,
          leg_odds_min: parseNum(legMinStr, 1.1),
          leg_odds_max: parseNum(legMaxStr, 1.5),
          max_results: 10,
        },
      });
    },
    onSuccess: (data) => {
      setSearchError("");
      setUsedDemo(false);
      if (data.results?.length) {
        setResults(data.results);
      } else {
        runDemoSearch();
        setSearchError("API-ն ոչինչ չգտավ — ցուցադրվում է demo արդյունք։");
      }
    },
    onError: () => {
      runDemoSearch();
      setSearchError("Որոնումը demo ռեժիմում (մուտք/API պարտադիր չէ)։");
    },
  });

  const runDemoSearch = () => {
    const targetMin = parseNum(targetMinStr, 9);
    const targetMax = parseNum(targetMaxStr, 10);
    const legs = parseInt(legsStr, 10) || 10;
    const filtered = filterDemoCombinatorResults(targetMin, targetMax, legs);
    setResults(filtered.length ? filtered : demoCombinatorResults);
    setUsedDemo(true);
  };

  const poolCount = pool.data?.count ?? 0;
  const showDemo = pool.isError || poolCount < 3;

  return (
    <div>
      <PageHeader
        eyebrow="Հավելվածներ"
        title="🎯 Կոնստրուկտոր չեկի"
        subtitle="Պրեսետներն աշխատում են անմիջապես — կարող եք նաև փորձել API որոնումը։"
      />
      {showDemo && <DemoBanner />}
      <div className="card card--glass">
        <p>
          Թեկուկներից հավելված: <strong className="gradient-text">{pool.isError ? "demo" : poolCount}</strong>
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="secondary"
              onClick={() => {
                setTargetMinStr(String(p.min));
                setTargetMaxStr(String(p.max));
                setLegsStr(String(p.legs));
                setTimeout(runDemoSearch, 0);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="filters">
          <div className="field">
            <span className="field__label">Min ընդհանուր кф</span>
            <input type="text" inputMode="decimal" value={targetMinStr} onChange={(e) => setTargetMinStr(e.target.value)} />
          </div>
          <div className="field">
            <span className="field__label">Max ընդհանուր кф</span>
            <input type="text" inputMode="decimal" value={targetMaxStr} onChange={(e) => setTargetMaxStr(e.target.value)} />
          </div>
          <div className="field">
            <span className="field__label">Ողներ</span>
            <input type="text" inputMode="numeric" value={legsStr} onChange={(e) => setLegsStr(e.target.value)} />
          </div>
          <div className="field">
            <span className="field__label">Min кф (ոգ)</span>
            <input type="text" inputMode="decimal" value={legMinStr} onChange={(e) => setLegMinStr(e.target.value)} />
          </div>
          <div className="field">
            <span className="field__label">Max кф (ոգ)</span>
            <input type="text" inputMode="decimal" value={legMaxStr} onChange={(e) => setLegMaxStr(e.target.value)} />
          </div>
        </div>
        <div className="filters-toolbar">
          <button type="button" onClick={() => search.mutate()} disabled={search.isPending}>
            {search.isPending ? "Որոնում…" : "Որոնել API-ում"}
          </button>
          <button type="button" className="secondary" onClick={runDemoSearch}>Demo որոնում</button>
        </div>
        {searchError && <p className="field__hint">{searchError}</p>}
        {usedDemo && <p className="field__hint">Ցուցադրվում են հասկանալի քարտեր, ոչ JSON։</p>}
      </div>
      {results.map((r, i) => (
        <ComboResultCard key={i} result={r} index={i} />
      ))}
    </div>
  );
}
