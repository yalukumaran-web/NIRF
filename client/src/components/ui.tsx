import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Icon({
  path,
  className = "h-5 w-5",
}: {
  path: string;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export const ICON = {
  chart: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  upload: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
  logout: "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 009.75 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9",
  bars: "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5",
  close: "M6 18L18 6M6 6l12 12",
  check: "M4.5 12.75l6 6 9-13.5",
  alert: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  spinner: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99",
  home: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  calculator: "M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.598 4.5 4.698V18a2.25 2.25 0 002.25 2.25h10.5A2.25 2.25 0 0019.5 18V4.698c0-1.1-.807-1.998-1.907-2.126A48.507 48.507 0 0012 2.25z",
  sun: "M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z",
  moon: "M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z",
} as const;

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="grid h-12 w-auto place-items-center rounded-lg bg-white px-2 shadow-sm ring-1 ring-[var(--border-3)]">
        <img
          src="/tce-logo.png"
          alt="Thiagarajar College of Engineering — NIRF Ranklab"
          className="h-10 w-auto object-contain"
        />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[13px] font-extrabold uppercase tracking-wider text-[var(--text-1)]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            NIRF <span className="text-gradient">Ranklab</span>
          </span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-faint)]">
            Score &amp; Rank Predictor
          </span>
        </span>
      )}
    </span>
  );
}

const badgeTones: Record<string, string> = {
  slate: "bg-[var(--surface-3)] text-[var(--text-4)] border-[var(--border-3)]",
  blue: "bg-[var(--chip-blue-bg)] text-[var(--chip-blue-text)] border-[var(--chip-blue-border)]",
  green: "bg-[var(--chip-success-bg)] text-[var(--chip-success-text)] border-[var(--chip-success-border)]",
  amber: "bg-[var(--chip-warn-bg)] text-[var(--chip-warn-text)] border-[var(--chip-warn-border)]",
  rose: "bg-[var(--chip-rose-bg)] text-rose-400 border-[var(--chip-rose-border)]",
  violet: "bg-[var(--chip-violet-bg)] text-[var(--chip-violet-text)] border-[var(--chip-violet-border)]",
  gold: "bg-brand-700/15 text-brand-600 border-brand-700/40",
};

export function Badge({
  tone = "slate",
  className,
  children,
}: {
  tone?: keyof typeof badgeTones | string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "chip border",
        badgeTones[tone] || badgeTones.slate,
        className
      )}
    >
      {children}
    </span>
  );
}

export function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("animate-fade-up", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("card p-5 sm:p-6", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <Reveal className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="maroon-line mb-4 w-16" />
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-1)] sm:text-[28px]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-sm text-[var(--text-faint)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </Reveal>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-[var(--text-faint)]">
      <span className="relative grid h-6 w-6 place-items-center">
        <span className="absolute inset-0 rounded-full border-2 border-[var(--border-2)]" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-brand-700" />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function Alert({
  tone = "amber",
  title,
  children,
  className,
}: {
  tone?: "amber" | "rose" | "green" | "blue";
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    amber: "border-[var(--chip-warn-border)] bg-[var(--chip-warn-bg)] text-[var(--chip-warn-text)]",
    rose: "border-[var(--chip-danger-border)] bg-[var(--chip-danger-bg)] text-[var(--chip-danger-text)]",
    green: "border-[var(--chip-success-border)] bg-[var(--chip-success-bg)] text-[var(--chip-success-text)]",
    blue: "border-[var(--chip-blue-border)] bg-[var(--chip-blue-bg)] text-[var(--chip-blue-text)]",
  };
  return (
    <Reveal
      className={cn(
        "rounded-xl border px-4 py-3 text-sm leading-relaxed",
        tones[tone],
        className
      )}
    >
      {title && (
        <strong className="mr-1.5">{title}</strong>
      )}
      {children}
    </Reveal>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { label: string; to?: string; onClick?: () => void };
}) {
  return (
    <Card className="animate-fade-up py-16 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/20 to-brand-700/20 border border-brand-600/30 text-brand-400">
        <Icon path={ICON.chart} className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-lg font-bold text-[var(--text-1)]">{title}</h2>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-faint)]">
          {description}
        </p>
      )}
      {action && (
        <LinkLike
          to={action.to}
          onClick={action.onClick}
          className="btn-primary mt-6"
        >
          {action.label}
        </LinkLike>
      )}
    </Card>
  );
}

function LinkLike({
  to,
  onClick,
  className,
  children,
}: {
  to?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  if (to) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "btn-ghost px-2.5 py-2",
        className
      )}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
    >
      <Icon path={theme === "dark" ? ICON.sun : ICON.moon} className="h-4 w-4" />
    </button>
  );
}