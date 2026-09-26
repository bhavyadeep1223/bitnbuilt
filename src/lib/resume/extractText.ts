import "server-only";
import { HttpError } from "@/lib/api/httpError";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Set(["application/pdf", "text/plain"]);

export class ResumeFileError extends HttpError {
  constructor(message: string) {
    super(422, message);
  }
}

export async function extractResumeText(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new ResumeFileError("Resume file is too large (max 5MB)");
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    throw new ResumeFileError("Only PDF or plain text resumes are supported");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const text = isPdf ? await extractPdfText(buffer) : buffer.toString("utf-8");

  const trimmed = text.trim();
  if (trimmed.length < 30) {
    throw new ResumeFileError("Could not find readable text in this resume");
  }
  if (trimmed.length > 50_000) {
    return trimmed.slice(0, 50_000);
  }
  return trimmed;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } catch {
    throw new ResumeFileError("Could not read this PDF — it may be corrupted or image-only");
  } finally {
    await parser.destroy();
  }
}
