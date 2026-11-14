import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, '');
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key?.startsWith('sb_publishable_') ? createClient(url, key) : null;
export const SUPABASE_SETUP =
  'Community storage is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart Parallax.';
let signingIn;
export async function citizenSession() {
  if (!supabase) throw new Error(SUPABASE_SETUP);
  if (!signingIn)
    signingIn = (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (data.session) {
        const { data: current, error: invalid } = await supabase.auth.getUser();
        if (invalid)
          throw new Error(
            'Your contributor session expired. Reload or clear this site’s session and retry.'
          );
        return current.user;
      }
      const { data: created, error: failure } = await supabase.auth.signInAnonymously();
      if (failure)
        throw new Error(
          `Could not start a contributor session: ${failure.message}. Anonymous Sign-Ins must be enabled in Supabase.`
        );
      return created.user;
    })().finally(() => {
      signingIn = null;
    });
  return signingIn;
}
