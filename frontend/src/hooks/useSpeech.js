import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser Web Speech API wrapper. Provides live speech recognition
 * (STT) and text-to-speech (TTS) via speechSynthesis.
 */
export function useSpeechRecognition({ lang = "en-US", onFinal } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const recognitionRef = useRef(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
    if (!SR) return;
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
        onFinalRef.current && onFinalRef.current(finalStr.trim());
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    return () => { try { rec.stop(); } catch (e) { void e; } };
  }, [lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setFinalText("");
    setInterim("");
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (e) { void e; }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try { recognitionRef.current.stop(); } catch (e) { void e; }
    setListening(false);
  }, []);

  return { supported, listening, interim, finalText, start, stop, setFinalText };
}

export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const utterRef = useRef(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  const speak = useCallback((text, { onEnd, rate = 1.03, pitch = 1 } = {}) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = pitch;
    // Prefer a natural-sounding voice
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /Google.*(US|UK).*English/i.test(v.name)) ||
      voices.find((v) => /Samantha|Daniel|Alex|Karen/i.test(v.name)) ||
      voices.find((v) => v.lang?.startsWith("en"));
    if (preferred) u.voice = preferred;
    u.onstart = () => setSpeaking(true);
    u.onend = () => { setSpeaking(false); onEnd && onEnd(); };
    u.onerror = () => { setSpeaking(false); onEnd && onEnd(); };
    utterRef.current = u;
    window.speechSynthesis.speak(u);
  }, []);

  const cancel = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { supported, speaking, speak, cancel };
}
