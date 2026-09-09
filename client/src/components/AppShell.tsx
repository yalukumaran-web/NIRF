import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Brand, cn, Icon, ICON } from "./ui";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  admin?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/rankings", label: "Rankings" },
  { to: "/compare", label: "Compare" },
  { to: "/calculations", label: "Calculations" },
  { to: "/absolute", label: "Absolute" },
  { to: "/documents", label: "Documents" },
  { to: "/admin/ml", label: "ML Studio", admin: true },
];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, institution, logout } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = NAV.filter((n) => !n.admin || user?.role === "admin");
  const isActive = (n: NavItem) =>
    n.end ? pathname === n.to : pathname.startsWith(n.to);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="shrink-0" onClick={() => setMenuOpen(false)}>
            <Brand />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {items.map((n) => {
              const active = isActive(n);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "relative rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200",
                    active
                      ? "bg-brand-200/80 text-brand-900"
                      : "text-brand-900/55 hover:bg-brand-200/40 hover:text-brand-900"
                  )}
                >
                  {n.label}
                  {active && (
                    <span className="absolute inset-x-4 -bottom-[13px] h-0.5 rounded-full bg-gradient-to-r from-brand-500 to-mint-500" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2.5 lg:flex">
            <span className="hidden max-w-[180px] items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-brand-900/70 xl:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-mint-500 animate-pulse-soft" />
              <span className="truncate">
                {institution?.name || user?.email}
              </span>
            </span>
            <Link to="/upload" className="btn-primary px-3.5 py-2 text-xs">
              <Icon path={ICON.upload} className="h-4 w-4" />
              Upload / Compute
            </Link>
            <button
              onClick={logout}
              className="btn-ghost px-3 py-2 text-xs"
              title="Sign out"
            >
              <Icon path={ICON.logout} className="h-4 w-4" />
            </button>
          </div>

          <button
            className="btn-ghost px-2 py-2 lg:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <Icon path={menuOpen ? ICON.close : ICON.bars} className="h-6 w-6" />
          </button>
        </div>

        {menuOpen && (
          <nav className="animate-slide-down border-t border-brand-200/70 bg-white/80 px-4 pb-4 pt-2 backdrop-blur-md lg:hidden">
            {items.map((n) => {
              const active = isActive(n);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "mt-1 block rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                    active
                      ? "bg-brand-200/80 text-brand-900"
                      : "text-brand-900/60 hover:bg-brand-200/40"
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
            <div className="mt-3 flex items-center gap-3 border-t border-brand-200/70 pt-3">
              <Link
                to="/upload"
                onClick={() => setMenuOpen(false)}
                className="btn-primary flex-1 px-3 py-2 text-xs"
              >
                <Icon path={ICON.upload} className="h-4 w-4" />
                Upload / Compute
              </Link>
              <button onClick={logout} className="btn-ghost px-3 py-2 text-xs">
                Sign out
              </button>
            </div>
          </nav>
        )}
      </header>

      <main
        key={pathname}
        className="mx-auto w-full max-w-7xl flex-1 animate-fade-up px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8"
      >
        {children}
      </main>

      <footer className="border-t border-white/50 py-5">
        <p className="text-center text-xs text-brand-900/40">
          NIRF Ranklab · Engine-driven scores, ML rank estimates &amp; full
          traceability
        </p>
      </footer>
    </div>
  );
}