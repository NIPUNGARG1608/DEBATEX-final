import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { useSpeechRecognition, useEdgeSpeechSynthesis } from "@/hooks/useSpeech";
import MicButton from "@/components/MicButton";
import SoundWave from "@/components/SoundWave";
import { Send, StopCircle, Flag, Loader2, Globe } from "lucide-react";

export default function DebateSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [debate, setDebate] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [sending, setSending] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const { supported: sttSupported, listening, starting, interim, finalText, error: sttError, start, stop, setFinalText } =
    useSpeechRecognition({});
  const { supported: ttsSupported, speaking, loading, error: ttsError, speak, cancel: cancelSpeak } = useEdgeSpeechSynthesis();

  // Load debate
  useEffect(() => {
    api.get(`/debates/${id}`).then((r) => {
      setDebate(r.data);
      // Auto-speak opener with voice character profile
      const opener = r.data.messages[0];
      if (opener && ttsSupported) {
        const vc = r.data.voice_character;
        // Add error handling for TTS
        speak(opener.content, { 
          voiceCharacter: vc,
          onError: (err) => {
            console.error("TTS error for opener:", err);
            toast.error("Failed to speak opening message. You can read it below.");
          }
        });
      }
    }).catch((e) => setError(e?.response?.data?.detail || "Debate not found"));
    return () => { cancelSpeak(); };
  }, [id, ttsSupported, speak]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [debate?.messages?.length, interim]);

  // Use a ref to track the latest finalText so we can read it immediately
  // after stop() without waiting for a React re-render.
  const finalTextRef = useRef("");
  useEffect(() => { finalTextRef.current = finalText; }, [finalText]);

  const submitTurn = async (message) => {
    const clean = (message || "").trim();
    if (!clean || sending) return;
    setSending(true);
    setTextInput("");
    setFinalText("");

    // Optimistic user message
    setDebate((prev) => ({
      ...prev,
      messages: [...prev.messages, { role: "user", content: clean, ts: new Date().toISOString() }],
    }));

    try {
      const { data } = await api.post("/debates/turn", { debate_id: id, user_message: clean });
      setDebate(data);
      // Speak the new AI reply with voice character profile via Edge-TTS
      const last = data.messages[data.messages.length - 1];
      if (last?.role === "assistant" && ttsSupported) {
        const vc = data.voice_character;
        speak(last.content, { voiceCharacter: vc });
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "AI reply failed");
    } finally {
      setSending(false);
    }
  };

  // Push-to-talk: start listening when button is pressed
  const handlePointerDown = () => {
    if (!sttSupported) {
      toast.error("Voice input not supported in this browser. Use the text field.");
      return;
    }
    // If AI is speaking, interrupt
    if (speaking) cancelSpeak();
    // Start listening only if not already listening
    if (!listening && !starting) {
      start();
    }
  };

  // Push-to-talk: stop listening and send when button is released
  const handlePointerUp = () => {
    if (listening || starting) {
      stop();
      // Read from the ref to avoid stale closure — the last onresult may
      // have fired after the current render's finalText was captured.
      const captured = (finalTextRef.current || "").trim();
      if (captured) submitTurn(captured);
    }
  };

  // Keep click handler for accessibility (space/enter key activation)
  const handleMicClick = () => {
    if (!sttSupported) {
      toast.error("Voice input not supported in this browser. Use the text field.");
      return;
    }
    // For click activation, toggle behavior
    if (listening || starting) {
      stop();
      const captured = (finalTextRef.current || "").trim();
      if (captured) submitTurn(captured);
    } else {
      if (speaking) cancelSpeak();
      start();
    }
  };

  const endDebate = async () => {
    if (!debate || finalizing) return;
    const hasUserTurn = debate.messages.some((m) => m.role === "user");
    if (!hasUserTurn) return toast.error("Speak at least once to get a report.");
    setFinalizing(true);
    try { cancelSpeak(); } catch (e) { void e; }
    try {
      await api.post(`/debates/${id}/report`);
      navigate(`/report/${id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not generate report");
      setFinalizing(false);
    }
  };

  // Surface STT errors (e.g. "not-allowed" = mic permission denied)
  useEffect(() => {
    if (sttError) toast.error(`Microphone: ${sttError}`);
  }, [sttError]);

  // Surface TTS errors
  useEffect(() => {
    if (ttsError) toast.error(`Voice: ${ttsError}`);
  }, [ttsError]);

  if (error) return <div className="p-10 text-muted_ink">{error}</div>;
  if (!debate) return <div className="p-10 font-mono text-xs uppercase tracking-[0.2em] text-muted_ink">Loading…</div>;

  return (
    <section className="mx-auto max-w-5xl px-6 md:px-10 py-10" data-testid="debate-session">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-10">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-signal mb-2">
            {debate.mode.replace(/_/g, " ")}
          </p>
          <h1 data-testid="debate-topic" className="font-serif text-3xl md:text-4xl tracking-tight leading-tight text-balance">
            {debate.topic}
          </h1>
          {debate.voice_character && (
            <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-gold mt-2">
              Voice: {debate.voice_character}
            </p>
          )}
        </div>
        <button
          data-testid="end-debate-btn"
          onClick={endDebate}
          disabled={finalizing}
          className="inline-flex items-center gap-2 rounded-sm border border-rule hover:border-signal hover:text-signal transition-colors px-5 py-2.5 text-sm font-mono uppercase tracking-[0.18em]"
        >
          {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" strokeWidth={1.5} />}
          {finalizing ? "Analyzing…" : "End & analyze"}
        </button>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        data-testid="transcript"
        className="bg-surface border border-rule rounded-lg p-6 md:p-8 h-[52vh] overflow-y-auto space-y-6 mb-8"
      >
        {debate.messages.map((m, i) => (
          <div key={i} data-testid={`msg-${i}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] ${m.role === "user" ? "text-right" : ""}`}>
              <p className={`font-mono text-[10px] uppercase tracking-[0.28em] mb-2 ${m.role === "user" ? "text-parchment" : "text-signal"}`}>
                {m.role === "user" ? "You" : "DebateX"}
                {m.used_web_search && (
                  <span className="ml-2 inline-flex items-center gap-1 text-gold">
                    <Globe className="w-3 h-3" /> Live sources
                  </span>
                )}
              </p>
              <p
                className={`font-serif text-xl md:text-2xl leading-snug ${
                  m.role === "user" ? "text-parchment" : "text-parchment"
                }`}
              >
                {m.content}
              </p>
            </div>
          </div>
        ))}
        {interim && (
          <div className="flex justify-end">
            <div className="max-w-[85%] text-right opacity-60">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] mb-2 text-parchment">You (live)</p>
              <p className="font-serif text-xl md:text-2xl leading-snug italic">{interim}</p>
            </div>
          </div>
        )}
        {sending && (
          <div className="flex justify-start">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted_ink flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> DebateX is thinking…
            </p>
          </div>
        )}
      </div>

      {/* Mic & controls */}
      <div className="flex flex-col items-center gap-6 mb-8">
        <MicButton 
          active={listening || starting} 
          onClick={handleMicClick} 
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          size="xl" 
          testId="session-mic" 
        />
        <SoundWave active={listening || speaking || loading || starting} bars={40} tone="signal" />
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted_ink text-center max-w-md">
          {loading
            ? "Preparing voice…"
            : starting
            ? "Activating microphone…"
            : listening
            ? "Listening… release to send."
            : speaking
            ? "DebateX is speaking. Tap the mic to interrupt."
            : sttSupported
            ? "Hold the mic button to speak, or type below."
            : "Voice not supported here — use the text field."}
        </p>
        {speaking && (
          <button
            data-testid="interrupt-btn"
            onClick={cancelSpeak}
            className="inline-flex items-center gap-2 text-sm text-signal hover:text-signal_hover font-mono uppercase tracking-[0.18em]"
          >
            <StopCircle className="w-4 h-4" /> Interrupt
          </button>
        )}
      </div>

      {/* Text fallback */}
      <form
        onSubmit={(e) => { e.preventDefault(); submitTurn(textInput); }}
        className="flex items-center gap-3"
        data-testid="text-form"
      >
        <input
          data-testid="text-input"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Or type your response…"
          className="flex-1 bg-elevated border border-rule rounded-sm px-4 py-3 text-parchment focus:border-parchment outline-none transition-colors"
        />
        <button
          data-testid="text-send"
          type="submit"
          disabled={sending || !textInput.trim()}
          className="inline-flex items-center gap-2 rounded-sm bg-parchment text-ink hover:bg-white disabled:opacity-50 transition-colors px-5 py-3 text-sm font-medium"
        >
          <Send className="w-4 h-4" strokeWidth={2} /> Send
        </button>
      </form>
    </section>
  );
}