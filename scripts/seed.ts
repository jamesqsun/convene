import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { seedData } from "../src/lib/catalog";

async function main() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    throw new Error(
      "Set Supabase URL and service role key in .env.local first.",
    );
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const data = seedData();
  let embeddings: number[][] = [];
  if (process.env.OPENAI_API_KEY) {
    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await ai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      dimensions: 1536,
      input: data.people.map((p) => p.summary),
    });
    embeddings = result.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
  const { error } = await db.from("users").upsert(
    data.people.map((p, i) => ({
      id: p.id,
      auth_id: null,
      profile: p.profile,
      summary: p.summary,
      seeded: true,
      profile_embedding: embeddings[i] ? JSON.stringify(embeddings[i]) : null,
    })),
  );
  if (error)
    throw new Error(`Seed users failed (${error.code}). Check the migration.`);
  // Only replace availability owned by the fixed fictional seed IDs; real users are untouched.
  const removed = await db
    .from("availability_blocks")
    .delete()
    .in(
      "user_id",
      data.people.map((p) => p.id),
    );
  if (removed.error)
    throw new Error(
      `Seed availability cleanup failed (${removed.error.code}).`,
    );
  const inserted = await db.from("availability_blocks").insert(
    data.availability.map((a) => ({
      id: a.id,
      user_id: a.userId,
      start_time: a.start,
      end_time: a.end,
      mode: a.mode,
    })),
  );
  if (inserted.error)
    throw new Error(`Seed availability failed (${inserted.error.code}).`);
  console.log(
    `Seeded ${data.people.length} fictional people with 14 days of availability${embeddings.length ? " and OpenAI embeddings" : ""}.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
