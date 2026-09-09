import { type ReactNode } from "react";
import { Link } from "react-router-dom";

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
} as const;

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-mint-500 text-white shadow-glow">
        <Icon path={ICON.chart} className="h-5 w-5" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px] font-extrabold tracking-tight text-brand-900">
            NIRF <span className="text-gradient">Ranklab</span>
          </span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-brand-900/45">
            Score &amp; Rank Predictor
          </span>
        </span>
      )}
    </span>
  );
}

const badgeTones: Record<string, string> = {
  slate: "bg-brand-100 text-brand-800 border-brand-200",
  blue: "bg-brand-200/70 text-brand-800 border-brand-300/70",
  green: "bg-mint-200/70 text-mint-800 border-mint-300/80",
  amber: "bg-amber-100 text-amber-800 border-amber-300",
  rose: "bg-rose-100 text-rose-700 border-rose-200",
  violet: "bg-violet-100 text-violet-700 border-violet-200",
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
    <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-900 sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-brand-900/55">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </Reveal>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-brand-900/50">
      <span className="relative grid h-6 w-6 place-items-center">
        <span className="absolute inset-0 rounded-full border-2 border-brand-200" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-brand-600" />
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
    amber: "border-amber-300 bg-amber-50/90 text-amber-800",
    rose: "border-rose-300 bg-rose-50/90 text-rose-700",
    green: "border-mint-300 bg-mint-50/90 text-mint-800",
    blue: "border-brand-300 bg-brand-100/80 text-brand-900",
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
    <Card className="animate-fade-up py-14 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-200 to-mint-200 text-brand-700">
        <Icon path={ICON.chart} className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-brand-900">{title}</h2>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-sm text-brand-900/55">
          {description}
        </p>
      )}
      {action && (
        <LinkLike
          to={action.to}
          onClick={action.onClick}
          className="btn-primary mt-5"
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