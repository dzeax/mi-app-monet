'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

import { useAuth } from '@/context/AuthContext';

type Role = 'admin' | 'editor';

type UserRow = {
  user_id: string | null;
  email: string;
  role: Role;
  is_active: boolean;
  display_name?: string | null;
  avatar_url?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Tab = 'list' | 'invite';
type BannerTone = 'ok' | 'err' | 'info';

type BannerState = { text: string; tone: BannerTone } | null;

type ConfirmState = {
  open: boolean;
  email: string;
  userId: string | null;
};

export default function ManageUsersModal({ onClose }: { onClose: () => void }) {
  const { isAdmin } = useAuth();
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [tab, setTab] = useState<Tab>('list');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<BannerState>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('editor');
  const [inviteName, setInviteName] = useState('');
  const [inviteAvatar, setInviteAvatar] = useState('');

const [confirm, setConfirm] = useState<ConfirmState>({ open: false, email: '', userId: null });
const [deleteAuth, setDeleteAuth] = useState(false);
const [confirmBusy, setConfirmBusy] = useState(false);
const [profileBusy, setProfileBusy] = useState(false);
const [editingEmail, setEditingEmail] = useState<string | null>(null);
const [profileName, setProfileName] = useState('');
const [profileAvatar, setProfileAvatar] = useState('');

  const showBanner = (text: string, tone: BannerTone = 'info') => {
    setBanner({ text, tone });
    window.clearTimeout((showBanner as any)._timer);
    (showBanner as any)._timer = window.setTimeout(() => setBanner(null), 3200);
  };

  const startEditProfile = (row: UserRow) => {
    setProfileBusy(false);
    setEditingEmail(row.email);
    setProfileName(row.display_name ?? '');
    setProfileAvatar(row.avatar_url ?? '');
  };

  const cancelEditProfile = () => {
    setEditingEmail(null);
    setProfileName('');
    setProfileAvatar('');
    setProfileBusy(false);
  };

  const saveProfile = async (email: string) => {
    if (!isAdmin || profileBusy) return;

    const payload: Record<string, unknown> = {
      email,
      displayName: profileName.trim(),
      avatarUrl: profileAvatar.trim(),
    };

    setProfileBusy(true);
    try {
      const response = await fetch('/api/admin/users/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok !== true) {
        const message = data?.error || `Profile update failed (${response.status})`;
        throw new Error(message);
      }
      showBanner('Profile updated', 'ok');
      setRows((prev) =>
        prev.map((row) =>
          row.email === email
            ? {
                ...row,
                display_name: data.displayName ?? null,
                avatar_url: data.avatarUrl ?? null,
                updated_at: new Date().toISOString(),
              }
            : row
        )
      );
      cancelEditProfile();
    } catch (error: any) {
      showBanner(error?.message || 'Unable to update profile', 'err');
      setProfileBusy(false);
    }
  };

  const isLastActiveAdmin = (email: string) => {
    const admins = rows.filter((row) => row.role === 'admin' && row.is_active);
    if (admins.length === 0) return false;
    return admins.length === 1 && admins[0].email.toLowerCase() === email.toLowerCase();
  };

  const friendlyDbError = (raw?: string) => {
    const msg = String(raw ?? '');
    if (/Cannot remove the last active admin/i.test(msg)) return 'You cannot demote the last active admin.';
    if (/Cannot delete the last active admin/i.test(msg)) return 'You cannot delete the row for the last active admin.';
    if (/last active admin/i.test(msg)) return 'The database blocked this change because it targets the last active admin.';
    return msg || 'An unexpected error occurred.';
  };

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('app_users')
      .select('user_id,email,role,is_active,display_name,avatar_url,created_at,updated_at')
      .order('email', { ascending: true });
    if (error) {
      showBanner(error.message, 'err');
    } else {
      setRows((data ?? []) as UserRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateRole = async (email: string, role: Role) => {
    if (role !== 'admin' && isLastActiveAdmin(email)) {
      showBanner('You cannot demote the last active admin.', 'err');
      return;
    }
    const { error } = await supabase.from('app_users').update({ role }).eq('email', email);
    if (error) {
      showBanner(friendlyDbError(error.message), 'err');
      return;
    }
    showBanner('Role updated', 'ok');
    setRows((prev) => prev.map((row) => (row.email === email ? { ...row, role } : row)));
  };

  const updateActive = async (email: string, nextActive: boolean) => {
    if (!nextActive && isLastActiveAdmin(email)) {
      showBanner('You cannot deactivate the last active admin.', 'err');
      return;
    }
    const { error } = await supabase.from('app_users').update({ is_active: nextActive }).eq('email', email);
    if (error) {
      showBanner(friendlyDbError(error.message), 'err');
      return;
    }
    showBanner(nextActive ? 'User activated' : 'User deactivated', 'ok');
    setRows((prev) => prev.map((row) => (row.email === email ? { ...row, is_active: nextActive } : row)));
  };

  const invite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    const displayName = inviteName.trim();
    const avatarUrl = inviteAvatar.trim();
    if (!email || !isAdmin) return;

    const payloadBody: Record<string, unknown> = {
      email,
      role: inviteRole,
      action: 'invite',
    };
    if (displayName) payloadBody.displayName = displayName;
    if (avatarUrl) payloadBody.avatarUrl = avatarUrl;

    try {
      const response = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true) {
        const message = payload?.error || `Invite failed (${response.status})`;
        throw new Error(message);
      }
      showBanner(payload?.invitationSent ? 'Invitation sent' : 'User updated', 'ok');
      setInviteEmail('');
      setInviteRole('editor');
      setInviteName('');
      setInviteAvatar('');
      setTab('list');
      fetchUsers();
    } catch (error: any) {
      showBanner(error?.message || 'Unable to send invitation', 'err');
    }
  };

  const resend = async (row: UserRow) => {
    try {
      const response = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: row.email,
          role: row.role,
          action: row.user_id ? 'magic_link' : 'invite',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true) {
        const message = payload?.error || `Invite failed (${response.status})`;
        throw new Error(message);
      }
      if (!row.user_id && payload?.userId) {
        setRows((prev) =>
          prev.map((item) => (item.email === row.email ? { ...item, user_id: payload.userId } : item))
        );
      }
      showBanner(row.user_id ? 'Magic link sent' : 'Invitation re-sent', 'ok');
    } catch (error: any) {
      showBanner(error?.message || 'Unable to send link', 'err');
    }
  };

  const openDeletePrompt = (row: UserRow) => {
    if (isLastActiveAdmin(row.email)) {
      showBanner('You cannot delete the row for the last active admin.', 'err');
      return;
    }
    setConfirm({ open: true, email: row.email, userId: row.user_id });
    setDeleteAuth(false);
  };

  const closeDeletePrompt = () => {
    if (confirmBusy) return;
    setConfirm({ open: false, email: '', userId: null });
    setDeleteAuth(false);
  };

  const performDelete = async () => {
    if (!confirm.open) return;
    setConfirmBusy(true);
    try {
      const response = await fetch('/api/admin/users/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: confirm.email,
          deleteAuth: deleteAuth,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true) {
        const message = payload?.error || `Delete failed (${response.status})`;
        throw new Error(message);
      }
      showBanner(
        payload?.deletedAuth ? 'User removed and auth account deleted' : 'Row deleted',
        'ok'
      );
      setRows((prev) => prev.filter((row) => row.email !== confirm.email));
      closeDeletePrompt();
    } catch (error: any) {
      showBanner(error?.message || 'Unable to delete user', 'err');
    } finally {
      setConfirmBusy(false);
    }
  };

  const body = (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <div
        className="relative card w-full max-w-4xl max-h-[90vh] overflow-hidden border border-[--color-border] shadow-xl"
        style={{ background: 'var(--color-surface)' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 modal-chrome modal-header px-5 py-3">
          <div className="accent-strip" aria-hidden />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Manage users</h3>
            <button className="btn-ghost" onClick={onClose} aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
        </div>

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

          <div className="segmented">
            <button className="segmented-tab" aria-selected={tab === 'list'} onClick={() => setTab('list')}>
              Users
            </button>
            <button className="segmented-tab" aria-selected={tab === 'invite'} onClick={() => setTab('invite')}>
              Invite
            </button>
          </div>

          {tab === 'invite' && (
            <div className="subcard p-4 grid gap-3 max-w-xl">
              <label className="text-sm grid gap-1">
                <span className="muted">Email</span>
                <input
                  className="input"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="user@example.com"
                />
              </label>
              <label className="text-sm grid gap-1">
                <span className="muted">Role</span>
                <select
                  className="input"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as Role)}
                >
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="text-sm grid gap-1">
                <span className="muted">Full name (optional)</span>
                <input
                  className="input"
                  value={inviteName}
                  onChange={(event) => setInviteName(event.target.value)}
                  placeholder="Jane Doe"
                />
              </label>
              <label className="text-sm grid gap-1">
                <span className="muted">Photo URL (optional)</span>
                <input
                  className="input"
                  value={inviteAvatar}
                  onChange={(event) => setInviteAvatar(event.target.value)}
                  placeholder="https://..."
                />
              </label>
              <div className="flex gap-2 pt-1">
                <button
                  className="btn-primary disabled:opacity-50 disabled:pointer-events-none"
                  onClick={invite}
                  disabled={!inviteEmail.trim() || !isAdmin}
                >
                  Send invitation
                </button>
                <button className="btn-ghost" onClick={() => setTab('list')}>
                  Cancel
                </button>
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
                    <th className="text-left font-medium px-3 py-2">Profile</th>
                    <th className="text-left font-medium px-3 py-2">Updated</th>
                    <th className="text-left font-medium px-3 py-2" />
                  </tr>
                </thead>
              </table>
              <div className="manage-rows divide-y divide-[--color-border]/60">
                {loading ? (
                  <div className="px-3 py-5 text-sm opacity-70">Loading...</div>
                ) : rows.length === 0 ? (
                  <div className="px-3 py-5 text-sm opacity-70">No users.</div>
                ) : (
                  rows.map((row) => (
                    <div
                      key={row.email}
                      className="grid grid-cols-[1.6fr_0.8fr_0.7fr_1.3fr_1fr_auto] gap-3 px-3 py-2 items-center"
                    >
                      <div className="truncate">
                        <div className="font-medium">{row.display_name || row.email}</div>
                        <div className="text-xs opacity-70 truncate">{row.email}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          className="input"
                          value={row.role}
                          onChange={(event) => updateRole(row.email, event.target.value as Role)}
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
                          checked={row.is_active}
                          onChange={(event) => updateActive(row.email, event.target.checked)}
                          disabled={!isAdmin}
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        {editingEmail === row.email ? (
                          <>
                            <input
                              className="input"
                              value={profileName}
                              onChange={(event) => setProfileName(event.target.value)}
                              placeholder="Full name"
                              disabled={profileBusy}
                            />
                            <input
                              className="input"
                              value={profileAvatar}
                              onChange={(event) => setProfileAvatar(event.target.value)}
                              placeholder="https://avatar.url"
                              disabled={profileBusy}
                            />
                            <div className="flex gap-2">
                              <button
                                className="btn-primary disabled:opacity-50 disabled:pointer-events-none"
                                onClick={() => saveProfile(row.email)}
                                disabled={profileBusy}
                              >
                                {profileBusy ? 'Saving...' : 'Save'}
                              </button>
                              <button className="btn-ghost" onClick={cancelEditProfile} disabled={profileBusy}>
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 overflow-hidden rounded-full bg-[--color-surface-3] ring-1 ring-black/5">
                                {row.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={row.avatar_url}
                                    alt={row.display_name || row.email}
                                    className="h-full w-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-xs font-medium opacity-70">
                                    {(row.display_name || row.email || 'U')
                                      .split(' ')
                                      .filter(Boolean)
                                      .slice(0, 2)
                                      .map((word) => word.charAt(0).toUpperCase())
                                      .join('') || 'U'}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs opacity-70 truncate max-w-[140px]">
                                {row.display_name || '—'}
                              </div>
                            </div>
                            <button
                              className="btn-ghost text-xs border border-[--color-border] px-2 py-1 disabled:opacity-50 disabled:pointer-events-none"
                              onClick={() => startEditProfile(row)}
                              disabled={!isAdmin}
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="text-xs opacity-70 truncate">
                        {row.updated_at || row.created_at || '--'}
                      </div>

                      <div className="justify-self-end flex items-center gap-1">
                        <button
                          className="btn-ghost text-xs border border-[--color-border] px-2 py-1 disabled:opacity-50 disabled:pointer-events-none"
                          onClick={() => resend(row)}
                          disabled={!isAdmin}
                          title={row.user_id ? 'Send magic link' : 'Resend invitation'}
                        >
                          {row.user_id ? 'Magic link' : 'Resend'}
                        </button>
                        <button
                          className="btn-ghost text-[--color-accent] disabled:opacity-50 disabled:pointer-events-none"
                          onClick={() => openDeletePrompt(row)}
                          disabled={!isAdmin}
                          title="Delete row"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-10 modal-chrome modal-footer px-5 py-3 flex items-center justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {confirm.open && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeletePrompt();
          }}
        >
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
          <div
            className="relative card w-full max-w-md border border-[--color-border] bg-[--color-surface] shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-chrome modal-header px-5 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Delete user</h3>
                <button className="btn-ghost" onClick={closeDeletePrompt} aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
            </div>
            <div className="px-5 py-4 space-y-4 text-sm">
              <p>
                Remove the entry for <strong>{confirm.email}</strong> from app_users.
              </p>
              {confirm.userId && (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 accent-[--color-primary]"
                    checked={deleteAuth}
                    onChange={(event) => setDeleteAuth(event.target.checked)}
                    disabled={confirmBusy}
                  />
                  <span>Also delete the Supabase Auth account (irreversible).</span>
                </label>
              )}
            </div>
            <div className="modal-chrome modal-footer flex justify-end gap-2 px-5 py-3">
              <button
                className="btn-ghost disabled:opacity-50 disabled:pointer-events-none"
                onClick={closeDeletePrompt}
                disabled={confirmBusy}
              >
                Cancel
              </button>
              <button
                className="btn-primary bg-[--color-accent] hover:bg-[--color-accent]/90 disabled:opacity-50 disabled:pointer-events-none"
                onClick={performDelete}
                disabled={confirmBusy}
              >
                {confirmBusy ? 'Deleting...' : deleteAuth ? 'Delete row & auth' : 'Delete row'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(body, document.body);
}
