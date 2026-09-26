import type { AiProvider } from '@/features/ai/provider'
import type { Db } from '@/lib/db'
import { refreshDerived } from './derived'

/** Run with app/worker stopped when changing embedding models. Safe to retry after failure. */
export async function rebuildEmbeddings(db: Db, ai: AiProvider): Promise<number> {
  await db.transaction(async (tx) => {
    await tx.exec('update preference_memories set embedding = null, embedding_stale = true')
    await tx.exec('update profiles set profile_embedding = null, embedding_stale = true')
  })
  const users = await db.query<{ id: string }>('select id from profiles order by id')
  for (const user of users) await refreshDerived(db, ai, user.id)
  return users.length
}
