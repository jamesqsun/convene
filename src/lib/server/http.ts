import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "../domain";

export function failure(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        code: "validation",
        message: error.issues[0]?.message ?? "Check your input.",
      },
      { status: 400 },
    );
  if (error instanceof AppError)
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.status },
    );
  if (error instanceof SyntaxError)
    return NextResponse.json(
      { code: "invalid_json", message: "Send a valid JSON request." },
      { status: 400 },
    );
  console.error(
    "Unexpected Convene request failure",
    error instanceof Error ? error.name : "unknown",
  );
  return NextResponse.json(
    { code: "internal", message: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
export async function readBody(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new AppError("origin", "This request is not allowed.", 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("content_type", "Send a JSON request.", 415);
  if (Number(request.headers.get("content-length") || 0) > 16000)
    throw new AppError("payload_size", "This request is too large.", 413);
  const text = await request.text();
  if (text.length > 16000)
    throw new AppError("payload_size", "This request is too large.", 413);
  return JSON.parse(text);
}
const hits = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, max = 40) {
  const now = Date.now();
  if (hits.size > 10000)
    for (const [id, value] of hits) if (value.reset < now) hits.delete(id);
  const hit = hits.get(key);
  if (hit && hit.reset > now) {
    if (++hit.count > max)
      throw new AppError("rate_limit", "Take a moment, then try again.", 429);
  } else hits.set(key, { count: 1, reset: now + 60000 });
}
