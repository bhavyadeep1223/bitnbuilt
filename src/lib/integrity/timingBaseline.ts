/**
 * Personal timing baseline — never an arbitrary universal "suspicious"
 * threshold. Each candidate is compared only against their own norm,
 * established from their first few answered questions.
 */
export type TimingSample = {
  responseGapMs: number | null;
  longestPauseMs: number | null;
  totalDurationMs: number | null;
};

export type TimingBaseline = {
  avgResponseGapMs: number;
  avgLongestPauseMs: number;
  avgDurationMs: number;
  sampleSize: number;
};

export type DeviationLevel = "NORMAL" | "MODERATE_DEVIATION" | "SIGNIFICANT_DEVIATION";

const MIN_BASELINE_SAMPLES = 2;
const DEFAULT_BASELINE_WINDOW = 3;

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeBaseline(
  samples: TimingSample[],
  windowSize = DEFAULT_BASELINE_WINDOW
): TimingBaseline | null {
  const window = samples.slice(0, windowSize);
  const gaps = window.map((s) => s.responseGapMs).filter((v): v is number => v != null);
  const pauses = window.map((s) => s.longestPauseMs ?? 0);
  const durations = window.map((s) => s.totalDurationMs).filter((v): v is number => v != null);

  if (gaps.length < MIN_BASELINE_SAMPLES || durations.length < MIN_BASELINE_SAMPLES) return null;

  return {
    avgResponseGapMs: mean(gaps),
    avgLongestPauseMs: mean(pauses),
    avgDurationMs: mean(durations),
    sampleSize: window.length,
  };
}

/** Ratio-based, with an absolute floor so a tiny baseline (e.g. 300ms) doesn't make ordinary variance look "significant". */
function classifyRatio(current: number, baseline: number, floorMs: number): DeviationLevel {
  const diff = current - baseline;
  if (diff <= floorMs) return "NORMAL";
  const ratio = baseline > 0 ? current / baseline : Infinity;
  if (ratio >= 3) return "SIGNIFICANT_DEVIATION";
  if (ratio >= 1.75) return "MODERATE_DEVIATION";
  return "NORMAL";
}

const levelRank: Record<DeviationLevel, number> = { NORMAL: 0, MODERATE_DEVIATION: 1, SIGNIFICANT_DEVIATION: 2 };
function worse(a: DeviationLevel, b: DeviationLevel): DeviationLevel {
  return levelRank[a] >= levelRank[b] ? a : b;
}

export function classifyDeviation(
  current: TimingSample,
  baseline: TimingBaseline
): { responseGap: DeviationLevel; pausePattern: DeviationLevel; overall: DeviationLevel } {
  const responseGap =
    current.responseGapMs != null
      ? classifyRatio(current.responseGapMs, baseline.avgResponseGapMs, 2000)
      : "NORMAL";
  const pausePattern =
    current.longestPauseMs != null
      ? classifyRatio(current.longestPauseMs, baseline.avgLongestPauseMs, 2000)
      : "NORMAL";

  return { responseGap, pausePattern, overall: worse(responseGap, pausePattern) };
}
