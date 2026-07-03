import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Bookmark, BookmarkCheck, Search, Trash2, Play } from "lucide-react";
import { toast } from "sonner";

export default function History() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [bookmarksOnly, setBookmarksOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (q.trim()) params.search = q.trim();
      if (bookmarksOnly) params.bookmarked = true;
      const { data } = await api.get("/debates", { params });
      setItems(data);
    } catch (e) {
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, bookmarksOnly]);

  const toggleBookmark = async (id, current) => {
    const { data } = await api.patch(`/debates/${id}/bookmark`, { bookmarked: !current });
    setItems((prev) => prev.map((d) => (d.id === id ? data : d)));
  };

  const remove = async (id) => {
    if (!confirm("Delete this debate?")) return;
    await api.delete(`/debates/${id}`);
    setItems((prev) => prev.filter((d) => d.id !== id));
    toast.success("Deleted.");
  };

  return (
    <section className="mx-auto max-w-6xl px-6 md:px-10 py-16" data-testid="history-page">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-signal mb-3">— Library</p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tighter leading-none mb-12">Your debates.</h1>

      <div className="flex flex-col sm:flex-row items-stretch gap-3 mb-10">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted_ink" strokeWidth={1.5} />
          <input
            data-testid="history-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search topics…"
            className="w-full bg-elevated border border-rule rounded-sm pl-11 pr-4 py-3 text-parchment focus:border-parchment outline-none"
          />
        </div>
        <button
          data-testid="filter-bookmarks"
          onClick={() => setBookmarksOnly((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-sm border px-5 py-3 text-sm font-mono uppercase tracking-[0.18em] transition-colors ${
            bookmarksOnly ? "border-signal text-signal" : "border-rule text-parchment hover:border-parchment"
          }`}
        >
          {bookmarksOnly ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          Bookmarks
        </button>
      </div>

      {loading ? (
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted_ink">Loading…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-24 border border-rule rounded-lg">
          <p className="font-serif text-3xl text-muted_ink mb-3">No debates yet.</p>
          <Link to="/new" className="text-signal hover:text-signal_hover font-mono uppercase tracking-[0.18em] text-sm">
            Start one →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-rule border border-rule rounded-lg bg-surface">
          {items.map((d) => (
            <li key={d.id} data-testid={`history-item-${d.id}`} className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-elevated transition-colors">
              <div className="min-w-0 flex-1">
                <p className="font-serif text-2xl truncate leading-tight">{d.topic}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted_ink mt-2">
                  {d.mode.replace(/_/g, " ")} &middot; {new Date(d.created_at).toLocaleDateString()} &middot;{" "}
                  {d.messages.length} turns
                  {d.report && <span className="ml-2 text-signal">score {d.report.overall_score}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleBookmark(d.id, d.bookmarked)}
                  data-testid={`bookmark-${d.id}`}
                  className={`p-2 rounded-sm border transition-colors ${
                    d.bookmarked ? "border-signal text-signal" : "border-rule text-muted_ink hover:border-parchment hover:text-parchment"
                  }`}
                  aria-label="Bookmark"
                >
                  {d.bookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                </button>
                <Link
                  to={d.report ? `/report/${d.id}` : `/debate/${d.id}`}
                  data-testid={`open-${d.id}`}
                  className="inline-flex items-center gap-2 rounded-sm border border-rule hover:border-parchment px-4 py-2 text-sm font-mono uppercase tracking-[0.18em]"
                >
                  <Play className="w-3.5 h-3.5" /> {d.report ? "Report" : "Replay"}
                </Link>
                <button
                  onClick={() => remove(d.id)}
                  data-testid={`delete-${d.id}`}
                  className="p-2 rounded-sm border border-rule hover:border-signal hover:text-signal transition-colors"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
