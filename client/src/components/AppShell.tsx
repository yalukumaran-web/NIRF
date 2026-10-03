import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Brand, cn, Icon, ICON, ThemeToggle } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/relative", label: "Relative", icon: ICON.chart, end: true },
  { to: "/absolute", label: "Absolute", icon: ICON.calculator },
];

const SOCIALS = [
  "M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4V8h4zM2 8h4v17H2V8zM4 2a2 2 0 110 4 2 2 0 010-4z",
  "M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3V2z",
  "M22 12a10 10 0 11-20 0 10 10 0 0120 0zM12 2v20M12 2c2.7 2.5 4 6.5 4 10s-1.3 7.5-4 10M12 2C9.3 4.5 8 8.5 8 12s1.3 7.5 4 10",
  "M22 12a10 10 0 11-20 0 10 10 0 0120 0zM8.5 12l2 2 5-5",
];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (n: NavItem) =>
    n.end ? pathname === n.to : pathname.startsWith(n.to);

  const navItemClass = (active: boolean) =>
    cn(
      "relative flex items-center gap-2 px-4 py-3 text-[13px] font-bold uppercase tracking-wide transition-colors duration-200",
      active
        ? "bg-white/15 text-white shadow-[inset_0_3px_0_0_var(--border-2)]"
        : "text-white/90 hover:bg-black/15 hover:text-white"
    );

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      {/* ── Header-main (TCE style: logo + utility) ─────────────────────── */}
      <header className="sticky top-0 z-40">
        <div className="bg-[var(--bg-soft)]">
          <div className="mx-auto flex h-[74px] max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Link
              to="/relative"
              className="shrink-0"
              onClick={() => setMenuOpen(false)}
            >
              <Brand />
            </Link>

            {/* Desktop utility cluster */}
            <div className="hidden items-center gap-2.5 lg:flex">
              <Link
                to="/upload"
                className="btn-primary px-4 py-2 text-xs uppercase tracking-wide"
              >
                <Icon path={ICON.upload} className="h-4 w-4" />
                Upload / Compute
              </Link>
              <span className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[var(--border-3)] bg-[var(--surface-3)] text-[var(--text-dim)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </span>
              <ThemeToggle />
              <button
                onClick={logout}
                className="btn-ghost px-3 py-2 text-xs"
                title="Sign out"
              >
                <Icon path={ICON.logout} className="h-4 w-4" />
              </button>
            </div>

            {/* Mobile hamburger */}
            <button
              className="btn-ghost px-2 py-2 lg:hidden"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              <Icon path={menuOpen ? ICON.close : ICON.bars} className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* ── Main nav bar (TCE maroon) ──────────────────────────────────── */}
        <nav className="bg-brand-700 shadow-md">
          <div className="mx-auto flex max-w-[1400px] items-center px-4 sm:px-6 lg:px-8">
            {/* Desktop nav */}
            <div className="hidden items-center lg:flex">
              {NAV.map((n) => {
                const active = isActive(n);
                return (
                  <Link key={n.to} to={n.to} className={navItemClass(active)}>
                    <Icon path={n.icon} className="h-4 w-4" />
                    {n.label}
                  </Link>
                );
              })}
              <a
                href="#"
                className="px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-white/90 transition-colors hover:bg-black/15 hover:text-white"
                onClick={(e) => e.preventDefault()}
              >
                NIRF
              </a>
            </div>
          </div>
        </nav>

        {/* Mobile menu */}
        {menuOpen && (
          <nav className="animate-slide-down border-b border-[var(--border)] bg-[var(--bg)] px-4 pb-4 pt-2 lg:hidden">
            {NAV.map((n) => {
              const active = isActive(n);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "mt-1 flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                    active
                      ? "bg-brand-700/15 text-brand-700"
                      : "text-[var(--text-faint)] hover:bg-[var(--surface-4)] hover:text-[var(--text-2)]"
                  )}
                >
                  <Icon path={n.icon} className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
            <div className="mt-3 flex items-center gap-3 border-t border-[var(--border)] pt-3">
              <Link
                to="/upload"
                onClick={() => setMenuOpen(false)}
                className="btn-primary flex-1 px-3 py-2 text-xs uppercase"
              >
                <Icon path={ICON.upload} className="h-4 w-4" />
                Upload / Compute
              </Link>
              <ThemeToggle />
              <button onClick={logout} className="btn-ghost px-3 py-2 text-xs">
                Sign out
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main
        key={pathname}
        className="mx-auto w-full max-w-7xl flex-1 animate-fade-up px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pt-10"
      >
        {children}
      </main>

      {/* ── Footer (TCE style) ───────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border-6)] bg-[var(--bg-soft)]">
        <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
            {/* Quick Links */}
            <div>
              <p className="gsc-button inline-block rounded-full bg-brand-700 px-5 py-2 text-[13px] font-bold text-white">
                Quick Links
              </p>
              <div className="footer-quick mt-4">
                {[
                  { label: "Relative Predictor", to: "/relative" },
                  { label: "Absolute Calculator", to: "/absolute" },
                ].map((l) => (
                  <div key={l.to}>
                    <Link
                      to={l.to}
                      className="inline-block py-2 text-sm font-medium text-[var(--text-2)] transition-colors hover:text-brand-700"
                    >
                      {l.label}
                    </Link>
                    <hr className="my-0.5 border-dashed border-[var(--border-3)]" />
                  </div>
                ))}
              </div>
            </div>

            {/* Explore */}
            <div>
              <p className="gsc-button inline-block rounded-full bg-brand-700 px-5 py-2 text-[13px] font-bold text-white">
                Explore
              </p>
              <div className="footer-quick mt-4">
                {[
                  { label: "Upload & Compute", to: "/upload" },
                  { label: "Official Rankings", to: "/relative" },
                ].map((l) => (
                  <div key={l.label}>
                    <Link
                      to={l.to}
                      className="inline-block py-2 text-sm font-medium text-[var(--text-2)] transition-colors hover:text-brand-700"
                    >
                      {l.label}
                    </Link>
                    <hr className="my-0.5 border-dashed border-[var(--border-3)]" />
                  </div>
                ))}
              </div>
            </div>

            {/* Institute block */}
            <div className="text-center md:text-left">
              <img
                src="/tce-crest.png"
                alt="NIRF Ranklab crest"
                className="mx-auto h-20 w-20 object-contain md:mx-0"
              />
              <h4 className="mt-3 text-base font-bold text-[var(--text-1)]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                NIRF Ranklab
              </h4>
              <p className="text-sm text-[var(--text-faint)]">Score &amp; Rank Predictor</p>
              <p className="mt-1 text-sm text-[var(--text-faint)]">
                Engineering Rankings · NIRF Methodology
              </p>
              <div className="mt-4 flex justify-center gap-2 md:justify-start">
                {SOCIALS.map((d, i) => (
                  <a
                    key={i}
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border-3)] bg-[var(--surface-3)] text-[var(--text-dim)] transition-colors hover:border-brand-700 hover:bg-brand-700 hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-4 w-4" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom maroon bar */}
        <div className="bg-brand-700">
          <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-2 px-4 py-4 text-sm text-white sm:flex-row sm:px-6 lg:px-8">
            <p className="font-medium">© 2026 NIRF Ranklab · Score computation &amp; rank estimation</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
              <span className="text-white/90 hover:text-white"><b>NIRF 2025</b></span>
              <span className="text-white/60">|</span>
              <a href="#" onClick={(e) => e.preventDefault()} className="text-white/90 hover:text-white"><b>Methodology</b></a>
              <span className="text-white/60">|</span>
              <a href="#" onClick={(e) => e.preventDefault()} className="text-white/90 hover:text-white"><b>About</b></a>
              <span className="text-white/60">|</span>
              <a href="#" onClick={(e) => e.preventDefault()} className="text-white/90 hover:text-white"><b>Contact</b></a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}