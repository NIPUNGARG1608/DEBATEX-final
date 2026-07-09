import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";

// --------------------------------------------------------------------------- #
// Browser Web Speech API wrapper (legacy/fallback)
// --------------------------------------------------------------------------- #
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
  const isRunningRef = useRef(false);
  const hasSpeechRef = useRef(false);
  const restartTimeoutRef = useRef(null);
  
  onFinalRef.current = onFinal;

  // Check browser support once
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  // Cleanup on unmount — abort any in-flight recognition
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (_) { /* ignore */ }
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
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

// --------------------------------------------------------------------------- #
// Groq Whisper STT hook (recommended)
// --------------------------------------------------------------------------- #
/**
 * Groq Whisper-based Speech-to-Text hook.
 * Uses MediaRecorder API to record audio and sends to backend for Groq Whisper transcription.
 * 
 * Advantages over Web Speech API:
 * - Works in all browsers (no Chrome-only limitation)
 * - More accurate transcription
 * - No network dependency for recognition (works offline for recording)
 * - Supports multiple languages
 */
export function useGroqSpeechRecognition({ 
  maxDuration = 30000,  // 30 seconds max
  onTranscription,
  onError,
} = {}) {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const onTranscriptionRef = useRef(onTranscription);
  const onErrorRef = useRef(onError);
  const isStartingRef = useRef(false);
  
  // Keep refs updated
  onTranscriptionRef.current = onTranscription;
  onErrorRef.current = onError;

  // Check browser support
  useEffect(() => {
    const isSupported = !!(
      navigator.mediaDevices && 
      navigator.mediaDevices.getUserMedia && 
      window.MediaRecorder
    );
    setSupported(isSupported);
    console.log("[STT] Browser support check:", {
      mediaDevices: !!navigator.mediaDevices,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      mediaRecorder: !!window.MediaRecorder,
      isSupported
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const start = useCallback(async () => {
    console.log("[STT] start() called, supported:", supported, "isStarting:", isStartingRef.current);
    
    // Prevent multiple rapid start calls
    if (isStartingRef.current) {
      console.log("[STT] Already starting, ignoring call");
      return;
    }
    
    if (!supported) {
      const err = "Audio recording not supported in this browser.";
      console.error("[STT] Recording not supported:", err);
      setError(err);
      onErrorRef.current?.(err);
      return;
    }

    isStartingRef.current = true;
    setError(null);
    audioChunksRef.current = [];
    console.log("[STT] Audio chunks reset, starting recording...");

    try {
      // Request microphone access
      console.log("[STT] Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });
      streamRef.current = stream;
      console.log("[STT] Microphone access granted, stream active:", stream.active);

      // Create MediaRecorder with webm format (widely supported)
      // Try different mime types for browser compatibility
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn("[STT] Preferred mime type not supported, trying alternatives...");
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else {
          console.warn("[STT] Using default mime type");
          mimeType = undefined;
        }
      }
      console.log("[STT] Using mime type:", mimeType);

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        console.log("[STT] ondataavailable event, size:", event.data.size);
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = async () => {
        console.log("[STT] onstop triggered, chunks collected:", audioChunksRef.current.length);
        setRecording(false);
        isStartingRef.current = false;
        
        // Stop all tracks to release microphone
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Create blob from recorded chunks
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        console.log("[STT] Audio blob created:", {
          size: audioBlob.size,
          type: audioBlob.type,
          chunks: audioChunksRef.current.length
        });
        
        // Check file size (25MB limit)
        if (audioBlob.size === 0) {
          const err = "Recording produced no audio data. Please try again.";
          console.error("[STT] Empty audio blob detected");
          setError(err);
          onErrorRef.current?.(err);
          return;
        }
        
        if (audioBlob.size > 25 * 1024 * 1024) {
          const err = "Recording too long. Please keep it under 30 seconds.";
          console.error("[STT] Audio blob too large:", audioBlob.size);
          setError(err);
          onErrorRef.current?.(err);
          return;
        }

        // Create a proper File object with filename and mime type
        const file = new File([audioBlob], 'recording.webm', { 
          type: mimeType || 'audio/webm',
          lastModified: Date.now()
        });
        console.log("[STT] File object created:", {
          name: file.name,
          size: file.size,
          type: file.type
        });

        // Send to backend for transcription
        setTranscribing(true);
        try {
          const formData = new FormData();
          formData.append('file', file, 'recording.webm');
          console.log("[STT] FormData created, sending to backend...");

          const backendUrl = process.env.REACT_APP_BACKEND_URL;
          console.log("[STT] Backend URL:", backendUrl);
          
          const response = await fetch(`${backendUrl}/api/stt`, {
            method: 'POST',
            body: formData,
          });

          console.log("[STT] Response received:", {
            status: response.status,
            ok: response.ok,
            statusText: response.statusText
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("[STT] API error response:", errorData);
            throw new Error(errorData.detail || `STT failed: ${response.status}`);
          }

          const data = await response.json();
          console.log("[STT] Transcription result:", data);
          onTranscriptionRef.current?.(data.text);
        } catch (err) {
          console.error("[STT] Transcription error:", err);
          const errorMsg = err.message || "Failed to transcribe audio";
          setError(errorMsg);
          onErrorRef.current?.(errorMsg);
        } finally {
          setTranscribing(false);
        }
      };

      // Handle errors
      mediaRecorder.onerror = (event) => {
        console.error("[STT] MediaRecorder error:", event.error);
        const err = event.error?.message || "Recording error";
        setError(err);
        setRecording(false);
        isStartingRef.current = false;
        onErrorRef.current?.(err);
      };

      // Start recording
      console.log("[STT] Starting MediaRecorder...");
      mediaRecorder.start(100); // Collect data every 100ms
      setRecording(true);
      console.log("[STT] MediaRecorder started, recording state:", true);

      // Auto-stop after max duration
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          console.log("[STT] Auto-stopping after max duration");
          mediaRecorderRef.current.stop();
        }
      }, maxDuration);

    } catch (err) {
      console.error("[STT] Failed to start recording:", err);
      isStartingRef.current = false;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        const errMsg = "Microphone permission denied. Please allow microphone access.";
        setError(errMsg);
        onErrorRef.current?.(errMsg);
      } else {
        const errMsg = err.message || "Failed to start recording";
        setError(errMsg);
        onErrorRef.current?.(errMsg);
      }
    }
  }, [supported, maxDuration]);

  const stop = useCallback(() => {
    console.log("[STT] stop() called, recorder state:", mediaRecorderRef.current?.state);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return {
    recording,
    supported,
    error,
    transcribing,
    start,
    stop,
  };
}

// --------------------------------------------------------------------------- #
// Edge-TTS powered speech synthesis
// --------------------------------------------------------------------------- #
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