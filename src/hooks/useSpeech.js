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
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const onFinalRef = useRef(onFinal);
  const shouldRestartRef = useRef(false);
  const restartTimeoutRef = useRef(null);
  // Store the latest start function in a ref to avoid circular dependency
  const startRef = useRef(null);
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
      }
      if (finalStr) {
        console.debug("Final result:", finalStr);
        setFinalText((prev) => (prev + " " + finalStr).trim());
        setInterim("");
        onFinalRef.current?.(finalStr.trim());
      }
    };

    rec.onend = () => {
      console.debug("Recognition ended, shouldRestart:", shouldRestartRef.current);
      // In continuous mode, the recognition can end unexpectedly.
      // If we should still be listening, create a new instance and restart.
      if (shouldRestartRef.current) {
        // Clear any existing timeout
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current);
        }
        // Use the startRef to get the latest start function
        restartTimeoutRef.current = setTimeout(() => {
          if (shouldRestartRef.current && startRef.current) {
            startRef.current();
          }
        }, 100);
      } else {
        setListening(false);
      }
    };

    rec.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      // "aborted" is expected when the user manually stops — don't surface it
      if (event.error === "aborted") {
        shouldRestartRef.current = false;
        return;
      }
      // "no-speech" is common and not critical - just log it
      if (event.error === "no-speech") {
        console.debug("Speech recognition: no speech detected");
        return;
      }
      // "network" errors can be recovered from
      if (event.error === "network" || event.error === "network-timeout") {
        console.warn("Speech recognition network error, attempting restart...");
        if (shouldRestartRef.current) {
          restartTimeoutRef.current = setTimeout(() => {
            if (startRef.current) {
              startRef.current();
            }
          }, 1000);
        }
        return;
      }
      // For other errors, stop and show the error
      shouldRestartRef.current = false;
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
    };

    // Handle audio start (microphone activated)
    rec.onaudiostart = () => {
      console.debug("Audio started");
    };

    // Handle when audio ends
    rec.onaudioend = () => {
      console.debug("Audio ended");
    };

    // Handle no match (speech detected but not recognized)
    rec.onnomatch = () => {
      console.debug("No match - speech not recognized");
    };

    return rec;
  }, [lang]);

  const start = useCallback(() => {
    setError(null);
    shouldRestartRef.current = true;

    // Abort any previous recognition instance before creating a new one
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) { /* ignore */ }
    }

    const rec = createRecognition();
    if (!rec) {
      setError("Speech recognition not supported in this browser.");
      return;
    }

    recognitionRef.current = rec;

    try {
      rec.start();
      setListening(true);
      setFinalText("");
      setInterim("");
    } catch (err) {
      console.error("Failed to start recognition:", err);
      shouldRestartRef.current = false;
      setError(err.message || "Failed to start microphone. Check permissions.");
    }
  }, [createRecognition]);

  // Keep startRef updated with the latest start function
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    if (!recognitionRef.current) return;
    try { recognitionRef.current.stop(); } catch (_) { /* ignore */ }
    setListening(false);
  }, []);

  return { supported, listening, interim, finalText, error, start, stop, setFinalText };
}

/**
 * Edge-TTS powered speech synthesis.
 * Uses the backend /api/tts endpoint to generate high-quality,
 * human-like speech via Microsoft Edge-TTS.
 */
export function useEdgeSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false);
  const [supported] = useState(true); // Always supported since it uses HTTP audio
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

  const speak = useCallback((text, { voiceCharacter, onEnd } = {}) => {
    if (!text || !text.trim()) return;

    // Cancel any ongoing speech
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    abortRef.current = false;
    setSpeaking(true);

    // Build the request URL with query params so we can stream the response as audio
    const params = new URLSearchParams();
    // We use POST with JSON body, but we'll create a Blob URL approach instead
    // Use fetch to the backend TTS endpoint with streaming

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

        const blob = response.data;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
          audioRef.current = null;
          onEnd?.();
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
          audioRef.current = null;
          onEnd?.();
        };

        await audio.play();
      } catch (err) {
        if (err?.code === 20 /* ABORT_ERR */ || abortRef.current) return;
        console.error("Edge-TTS playback error:", err);
        setSpeaking(false);
        onEnd?.();
      }
    })();

    // Store abort function
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
  }, []);

  return { supported, speaking, speak, cancel };
}