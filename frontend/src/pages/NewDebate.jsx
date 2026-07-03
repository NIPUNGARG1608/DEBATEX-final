import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Star, StarOff, ArrowRight } from "lucide-react";

const SUGGESTED = [
  "Should AI replace teachers?",
  "Is college still worth it?",
  "Is capitalism ethical?",
  "Should governments regulate AI?",
  "Is social media net positive?",
  "Can art be replaced by AI?",
];

export default function NewDebate() {
  const navigate = useNavigate();
  const [modes, setModes] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [topic, setTopic] = useState("");
  const [stance, setStance] = useState("");
  const [modeId, setModeId] = useState("devils_advocate");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/modes").then((r) => setModes(r.data));
    api.get("/favorites").then((r) => setFavorites(r.data.favorites || []));
  }, []);

  const toggleFavorite = async (t) => {
    try {
      if (favorites.includes(t)) {
        const { data } = await api.delete("/favorites", { data: { topic: t } });
        setFavorites(data.favorites || []);
      } else {
        const { data } = await api.post("/favorites", { topic: t });
        setFavorites(data.favorites || []);
      }
    } catch (e) {
      toast.error("Could not update favorites");
    }
  };

  const startDebate = async () => {
    if (!topic.trim()) return toast.error("Enter a topic first");
    setLoading(true);
    try {
      const { data } = await api.post("/debates", {
        topic: topic.trim(),
        mode: modeId,
        user_stance: stance.trim() || null,
      });
      navigate(`/debate/${data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start debate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-6 md:px-10 py-16" data-testid="new-debate-page">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-signal mb-3">— New debate</p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tighter leading-none mb-14">Set the stage.</h1>

      {/* Topic */}
      <div className="mb-14">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-4">01 — Your topic</p>
        <input
          data-testid="topic-input"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Should we tax robots that replace human workers?"
          className="w-full bg-transparent border-b border-rule focus:border-parchment outline-none font-serif text-2xl md:text-4xl py-4 tracking-tight placeholder:text-muted_ink/40 transition-colors"
        />

        <div className="mt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-4">Suggestions</p>
          <div className="flex flex-wrap gap-3">
            {SUGGESTED.map((t) => (
              <button
                key={t}
                data-testid={`suggested-${t}`}
                onClick={() => setTopic(t)}
                className="group inline-flex items-center gap-2 border border-rule text-sm px-4 py-2 rounded-sm hover:border-signal hover:text-signal transition-colors font-mono"
              >
                <span>{t}</span>
                <span
                  role="button"
                  aria-label="favorite"
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(t); }}
                  data-testid={`fav-toggle-${t}`}
                >
                  {favorites.includes(t) ? (
                    <Star className="w-3.5 h-3.5 fill-signal text-signal" />
                  ) : (
                    <StarOff className="w-3.5 h-3.5 text-muted_ink" />
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {favorites.length > 0 && (
          <div className="mt-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-4">Your favorites</p>
            <div className="flex flex-wrap gap-3">
              {favorites.map((t) => (
                <button
                  key={t}
                  onClick={() => setTopic(t)}
                  data-testid={`fav-topic-${t}`}
                  className="inline-flex items-center gap-2 border border-signal/60 text-sm px-4 py-2 rounded-sm text-signal hover:bg-signal hover:text-parchment transition-colors font-mono"
                >
                  <Star className="w-3.5 h-3.5" /> {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stance */}
      <div className="mb-14">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-4">02 — Your stance (optional)</p>
        <input
          data-testid="stance-input"
          value={stance}
          onChange={(e) => setStance(e.target.value)}
          placeholder="What do you believe? The AI will argue against it."
          className="w-full bg-elevated border border-rule rounded-sm px-4 py-3 text-parchment focus:border-parchment outline-none transition-colors"
        />
      </div>

      {/* Mode */}
      <div className="mb-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-4">03 — Choose your opponent</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {modes.map((m) => {
            const selected = modeId === m.id;
            return (
              <button
                key={m.id}
                data-testid={`mode-${m.id}`}
                onClick={() => setModeId(m.id)}
                className={`text-left p-6 rounded-lg border transition-all duration-300 ${
                  selected
                    ? "border-signal bg-signal/5 shadow-[0_0_30px_rgba(224,60,49,0.15)]"
                    : "border-rule bg-surface hover:border-parchment/40"
                }`}
              >
                <p className={`font-mono text-[10px] uppercase tracking-[0.24em] mb-4 ${selected ? "text-signal" : "text-muted_ink"}`}>
                  {selected ? "Selected" : "Select"}
                </p>
                <p className="font-serif text-2xl leading-tight mb-3">{m.name}</p>
                <p className="text-sm text-muted_ink leading-relaxed">{m.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <button
        data-testid="start-debate-btn"
        onClick={startDebate}
        disabled={loading}
        className="w-full sm:w-auto inline-flex items-center gap-3 rounded-sm bg-signal text-parchment hover:bg-signal_hover disabled:opacity-50 transition-colors px-10 py-4 text-sm font-medium"
      >
        {loading ? "Starting…" : "Begin debate"} <ArrowRight className="w-4 h-4" strokeWidth={2} />
      </button>
    </section>
  );
}
