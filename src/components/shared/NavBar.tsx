import Link from "next/link";

export function NavBar() {
  return (
    <header className="border-b border-border px-6 py-3">
      <nav className="mx-auto flex max-w-4xl items-center justify-between">
        <Link href="/" className="font-mono text-xs tracking-[0.3em] text-accent uppercase">
          INTERVIEWOS
        </Link>
        <div className="flex gap-5 text-sm text-muted">
          <Link href="/setup" className="hover:text-foreground">Candidate</Link>
          <Link href="/dashboard" className="hover:text-foreground">Recruiter</Link>
          <Link href="/login" className="hover:text-foreground">Sign in</Link>
        </div>
      </nav>
    </header>
  );
}
