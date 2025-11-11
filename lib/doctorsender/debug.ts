import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEBUG_DIR_RAW = process.env.DOCTORSENDER_DEBUG_DIR?.trim();
const DEBUG_DIR = DEBUG_DIR_RAW ? path.resolve(DEBUG_DIR_RAW) : null;

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

function createTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function isDoctorSenderDebugEnabled(): boolean {
  return Boolean(DEBUG_DIR);
}

export async function writeDoctorSenderDebugFile(fileName: string, content: string): Promise<void> {
  if (!DEBUG_DIR) return;
  const safeName = sanitizeFileName(fileName);
  const timestamp = createTimestamp();
  const finalName = safeName ? `${timestamp}_${safeName}` : `${timestamp}_debug.txt`;
  const target = path.join(DEBUG_DIR, finalName);
  try {
    await mkdir(DEBUG_DIR, { recursive: true });
    await writeFile(target, content, 'utf8');
    console.info('[DoctorSender][debug]', 'wrote', target);
  } catch (error) {
    console.error('[DoctorSender][debug] failed to write file', { target, error });
  }
}
