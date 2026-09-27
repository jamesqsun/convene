import type { Db } from '@/lib/db'
import type { MemoryDraft } from '@/features/ai/schemas'
import { attributesToObject } from '@/features/ai/schemas'
import type { MemoryPatch } from './schemas'

export interface Memory {
  id: string
  topic: string
  summary: string
  evidence: string[]
  attributes: Record<string, string>
  confidence: number
  source: string
  editedAt: number | null
  createdAt: number
}

interface MemoryRow {
  id: string
  topic: string
  summary: string
  evidence: string[]
  attributes: Record<string, string>
  confidence: number
  source: string
  edited_at: Date | null
  created_at: Date
}

function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    topic: row.topic,
    summary: row.summary,
    evidence: row.evidence,
    attributes: row.attributes,
    confidence: row.confidence,
    source: row.source,
    editedAt: row.edited_at?.getTime() ?? null,
    createdAt: row.created_at.getTime(),
  }
}

const columns =
  'id, topic, summary, evidence, attributes, confidence, source, edited_at, created_at'

export async function listMemories(db: Db, userId: string): Promise<Memory[]> {
  const rows = await db.query<MemoryRow>(
    `select ${columns} from preference_memories where user_id = $1 order by confidence desc, created_at`,
    [userId],
  )
  return rows.map(toMemory)
}

/** The text an embedding represents: what the memory says, not the raw evidence behind it. */
export function memoryText(memory: Pick<Memory, 'topic' | 'summary' | 'attributes'>): string {
  const attributes = Object.entries(memory.attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')
  return attributes
    ? `${memory.topic}. ${memory.summary} (${attributes})`
    : `${memory.topic}. ${memory.summary}`
}

function vectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.join(',')}]`
}

/** Replaces onboarding/seed memories, retaining learned memories and their owner edits. */
export async function replaceMemories(
  db: Db,
  userId: string,
  drafts: readonly MemoryDraft[],
  embeddings: readonly number[][],
  source: 'onboarding' | 'seed' = 'onboarding',
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(
      "delete from preference_memories where user_id = $1 and source in ('onboarding', 'seed')",
      [userId],
    )
    for (const [index, draft] of drafts.entries()) {
      const embedding = embeddings[index]
      await tx.query(
        `insert into preference_memories (user_id, topic, summary, evidence, attributes, confidence, source, embedding, embedding_stale)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::vector, $9)`,
        [
          userId,
          draft.topic,
          draft.summary,
          draft.evidence,
          JSON.stringify(attributesToObject(draft.attributes)),
          draft.confidence,
          source,
          embedding ? vectorLiteral(embedding) : null,
          !embedding,
        ],
      )
    }
  })
}

/** Owner-checked edit. Clears the embedding so the derived refresh recomputes it. */
export async function updateMemory(
  db: Db,
  userId: string,
  memoryId: string,
  patch: MemoryPatch,
): Promise<Memory | null> {
  const rows = await db.query<MemoryRow>(
    `update preference_memories set
       topic = coalesce($3, topic), summary = coalesce($4, summary), attributes = coalesce($5::jsonb, attributes),
       embedding = null, embedding_stale = true, edited_at = now()
     where id = $1 and user_id = $2
     returning ${columns}`,
    [
      memoryId,
      userId,
      patch.topic ?? null,
      patch.summary ?? null,
      patch.attributes ? JSON.stringify(patch.attributes) : null,
    ],
  )
  return rows[0] ? toMemory(rows[0]) : null
}

export async function deleteMemory(db: Db, userId: string, memoryId: string): Promise<boolean> {
  const rows = await db.query(
    'delete from preference_memories where id = $1 and user_id = $2 returning id',
    [memoryId, userId],
  )
  return rows.length > 0
}

export interface StaleMemory {
  id: string
  text: string
}

export async function listStaleMemories(db: Db, userId: string): Promise<StaleMemory[]> {
  const rows = await db.query<Pick<MemoryRow, 'id' | 'topic' | 'summary' | 'attributes'>>(
    'select id, topic, summary, attributes from preference_memories where user_id = $1 and embedding_stale order by created_at',
    [userId],
  )
  return rows.map((row) => ({ id: row.id, text: memoryText(row) }))
}

export async function storeMemoryEmbedding(
  db: Db,
  memoryId: string,
  embedding: readonly number[],
): Promise<void> {
  await db.query(
    'update preference_memories set embedding = $2::vector, embedding_stale = false where id = $1',
    [memoryId, vectorLiteral(embedding)],
  )
}

export async function listMemoryEmbeddings(db: Db, userId: string): Promise<number[][]> {
  const rows = await db.query<{ embedding: string }>(
    'select embedding::text as embedding from preference_memories where user_id = $1 and embedding is not null',
    [userId],
  )
  return rows.map((row) => JSON.parse(row.embedding) as number[])
}

export async function storeProfileEmbedding(
  db: Db,
  userId: string,
  embedding: readonly number[] | null,
): Promise<void> {
  await db.query(
    'update profiles set profile_embedding = $2::vector, embedding_stale = false where id = $1',
    [userId, embedding ? vectorLiteral(embedding) : null],
  )
}
