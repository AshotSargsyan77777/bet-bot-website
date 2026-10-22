import { Link } from "react-router-dom";
import { useT } from "../i18n";

export function SiteFooter({ showCombinator = false }: { showCombinator?: boolean }) {
  const { t } = useT();
  return (
    <footer className="site-footer">
      <div className="site-footer__grid">
        <div>
          <strong className="gradient-text">Goalking</strong>
          <p className="muted">{t("footer.tagline")}</p>
        </div>
        <div className="site-footer__links">
          <Link to="/checks">{t("nav.checks")}</Link>
          <Link to="/games?analysis=1">{t("nav.analysis")}</Link>
          <Link to="/results">{t("nav.results")}</Link>
          <Link to="/games">{t("nav.games")}</Link>
          {showCombinator && <Link to="/combinator">{t("nav.combinator")}</Link>}
          <Link to="/vip">VIP</Link>
          <Link to="/help">Support</Link>
        </div>
      </div>
      <p className="site-footer__legal">
        {t("footer.legal")}
      </p>
    </footer>
  );
}
