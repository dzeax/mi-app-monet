'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  MoreHorizontal,
  Shield,
  Trash2,
  Link as LinkIcon,
  Edit2,
  User,
  Mail,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';

type Role = 'admin' | 'editor';

type UserRow = {
  user_id: string | null;
  email: string;
  role: Role;
  is_active: boolean;
  in_team_capacity: boolean;
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

function ActionMenu({
  onEdit,
  onResend,
  onDelete,
  isAdmin,
  isLinkMode,
}: {
  onEdit: () => void;
  onResend: () => void;
  onDelete: () => void;
  isAdmin: boolean;
  isLinkMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const handleClick = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        className="icon-btn disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!isAdmin}
        aria-label="Row actions"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg z-50"
          role="menu"
        >
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-hover)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={() => handleClick(onEdit)}
            disabled={!isAdmin}
          >
            <Edit2 className="h-4 w-4" />
            Edit Profile
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-hover)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={() => handleClick(onResend)}
            disabled={!isAdmin}
          >
            <LinkIcon className="h-4 w-4" />
            {isLinkMode ? 'Resend Magic Link' : 'Resend Invite'}
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-hover)] flex items-center gap-2 text-[var(--color-accent)] disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={() => handleClick(onDelete)}
            disabled={!isAdmin}
          >
            <Trash2 className="h-4 w-4" />
            Delete User
          </button>
        </div>
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full shadow-inner ring-1 ring-black/10 transition-colors ${
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

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

  const bannerTimer = useRef<number | null>(null);
  const showBanner = (text: string, tone: BannerTone = 'info') => {
    setBanner({ text, tone });
    if (bannerTimer.current != null) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), 3200);
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
      const raw: unknown = await response.json().catch(() => ({}));
      const obj: Record<string, unknown> = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const ok = obj['ok'] === true;
      const messageFromServer = typeof obj['error'] === 'string' ? (obj['error'] as string) : undefined;
      if (!response.ok || !ok) {
        const message = messageFromServer || `Profile update failed (${response.status})`;
        throw new Error(message);
      }
      showBanner('Profile updated', 'ok');
      const displayName = (obj['displayName'] ?? null) as string | null;
      const avatarUrl = (obj['avatarUrl'] ?? null) as string | null;
      setRows((prev) =>
        prev.map((row) =>
          row.email === email
            ? {
                ...row,
                display_name: displayName,
                avatar_url: avatarUrl,
                updated_at: new Date().toISOString(),
              }
            : row
        )
      );
      cancelEditProfile();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to update profile';
      showBanner(message, 'err');
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
      .select('user_id,email,role,is_active,in_team_capacity,display_name,avatar_url,created_at,updated_at')
      .order('email', { ascending: true });
    if (error) {
      showBanner(error.message, 'err');
    } else {
      const mapped = (data ?? []).map((row) => ({
        ...(row as UserRow),
        in_team_capacity: row.in_team_capacity ?? true,
      }));
      setRows(mapped as UserRow[]);
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

  const updateTeamCapacityFlag = async (email: string, nextValue: boolean) => {
    if (!isAdmin) return;
    const { error } = await supabase.from('app_users').update({ in_team_capacity: nextValue }).eq('email', email);
    if (error) {
      showBanner(friendlyDbError(error.message), 'err');
      return;
    }
    showBanner(nextValue ? 'Added to Team Capacity' : 'Removed from Team Capacity', 'ok');
    setRows((prev) => prev.map((row) => (row.email === email ? { ...row, in_team_capacity: nextValue } : row)));
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
      const payload: unknown = await response.json().catch(() => ({}));
      const obj: Record<string, unknown> = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const ok = obj['ok'] === true;
      const errorMsg = typeof obj['error'] === 'string' ? (obj['error'] as string) : undefined;
      if (!response.ok || !ok) {
        const message = (typeof errorMsg === 'string' && errorMsg) || `Invite failed (${response.status})`;
        throw new Error(message);
      }
      const invitationSent = obj['invitationSent'] === true;
      showBanner(invitationSent ? 'Invitation sent' : 'User updated', 'ok');
      setInviteEmail('');
      setInviteRole('editor');
      setInviteName('');
      setInviteAvatar('');
      setTab('list');
      fetchUsers();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to send invitation';
      showBanner(message, 'err');
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
      const payload: unknown = await response.json().catch(() => ({}));
      const obj: Record<string, unknown> = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const ok = obj['ok'] === true;
      const errorMsg = typeof obj['error'] === 'string' ? (obj['error'] as string) : undefined;
      if (!response.ok || !ok) {
        const message = (typeof errorMsg === 'string' && errorMsg) || `Invite failed (${response.status})`;
        throw new Error(message);
      }
      if (!row.user_id && typeof obj['userId'] === 'string') {
        setRows((prev) =>
          prev.map((item) => (item.email === row.email ? { ...item, user_id: obj['userId'] as string } : item))
        );
      }
      showBanner(row.user_id ? 'Magic link sent' : 'Invitation re-sent', 'ok');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to send link';
      showBanner(message, 'err');
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
      const payload: unknown = await response.json().catch(() => ({}));
      const obj: Record<string, unknown> = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const ok = obj['ok'] === true;
      const errorMsg = typeof obj['error'] === 'string' ? (obj['error'] as string) : undefined;
      if (!response.ok || !ok) {
        const message = (typeof errorMsg === 'string' && errorMsg) || `Delete failed (${response.status})`;
        throw new Error(message);
      }
      const deletedAuth = obj['deletedAuth'] === true;
      showBanner(deletedAuth ? 'User removed and auth account deleted' : 'Row deleted', 'ok');
      setRows((prev) => prev.filter((row) => row.email !== confirm.email));
      closeDeletePrompt();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to delete user';
      showBanner(message, 'err');
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
        className="relative card w-full max-w-4xl max-h-[90vh] overflow-hidden border border-[var(--color-border)] shadow-xl"
        style={{ background: 'var(--color-surface)' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 modal-chrome modal-header px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Manage Users</h3>
              <p className="text-xs opacity-75">Manage access and roles.</p>
            </div>
            <button className="btn-ghost" onClick={onClose} aria-label="Close">
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 pt-4 pb-12 space-y-4 relative">
          {banner && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                banner.tone === 'ok'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                  : banner.tone === 'info'
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-700'
                    : 'border-red-500/40 bg-red-500/10 text-red-600'
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

          <div className="segmented mb-4" role="tablist" aria-label="Manage users tabs">
            <button
              type="button"
              role="tab"
              id="users-tab"
              aria-selected={tab === 'list'}
              aria-controls="users-panel"
              className="flex items-center gap-2"
              onClick={() => setTab('list')}
            >
              <User className="h-4 w-4" />
              Users
            </button>
            <button
              type="button"
              role="tab"
              id="invite-tab"
              aria-selected={tab === 'invite'}
              aria-controls="invite-panel"
              className="flex items-center gap-2"
              onClick={() => setTab('invite')}
            >
              <Mail className="h-4 w-4" />
              Invite
            </button>
          </div>

          {tab === 'invite' && (
            <div className="card max-w-lg mx-auto" role="tabpanel" id="invite-panel" aria-labelledby="invite-tab">
              <div className="p-4 grid gap-3">
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
            </div>
          )}

          {tab === 'list' && (
            <div role="tabpanel" id="users-panel" aria-labelledby="users-tab">
              <div className="max-h-[60vh] overflow-auto">
                <div className="table-wrap">
                  <table className="table">
                <thead>
                  <tr>
                    <th className="text-left text-xs uppercase tracking-wide muted">User</th>
                    <th className="text-left text-xs uppercase tracking-wide muted">Role</th>
                    <th className="text-center text-xs uppercase tracking-wide muted">Status</th>
                    <th className="text-center text-xs uppercase tracking-wide muted">Capacity</th>
                    <th className="text-right text-xs uppercase tracking-wide muted" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="py-5 px-3 text-sm opacity-70" colSpan={5}>
                        Loading...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td className="py-5 px-3 text-sm opacity-70" colSpan={5}>
                        No users.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.email}>
                        <td className="py-3 px-3">
                          {editingEmail === row.email ? (
                            <div className="flex flex-col gap-2">
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
                                <button
                                  className="btn-ghost"
                                  onClick={cancelEditProfile}
                                  disabled={profileBusy}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 overflow-hidden rounded-full bg-[var(--color-surface-2)] ring-1 ring-black/5">
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
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium truncate">
                                  {row.display_name || row.email}
                                </span>
                                <span className="text-xs muted truncate">{row.email}</span>
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <select
                            className="rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1 text-sm"
                            value={row.role}
                            onChange={(event) => updateRole(row.email, event.target.value as Role)}
                            disabled={!isAdmin}
                          >
                            <option value="editor">Editor</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <ToggleSwitch
                              checked={row.is_active}
                              onChange={(checked) => updateActive(row.email, checked)}
                              disabled={!isAdmin}
                            />
                            <span className="text-[0.7rem] muted">
                              {row.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            className="accent-[var(--color-primary)]"
                            checked={row.in_team_capacity}
                            onChange={(event) => updateTeamCapacityFlag(row.email, event.target.checked)}
                            disabled={!isAdmin}
                          />
                        </td>

                        <td className="py-3 px-3 text-right">
                          <ActionMenu
                            onEdit={() => startEditProfile(row)}
                            onResend={() => resend(row)}
                            onDelete={() => openDeletePrompt(row)}
                            isAdmin={isAdmin}
                            isLinkMode={Boolean(row.user_id)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                  </table>
                </div>
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
            className="relative card w-full max-w-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
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
                    className="mt-1 accent-[var(--color-primary)]"
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
                className="inline-flex items-center justify-center rounded-lg px-4 py-2 font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
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

