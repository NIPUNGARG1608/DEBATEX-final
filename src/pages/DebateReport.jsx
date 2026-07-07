import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "@/lib/api";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { ArrowLeft, Bookmark, BookmarkCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const ScoreBar = ({ label, value, testId }) => (
  <div data-testid={testId} className="mb-5">
    <div className="flex items-baseline justify-between mb-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted_ink">{label}</p>
      <p className="font-serif text-2xl">{value}</p>
    </div>
    <div className="h-[2px] bg-rule">
      <div className="h-full bg-signal transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  </div>
);

export default function DebateReport() {
  const { id } = useParams();
  const [debate, setDebate] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/debates/${id}`).then((r) => setDebate(r.data)).catch((e) => setErr(e?.response?.data?.detail || "Not found"));
  }, [id]);

  const toggleBookmark = async () => {
    try {
      const { data } = await api.patch(`/debates/${id}/bookmark`, { bookmarked: !debate.bookmarked });
      setDebate(data);
      toast.success(data.bookmarked ? "Bookmarked." : "Removed bookmark.");
    } catch (e) { toast.error("Could not update"); }
  };

  if (err) return <div className="p-10 text-muted_ink">{err}</div>;
  if (!debate) return <div className="p-10 font-mono text-xs uppercase tracking-[0.2em] text-muted_ink">Loading…</div>;
  if (!debate.report) {
    return (
      <div className="p-10 max-w-2xl mx-auto text-center">
        <p className="font-serif text-3xl mb-4">No report yet.</p>
        <Link to={`/debate/${id}`} className="text-signal hover:text-signal_hover font-mono uppercase tracking-[0.18em] text-sm">
          Continue debate →
        </Link>
      </div>
    );
  }

  const r = debate.report;
  const radarData = [
    { axis: "Logic", value: r.logic_score },
    { axis: "Evidence", value: r.evidence_score },
    { axis: "Critical", value: r.critical_thinking_score },
    { axis: "Persuasive", value: r.persuasiveness_score },
    { axis: "Comm.", value: r.communication_score },
    { axis: "Confidence", value: r.confidence_score },
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 md:px-10 py-12" data-testid="report-page">
      <Link
        to="/history"
        data-testid="back-to-history"
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted_ink hover:text-parchment mb-8"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to history
      </Link>

      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 mb-14">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-signal mb-3">— Debate report</p>
          <h1 data-testid="report-topic" className="font-serif text-4xl md:text-5xl tracking-tighter leading-tight text-balance">
            {debate.topic}
          </h1>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted_ink mt-3">
            {debate.mode.replace(/_/g, " ")} &middot; {new Date(debate.created_at).toLocaleString()}
          </p>
        </div>
        <button
          data-testid="bookmark-btn"
          onClick={toggleBookmark}
          className="inline-flex items-center gap-2 rounded-sm border border-rule hover:border-signal hover:text-signal transition-colors px-5 py-2.5 text-sm font-mono uppercase tracking-[0.18em]"
        >
          {debate.bookmarked ? <BookmarkCheck className="w-4 h-4 text-signal" /> : <Bookmark className="w-4 h-4" />}
          {debate.bookmarked ? "Bookmarked" : "Bookmark"}
        </button>
      </div>

      {/* Overall Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <article className="bg-surface border border-rule rounded-lg p-8" data-testid="overall-score">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-6">Overall</p>
          <p className="font-serif text-7xl md:text-8xl tracking-tighter leading-none text-signal">{r.overall_score}</p>
          <p className="font-mono text-xs text-muted_ink mt-3">out of 100</p>
          <p className="text-sm text-muted_ink leading-relaxed mt-6">{r.summary}</p>
        </article>

        <article className="lg:col-span-2 bg-surface border border-rule rounded-lg p-8" data-testid="radar-chart">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-6">Skill breakdown</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#262626" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: "#A19D94", fontSize: 11, fontFamily: "JetBrains Mono" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="#E03C31" fill="#E03C31" fillOpacity={0.25} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      {/* Score bars */}
      <article className="bg-surface border border-rule rounded-lg p-8 mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-8">Detailed scores</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-14">
          <ScoreBar testId="score-logic" label="Logic" value={r.logic_score} />
          <ScoreBar testId="score-evidence" label="Evidence" value={r.evidence_score} />
          <ScoreBar testId="score-critical" label="Critical thinking" value={r.critical_thinking_score} />
          <ScoreBar testId="score-persuasive" label="Persuasiveness" value={r.persuasiveness_score} />
          <ScoreBar testId="score-comm" label="Communication" value={r.communication_score} />
          <ScoreBar testId="score-confidence" label="Confidence" value={r.confidence_score} />
        </div>
      </article>

      {/* Arguments */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <article className="bg-surface border border-rule rounded-lg p-6" data-testid="strongest">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-signal mb-4">Strongest argument</p>
          <p className="font-serif text-xl leading-snug">{r.strongest_argument}</p>
        </article>
        <article className="bg-surface border border-rule rounded-lg p-6" data-testid="weakest">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-signal mb-4">Weakest argument</p>
          <p className="font-serif text-xl leading-snug">{r.weakest_argument}</p>
        </article>
        <article className="bg-surface border border-rule rounded-lg p-6" data-testid="assumption">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-signal mb-4">Biggest assumption</p>
          <p className="font-serif text-xl leading-snug">{r.biggest_assumption}</p>
        </article>
      </div>

      {/* Fallacies + Suggestions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-14">
        <article className="bg-surface border border-rule rounded-lg p-6" data-testid="fallacies">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-signal mb-4">Fallacies detected</p>
          {(r.fallacies_detected || []).length === 0 ? (
            <p className="text-sm text-muted_ink">None detected. Solid reasoning.</p>
          ) : (
            <ul className="flex flex-wrap gap-2 mt-2">
              {r.fallacies_detected.map((f) => (
                <li key={f} className="border border-signal/60 text-signal font-mono text-xs uppercase tracking-[0.18em] px-3 py-1.5 rounded-sm">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="bg-surface border border-rule rounded-lg p-6" data-testid="suggestions">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-signal mb-4">Suggestions</p>
          <ul className="space-y-3">
            {(r.suggestions || []).map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-mono text-xs text-signal mt-1">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm text-parchment leading-relaxed">{s}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      {/* Transcript */}
      <article className="bg-surface border border-rule rounded-lg p-6 mb-10" data-testid="report-transcript">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-6">Transcript</p>
        <div className="space-y-5 max-h-[50vh] overflow-y-auto pr-2">
          {debate.messages.map((m, i) => (
            <div key={i}>
              <p className={`font-mono text-[10px] uppercase tracking-[0.24em] mb-1 ${m.role === "user" ? "text-parchment" : "text-signal"}`}>
                {m.role === "user" ? "You" : "DebateX"}
              </p>
              <p className="text-sm text-parchment leading-relaxed">{m.content}</p>
            </div>
          ))}
        </div>
      </article>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          to="/new"
          data-testid="new-debate-cta"
          className="inline-flex items-center gap-3 rounded-sm bg-signal text-parchment hover:bg-signal_hover transition-colors px-8 py-3.5 text-sm font-medium"
        >
          Start another debate <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-3 rounded-sm border border-rule hover:border-parchment transition-colors px-8 py-3.5 text-sm font-mono uppercase tracking-[0.18em]"
        >
          Dashboard
        </Link>
      </div>
    </section>
  );
}
