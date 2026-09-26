"use client";

import { useEffect } from "react";

/**
 * Observes tab visibility, window focus, fullscreen, and audio-input
 * changes while an interview is active, and reports each as a timestamped
 * event. Purely observational — this hook makes no judgment about what any
 * event means; that interpretation happens only in the recruiter-facing
 * integrity report, with explicit non-accusatory framing.
 */
export function useBrowserIntegritySignals(interviewId: string, active: boolean) {
  useEffect(() => {
    if (!active) return;

    function report(type: string, metadata?: Record<string, unknown>) {
      fetch(`/api/interviews/${interviewId}/integrity-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, timestamp: Date.now(), metadata }),
      }).catch(() => {
        // Best-effort signal — never blocks or interrupts the interview.
      });
    }

    function onVisibilityChange() {
      report(document.hidden ? "TAB_HIDDEN" : "TAB_VISIBLE");
    }
    function onBlur() {
      report("FOCUS_LOST");
    }
    function onFocus() {
      report("FOCUS_RESTORED");
    }
    function onFullscreenChange() {
      report(document.fullscreenElement ? "FULLSCREEN_ENTER" : "FULLSCREEN_EXIT");
    }

    let knownAudioInputIds = new Set<string>();
    async function refreshAudioInputs(): Promise<Set<string>> {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return new Set(devices.filter((d) => d.kind === "audioinput").map((d) => d.deviceId));
      } catch {
        return new Set();
      }
    }
    async function onDeviceChange() {
      const current = await refreshAudioInputs();
      const lost = [...knownAudioInputIds].some((id) => !current.has(id));
      const gained = [...current].some((id) => !knownAudioInputIds.has(id));
      if (lost) report("MIC_DISCONNECT");
      else if (gained) report("AUDIO_INPUT_CHANGE");
      knownAudioInputIds = current;
    }

    refreshAudioInputs().then((ids) => {
      knownAudioInputIds = ids;
    });

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
    };
  }, [interviewId, active]);
}
