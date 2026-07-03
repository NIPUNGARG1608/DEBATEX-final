import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email.trim(), password);
      toast.success("Welcome back.");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    }
  };

  return (
    <section className="mx-auto max-w-md px-6 py-24" data-testid="login-page">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-signal mb-3">— Welcome back</p>
      <h1 className="font-serif text-5xl tracking-tighter leading-none mb-10">Log in</h1>

      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted_ink block mb-2">Email</label>
          <input
            data-testid="login-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-elevated border border-rule rounded-sm px-4 py-3 text-parchment focus:border-parchment outline-none transition-colors"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted_ink block mb-2">Password</label>
          <input
            data-testid="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-elevated border border-rule rounded-sm px-4 py-3 text-parchment focus:border-parchment outline-none transition-colors"
            placeholder="••••••••"
          />
        </div>
        <button
          data-testid="login-submit"
          type="submit"
          disabled={loading}
          className="w-full rounded-sm bg-parchment text-ink hover:bg-white disabled:opacity-50 transition-colors px-6 py-3.5 text-sm font-medium"
        >
          {loading ? "Signing in…" : "Log in"}
        </button>
      </form>
      <p className="mt-8 text-sm text-muted_ink">
        Don&rsquo;t have an account?{" "}
        <Link to="/signup" data-testid="link-to-signup" className="text-parchment underline underline-offset-4 hover:text-signal">
          Create one
        </Link>
      </p>
    </section>
  );
}
