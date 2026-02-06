import { NextResponse } from 'next/server';
import { DEFAULT_CLIENT, runJiraSync } from '@/app/api/admin/jira-sync/route';

export const runtime = 'nodejs';

const getSecret = () => process.env.CRON_SECRET || '';

const getAuthToken = (request: Request) => {
  const bearer = request.headers.get('authorization');
  if (bearer && bearer.toLowerCase().startsWith('bearer ')) {
    return bearer.slice(7).trim();
  }
  return request.headers.get('x-cron-secret') || '';
};

async function handleCron(request: Request) {
  const secret = getSecret();
  if (!secret) {
    return NextResponse.json({ error: 'Missing CRON_SECRET' }, { status: 500 });
  }

  const token = getAuthToken(request);
  if (!token || token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client') || DEFAULT_CLIENT;
    const forceFull = searchParams.get('full') === '1';
    const jql = searchParams.get('jql');
    const result = await runJiraSync({
      client,
      forceFull,
      jql,
      userId: null,
    });
    // Cron should be idempotent: if a sync is already running, return 200 and rely on the JSON payload.
    return NextResponse.json({ client, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
