import { NextResponse } from "next/server";
import { actionSchema } from "@/lib/domain";
import { identity, loadData, toState } from "@/lib/server/store";
import { applyAction } from "@/lib/server/actions";
import { failure, rateLimit, readBody } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    const action = actionSchema.parse(await readBody(request));
    const { userId, mode } = await identity();
    rateLimit(userId);
    if (action.action === "profile") rateLimit(`${userId}:ai`, 5);
    const data = await loadData(userId, mode);
    const notice = await applyAction(data, userId, mode, action);
    return NextResponse.json(
      {
        state: toState(
          mode === "demo" ? data : await loadData(userId, mode),
          userId,
          mode,
        ),
        notice,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
