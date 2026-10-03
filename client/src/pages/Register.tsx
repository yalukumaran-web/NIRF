import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Brand, cn, Icon, ICON } from "../components/ui";

const CATEGORIES = [
  "overall",
  "engineering",
  "university",
  "management",
  "pharmacy",
  "medical",
  "architecture",
];

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    institutionName: "",
    category: "overall",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register(
        form.email,
        form.password,
        form.institutionName,
        form.category
      );
      nav("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg-deep)]">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-navy-800/20 blur-3xl animate-float" />
      <div
        className="pointer-events-none absolute -bottom-48 -right-40 h-[600px] w-[600px] rounded-full bg-brand-700/10 blur-3xl animate-float"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(16,37,63,1) 1px, transparent 1px), linear-gradient(90deg, rgba(16,37,63,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
        <form
          onSubmit={submit}
          className="w-full space-y-5 rounded-2xl border border-[var(--surface-4)] bg-[var(--surface-5)] p-8 shadow-lift animate-fade-up"
        >
          <Brand />

          <div>
            <h2
              className="text-2xl font-extrabold tracking-tight text-[var(--text-1)]"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            >
              Institution Registration
            </h2>
            <p className="mt-1.5 text-sm text-[var(--text-faint)]">
              Create an account to upload credentials and compute scores
            </p>
          </div>

          <div className="h-px bg-[var(--border)]" />

          <div>
            <label className="label" htmlFor="institutionName">
              Institution Name
            </label>
            <input
              id="institutionName"
              className="input"
              type="text"
              placeholder="e.g. Sri Krishna College of Engineering"
              value={form.institutionName}
              onChange={(e) => set("institutionName", e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="category">
              Category
            </label>
            <select
              id="category"
              className="input"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-[var(--surface-5)]">
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="reg-email">
              Email address
            </label>
            <input
              id="reg-email"
              className="input"
              type="email"
              placeholder="you@institution.edu"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="reg-password">
              Password
            </label>
            <input
              id="reg-password"
              className="input"
              type="password"
              placeholder="Minimum 6 characters"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
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
            <Icon path={ICON.check} className="h-4 w-4" />
            {submitting ? "Creating account…" : "Create Account"}
          </button>

          <p className="text-sm text-center text-[var(--text-fainter)]">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-semibold text-brand-600 hover:text-brand-500 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}