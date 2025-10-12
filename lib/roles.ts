import { Role } from '@/types/auth';

export const isAdmin = (r?: Role | null) => r === 'admin';
export const isEditor = (r?: Role | null) => r === 'editor' || r === 'admin';
