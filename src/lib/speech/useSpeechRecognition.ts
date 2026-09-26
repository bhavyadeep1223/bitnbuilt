"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UseSpeechRecognition = {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  error: string | null;
  /** Timestamps (Date.now()) of each recognized speech chunk — raw signal for server-side pause analysis. */
  speechEventTimestamps: number[];
  start: () => void;
  stop: () => void;
  reset: () => void;
};

/**
 * Thin wrapper around the browser's SpeechRecognition API. Not supported in
 * every browser (notably Firefox) — callers must check `isSupported` and
 * fall back to a text input, which is why the interview page always keeps
 * the textarea editable rather than hiding it behind voice.
 */
export function useSpeechRecognition(): UseSpeechRecognition {
  const [isSupported] = useState(
    () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const timestampsRef = useRef<number[]>([]);
  const [speechEventTimestamps, setSpeechEventTimestamps] = useState<number[]>([]);

  useEffect(() => {
    const Ctor =
      typeof window !== "undefined" ? window.SpeechRecognition ?? window.webkitSpeechRecognition : undefined;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event) => {
      setError(event.error);
      setIsListening(false);
    };
    recognition.onresult = (event) => {
      timestampsRef.current.push(Date.now());
      setSpeechEventTimestamps([...timestampsRef.current]);

      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscriptRef.current += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript((finalTranscriptRef.current + interim).trim());
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.abort();
    };
  }, []);

  const start = useCallback(() => {
    setError(null);
    finalTranscriptRef.current = "";
    timestampsRef.current = [];
    setSpeechEventTimestamps([]);
    setTranscript("");
    try {
      recognitionRef.current?.start();
    } catch {
      // Already started — ignore, common when a click fires twice quickly.
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    finalTranscriptRef.current = "";
    timestampsRef.current = [];
    setSpeechEventTimestamps([]);
    setTranscript("");
    setError(null);
  }, []);

  return { isSupported, isListening, transcript, error, speechEventTimestamps, start, stop, reset };
}
