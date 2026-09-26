export type EvaluationReportView = {
  strengths: string[];
  gaps: string[];
  verifiedSkills: string[];
  partiallyVerified: string[];
  unverifiedClaims: string[];
  reasoningNotes: string[];
  consistencyNotes: string[];
  timingNotes: string[];
  roleAlignment: { summary: string; score: number };
  confidenceScore: number;
};

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">None noted.</p>;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-foreground">
          · {item}
        </li>
      ))}
    </ul>
  );
}

function Chips({ items, tone }: { items: string[]; tone: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">None.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className={`rounded-full border px-2.5 py-1 text-xs ${tone}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function EvidenceReport({ report }: { report: EvaluationReportView }) {
  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Final evaluation</h2>
        <span className="text-2xl font-semibold text-foreground">
          {Math.round(report.roleAlignment.score * 100)}%
        </span>
      </div>
      <p className="text-xs text-muted">Role alignment</p>
      <p className="mt-3 text-sm text-foreground">{report.roleAlignment.summary}</p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted uppercase tracking-wide">Strengths</p>
          <div className="mt-2">
            <Bullets items={report.strengths} />
          </div>
        </div>
        <div>
          <p className="text-xs text-muted uppercase tracking-wide">Gaps</p>
          <div className="mt-2">
            <Bullets items={report.gaps} />
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-xs text-muted uppercase tracking-wide">Verified skills</p>
        <div className="mt-2">
          <Chips items={report.verifiedSkills} tone="text-emerald-400 border-emerald-400/30 bg-emerald-400/10" />
        </div>
        <p className="mt-3 text-xs text-muted uppercase tracking-wide">Partially verified</p>
        <div className="mt-2">
          <Chips items={report.partiallyVerified} tone="text-amber-400 border-amber-400/30 bg-amber-400/10" />
        </div>
        <p className="mt-3 text-xs text-muted uppercase tracking-wide">Unverified (important) claims</p>
        <div className="mt-2">
          <Chips items={report.unverifiedClaims} tone="text-danger border-danger/30 bg-danger/10" />
        </div>
      </div>

      <div className="mt-5 grid gap-5 border-t border-border pt-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted uppercase tracking-wide">Reasoning observations</p>
          <div className="mt-2">
            <Bullets items={report.reasoningNotes} />
          </div>
        </div>
        <div>
          <p className="text-xs text-muted uppercase tracking-wide">Consistency observations</p>
          <div className="mt-2">
            <Bullets items={report.consistencyNotes} />
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-xs text-muted uppercase tracking-wide">Timing observations</p>
        <div className="mt-2">
          <Bullets items={report.timingNotes} />
        </div>
      </div>
    </div>
  );
}
