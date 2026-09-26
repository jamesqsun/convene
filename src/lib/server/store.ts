import "server-only";
import { cookies } from "next/headers";
import {
  AppError,
  type AppState,
  type Data,
  type Person,
  publicPerson,
} from "../domain";
import { seedData } from "../catalog";
import { appMode } from "./config";
import { adminClient, authClient } from "./supabase";

type Session = { data: Data; touched: number };
const root = globalThis as typeof globalThis & {
  conveneSessions?: Map<string, Session>;
};
const sessions = (root.conveneSessions ??= new Map());
export async function identity() {
  const mode = appMode();
  if (mode === "supabase") {
    const auth = await authClient();
    const { data, error } = await auth.auth.getUser();
    if (error || !data.user)
      throw new AppError("unauthenticated", "Sign in to start planning.", 401);
    return { userId: data.user.id, mode };
  }
  const jar = await cookies();
  let userId = jar.get("convene_demo")?.value;
  if (!userId || !sessions.has(userId)) {
    userId = crypto.randomUUID();
    jar.set("convene_demo", userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 86400,
    });
    for (const [id, s] of sessions)
      if (Date.now() - s.touched > 86400000) sessions.delete(id);
    if (sessions.size >= 200) sessions.delete(sessions.keys().next().value!);
    sessions.set(userId, { data: seedData(), touched: Date.now() });
  }
  sessions.get(userId)!.touched = Date.now();
  return { userId, mode };
}
export function dbError(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.message.includes("schedule_conflict"))
    throw new AppError(
      "schedule_conflict",
      "That time was just taken or availability changed. Try planning again.",
      409,
    );
  if (error.message.includes("feedback_not_allowed"))
    throw new AppError(
      "feedback_not_allowed",
      "Feedback is available once your hangout has ended.",
      409,
    );
  if (error.message.includes("duplicate_feedback"))
    throw new AppError(
      "duplicate_feedback",
      "You already shared feedback for this hangout.",
      409,
    );
  // Provider details can contain private data. Only emit a code to server logs.
  console.error("Supabase operation failed", error.code ?? "unknown");
  throw new AppError(
    "database_unavailable",
    "Could not save or load your data. Check the database setup and try again.",
    503,
  );
}
export async function loadData(
  userId: string,
  mode: "demo" | "supabase",
): Promise<Data> {
  if (mode === "demo") return sessions.get(userId)!.data;
  const db = adminClient();
  const results = await Promise.all([
    db.from("users").select("id,profile,summary,seeded,profile_embedding"),
    db.from("preference_memories").select("content").eq("user_id", userId),
    db
      .from("availability_blocks")
      .select("*")
      .gte("end_time", new Date(Date.now() - 30 * 86400000).toISOString()),
    db.from("connections").select("*"),
    db.from("hangouts").select("*,hangout_participants(user_id)"),
    db.from("feedback").select("*").eq("user_id", userId),
  ]);
  results.forEach((r) => dbError(r.error));
  const [users, memories, availability, connections, hangouts, feedback] =
    results;
  return {
    people: (users.data ?? []).map((row) => ({
      id: row.id,
      profile: row.profile,
      summary: row.summary,
      seeded: row.seeded,
      memories:
        row.id === userId ? (memories.data ?? []).map((m) => m.content) : [],
      embedding:
        typeof row.profile_embedding === "string"
          ? JSON.parse(row.profile_embedding)
          : row.profile_embedding,
    })) as Person[],
    availability: (availability.data ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      start: r.start_time,
      end: r.end_time,
      mode: r.mode,
    })),
    connections: (connections.data ?? []).map((r) => ({
      userId: r.user_id,
      otherId: r.other_id,
      status: r.status,
      hangoutCount: r.hangout_count,
    })),
    hangouts: (hangouts.data ?? []).map((r) => ({
      id: r.id,
      participantIds: r.hangout_participants.map(
        (p: { user_id: string }) => p.user_id,
      ),
      activityId: r.activity_id,
      start: r.start_time,
      end: r.end_time,
      status: r.status,
      reason: r.reason,
      score: r.score,
      seededVenue: r.seeded_venue,
    })),
    feedback: (feedback.data ?? []).map((r) => ({
      id: r.id,
      hangoutId: r.hangout_id,
      userId: r.user_id,
      rating: r.rating,
      meetAgain: r.meet_again,
      comments: r.comments,
    })),
  };
}
export function toState(
  data: Data,
  userId: string,
  mode: "demo" | "supabase",
): AppState {
  const me = data.people.find((p) => p.id === userId);
  const hangouts = data.hangouts.filter((h) =>
    h.participantIds.includes(userId),
  );
  const connections = data.connections.filter((c) => c.userId === userId);
  const visible = new Set([
    ...hangouts.flatMap((h) => h.participantIds),
    ...connections.map((c) => c.otherId),
  ]);
  return {
    mode,
    userId,
    profile: me?.profile ?? null,
    summary: me?.summary ?? "",
    memories: me?.memories ?? [],
    availability: data.availability.filter((a) => a.userId === userId),
    people: data.people
      .filter((p) => p.id !== userId && visible.has(p.id))
      .map(publicPerson),
    connections,
    hangouts,
    feedback: data.feedback.filter((f) => f.userId === userId),
    aiAvailable: mode === "supabase" && !!process.env.OPENAI_API_KEY,
  };
}
