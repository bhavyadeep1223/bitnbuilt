/**
 * Derives pause statistics from raw speech-event timestamps. Runs
 * server-side on client-reported timestamps — the client sends raw signal
 * (when speech was detected), never a pre-computed "pause score", so
 * scoring stays out of client control.
 */
export type PauseMetrics = {
  pauses: number[];
  longestPauseMs: number | null;
  avgPauseMs: number | null;
};

const DEFAULT_PAUSE_THRESHOLD_MS = 1200;

export function computePauseMetrics(
  speechEventTimestamps: number[],
  answerStartTs: number,
  answerEndTs: number,
  pauseThresholdMs = DEFAULT_PAUSE_THRESHOLD_MS
): PauseMetrics {
  const points = [answerStartTs, ...speechEventTimestamps, answerEndTs]
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  const pauses: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const gap = points[i] - points[i - 1];
    if (gap >= pauseThresholdMs) pauses.push(gap);
  }

  if (pauses.length === 0) {
    return { pauses: [], longestPauseMs: null, avgPauseMs: null };
  }

  const longestPauseMs = Math.max(...pauses);
  const avgPauseMs = Math.round(pauses.reduce((a, b) => a + b, 0) / pauses.length);
  return { pauses, longestPauseMs, avgPauseMs };
}
