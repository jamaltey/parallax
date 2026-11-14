import { supabase, citizenSession, SUPABASE_SETUP } from '../lib/supabase';
import { validateCandidate } from './model';
function client() {
  if (!supabase) throw new Error(SUPABASE_SETUP);
  return supabase;
}
export function communityError(error) {
  if (error.code === '23505')
    return 'This contribution is already saved. Reload the candidate to see it.';
  if (['42P01', 'PGRST205', 'PGRST202'].includes(error.code))
    return 'Community tables are not installed yet. Apply the citizen-science migration in Supabase.';
  if (error.code === '42501')
    return 'This action is not allowed for your session. Check the database policies and anonymous authentication setup.';
  return error.message || 'The community service could not be reached. Please retry.';
}
export async function listCandidates({ type = '', sort = 'newest', page = 0, signal } = {}) {
  let query = client().from('candidate_summary').select('*', { count: 'exact' });
  if (type) query = query.eq('type', type);
  query = query
    .order(sort === 'reviewed' ? 'review_count' : 'created_at', { ascending: false })
    .order('id')
    .range(page * 20, page * 20 + 19);
  if (signal) query = query.abortSignal(signal);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data, count };
}
export async function getCandidate(id, signal) {
  let query = client().from('candidates').select('*').eq('id', id).maybeSingle();
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  if (!data) throw new Error('Candidate not found or no longer available.');
  validateCandidate(data);
  return data;
}
export async function saveCandidate(input, id) {
  validateCandidate(input);
  const user = await citizenSession();
  const { data, error } = await client()
    .from('candidates')
    .insert({ ...input, id, user_id: user.id })
    .select('id')
    .single();
  if (error?.code === '23505') {
    const existing = await client()
      .from('candidates')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing.data) return existing.data;
  }
  if (error) throw error;
  return data;
}
export async function getOwnReview(id, user) {
  const { data, error } = await client()
    .from('classifications')
    .select('verdict')
    .eq('candidate_id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function saveReview(candidate, verdict) {
  const user = await citizenSession();
  if (user.id === candidate.user_id) throw new Error('You cannot review your own candidate.');
  const { error } = await client()
    .from('classifications')
    .insert({ candidate_id: candidate.id, user_id: user.id, verdict });
  if (error) throw error;
  return { verdict };
}
export async function getStatistics(id) {
  const { data, error } = await client()
    .from('candidate_summary')
    .select('review_count,agree_count,disagree_count,unsure_count,agreement')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}
