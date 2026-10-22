import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import heroImg from "../assets/hero.png";
import { api } from "../api/client";
import { GameCard } from "../components/GameCard";
import type { GamesResponse } from "../types/game";
import type { Catalog } from "../types/catalog";
import { useT, usePkgLabel } from "../i18n";

type Summary = {
  today: string;
  checks_date: string | null;
  ready_packages: number;
  total_packages: number;
  games_today: number;
  live_games: number;
  games_provider_configured: boolean;
  results_30d?: { won: number; lost: number; settled: number; win_rate: number | null };
};

export function Home() {
  const { t } = useT();
  const pkgLabel = usePkgLabel();
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
    { label: t("home.statReady"), value: s ? `${s.ready_packages}/${s.total_packages}` : "—" },
    { label: t("home.statGames"), value: s ? String(s.games_today) : "—" },
    { label: t("home.statLive"), value: s ? String(s.live_games) : "—" },
    {
      label: t("home.statPast"),
      value: s?.results_30d?.settled ? `${s.results_30d.won}/${s.results_30d.settled}` : "—",
    },
  ];

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero__bg" style={{ backgroundImage: `url(${heroImg})` }} aria-hidden />
        <div className="hero__mesh" aria-hidden />
        <div className="hero__content">
          <p className="page-header__eyebrow animate-fade-in">Goalking{s?.today ? ` · ${s.today.slice(0, 4)}` : ""}</p>
          <h1 className="hero__title animate-fade-in animate-delay-1">
            {t("home.title1")}<span className="gradient-text">{t("home.titleAccent")}</span>{t("home.title2")}
          </h1>
          <p className="hero__lead animate-fade-in animate-delay-2">
            {t("home.lead")}
          </p>
          <div className="hero__actions animate-fade-in animate-delay-3">
            <Link to="/checks" className="btn btn--lg">{t("home.ctaChecks")}</Link>
            <Link to="/games" className="btn btn--lg btn--ghost">{t("home.ctaGames")}</Link>
            <Link to="/combinator" className="btn btn--secondary btn--lg">{t("home.ctaCombinator")}</Link>
          </div>
          <div className="card card--glass hero__float-card">
            <h3 style={{ marginTop: 0 }}>{t("home.availableToday")}</h3>
            {catalog.isLoading && <div className="loading-shimmer" />}
            {catalog.isError && <p className="field__error">{t("home.packagesError")}</p>}
            {catalog.data && readyPkgs.length === 0 && (
              <p className="muted">{t("home.notReady")}</p>
            )}
            {readyPkgs.length > 0 && (
              <ul className="match-list">
                {readyPkgs.map((p) => (
                  <li key={p.key}>
                    ✅ {pkgLabel(p.key, p.label)}
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
        <h2 className="section__title">{t("home.why")}</h2>
        <p className="section__desc">{t("home.whyDesc")}</p>
        <div className="features">
          <article className="feature-card">
            <div className="feature-card__icon">📊</div>
            <h3>{t("home.f1Title")}</h3>
            <p>{t("home.f1Text")}</p>
          </article>
          <article className="feature-card">
            <div className="feature-card__icon">📈</div>
            <h3>{t("home.f2Title")}</h3>
            <p>{t("home.f2Text")}</p>
          </article>
          <article className="feature-card">
            <div className="feature-card__icon">🎯</div>
            <h3>{t("home.f3Title")}</h3>
            <p>{t("home.f3Text")}</p>
          </article>
          <article className="feature-card">
            <div className="feature-card__icon">👑</div>
            <h3>{t("home.f4Title")}</h3>
            <p>{t("home.f4Text")}</p>
          </article>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">{t("home.liveTitle")}</h2>
        <p className="section__desc">{t("home.liveDesc")}</p>
        {games.isLoading && <div className="loading-shimmer" />}
        {games.isError && <p className="field__error">{t("home.gamesError")}</p>}
        {games.data && gameList.length === 0 && (
          <p className="muted">
            {games.data.provider_configured
              ? t("home.noGames")
              : t("home.noProvider")}
          </p>
        )}
        <div className="games-grid">
          {gameList.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
        <p style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <Link to="/games" className="btn">{t("home.allGames")}</Link>
        </p>
      </section>

      <section className="section check-preview">
        <div>
          <h2 className="section__title">{t("home.formatTitle")}</h2>
          <p className="section__desc">{t("home.formatDesc")}</p>
          <Link to="/checks" className="btn">{t("home.viewCatalog")}</Link>
        </div>
        <pre className="pre">{t("home.sample")}</pre>
      </section>

      <section className="section">
        <h2 className="section__title">{t("home.anTitle")}</h2>
        <p className="section__desc">{t("home.anText", { price: "1,000" })}</p>
        <Link to="/games?analysis=1" className="btn" style={{ marginTop: "1rem" }}>{t("home.anButton")}</Link>
      </section>

      <section className="section">
        <h2 className="section__title">{t("home.combTitle")}</h2>
        <p className="section__desc">{t("home.combDesc")}</p>
        <Link to="/combinator" className="btn" style={{ marginTop: "1rem" }}>{t("home.openCombinator")}</Link>
      </section>

      <div className="cta-band">
        <h2>{t("home.ctaTitle")}</h2>
        <p className="muted">{t("home.ctaText")}</p>
        <Link to="/login" className="btn btn--lg" style={{ marginTop: "1rem", display: "inline-block" }}>
          {t("home.ctaButton")}
        </Link>
      </div>
    </div>
  );
}
