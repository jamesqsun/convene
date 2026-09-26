import { NextResponse } from "next/server";
import { identity, loadData, toState } from "@/lib/server/store";
import { failure } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { userId, mode } = await identity();
    return NextResponse.json(
      toState(await loadData(userId, mode), userId, mode),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
