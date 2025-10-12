export type Role = 'admin' | 'editor';

export type SessionUser = {
  id: string;
  email: string | null;
  role: Role;
};

export const DEFAULT_ROLE: Role = 'editor';
