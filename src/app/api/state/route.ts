import { NextResponse } from "next/server";
import { identity, loadData, toState } from "@/lib/server/store";
import { failure } from "@/lib/server/http";
import { fillPendingSlots } from "@/lib/planner";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { userId, mode } = await identity();
    const data = await loadData(userId, mode);
    if (mode === "demo") fillPendingSlots(data);
    return NextResponse.json(toState(data, userId, mode), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
