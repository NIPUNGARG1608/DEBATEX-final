import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ArrowRight, Clock, Flame, Trophy, MessageCircle } from "lucide-react";

const Stat = ({ label, value, icon: Icon, testId }) => (
  <article data-testid={testId} className="bg-surface border border-rule rounded-lg p-6">
    <div className="flex items-center justify-between mb-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink">{label}</p>
      <Icon className="w-4 h-4 text-signal" strokeWidth={1.5} />
    </div>
    <p className="font-serif text-4xl md:text-5xl leading-none tracking-tighter">{value}</p>
  </article>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get("/dashboard").then((r) => setData(r.data)).catch((e) => setErr(e?.response?.data?.detail || "Failed to load"));
  }, []);

  if (err) return <div className="p-10 text-muted_ink">{err}</div>;
  if (!data) return <div className="p-10 font-mono text-xs uppercase tracking-[0.2em] text-muted_ink">Loading…</div>;

  return (
    <section className="mx-auto max-w-7xl px-6 md:px-10 py-16" data-testid="dashboard-page">
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 mb-14">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-signal mb-3">— Dashboard</p>
          <h1 className="font-serif text-5xl md:text-6xl tracking-tighter leading-none">
            Hello, {user?.name?.split(" ")[0] || "friend"}.
          </h1>
        </div>
        <Link
          to="/new"
          data-testid="dashboard-start-debate"
          className="inline-flex items-center gap-3 rounded-sm bg-signal text-parchment hover:bg-signal_hover transition-colors px-8 py-3.5 text-sm font-medium"
        >
          Start new debate <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat testId="stat-total" label="Total Debates" value={data.total_debates} icon={MessageCircle} />
        <Stat testId="stat-hours" label="Hours Debated" value={data.total_hours} icon={Clock} />
        <Stat testId="stat-avg" label="Average Score" value={data.average_score || "—"} icon={Trophy} />
        <Stat testId="stat-fallacy" label="Top Fallacy" value={data.common_fallacies[0]?.name || "—"} icon={Flame} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <article className="lg:col-span-2 bg-surface border border-rule rounded-lg p-6" data-testid="improvement-chart">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-6">Improvement over time</p>
          {data.improvement.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted_ink text-sm">
              Complete debates to see your progress.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.improvement.map((d, i) => ({ ...d, i: i + 1 }))}>
                  <CartesianGrid stroke="#262626" strokeDasharray="2 4" />
                  <XAxis dataKey="i" stroke="#666" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
                  <YAxis stroke="#666" domain={[0, 100]} tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
                  <Tooltip contentStyle={{ background: "#0F0F0F", border: "1px solid #262626", fontFamily: "Outfit" }} />
                  <Line type="monotone" dataKey="score" stroke="#E03C31" strokeWidth={2} dot={{ fill: "#E03C31", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="bg-surface border border-rule rounded-lg p-6" data-testid="fav-topics">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-6">Most-debated topics</p>
          {data.favorite_topics.length === 0 ? (
            <p className="text-sm text-muted_ink">No topics yet.</p>
          ) : (
            <ul className="space-y-4">
              {data.favorite_topics.map((t) => (
                <li key={t.topic} className="flex items-start justify-between gap-4">
                  <span className="text-sm text-parchment leading-snug">{t.topic}</span>
                  <span className="font-mono text-xs text-signal">×{t.count}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <article className="bg-surface border border-rule rounded-lg p-6" data-testid="recent-debates">
        <div className="flex items-center justify-between mb-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink">Recent debates</p>
          <Link to="/history" className="font-mono text-xs uppercase tracking-[0.18em] text-parchment hover:text-signal">
            View all →
          </Link>
        </div>
        {data.recent_debates.length === 0 ? (
          <p className="text-sm text-muted_ink py-8">No debates yet. Start your first one.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {data.recent_debates.map((d) => (
              <li key={d.id} data-testid={`recent-item-${d.id}`} className="py-4 flex items-center justify-between gap-6">
                <div className="min-w-0">
                  <p className="font-serif text-xl truncate">{d.topic}</p>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted_ink mt-1">
                    {d.mode.replace(/_/g, " ")} &middot; {new Date(d.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  to={d.report ? `/report/${d.id}` : `/debate/${d.id}`}
                  className="font-mono text-xs uppercase tracking-[0.18em] text-parchment hover:text-signal whitespace-nowrap"
                >
                  {d.report ? "View report →" : "Continue →"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
