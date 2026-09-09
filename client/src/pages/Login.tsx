import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Brand, cn, Icon, ICON } from "../components/ui";

const FEATURES = [
  {
    title: "PDF-first extraction",
    body: "Reads NIRF credentials and tags every field as From PDF, Estimated, or Requiring External Source.",
  },
  {
    title: "Transparent scoring",
    body: "NIRF 2025 engineering methodology with explicit partial scores — nothing silently assumed.",
  },
  {
    title: "Rank prediction",
    body: "ML estimate calibrated against the official top-90 results with confidence bands.",
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
    <div className="relative min-h-screen overflow-hidden">
      <Deco />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-6 py-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="hidden animate-fade-right lg:block">
          <Brand />
          <h1 className="mt-8 text-4xl font-extrabold leading-tight tracking-tight text-brand-900 xl:text-5xl">
            Institutional NIRF scoring,{" "}
            <span className="text-gradient">with a paper trail.</span>
          </h1>
          <p className="mt-4 max-w-lg text-brand-900/60">
            Compute engineering rankings from your credentials PDF, review every
            source decision, and estimate your rank before results publish.
          </p>
          <div className="mt-10 space-y-5">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="flex gap-4 animate-fade-up"
                style={{ animationDelay: `${150 + i * 120}ms` }}
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-mint-500 text-white shadow-glow">
                  <Icon path={ICON.check} className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-bold text-brand-900">{f.title}</p>
                  <p className="mt-0.5 text-sm text-brand-900/55">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <form
            onSubmit={submit}
            className="card mx-auto w-full max-w-md space-y-5 p-7 shadow-lift sm:p-9"
          >
            <div className="lg:hidden">
              <Brand />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-brand-900">
                Welcome back
              </h2>
              <p className="mt-1 text-sm text-brand-900/55">
                Sign in to your institution account
              </p>
            </div>

            <div>
              <label className="label" htmlFor="email">
                Email
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

            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className={cn("btn-primary w-full py-3")}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-sm text-center text-brand-900/50">
              No account?{" "}
              <Link
                to="/register"
                className="font-semibold text-brand-600 hover:text-brand-800"
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

function Deco() {
  return (
    <>
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-200/70 blur-3xl animate-float" />
      <div
        className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-mint-200/80 blur-3xl animate-float"
        style={{ animationDelay: "1.6s" }}
      />
      <div className="pointer-events-none absolute right-1/3 top-16 h-40 w-40 rounded-full bg-white/40 blur-2xl animate-float " style={{ animationDelay: "3s" }} />
    </>
  );
}