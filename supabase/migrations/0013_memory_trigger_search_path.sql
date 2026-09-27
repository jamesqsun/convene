-- Supabase Auth deletes users with search_path = auth. The delete cascades to preference_memories,
-- whose trigger updates "profiles" by bare name, so it failed for every user who had memories.
alter function mark_profile_embedding_stale() set search_path = public;
