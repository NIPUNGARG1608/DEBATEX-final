import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Signup() {
  const { signup, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await signup(email.trim(), password, name.trim());
      toast.success("Account created. Let's debate.");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Signup failed");
    }
  };

  return (
    <section className="mx-auto max-w-md px-6 py-24" data-testid="signup-page">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-signal mb-3">— Create account</p>
      <h1 className="font-serif text-5xl tracking-tighter leading-none mb-10">Sign up</h1>

      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted_ink block mb-2">Name</label>
          <input
            data-testid="signup-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-elevated border border-rule rounded-sm px-4 py-3 text-parchment focus:border-parchment outline-none transition-colors"
            placeholder="Alex Rivers"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted_ink block mb-2">Email</label>
          <input
            data-testid="signup-email"
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
            data-testid="signup-password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-elevated border border-rule rounded-sm px-4 py-3 text-parchment focus:border-parchment outline-none transition-colors"
            placeholder="6+ characters"
          />
        </div>
        <button
          data-testid="signup-submit"
          type="submit"
          disabled={loading}
          className="w-full rounded-sm bg-parchment text-ink hover:bg-white disabled:opacity-50 transition-colors px-6 py-3.5 text-sm font-medium"
        >
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-8 text-sm text-muted_ink">
        Already registered?{" "}
        <Link to="/login" data-testid="link-to-login" className="text-parchment underline underline-offset-4 hover:text-signal">
          Log in
        </Link>
      </p>
    </section>
  );
}
