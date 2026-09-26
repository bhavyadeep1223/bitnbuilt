import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/api/httpError";

/** Normalizes thrown errors into a JSON response without leaking internals. */
export function apiErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request", issues: error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }
  if (error instanceof HttpError) {
    if (error.status >= 500) console.error(error);
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
