import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { LangSwitcher, useT, type Key } from "../i18n";
import { SiteFooter } from "./SiteFooter";

type NavItem = { to: string; label: Key | string; end?: boolean };

const publicLinks: NavItem[] = [
  { to: "/", label: "nav.home", end: true },
  { to: "/checks", label: "nav.checks" },
  { to: "/analysis", label: "nav.analysis" },
  { to: "/results", label: "nav.results" },
  { to: "/games", label: "nav.games" },
];

const loggedInLinks: NavItem[] = [
  { to: "/status", label: "nav.status" },
  { to: "/promo", label: "nav.promo" },
  { to: "/vip", label: "VIP" },
  { to: "/help", label: "Support" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { t } = useT();
  const label = (l: NavItem) => (l.label.includes(".") ? t(l.label as Key) : l.label);
  const location = useLocation();
  const menuRef = useRef<HTMLDetailsElement>(null);

  // On phones the drawer would otherwise stay open over the new page after tapping a link.
  useEffect(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, [location.pathname]);
  const isHome = location.pathname === "/";

  const vip = useQuery({
    queryKey: ["vip", user?.id],
    queryFn: () => api<{ is_vip: boolean }>("/api/vip/status/"),
    enabled: !!user,
  });
  const isVip = !!vip.data?.is_vip || !!user?.is_admin;

  const links: NavItem[] = [
    ...publicLinks,
    ...(user ? loggedInLinks : []),
    ...(isVip ? [{ to: "/combinator", label: "nav.combinator" }] : []),
    ...(user?.is_admin ? [{ to: "/admin", label: "Admin" }] : []),
  ];

  return (
    <div className={`layout ${isHome ? "layout--landing" : ""}`}>
      <header className="site-nav-wrap">
        <nav className="site-nav">
          <NavLink to="/" className="site-nav__brand" end>Goalking</NavLink>

          <div className="site-nav__links site-nav__links--desktop">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}>{label(l)}</NavLink>
            ))}
          </div>

          <LangSwitcher />

          <details className="site-nav__menu" ref={menuRef}>
            <summary className="site-nav__burger" aria-label={t("common.menu")}>☰</summary>
            <div className="site-nav__drawer">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end}>{label(l)}</NavLink>
              ))}
            </div>
          </details>

          {user ? (
            <div className="site-nav__auth">
              <Link to="/status" className="site-nav__user">{user.username}</Link>
              <button type="button" className="secondary site-nav__logout" onClick={() => void logout()}>{t("common.logout")}</button>
            </div>
          ) : (
            <Link to="/login" className="site-nav__cta">{t("common.login")}</Link>
          )}
        </nav>
      </header>
      <main className="layout__main">
        <Outlet />
      </main>
      <SiteFooter showCombinator={isVip} />
    </div>
  );
}
