import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LogOut } from "lucide-react";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const linkClass = ({ isActive }) =>
    `text-sm font-mono uppercase tracking-[0.18em] transition-colors ${
      isActive ? "text-parchment" : "text-muted_ink hover:text-parchment"
    }`;

  return (
    <div className="min-h-screen bg-ink text-parchment grain relative">
      <header
        data-testid="app-header"
        className="sticky top-0 z-40 w-full backdrop-blur-xl bg-ink/80 border-b border-rule"
      >
        <div className="mx-auto max-w-7xl px-6 md:px-10 h-16 flex items-center justify-between">
          <Link to={user ? "/dashboard" : "/"} data-testid="brand-link" className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-signal animate-pulse-signal" />
            <span className="font-serif text-2xl tracking-tight">DebateX</span>
          </Link>

          {user ? (
            <nav className="flex items-center gap-8">
              <NavLink to="/dashboard" data-testid="nav-dashboard" className={linkClass}>Dashboard</NavLink>
              <NavLink to="/new" data-testid="nav-new" className={linkClass}>New Debate</NavLink>
              <NavLink to="/history" data-testid="nav-history" className={linkClass}>History</NavLink>
              <button
                data-testid="logout-btn"
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm font-mono uppercase tracking-[0.18em] text-muted_ink hover:text-signal transition-colors"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.5} /> Logout
              </button>
            </nav>
          ) : (
            <nav className="flex items-center gap-4">
              <NavLink to="/login" data-testid="nav-login" className={linkClass}>Login</NavLink>
              <NavLink
                to="/signup"
                data-testid="nav-signup"
                className="rounded-sm bg-parchment text-ink hover:bg-white transition-colors px-5 py-2 text-sm font-medium"
              >
                Sign up
              </NavLink>
            </nav>
          )}
        </div>
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 border-t border-rule mt-24">
        <div className="mx-auto max-w-7xl px-6 md:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted_ink">
            DebateX &middot; Argue with an AI that actually pushes back
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted_ink">
            Voice powered by your browser &middot; AI by Groq
          </p>
        </div>
      </footer>
    </div>
  );
}
