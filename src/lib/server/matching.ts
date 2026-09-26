import "server-only";
import { AppError } from "../domain";
import { plan } from "../planner";
import { adminClient } from "./supabase";
import { dbError, loadMatchingData, slotFromRow } from "./store";

export async function runMatchingJobs(limit = 10) {
  const db = adminClient();
  const deadline = Date.now() + 20000;
  let processed = 0;
  let assigned = 0;
  while (processed < limit && Date.now() < deadline) {
    const claimed = await db.rpc("claim_matching_job");
    dbError(claimed.error);
    const job = claimed.data?.[0];
    if (!job) break;
    processed++;
    let cursor: string | null = null;
    let failed = false;
    try {
      const source = await db
        .from("availability_blocks")
        .select("*")
        .eq("id", job.slot_id)
        .eq("revision", job.revision)
        .eq("status", "pending")
        .maybeSingle();
      dbError(source.error);
      if (source.data) {
        const candidates = await db.rpc("matching_candidates", {
          p_slot: job.slot_id,
          p_revision: job.revision,
          p_after: job.cursor_id,
        });
        dbError(candidates.error);
        const rows = candidates.data ?? [];
        if (rows.length === 100) cursor = rows[rows.length - 1].id;
        if (rows.length) {
          const data = await loadMatchingData(
            [source.data, ...rows].map(slotFromRow),
          );
          const hangout = plan(data, source.data.user_id, {
            goal: "either",
            mode: "either",
            interest: "any",
            slotId: job.slot_id,
            requireLocation: true,
          });
          const result = await db.rpc("schedule_convene_slots", {
            p_user_id: source.data.user_id,
            p_hangout: hangout,
            p_slots: hangout.slotIds!.map((id) => ({
              id,
              revision: data.availability.find((s) => s.id === id)!.revision,
            })),
            p_profiles: Object.fromEntries(
              data.people
                .filter((p) => hangout.participantIds.includes(p.id))
                .map((p) => [p.id, p.profile]),
            ),
          });
          dbError(result.error);
          assigned++;
        }
      }
    } catch (error) {
      if (!(error instanceof AppError && error.code === "no_viable_plan")) {
        failed = true;
        console.error(
          "Matching job will retry",
          error instanceof AppError ? error.code : "worker_error",
        );
      }
    } finally {
      const finished = await db.rpc("finish_matching_job", {
        p_slot: job.slot_id,
        p_revision: job.revision,
        p_token: job.token,
        p_cursor: cursor,
        p_failed: failed,
      });
      dbError(finished.error);
    }
  }
  return { processed, assigned };
}
