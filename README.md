# INTERVIEWOS

AI-powered adaptive interview platform. Next.js (App Router, TypeScript) + Prisma/Postgres (Supabase) + Anthropic Claude.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Create a `.env` file at the project root (never commit it) with:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres pooled connection string |
| `DIRECT_URL` | Supabase Postgres direct connection string (for Prisma migrations) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `ANTHROPIC_API_KEY` | Claude API key (server-side only) |
| `ANTHROPIC_MODEL` | Claude model id, e.g. `claude-sonnet-5` |
| `NEXT_PUBLIC_APP_URL` | Base app URL, e.g. `http://localhost:3000` |
| `SESSION_SECRET` | Long random string for session signing |

## Database

```bash
npx prisma generate
npx prisma migrate dev --name init
```

## Architecture

See `prisma/schema.prisma` for the data model and `src/lib/agents/` for the interview reasoning pipeline (profile, interview, verification, integrity, evaluation).

## Deploy

Deploy on [Vercel](https://vercel.com/new); provision Postgres via [Supabase](https://supabase.com).
