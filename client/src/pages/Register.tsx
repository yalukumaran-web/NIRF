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
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-200/70 blur-3xl animate-float" />
      <div
        className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-mint-200/80 blur-3xl animate-float"
        style={{ animationDelay: "1.6s" }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
        <form
          onSubmit={submit}
          className="card w-full space-y-5 p-7 shadow-lift sm:p-9 animate-fade-up"
        >
          <Brand />
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-brand-900">
              Institution Registration
            </h2>
            <p className="mt-1 text-sm text-brand-900/55">
              Create an account to upload credentials and compute scores
            </p>
          </div>

          <div>
            <label className="label" htmlFor="institutionName">
              Institution Name
            </label>
            <input
              id="institutionName"
              className="input"
              type="text"
              placeholder="Indian Institute of Technology, Madras"
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
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
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
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
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
              placeholder="Min 6 characters"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className={cn("btn-primary w-full py-3")}
          >
            <Icon path={ICON.check} className="h-4 w-4" />
            {submitting ? "Creating account…" : "Create account"}
          </button>

          <p className="text-sm text-center text-brand-900/50">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-semibold text-brand-600 hover:text-brand-800"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}