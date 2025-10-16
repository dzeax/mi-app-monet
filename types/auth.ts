export type Role = 'admin' | 'editor';

export type SessionUser = {
  id: string;
  email: string | null;
  role: Role;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export const DEFAULT_ROLE: Role = 'editor';
