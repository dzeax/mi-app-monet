import type { SupabaseClient } from '@supabase/supabase-js';

let cachedProgrammedAtSupport: boolean | null = null;

function isMissingProgrammedAtColumn(error: { code?: string | null; message?: string | null }) {
  if (error.code === '42703') return true;
  const message = String(error.message ?? '').toLowerCase();
  return message.includes('programmed_at') && message.includes('does not exist');
}

export async function campaignPlanningSupportsProgrammedAt(admin: SupabaseClient): Promise<boolean> {
  if (cachedProgrammedAtSupport !== null) return cachedProgrammedAtSupport;

  const { error } = await admin.from('campaign_planning').select('programmed_at').limit(1);
  if (!error) {
    cachedProgrammedAtSupport = true;
    return true;
  }

  if (isMissingProgrammedAtColumn(error)) {
    cachedProgrammedAtSupport = false;
    return false;
  }

  throw new Error(error.message || 'Unable to verify campaign_planning schema.');
}
