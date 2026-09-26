"use client";

import { useEffect, useRef } from "react";

const BAR_COUNT = 24;

/**
 * Live microphone-reactive waveform while `active`; a slow idle pulse
 * otherwise. Only requests mic access when it actually needs to render
 * live audio, tied to the same user gesture that starts speech recognition.
 */
export function Waveform({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let analyser: AnalyserNode | null = null;
    let dataArray: Uint8Array<ArrayBuffer> | null = null;
    let idlePhase = 0;
    let cancelled = false;

    function draw() {
      if (!ctx || !canvas) return;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const barWidth = width / BAR_COUNT;

      for (let i = 0; i < BAR_COUNT; i++) {
        let amplitude: number;
        if (analyser && dataArray) {
          const sliceStart = Math.floor((i / BAR_COUNT) * dataArray.length);
          amplitude = dataArray[sliceStart] / 255;
        } else {
          amplitude = 0.15 + 0.1 * Math.sin(idlePhase + i * 0.5);
        }
        const barHeight = Math.max(2, amplitude * height);
        ctx.fillStyle = active ? "#4fd1ff" : "rgba(139, 146, 163, 0.5)";
        ctx.fillRect(i * barWidth + 1, (height - barHeight) / 2, barWidth - 2, barHeight);
      }

      idlePhase += 0.08;
      rafRef.current = requestAnimationFrame(draw);
    }

    async function setup() {
      if (!active) {
        draw();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        dataArray = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        source.connect(analyser);
      } catch {
        // Mic permission denied or unavailable — fall back to the idle pulse.
      }
      draw();
    }

    setup();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      width={240}
      height={48}
      className="h-12 w-full max-w-xs"
      aria-hidden="true"
    />
  );
}
