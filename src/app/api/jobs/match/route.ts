import { timingSafeEqual } from "node:crypto";
import { runMatchingJobs } from "@/lib/server/matching";
import { appMode } from "@/lib/server/config";
import { failure } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  if (appMode() !== "supabase")
    return Response.json(
      { message: "Matching worker requires Supabase" },
      { status: 409 },
    );
  try {
    return Response.json(await runMatchingJobs(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

// Supports scheduler services that invoke authenticated GET requests.
export const GET = POST;
