import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Star, StarOff, ArrowRight, BookOpen, Zap, Disc3 } from "lucide-react";

const SUGGESTED = [
  "Should AI replace teachers?",
  "Is college still worth it?",
  "Is capitalism ethical?",
  "Should governments regulate AI?",
  "Is social media net positive?",
  "Can art be replaced by AI?",
];

const VOICE_ICONS = {
  sage: BookOpen,
  maverick: Zap,
  echo: Disc3,
};

export default function NewDebate() {
  const navigate = useNavigate();
  const [modes, setModes] = useState([]);
  const [voices, setVoices] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [topic, setTopic] = useState("");
  const [stance, setStance] = useState("");
  const [modeId, setModeId] = useState("devils_advocate");
  const [voiceId, setVoiceId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/modes").then((r) => setModes(r.data));
    api.get("/voices").then((r) => setVoices(r.data));
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
        voice_character: voiceId || null,
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

      {/* Voice Character */}
      <div className="mb-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-4">04 — Choose a voice (optional)</p>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted_ink mb-6">
          Select a speaking character for your AI opponent. Each has a distinct personality and delivery style.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {voices.map((v) => {
            const selected = voiceId === v.id;
            const Icon = VOICE_ICONS[v.id] || Disc3;
            return (
              <button
                key={v.id}
                data-testid={`voice-${v.id}`}
                onClick={() => setVoiceId(selected ? null : v.id)}
                className={`text-left p-6 rounded-lg border transition-all duration-300 ${
                  selected
                    ? "border-gold bg-gold/5 shadow-[0_0_30px_rgba(197,160,89,0.15)]"
                    : "border-rule bg-surface hover:border-parchment/40"
                }`}
              >
                {/* SVG doodle icon */}
                <div className={`mb-5 flex items-center justify-center w-14 h-14 rounded-full border ${
                  selected ? "border-gold text-gold" : "border-rule text-muted_ink"
                }`}>
                  <Icon className="w-7 h-7" strokeWidth={1.2} />
                </div>
                <p className={`font-mono text-[10px] uppercase tracking-[0.24em] mb-3 ${
                  selected ? "text-gold" : "text-muted_ink"
                }`}>
                  {selected ? "Selected" : "Select"}
                </p>
                <p className="font-serif text-2xl leading-tight mb-1">{v.name}</p>
                <p className="text-sm text-muted_ink mb-3">{v.tagline}</p>
                <p className="text-xs text-muted_ink/70 leading-relaxed">{v.description}</p>
              </button>
            );
          })}
          {/* None option */}
          <button
            data-testid="voice-none"
            onClick={() => setVoiceId(null)}
            className={`text-left p-6 rounded-lg border transition-all duration-300 ${
              voiceId === null
                ? "border-rule bg-surface/50"
                : "border-rule bg-surface hover:border-parchment/40"
            }`}
          >
            <div className={`mb-5 flex items-center justify-center w-14 h-14 rounded-full border border-dashed ${
              voiceId === null ? "border-muted_ink text-muted_ink" : "border-rule text-muted_ink"
            }`}>
              <Disc3 className="w-7 h-7" strokeWidth={0.8} />
            </div>
            <p className={`font-mono text-[10px] uppercase tracking-[0.24em] mb-3 ${
              voiceId === null ? "text-muted_ink" : "text-muted_ink"
            }`}>
              {voiceId === null ? "Default" : "Select"}
            </p>
            <p className="font-serif text-2xl leading-tight mb-1">None</p>
            <p className="text-sm text-muted_ink mb-3">No character tint</p>
            <p className="text-xs text-muted_ink/70 leading-relaxed">The AI will speak in its standard debate voice without any character flavor.</p>
          </button>
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