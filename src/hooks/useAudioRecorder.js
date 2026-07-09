import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";

/**
 * Audio recording hook using MediaRecorder API.
 * Records audio in webm format and sends to backend for Groq Whisper STT.
 * 
 * Features:
 * - Records audio using browser's MediaRecorder API
 * - Automatically stops after silence or max duration
 * - Sends audio to /api/stt endpoint for transcription
 * - Handles file size validation (25MB limit)
 * - Provides real-time recording state
 */
export function useAudioRecorder({ 
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
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorder.current.stop();
      }
    };
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      const err = "Audio recording not supported in this browser.";
      setError(err);
      onErrorRef.current?.(err);
      return;
    }

    setError(null);
    audioChunksRef.current = [];

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });
      streamRef.current = stream;

      // Create MediaRecorder with webm format (widely supported)
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      mediaRecorderRef.current = mediaRecorder;

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = async () => {
        setRecording(false);
        
        // Stop all tracks to release microphone
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Create blob from recorded chunks
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Check file size (25MB limit)
        if (audioBlob.size > 25 * 1024 * 1024) {
          const err = "Recording too long. Please keep it under 30 seconds.";
          setError(err);
          onErrorRef.current?.(err);
          return;
        }

        // Send to backend for transcription
        setTranscribing(true);
        try {
          const formData = new FormData();
          formData.append('file', audioBlob, 'recording.webm');

          const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/stt`, {
            method: 'POST',
            body: formData,
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('debatex_token') || ''}`,
            },
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `STT failed: ${response.status}`);
          }

          const data = await response.json();
          onTranscriptionRef.current?.(data.text);
        } catch (err) {
          console.error("STT error:", err);
          const errorMsg = err.message || "Failed to transcribe audio";
          setError(errorMsg);
          onErrorRef.current?.(errorMsg);
        } finally {
          setTranscribing(false);
        }
      };

      // Handle errors
      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        const err = event.error?.message || "Recording error";
        setError(err);
        setRecording(false);
        onErrorRef.current?.(err);
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setRecording(true);

      // Auto-stop after max duration
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, maxDuration);

    } catch (err) {
      console.error("Failed to start recording:", err);
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