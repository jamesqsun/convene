import { openPgDb } from '../src/lib/db-pg'
import { readEnv } from '../src/lib/env'
import { applyMigrations } from '../src/lib/migrate'
import { geminiEmbedder } from '../src/features/ai/gemini'
import { fakeAiProvider } from '../src/features/ai/fake'
import { rebuildEmbeddings } from '../src/features/memories/rebuild'
import { loadDotEnvLocal } from './load-env'

async function main(): Promise<void> {
  loadDotEnvLocal()
  const env = readEnv(process.env)
  if (env.mode !== 'supabase' || !env.gemini)
    throw new Error('embeddings:rebuild requires connected mode and META_API_KEY / GEMINI_API_KEY')
  const db = openPgDb(env.databaseUrl)
  await applyMigrations(db)
  console.log(`Rebuilding embeddings with ${env.gemini.model}. Keep the app and worker stopped.`)
  const count = await rebuildEmbeddings(db, {
    ...fakeAiProvider(),
    embed: geminiEmbedder(env.gemini),
  })
  console.log(`Rebuilt embeddings for ${count} profiles. Users, memories, and history preserved.`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
