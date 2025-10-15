'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useAuth } from '@/context/AuthContext';

type Row = {
  user_id: string | null;
  email: string;
  role: 'admin' | 'editor';
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type TabState = 'list' | 'invite';

export default function ManageUsersModal({ onClose }: { onClose: () => void }) {
  const { isAdmin } = useAuth();
  const sb = useMemo(() => createClientComponentClient(), []);
  const [tab, setTab] = useState<TabState>('list');

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<null | { text: string; tone: 'ok'|'err'|'info' }>(null);

  const show = (text: string, tone: 'ok'|'err'|'info'='info') => {
    setBanner({ text, tone });
    window.clearTimeout((show as any)._t);
    (show as any)._t = window.setTimeout(() => setBanner(null), 3200);
  };

  // ---- helpers: detecciÃ³n de "Ãºltimo admin" y traducciÃ³n de errores del trigger
  const isLastActiveAdmin = (email: string) => {
    const admins = rows.filter(r => r.role === 'admin' && !!r.is_active);
    return admins.length === 1 && admins[0].email.toLowerCase() === email.toLowerCase();
  };

  const friendlyDbError = (raw?: string) => {
    const msg = String(raw || '');
    if (/Cannot remove the last active admin/i.test(msg)) {
      return 'You cannot demote the last active admin.';
    }
    if (/Cannot delete the last active admin/i.test(msg)) {
      return 'You cannot delete the row for the last active admin.';
    }
    return msg || 'An unexpected error occurred.';
  };

  // Buscar usuarios
  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await sb
      .from('app_users')
      .select('user_id,email,role,is_active,created_at,updated_at')
      .order('email', { ascending: true });
    if (error) {
      show(error.message, 'err');
    } else {
      setRows((data || []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
    // ESC para cerrar
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mutaciones
  const updateRole = async (email: string, role: 'admin'|'editor') => {
    // Guard: prevent demoting the last active adminÃºltimo admin
    if (role !== 'admin' && isLastActiveAdmin(email)) {
      return show('You cannot demote the last active admin.', 'err');
    }
    const { error } = await sb.from('app_users').update({ role }).eq('email', email);
    if (error) return show(friendlyDbError(error.message), 'err');
    show('Role updated', 'ok');
    setRows(prev => prev.map(r => r.email === email ? { ...r, role } : r));
  };

  const updateActive = async (email: string, is_active: boolean) => {
    // Guard: prevent deactivating the last active adminÃºltimo admin
    if (!is_active && isLastActiveAdmin(email)) {
      return show('You cannot deactivate the last active admin.', 'err');
    }
    const { error } = await sb.from('app_users').update({ is_active }).eq('email', email);
    if (error) return show(friendlyDbError(error.message), 'err');
    show(is_active ? 'User activated' : 'User deactivated', 'ok');
    setRows(prev => prev.map(r => r.email === email ? { ...r, is_active } : r));
  };

  const removeRow = async (email: string) => {
    // Guard: prevent deleting the last active admin rowÃºltimo admin
    if (isLastActiveAdmin(email)) {
      return show('You cannot delete the row for the last active admin.', 'err');
    }
    if (!confirm(`Delete row for "${email}"? (no borra la cuenta auth)`)) return;
    const { error } = await sb.from('app_users').delete().eq('email', email);
    if (error) return show(friendlyDbError(error.message), 'err');
    show('Row deleted', 'ok');
    setRows(prev => prev.filter(r => r.email !== email));
  };

  // Invite (OTP + upsert fila)
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<'admin'|'editor'>('editor');

  const invite = async () => {
    const email = invEmail.trim().toLowerCase();
    if (!email) return;

    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: invRole, action: 'invite' }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) {
        const msg = payload?.error || `Invite failed (${res.status})`;
        throw new Error(msg);
      }
      show(
        payload.invitationSent
          ? 'Invitation sent'
          : 'User record updated (existing account)',
        'ok'
      );
    } catch (e: any) {
      show(`Invite failed: ${e?.message || e}`, 'err');
      return;
    }

    setInvEmail('');
    setInvRole('editor');
    setTab('list');
    fetchUsers();
  };

  const resendInvite = async (row: Row) => {
    const email = row.email;
    const shouldSendMagic = !!row.user_id;

    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role: row.role,
          action: shouldSendMagic ? 'magic_link' : 'invite',
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) {
        const msg = payload?.error || `Invite failed (${res.status})`;
        throw new Error(msg);
      }

      if (!row.user_id && payload?.userId) {
        setRows((prev) =>
          prev.map((item) =>
            item.email === row.email ? { ...item, user_id: payload.userId } : item
          )
        );
      }

      show(shouldSendMagic ? 'Magic link sent' : 'Invitation re-sent', 'ok');
    } catch (e: any) {
      show(e?.message || 'Could not send link', 'err');
    }
  };

  // UI
  const body = (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <div
        className="relative card w-full max-w-4xl max-h-[90vh] overflow-hidden border border-[--color-border] shadow-xl"
        style={{ background: 'var(--color-surface)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 modal-chrome modal-header px-5 py-3">
          <div className="accent-strip" aria-hidden />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Manage users</h3>
            <button className="btn-ghost" onClick={onClose} aria-label="Close">âœ•</button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-4 relative">
          {banner && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                banner.tone === 'ok'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                  : banner.tone === 'info'
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-700'
                    : 'border-[--color-accent]/50 bg-[--color-accent]/10 text-[--color-accent]'
              }`}
            >
              {banner.text}
            </div>
          )}

          {!isAdmin && (
            <div className="rounded-lg border px-3 py-2 text-sm border-amber-400/40 bg-amber-400/10 text-amber-700">
              Read-only. Only admins can edit or invite.
            </div>
          )}

          {/* Tabs */}
          <div className="segmented">
            <button className="segmented-tab" aria-selected={tab==='list'} onClick={()=>setTab('list')}>
              Users
            </button>
            <button className="segmented-tab" aria-selected={tab==='invite'} onClick={()=>setTab('invite')}>
              Invite
            </button>
          </div>

          {tab === 'invite' && (
            <div className="subcard p-4 grid gap-3 max-w-xl">
              <label className="text-sm grid gap-1">
                <span className="muted">Email</span>
                <input
                  className="input"
                  value={invEmail}
                  onChange={(e)=>setInvEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </label>
              <label className="text-sm grid gap-1">
                <span className="muted">Role</span>
                <select
                  className="input"
                  value={invRole}
                  onChange={(e)=>setInvRole(e.target.value as any)}
                >
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  className="btn-primary disabled:opacity-50 disabled:pointer-events-none"
                  onClick={invite}
                  disabled={!invEmail.trim() || !isAdmin}
                >
                  Send invitation
                </button>
                <button className="btn-ghost" onClick={()=>setTab('list')}>Cancel</button>
              </div>
            </div>
          )}

          {tab === 'list' && (
            <div className="manage-table">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Email</th>
                    <th className="text-left font-medium px-3 py-2">Role</th>
                    <th className="text-left font-medium px-3 py-2">Active</th>
                    <th className="text-left font-medium px-3 py-2">Updated</th>
                    <th className="text-left font-medium px-3 py-2" />
                  </tr>
                </thead>
              </table>
              <div className="manage-rows divide-y divide-[--color-border]/60">
                {loading ? (
                  <div className="px-3 py-5 text-sm opacity-70">Loadingâ€¦</div>
                ) : rows.length === 0 ? (
                  <div className="px-3 py-5 text-sm opacity-70">No users.</div>
                ) : rows.map((r) => (
                  <div
                    key={r.email}
                    className="grid grid-cols-[1.6fr_0.8fr_0.7fr_1fr_auto] gap-3 px-3 py-2 items-center"
                  >
                    <div className="truncate">{r.email}</div>

                    <div className="flex items-center gap-2">
                      <select
                        className="input"
                        value={r.role}
                        onChange={(e)=>updateRole(r.email, e.target.value as any)}
                        disabled={!isAdmin}
                      >
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="accent-[--color-primary]"
                        checked={r.is_active}
                        onChange={(e)=>updateActive(r.email, e.target.checked)}
                        disabled={!isAdmin}
                      />
                    </div>

                    <div className="text-xs opacity-70 truncate">
                      {r.updated_at || r.created_at || 'â€”'}
                    </div>

                    <div className="justify-self-end flex items-center gap-1">
                      <button
                        className="btn-ghost text-xs border border-[--color-border] px-2 py-1 disabled:opacity-50 disabled:pointer-events-none"
                        onClick={() => resendInvite(r)}
                        disabled={!isAdmin}
                        title={r.user_id ? 'Send magic link' : 'Resend invitation'}
                      >
                        {r.user_id ? 'Magic link' : 'Resend'}
                      </button>
                      <button
                        className="btn-ghost text-[--color-accent] disabled:opacity-50 disabled:pointer-events-none"
                        onClick={()=>removeRow(r.email)}
                        disabled={!isAdmin}
                        title="Delete row"
                      >
                        âœ•
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 modal-chrome modal-footer px-5 py-3 flex items-center justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(body, document.body);
}


