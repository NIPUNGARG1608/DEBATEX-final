import { Mic, MicOff } from "lucide-react";

/**
 * MicButton — the hero interaction. Two visual states: idle (subtle) and
 * active (signal-red glow + ripple rings).
 */
export default function MicButton({ active, onClick, size = "lg", disabled = false, testId = "mic-button" }) {
  const dim =
    size === "xl" ? "w-32 h-32" :
    size === "lg" ? "w-24 h-24" :
    "w-16 h-16";
  const iconSize = size === "xl" ? "w-12 h-12" : size === "lg" ? "w-8 h-8" : "w-6 h-6";

  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`relative flex items-center justify-center rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal ${dim} ${
        active
          ? "bg-signal/15 border border-signal text-signal mic-ring animate-pulse-signal"
          : "bg-surface border border-rule text-parchment hover:border-parchment/50 hover:bg-elevated"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
      aria-label={active ? "Stop listening" : "Start listening"}
    >
      {active ? <Mic className={iconSize} strokeWidth={1.5} /> : <MicOff className={iconSize} strokeWidth={1.5} />}
    </button>
  );
}
