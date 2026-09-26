type Claim = {
  id: string;
  type: string;
  name: string;
  importance: string;
  claimedLevel?: string | null;
  coverageStatus: "NOT_VERIFIED" | "PARTIALLY_VERIFIED" | "VERIFIED";
};

const STATUS_STYLE: Record<Claim["coverageStatus"], string> = {
  VERIFIED: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  PARTIALLY_VERIFIED: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  NOT_VERIFIED: "text-muted border-border bg-white/5",
};

const STATUS_LABEL: Record<Claim["coverageStatus"], string> = {
  VERIFIED: "Verified",
  PARTIALLY_VERIFIED: "Partially verified",
  NOT_VERIFIED: "Not verified",
};

export function CoverageTracker({ claims }: { claims: Claim[] }) {
  const sorted = [...claims].sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
    return (rank[a.importance] ?? 3) - (rank[b.importance] ?? 3);
  });

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Resume coverage tracker</h2>
        <span className="text-xs text-muted">{claims.length} items extracted</span>
      </div>
      <div className="mt-4 space-y-2">
        {sorted.map((claim) => (
          <div
            key={claim.id}
            className="flex items-center justify-between rounded-lg border border-border bg-white/[0.02] px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{claim.name}</p>
              <p className="text-xs text-muted">
                {claim.type.toLowerCase()} · {claim.importance} importance
                {claim.claimedLevel ? ` · claims ${claim.claimedLevel}` : ""}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${STATUS_STYLE[claim.coverageStatus]}`}
            >
              {STATUS_LABEL[claim.coverageStatus]}
            </span>
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="text-sm text-muted">No claims extracted yet.</p>
        )}
      </div>
    </div>
  );
}

export type { Claim };
