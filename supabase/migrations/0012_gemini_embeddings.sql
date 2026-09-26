-- Embedding spaces are incompatible even when dimensions match. Preserve canonical data,
-- clear derived vectors, and use interest matching until pnpm embeddings:rebuild finishes.
update preference_memories set embedding = null, embedding_stale = true;
update profiles set profile_embedding = null, embedding_stale = true;
