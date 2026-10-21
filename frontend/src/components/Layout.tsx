import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { SiteFooter } from "./SiteFooter";

type NavItem = { to: string; label: string; end?: boolean };

const publicLinks: NavItem[] = [
  { to: "/", label: "Գլխավոր", end: true },
  { to: "/checks", label: "Չեկեր" },
  { to: "/games", label: "Խաղեր" },
];

const loggedInLinks: NavItem[] = [
  { to: "/vip", label: "VIP" },
  { to: "/help", label: "Support" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isHome = location.pathname === "/";

  const vip = useQuery({
    queryKey: ["vip", user?.id],
    queryFn: () => api<{ is_vip: boolean }>("/api/vip/status/"),
    enabled: !!user,
  });
  const isVip = !!vip.data?.is_vip;

  const links: NavItem[] = [
    ...publicLinks,
    ...(user ? loggedInLinks : []),
    ...(isVip ? [{ to: "/combinator", label: "Կոնստրուկտոր" }] : []),
    ...(user?.is_admin ? [{ to: "/admin", label: "Admin" }] : []),
  ];

  return (
    <div className={`layout ${isHome ? "layout--landing" : ""}`}>
      <header className="site-nav-wrap">
        <nav className="site-nav">
          <NavLink to="/" className="site-nav__brand" end>Goalking</NavLink>

          <div className="site-nav__links site-nav__links--desktop">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>
            ))}
          </div>

          <details className="site-nav__menu">
            <summary className="site-nav__burger" aria-label="Մենյու">☰</summary>
            <div className="site-nav__drawer">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>
              ))}
            </div>
          </details>

          {user ? (
            <div className="site-nav__auth">
              <span className="site-nav__user">{user.username}</span>
              <button type="button" className="secondary site-nav__logout" onClick={logout}>Ելք</button>
            </div>
          ) : (
            <Link to="/login" className="site-nav__cta">Մուտք</Link>
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
