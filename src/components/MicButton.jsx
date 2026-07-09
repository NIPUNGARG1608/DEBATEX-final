import { Mic, MicOff } from "lucide-react";

/**
 * MicButton — the hero interaction. Two visual states: idle (subtle) and
 * active (signal-red glow + ripple rings).
 * 
 * Supports push-to-talk: hold to speak, release to send.
 * For accessibility, also supports click/tap to toggle.
 */
export default function MicButton({ 
  active, 
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  size = "lg", 
  disabled = false, 
  testId = "mic-button" 
}) {
  const dim =
    size === "xl" ? "w-32 h-32" :
    size === "lg" ? "w-24 h-24" :
    "w-16 h-16";
  const iconSize = size === "xl" ? "w-12 h-12" : size === "lg" ? "w-8 h-8" : "w-6 h-6";

  const handlePointerDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    onPointerDown?.(e);
  };

  const handlePointerUp = (e) => {
    if (disabled) return;
    e.preventDefault();
    onPointerUp?.(e);
  };

  const handlePointerLeave = (e) => {
    // If user releases mouse outside the button while holding, still trigger stop
    if (active && onPointerUp) {
      onPointerUp(e);
    }
  };

  const handlePointerCancel = (e) => {
    if (disabled) return;
    e.preventDefault();
    onPointerUp?.(e);
  };

  // Handle click for accessibility (space/enter key activation)
  // Only trigger onClick if not actively recording (to avoid double-trigger)
  const handleClick = (e) => {
    if (disabled) return;
    // Don't trigger click if we're in the middle of a pointer sequence
    // (pointer down -> pointer up will handle it)
    if (!active) {
      onClick?.(e);
    }
  };

  return (
    <button
      data-testid={testId}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
      disabled={disabled}
      className={`relative flex items-center justify-center rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal ${dim} ${
        active
          ? "bg-signal/15 border border-signal text-signal mic-ring animate-pulse-signal"
          : "bg-surface border border-rule text-parchment hover:border-parchment/50 hover:bg-elevated"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
      aria-label={active ? "Release to send" : "Hold to speak"}
      style={{ touchAction: "none" }} // Prevent touch scrolling while holding
    >
      {active ? <Mic className={iconSize} strokeWidth={1.5} /> : <MicOff className={iconSize} strokeWidth={1.5} />}
    </button>
  );
}