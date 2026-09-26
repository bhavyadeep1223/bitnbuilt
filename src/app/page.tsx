import Link from "next/link";

export default function Home() {
  return (
    <div className="bg-grid flex flex-1 flex-col items-center justify-center px-6">
      <div className="glass-panel w-full max-w-xl rounded-2xl p-10 text-center">
        <p className="font-mono text-xs tracking-[0.3em] text-accent uppercase">
          INTERVIEWOS
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-foreground">
          Evidence-based interviewing, not a question list.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          The interviewer reads the resume, tracks what&apos;s been verified,
          and decides the next question from the evidence so far.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/setup"
            className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-black transition-opacity hover:opacity-90"
          >
            Start as candidate
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-white/5"
          >
            Recruiter dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
