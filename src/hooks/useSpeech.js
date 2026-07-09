import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";

/**
 * Browser Web Speech API wrapper. Provides live speech recognition
 * (STT) and text-to-speech (TTS) via backend Edge-TTS for human-like voices.
 *
 * Creates a fresh SpeechRecognition instance on each start() to avoid
 * the well-known "finished state" bug where reusing an instance silently
 * fails after it has stopped.
 */
export function useSpeechRecognition({ lang = "en-US", onFinal } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const onFinalRef = useRef(onFinal);
  const shouldRestartRef = useRef(false);
  const restartTimeoutRef = useRef(null);
  // Track if we've received any speech to detect silent failures
  const hasSpeechRef = useRef(false);
  // Track if recognition is actually running (not just in restart delay)
  const isRunningRef = useRef(false);
  onFinalRef.current = onFinal;

  // Check browser support once
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  // Cleanup on unmount — abort any in-flight recognition
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      isRunningRef.current = false;
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (_) { /* ignore */ }
      }
    };
  }, []);

  // Create a recognition instance with all event handlers
  const createRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (e) => {
      let interimStr = "";
      let finalStr = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalStr += t;
        else interimStr += t;
      }
      if (interimStr) {
        console.debug("Interim result:", interimStr);
        setInterim(interimStr);
        hasSpeechRef.current = true;
      }
      if (finalStr) {
        console.debug("Final result:", finalStr);
        setFinalText((prev) => (prev + " " + finalStr).trim());
        setInterim("");
        onFinalRef.current?.(finalStr.trim());
        hasSpeechRef.current = true;
      }
    };

    rec.onend = () => {
      console.debug("Recognition ended, shouldRestart:", shouldRestartRef.current, "hasSpeech:", hasSpeechRef.current, "isRunning:", isRunningRef.current);
      isRunningRef.current = false;
      setStarting(false);
      
      // In continuous mode, the recognition can end unexpectedly.
      // If we should still be listening, create a new instance and restart.
      if (shouldRestartRef.current) {
        // Only restart if we haven't received any speech (to avoid interrupting user)
        // or if the recognition ended unexpectedly
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current);
        }
        // Use a longer delay to avoid rapid restart loops
        restartTimeoutRef.current = setTimeout(() => {
          if (shouldRestartRef.current && !hasSpeechRef.current) {
            // Create a fresh instance
            const newRec = createRecognition();
            if (newRec) {
              recognitionRef.current = newRec;
              try {
                newRec.start();
                isRunningRef.current = true;
                setStarting(true);
                setListening(true);
                hasSpeechRef.current = false;
              } catch (e) {
                console.error("Failed to restart recognition:", e);
                setListening(false);
                setStarting(false);
                shouldRestartRef.current = false;
              }
            }
          } else {
            // Either not restarting or we have speech - stop listening
            setListening(false);
          }
        }, 500);
      } else {
        setListening(false);
      }
    };

    rec.onerror = (event) => {
      console.warn("Speech recognition error:", event.error, event.message);
      setStarting(false);
      // "aborted" is expected when the user manually stops — don't surface it
      if (event.error === "aborted") {
        shouldRestartRef.current = false;
        isRunningRef.current = false;
        setListening(false);
        return;
      }
      // "not-allowed" = permission denied - this is critical
      if (event.error === "not-allowed") {
        console.error("Microphone permission denied. Please allow microphone access in browser settings.");
        shouldRestartRef.current = false;
        isRunningRef.current = false;
        setListening(false);
        setError("Microphone permission denied. Please allow microphone access and try again.");
        return;
      }
      // "no-speech" is common and not critical - just log it
      if (event.error === "no-speech") {
        console.debug("Speech recognition: no speech detected");
        // Don't stop listening on no-speech - let it continue
        return;
      }
      // "network" errors can be recovered from
      if (event.error === "network" || event.error === "network-timeout") {
        console.warn("Speech recognition network error, attempting restart...");
        if (shouldRestartRef.current) {
          restartTimeoutRef.current = setTimeout(() => {
            if (shouldRestartRef.current && !hasSpeechRef.current) {
              const newRec = createRecognition();
              if (newRec) {
                recognitionRef.current = newRec;
                try {
                  newRec.start();
                  isRunningRef.current = true;
                  setStarting(true);
                  setListening(true);
                  hasSpeechRef.current = false;
                } catch (e) {
                  setListening(false);
                  setStarting(false);
                  shouldRestartRef.current = false;
                }
              }
            } else {
              setListening(false);
            }
          }, 1000);
        }
        return;
      }
      // For other errors, stop and show the error
      shouldRestartRef.current = false;
      isRunningRef.current = false;
      setListening(false);
      setError(event.error);
    };

    // Handle when speech input ends (user stops talking)
    rec.onspeechend = () => {
      console.debug("Speech ended");
    };

    // Handle when speech starts
    rec.onspeechstart = () => {
      console.debug("Speech started");
      // Clear any previous errors when speech actually starts
      setError(null);
      hasSpeechRef.current = true;
    };

    // Handle audio start (microphone activated)
    rec.onaudiostart = () => {
      console.debug("Audio started - mic is active");
      isRunningRef.current = true;
      setStarting(false);
      setListening(true);
    };

    // Handle when audio ends
    rec.onaudioend = () => {
      console.debug("Audio ended");
    };

    // Handle no match (speech detected but not recognized)
    rec.onnomatch = () => {
      console.debug("No match - speech not recognized");
    };

    // Handle sound start (for Chrome)
    rec.onsoundstart = () => {
      console.debug("Sound detected");
    };

    // Handle sound end
    rec.onsoundend = () => {
      console.debug("Sound ended");
    };

    return rec;
  }, [lang]);

  const start = useCallback(() => {
    setError(null);
    shouldRestartRef.current = true;
    hasSpeechRef.current = false;
    isRunningRef.current = false;
    setStarting(true);

    // Abort any previous recognition instance before creating a new one
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) { /* ignore */ }
    }

    const rec = createRecognition();
    if (!rec) {
      setError("Speech recognition not supported in this browser.");
      setStarting(false);
      return;
    }

    recognitionRef.current = rec;

    try {
      rec.start();
      // Don't set listening to true yet - wait for onaudiostart
      // This ensures the UI only shows active when mic is actually working
    } catch (err) {
      console.error("Failed to start recognition:", err);
      shouldRestartRef.current = false;
      isRunningRef.current = false;
      setStarting(false);
      setError(err.message || "Failed to start microphone. Check permissions.");
    }
  }, [createRecognition]);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    isRunningRef.current = false;
    setStarting(false);
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    if (!recognitionRef.current) return;
    try { recognitionRef.current.stop(); } catch (_) { /* ignore */ }
    // Don't set listening to false here - let onend handle it
    // This ensures we capture any final results that come after stop()
  }, []);

  // Get the current captured text (combines interim and final)
  const getCapturedText = useCallback(() => {
    // Return finalText if available, otherwise interim
    return (finalText || "").trim() || (interim || "").trim();
  }, [finalText, interim]);

  return { supported, listening, starting, interim, finalText, error, start, stop, setFinalText, getCapturedText };
}

/**
 * Edge-TTS powered speech synthesis.
 * Uses the backend /api/tts endpoint to generate high-quality,
 * human-like speech via Microsoft Edge-TTS.
 */
export function useEdgeSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false);
  const [supported] = useState(true); // Always supported since it uses HTTP audio
  const [loading, setLoading] = useState(false);
  const [ttsError, setTtsError] = useState(null);
  const audioRef = useRef(null);
  const abortRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const speak = useCallback((text, { voiceCharacter, onEnd, onError } = {}) => {
    if (!text || !text.trim()) return;

    // Cancel any ongoing speech
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    abortRef.current = false;
    setSpeaking(true);
    setLoading(true);
    setTtsError(null);

    const controller = new AbortController();

    (async () => {
      try {
        const response = await api.post("/tts", {
          text: text,
          voice_character: voiceCharacter || null,
        }, {
          responseType: "blob",
          signal: controller.signal,
        });

        if (abortRef.current) return;

        setLoading(false);
        
        const blob = response.data;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        // Handle autoplay - need user interaction for audio to play
        const playPromise = audio.play().catch(err => {
          console.error("Audio play failed (likely autoplay policy):", err);
          if (err.name === 'NotAllowedError') {
            setTtsError("Click to enable audio playback");
          }
          throw err;
        });

        audio.onended = () => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
          setLoading(false);
          audioRef.current = null;
          onEnd?.();
        };

        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          URL.revokeObjectURL(url);
          setSpeaking(false);
          setLoading(false);
          audioRef.current = null;
          onError?.(e);
          onEnd?.();
        };

        await playPromise;
      } catch (err) {
        if (err?.code === 20 /* ABORT_ERR */ || abortRef.current) return;
        console.error("Edge-TTS playback error:", err);
        setSpeaking(false);
        setLoading(false);
        onError?.(err);
        onEnd?.();
      }
    })();

    // Return abort function
    return () => {
      controller.abort();
    };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(false);
    setLoading(false);
    setTtsError(null);
  }, []);

  return { supported, speaking, loading, error: ttsError, speak, cancel };
}