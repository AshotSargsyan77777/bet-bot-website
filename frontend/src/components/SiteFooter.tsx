import { Link } from "react-router-dom";

export function SiteFooter({ showCombinator = false }: { showCombinator?: boolean }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__grid">
        <div>
          <strong className="gradient-text">Goalking</strong>
          <p className="muted">Օրվա չեկեր · վիճակագրություն · կոնստրուկտոր</p>
        </div>
        <div className="site-footer__links">
          <Link to="/checks">Չեկեր</Link>
          <Link to="/results">Արդյունքներ</Link>
          <Link to="/games">Խաղեր</Link>
          {showCombinator && <Link to="/combinator">Կոնստրուկտոր</Link>}
          <Link to="/vip">VIP</Link>
          <Link to="/help">Support</Link>
        </div>
      </div>
      <p className="site-footer__legal">
        ⚠️ Խաղադրույք կատարեք սեփական պատասխանատվությամբ. Մենք պատասխանատվություն չենք կրում արդյունքների համար։
      </p>
    </footer>
  );
}
