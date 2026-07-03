/**
 * SoundWave — pure-CSS animated bar visualizer. Signals whether audio is
 * "playing" (the AI is speaking) or "listening" (the user is speaking).
 */
export default function SoundWave({ active = false, bars = 24, tone = "signal" }) {
  const color = tone === "signal" ? "bg-signal" : "bg-parchment";
  return (
    <div
      data-testid="sound-wave"
      className="flex items-center gap-[3px] h-14"
      aria-hidden="true"
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full ${color} ${active ? "animate-wave" : "opacity-30"}`}
          style={{
            height: active ? `${20 + (i % 6) * 8}%` : "20%",
            animationDelay: `${(i % 8) * 90}ms`,
            transformOrigin: "center",
          }}
        />
      ))}
    </div>
  );
}
