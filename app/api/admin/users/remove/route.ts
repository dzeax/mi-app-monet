import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const payloadSchema = z.object({
  email: z.string().email(),
  deleteAuth: z.boolean().optional(),
});

export async function POST(req: Request) {
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
  } catch (error: any) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((err) => err.message).join(', ') || 'Invalid payload'
        : 'Invalid payload';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const email = parsed.email.trim().toLowerCase();
  const deleteAuth = parsed.deleteAuth === true;

  const admin = supabaseAdmin();

  const { data: targetUser, error: targetError } = await admin
    .from('app_users')
    .select('user_id,role,is_active')
    .eq('email', email)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (targetUser.role === 'admin' && targetUser.is_active) {
    const { data: activeAdmins, error: adminsError } = await admin
      .from('app_users')
      .select('email')
      .eq('role', 'admin')
      .eq('is_active', true);

    if (adminsError) {
      return NextResponse.json({ error: adminsError.message }, { status: 500 });
    }

    if ((activeAdmins || []).filter((row) => row?.email?.toLowerCase() !== email).length === 0) {
      return NextResponse.json(
        { error: 'You cannot delete the row for the last active admin.' },
        { status: 400 }
      );
    }
  }

  const { error: deleteRowError } = await admin.from('app_users').delete().eq('email', email);
  if (deleteRowError) {
    return NextResponse.json({ error: deleteRowError.message }, { status: 400 });
  }

  let deletedAuth = false;
  if (deleteAuth && targetUser.user_id) {
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(targetUser.user_id);
    if (deleteAuthError) {
      return NextResponse.json({ error: deleteAuthError.message }, { status: 400 });
    }
    deletedAuth = true;
  }

  return NextResponse.json({ ok: true, deletedAuth });
}

