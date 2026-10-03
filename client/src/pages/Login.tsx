import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Brand, cn, Icon, ICON } from "../components/ui";

const FEATURES = [
  {
    title: "PDF-First Extraction",
    body: "Reads NIRF credentials and tags every field as From PDF, Estimated, or Requiring External Source.",
  },
  {
    title: "Transparent Scoring",
    body: "NIRF 2025 engineering methodology with explicit partial scores — nothing silently assumed.",
  },
  {
    title: "Rank Estimation",
    body: "ML estimate calibrated against official top-90 results with full arithmetic traceability.",
  },
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      nav("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg-deep)]">
      {/* Ambient glow decorations */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-navy-800/20 blur-3xl animate-float" />
      <div
        className="pointer-events-none absolute -bottom-48 -right-40 h-[600px] w-[600px] rounded-full bg-brand-700/10 blur-3xl animate-float"
        style={{ animationDelay: "2s" }}
      />
      {/* Grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(16,37,63,1) 1px, transparent 1px), linear-gradient(90deg, rgba(16,37,63,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.15fr_1fr]">
        {/* Left: branding panel */}
        <div className="hidden animate-fade-right lg:block">
          <Brand />

          <div className="mt-3 h-px w-24 bg-gradient-to-r from-brand-700/60 to-transparent" />

          <h1
            className="mt-8 text-4xl font-extrabold leading-tight tracking-tight text-[var(--text-1)] xl:text-5xl"
            style={{ fontFamily: "'Montserrat', sans-serif" }}
          >
            Institutional NIRF scoring,{" "}
            <span className="text-gradient">with a paper trail.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[var(--text-faint)] leading-relaxed">
            Compute engineering rankings from your credentials PDF, review every
            source decision, and estimate your rank before results publish.
          </p>

          <div className="mt-10 space-y-5">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="flex gap-4 animate-fade-up"
                style={{ animationDelay: `${200 + i * 120}ms` }}
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-700/15 border border-brand-700/30 text-brand-600">
                  <Icon path={ICON.check} className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-bold text-[var(--text-1)]">{f.title}</p>
                  <p className="mt-0.5 text-sm text-[var(--text-faint)] leading-relaxed">{f.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom accent */}
          <div className="mt-14 flex items-center gap-4">
            <div className="h-px flex-1 bg-gradient-to-r from-brand-700/30 to-transparent" />
            <span className="text-xs text-[var(--text-faintest)] uppercase tracking-widest">NIRF 2025</span>
          </div>
        </div>

        {/* Right: login form */}
        <div className="animate-fade-up" style={{ animationDelay: "100ms" }}>
          <form
            onSubmit={submit}
            className="mx-auto w-full max-w-md space-y-5 rounded-2xl border border-[var(--surface-4)] bg-[var(--surface-5)] p-8 shadow-lift"
          >
            <div className="lg:hidden mb-2">
              <Brand />
            </div>

            <div>
              <h2
                className="text-2xl font-extrabold tracking-tight text-[var(--text-1)]"
                style={{ fontFamily: "'Montserrat', sans-serif" }}
              >
                Welcome back
              </h2>
              <p className="mt-1.5 text-sm text-[var(--text-faint)]">
                Sign in to your institution account
              </p>
            </div>

            <div className="h-px bg-[var(--border)]" />

            <div>
              <label className="label" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                className="input"
                type="email"
                placeholder="you@institution.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="rounded-lg border border-[var(--chip-danger-border)] bg-[var(--chip-danger-bg)] px-3 py-2 text-sm font-medium text-[var(--chip-danger-text)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={cn("btn-primary w-full py-3")}
            >
              {submitting ? "Signing in…" : "Sign In"}
            </button>

            <p className="text-sm text-center text-[var(--text-fainter)]">
              No account?{" "}
              <Link
                to="/register"
                className="font-semibold text-brand-600 hover:text-brand-500 transition-colors"
              >
                Register institution
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}