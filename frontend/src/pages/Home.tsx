import { Link } from "react-router-dom";
import heroImg from "../assets/hero.png";
import { GameCard } from "../components/GameCard";
import {
  demoCheckPreview,
  demoCombinatorResults,
  demoGames,
  landingStats,
} from "../data/demo";

const marqueeItems = demoGames.map((g) => ({
  key: g.id,
  text: `${g.home} vs ${g.away}`,
  score: g.score[0] != null ? `${g.score[0]}:${g.score[1]}` : "—",
}));

export function Home() {
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero__bg" style={{ backgroundImage: `url(${heroImg})` }} aria-hidden />
        <div className="hero__mesh" aria-hidden />
        <div className="hero__content">
          <p className="page-header__eyebrow animate-fade-in">Goalking · 2026</p>
          <h1 className="hero__title animate-fade-in animate-delay-1">
            Օրվա <span className="gradient-text">չեկերը</span> և live վիճակագրություն
          </h1>
          <p className="hero__lead animate-fade-in animate-delay-2">
            Վերջին 5 խաղի ֆորմա, API-Football թարմացումներ, կոնստրուկտոր x9–x20 — ամենը մեկ սև թեմայի
            ինտերֆեյսում։
          </p>
          <div className="hero__actions animate-fade-in animate-delay-3">
            <Link to="/checks" className="btn btn--lg">📊 Օրվա չեկերը</Link>
            <Link to="/games" className="btn btn--lg btn--ghost">⚽ Խաղեր</Link>
            <Link to="/combinator" className="btn btn--secondary btn--lg">🎯 Կոնստրուկտոր</Link>
          </div>
          <div className="card card--glass hero__float-card">
            <span className="pill pill--demo" style={{ position: "static", marginBottom: "0.5rem" }}>Demo</span>
            <pre className="pre" style={{ margin: 0, maxHeight: 180, overflow: "hidden" }}>{demoCheckPreview}</pre>
          </div>
        </div>
      </section>

      <div className="stats-row">
        {landingStats.map((s) => (
          <div key={s.label} className="stat-tile">
            <div className="stat-tile__value">{s.value}</div>
            <div className="stat-tile__label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="marquee-wrap" aria-hidden>
        <div className="marquee">
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <span key={`${item.key}-${i}`} className="marquee__item">
              <strong>{item.score}</strong> {item.text}
            </span>
          ))}
        </div>
      </div>

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
            <p>Ընդհանուր кф 9–20, min/max յուրաքանչյուր ողի — ավտոմատ կոմբինացիաներ։</p>
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
        <p className="section__desc">
          Ներքևում — demo տվյալներ API-ի նման։ Երբ միացնեք API-Football, նույն քարտերով կտեսնեք իրական խաղերը։
        </p>
        <div className="games-grid">
          {demoGames.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
        <p style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <Link to="/games" className="btn">Բոլոր խաղերը →</Link>
        </p>
      </section>

      <section className="section check-preview">
        <div>
          <h2 className="section__title">Օրինակ չեկ</h2>
          <p className="section__desc">Հայերեն բացատրություններով, ինչպես n8n-ից գալիս է բոտին։</p>
          <Link to="/checks" className="btn">Դիտել կատալոգը</Link>
        </div>
        <pre className="pre">{demoCheckPreview}</pre>
      </section>

      <section className="section">
        <h2 className="section__title">Կոնստրուկտոր — նախադիտում</h2>
        <p className="section__desc">Օրինակ հավելվածներ ընդհանուր ~10x գործակցով։</p>
        {demoCombinatorResults.map((r, i) => (
          <div key={i} className="combo-result">
            <div className="combo-result__odds">{r.combined_odds}x</div>
            <ul className="match-list">
              {r.legs.map((leg, j) => (
                <li key={j}>
                  {leg.fixture_name} · {leg.market} · {leg.selection} @ {leg.odd}
                </li>
              ))}
            </ul>
          </div>
        ))}
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
