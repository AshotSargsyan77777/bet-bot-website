import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import heroImg from "../assets/hero.png";
import { api } from "../api/client";
import { GameCard } from "../components/GameCard";
import type { GamesResponse } from "../types/game";
import type { Catalog } from "../types/catalog";

type Summary = {
  today: string;
  checks_date: string | null;
  ready_packages: number;
  total_packages: number;
  games_today: number;
  live_games: number;
  games_provider_configured: boolean;
};

/** Illustrates the format of a check (static marketing example, not a real pick). */
const SAMPLE_CHECK_FORMAT = `⚽ GOALKING ՉԵԿ
🎯 Ընդհանուր գործակից՝ 3.12x
━━━━━━━━━━━━━━

1️⃣ 🏟 Թիմ A - Թիմ B
🏆 Թիմ A (Home Win)
💰 Գործակից՝ 1.60
💡 Թիմ A-ն վերջին խաղերում ավելի լավ ձևի մեջ է։

2️⃣ 🏟 Թիմ C - Թիմ D
🥅 Both Teams To Score — Yes
💰 Գործակից՝ 1.95

━━━━━━━━━━━━━━`;

export function Home() {
  const summary = useQuery({
    queryKey: ["summary"],
    queryFn: () => api<Summary>("/api/summary/"),
    refetchInterval: 120000,
  });
  const games = useQuery({
    queryKey: ["home-games"],
    queryFn: () => api<GamesResponse>("/api/games/?page_size=6"),
    refetchInterval: 120000,
  });
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api<Catalog>("/api/checks/catalog/"),
  });

  const gameList = games.data?.results ?? [];
  const readyPkgs = (catalog.data?.packages ?? []).filter((p) => p.ready && p.key !== "pkg_vip");
  const s = summary.data;
  const stats = [
    { label: "Պատրաստ չեկեր այսօր", value: s ? `${s.ready_packages}/${s.total_packages}` : "—" },
    { label: "Այսօրվա խաղեր", value: s ? String(s.games_today) : "—" },
    { label: "Live հիմա", value: s ? String(s.live_games) : "—" },
    { label: "Չեկերի ամսաթիվ", value: s?.checks_date ?? "—" },
  ];

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero__bg" style={{ backgroundImage: `url(${heroImg})` }} aria-hidden />
        <div className="hero__mesh" aria-hidden />
        <div className="hero__content">
          <p className="page-header__eyebrow animate-fade-in">Goalking{s?.today ? ` · ${s.today.slice(0, 4)}` : ""}</p>
          <h1 className="hero__title animate-fade-in animate-delay-1">
            Օրվա <span className="gradient-text">չեկերը</span> և live վիճակագրություն
          </h1>
          <p className="hero__lead animate-fade-in animate-delay-2">
            Վերջին 5 խաղի ֆորմա, API-Football թարմացումներ, կոնստրուկտոր x5–x20 — ամենը մեկ սև թեմայի
            ինտերֆեյսում։
          </p>
          <div className="hero__actions animate-fade-in animate-delay-3">
            <Link to="/checks" className="btn btn--lg">📊 Օրվա չեկերը</Link>
            <Link to="/games" className="btn btn--lg btn--ghost">⚽ Խաղեր</Link>
            <Link to="/combinator" className="btn btn--secondary btn--lg">🎯 Կոնստրուկտոր</Link>
          </div>
          <div className="card card--glass hero__float-card">
            <h3 style={{ marginTop: 0 }}>Այսօր հասանելի</h3>
            {catalog.isLoading && <div className="loading-shimmer" />}
            {catalog.isError && <p className="field__error">Չհաջողվեց բեռնել փաթեթները</p>}
            {catalog.data && readyPkgs.length === 0 && (
              <p className="muted">Այսօրվա չեկերը դեռ պատրաստ չեն — թարմացվում է ավտոմատ։</p>
            )}
            {readyPkgs.length > 0 && (
              <ul className="match-list">
                {readyPkgs.map((p) => (
                  <li key={p.key}>
                    ✅ {p.label}
                    {p.combined_odds ? <> · <strong>{Number(p.combined_odds).toFixed(2)}x</strong></> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div className="stats-row">
        {stats.map((st) => (
          <div key={st.label} className="stat-tile">
            <div className="stat-tile__value">{st.value}</div>
            <div className="stat-tile__label">{st.label}</div>
          </div>
        ))}
      </div>

      {gameList.length > 0 && (
        <div className="marquee-wrap" aria-hidden>
          <div className="marquee">
            {[...gameList, ...gameList].map((g, i) => (
              <span key={`${g.id}-${i}`} className="marquee__item">
                <strong>{g.score[0] != null ? `${g.score[0]}:${g.score[1]}` : "—"}</strong> {g.home} vs {g.away}
              </span>
            ))}
          </div>
        </div>
      )}

      <section className="section">
        <h2 className="section__title">Ինչու Goalking</h2>
        <p className="section__desc">Ֆունկցիոնալը նույնն է, ինչ Telegram-բոտում — այժմ վեբում, ավելի հարուստ վիզուալով։</p>
        <div className="features">
          <article className="feature-card">
            <div className="feature-card__icon">📊</div>
            <h3>Օրվա փաթեթներ</h3>
            <p>x3, x5, x10, x20 և Champions League — n8n-ից ավտոմատ թարմացում։</p>
          </article>
          <article className="feature-card">
            <div className="feature-card__icon">📈</div>
            <h3>Ձև L5</h3>
            <p>Տուն / հյուր, % հաղթանակ, գոլեր, BTTS — ֆիլտրերով ցուցակ։</p>
          </article>
          <article className="feature-card">
            <div className="feature-card__icon">🎯</div>
            <h3>Կոնստրուկտոր</h3>
            <p>Ընդհանուր кф 5–20, min/max յուրաքանչյուր ողի — ավտոմատ կոմբինացիաներ։</p>
          </article>
          <article className="feature-card">
            <div className="feature-card__icon">👑</div>
            <h3>VIP &amp; պրոմո</h3>
            <p>Վճարում քարտով, պրոմոկոդ, ադմին հաստատում — ինչպես բոտում։</p>
          </article>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Live &amp; առաջիկա խաղեր</h2>
        <p className="section__desc">Այսօրվա խաղերը API-Football-ից՝ վերջին 5 խաղի ձևով։</p>
        {games.isLoading && <div className="loading-shimmer" />}
        {games.isError && <p className="field__error">Չհաջողվեց բեռնել խաղերը</p>}
        {games.data && gameList.length === 0 && (
          <p className="muted">
            {games.data.provider_configured
              ? "Այսօր խաղեր դեռ չկան։"
              : "Խաղերի տվյալները դեռ միացված չեն (API-Football)։"}
          </p>
        )}
        <div className="games-grid">
          {gameList.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
        <p style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <Link to="/games" className="btn">Բոլոր խաղերը →</Link>
        </p>
      </section>

      <section className="section check-preview">
        <div>
          <h2 className="section__title">Չեկի ձևաչափը</h2>
          <p className="section__desc">Հայերեն բացատրություններով, ինչպես n8n-ից գալիս է բոտին։ Ներքևում՝ ձևաչափի օրինակ։</p>
          <Link to="/checks" className="btn">Դիտել կատալոգը</Link>
        </div>
        <pre className="pre">{SAMPLE_CHECK_FORMAT}</pre>
      </section>

      <section className="section">
        <h2 className="section__title">Կոնստրուկտոր</h2>
        <p className="section__desc">
          VIP անդամները կարող են կառուցել սեփական կոմբինացիաները օրվա ընտրանքներից՝ ըստ ցանկալի ընդհանուր
          գործակցի և ողների քանակի։
        </p>
        <Link to="/combinator" className="btn" style={{ marginTop: "1rem" }}>Բացել կոնստրուկտորը</Link>
      </section>

      <div className="cta-band">
        <h2>Պատրա՞ստ եք սկսելու</h2>
        <p className="muted">Գրանցվեք, ընտրեք փաթեթը և ստացեք օրվա չեկը հաստատումից հետո։</p>
        <Link to="/login" className="btn btn--lg" style={{ marginTop: "1rem", display: "inline-block" }}>
          Մուտք / գրանցում
        </Link>
      </div>
    </div>
  );
}
