import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const payloadSchema = z.object({
  email: z.string().email(),
  displayName: z
    .string()
    .trim()
    .max(120, 'Display name is too long')
    .optional(),
  avatarUrl: z
    .string()
    .trim()
    .url('Avatar URL must be a valid url')
    .refine((value) => value.startsWith('https://'), 'Avatar URL must start with https')
    .optional(),
});

type ErrorRes = { error: string };
type OkRes = { ok: true; email: string; displayName: string | null; avatarUrl: string | null };

export async function POST(req: Request): Promise<NextResponse<ErrorRes | OkRes>> {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: currentUser, error: currentUserError } = await supabase
    .from('app_users')
    .select('role,is_active')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (currentUserError) {
    return NextResponse.json({ error: currentUserError.message }, { status: 500 });
  }

  if (!currentUser || currentUser.is_active === false || currentUser.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let parsed: z.infer<typeof payloadSchema>;
  try {
    const body = await req.json();
    parsed = payloadSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((item) => item.message).join(', ') || 'Invalid payload' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const email = parsed.email.trim().toLowerCase();
  const displayName =
    parsed.displayName && parsed.displayName.trim().length > 0
      ? parsed.displayName.trim()
      : null;
  const avatarUrl =
    parsed.avatarUrl && parsed.avatarUrl.trim().length > 0 ? parsed.avatarUrl.trim() : null;

  const admin = supabaseAdmin();

  const { data: profileRow, error: profileError } = await admin
    .from('app_users')
    .select('user_id')
    .eq('email', email)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  if (!profileRow) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const updatePayload: { display_name: string | null; avatar_url: string | null } = {
    display_name: displayName,
    avatar_url: avatarUrl,
  };

  const { error: updateError } = await admin
    .from('app_users')
    .update(updatePayload)
    .eq('email', email);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  if (profileRow.user_id) {
    try {
      await admin.auth.admin.updateUserById(profileRow.user_id, {
        user_metadata: {
          ...(displayName !== null ? { name: displayName } : { name: null }),
          ...(avatarUrl !== null ? { avatar_url: avatarUrl } : { avatar_url: null }),
        },
      });
    } catch (error) {
      console.warn('Failed to update auth metadata for user', email, error);
      // Continue; not a fatal error for UI
    }
  }

  return NextResponse.json({ ok: true, email, displayName, avatarUrl });
}
