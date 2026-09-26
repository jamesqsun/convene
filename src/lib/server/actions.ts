import "server-only";
import { AppError, type Action, type Data, type Memory } from "../domain";
import { plan } from "../planner";
import { understand } from "./ai";
import { adminClient } from "./supabase";
import { dbError } from "./store";

export async function applyAction(
  data: Data,
  userId: string,
  mode: "demo" | "supabase",
  action: Action,
): Promise<string | undefined> {
  const db = mode === "supabase" ? adminClient() : null;
  if (action.action === "profile") {
    const result = await understand(action.profile, mode === "supabase");
    const prior = data.people.find((p) => p.id === userId);
    const memories = [
      ...result.memories,
      ...(prior?.memories.filter((m) => m.source === "feedback") ?? []),
    ];
    if (db) {
      const { error } = await db.rpc("save_convene_profile", {
        p_user_id: userId,
        p_profile: action.profile,
        p_summary: result.summary,
        p_memories: memories,
        p_embedding: result.embedding ? JSON.stringify(result.embedding) : null,
      });
      dbError(error);
    } else {
      const person = {
        id: userId,
        profile: action.profile,
        summary: result.summary,
        memories,
        embedding: result.embedding,
        seeded: false,
      };
      if (prior) Object.assign(prior, person);
      else {
        data.people.push(person);
        // A labeled, fictional past hangout makes the feedback loop demonstrable.
        const end = new Date(Date.now() - 86400000);
        data.hangouts.push({
          id: crypto.randomUUID(),
          participantIds: [userId, data.people.find((p) => p.seeded)!.id],
          activityId: "coffee",
          start: new Date(end.getTime() - 3600000).toISOString(),
          end: end.toISOString(),
          status: "completed",
          reason:
            "An example past hangout included in demo mode so you can try private feedback.",
          score: 80,
          seededVenue: true,
        });
      }
    }
    return result.notice;
  }
  if (!data.people.some((p) => p.id === userId))
    throw new AppError("profile_required", "Complete your profile first.");
  if (action.action === "availability") {
    if (Date.parse(action.block.start) <= Date.now())
      throw new AppError("past_availability", "Choose a time in the future.");
    if (Date.parse(action.block.end) > Date.now() + 90 * 86400000)
      throw new AppError(
        "far_availability",
        "Choose a time in the next 90 days.",
      );
    if (data.availability.filter((b) => b.userId === userId).length >= 50)
      throw new AppError(
        "availability_limit",
        "Remove an old time block before adding another.",
      );
    const block = { ...action.block, id: crypto.randomUUID(), userId };
    if (db)
      dbError(
        (
          await db.from("availability_blocks").insert({
            id: block.id,
            user_id: userId,
            start_time: block.start,
            end_time: block.end,
            mode: block.mode,
          })
        ).error,
      );
    else data.availability.push(block);
  } else if (action.action === "remove_availability") {
    if (db)
      dbError(
        (
          await db
            .from("availability_blocks")
            .delete()
            .eq("id", action.id)
            .eq("user_id", userId)
        ).error,
      );
    else
      data.availability = data.availability.filter(
        (b) => b.id !== action.id || b.userId !== userId,
      );
  } else if (action.action === "plan") {
    const hangout = plan(data, userId, action);
    if (db)
      dbError(
        (
          await db.rpc("schedule_convene_hangout", {
            p_user_id: userId,
            p_hangout: hangout,
          })
        ).error,
      );
    else data.hangouts.push(hangout);
  } else if (action.action === "cancel") {
    const hangout = data.hangouts.find(
      (h) => h.id === action.id && h.participantIds.includes(userId),
    );
    if (!hangout) throw new AppError("not_found", "Plan not found.", 404);
    if (hangout.status !== "scheduled" || Date.parse(hangout.end) <= Date.now())
      throw new AppError(
        "already_ended",
        "Only upcoming or ongoing plans can be cancelled.",
        409,
      );
    if (db)
      dbError(
        (
          await db
            .from("hangouts")
            .update({ status: "cancelled" })
            .eq("id", hangout.id)
            .eq("status", "scheduled")
        ).error,
      );
    else hangout.status = "cancelled";
  } else if (action.action === "feedback") {
    const hangout = data.hangouts.find(
      (h) => h.id === action.hangoutId && h.participantIds.includes(userId),
    );
    if (
      !hangout ||
      hangout.status === "cancelled" ||
      Date.parse(hangout.end) > Date.now()
    )
      throw new AppError(
        "feedback_not_allowed",
        "Feedback is available once your hangout has ended.",
        409,
      );
    if (
      data.feedback.some(
        (f) => f.userId === userId && f.hangoutId === hangout.id,
      )
    )
      throw new AppError(
        "duplicate_feedback",
        "You already shared feedback for this hangout.",
        409,
      );
    const feedback = { id: crypto.randomUUID(), userId, ...action };
    const memory: Memory | null = action.comments
      ? {
          id: crypto.randomUUID(),
          topic: "Hangout feedback",
          summary: action.comments,
          evidence: action.comments,
          confidence: 0.9,
          source: "feedback",
        }
      : null;
    if (db)
      dbError(
        (
          await db.rpc("submit_convene_feedback", {
            p_user_id: userId,
            p_feedback: feedback,
            p_memory: memory,
          })
        ).error,
      );
    else {
      data.feedback.push(feedback);
      hangout.status = "completed";
      if (memory)
        data.people.find((p) => p.id === userId)!.memories.push(memory);
      for (const otherId of hangout.participantIds.filter(
        (id) => id !== userId,
      )) {
        const connection = data.connections.find(
          (c) => c.userId === userId && c.otherId === otherId,
        );
        if (connection) {
          connection.hangoutCount++;
          if (connection.status !== "blocked")
            connection.status = action.meetAgain
              ? connection.status
              : "declined";
        } else
          data.connections.push({
            userId,
            otherId,
            status: action.meetAgain ? "met" : "declined",
            hangoutCount: 1,
          });
      }
    }
  } else if (action.action === "connection") {
    if (
      action.otherId === userId ||
      !data.hangouts.some(
        (h) =>
          h.participantIds.includes(userId) &&
          h.participantIds.includes(action.otherId),
      )
    )
      throw new AppError(
        "not_found",
        "You can manage connections after making a plan together.",
        404,
      );
    const existing = data.connections.find(
      (c) => c.userId === userId && c.otherId === action.otherId,
    );
    if (existing?.status === "blocked" && action.status === "friend")
      throw new AppError("blocked", "This connection is blocked.");
    const connection = {
      userId,
      otherId: action.otherId,
      status: action.status,
      hangoutCount: existing?.hangoutCount ?? 0,
    };
    if (db)
      dbError(
        (
          await db.rpc("manage_convene_connection", {
            p_user_id: userId,
            p_other_id: action.otherId,
            p_status: action.status,
          })
        ).error,
      );
    else if (existing) Object.assign(existing, connection);
    else data.connections.push(connection);
    // Blocking also removes future plans with this person.
    if (!db && action.status === "blocked") {
      const ids = data.hangouts
        .filter(
          (h) =>
            h.status === "scheduled" &&
            Date.parse(h.end) > Date.now() &&
            h.participantIds.includes(userId) &&
            h.participantIds.includes(action.otherId),
        )
        .map((h) => h.id);
      data.hangouts.forEach((h) => {
        if (ids.includes(h.id)) h.status = "cancelled";
      });
    }
  }
}
