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
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (_) { /* ignore */ }
      }
    };
  }, []);

  const start = useCallback(() => {
    setError(null);
    shouldRestartRef.current = true;

    // Abort any previous recognition instance before creating a new one
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) { /* ignore */ }
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition not supported in this browser.");
      return;
    }

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
      if (interimStr) setInterim(interimStr);
      if (finalStr) {
        setFinalText((prev) => (prev + " " + finalStr).trim());
        setInterim("");
        onFinalRef.current?.(finalStr.trim());
      }
    };

    rec.onend = () => {
      // In continuous mode, the recognition can end unexpectedly.
      // If we should still be listening, try to restart.
      if (shouldRestartRef.current) {
        try {
          rec.start();
        } catch (e) {
          // If restart fails, stop listening
          setListening(false);
          shouldRestartRef.current = false;
        }
      } else {
        setListening(false);
      }
    };

    rec.onerror = (event) => {
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
          try {
            setTimeout(() => rec.start(), 1000);
          } catch (e) {
            setListening(false);
            shouldRestartRef.current = false;
          }
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
      // In continuous mode, this doesn't stop recognition
      // The user can continue speaking and it will pick up
    };

    // Handle when speech starts
    rec.onspeechstart = () => {
      // Clear any previous errors when speech actually starts
      setError(null);
    };

    // Handle audio start (microphone activated)
    rec.onaudiostart = () => {
      // Audio stream is now active
    };

    // Handle when audio ends
    rec.onaudioend = () => {
      // Audio stream ended
    };

    // Handle no match (speech detected but not recognized)
    rec.onnomatch = () => {
      // Speech was detected but couldn't be recognized
    };

    recognitionRef.current = rec;

    try {
      rec.start();
      setListening(true);
      setFinalText("");
      setInterim("");
    } catch (err) {
      shouldRestartRef.current = false;
      setError(err.message || "Failed to start microphone. Check permissions.");
    }
  }, [lang]);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
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