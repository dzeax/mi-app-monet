import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const DEFAULT_CLIENT = "emg";

const requireJiraEnv = () => {
  const base = process.env.JIRA_BASE;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) {
    throw new Error("Missing JIRA env vars (JIRA_BASE, JIRA_EMAIL, JIRA_API_TOKEN)");
  }
  return { base: base.replace(/\/+$/, ""), email, token };
};

export const runtime = "nodejs";

export async function GET(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

  try {
    const { searchParams } = new URL(request.url);
    const ticket = searchParams.get("ticket");
    const client = searchParams.get("client") || DEFAULT_CLIENT;
    void client;

    if (!ticket) {
      return NextResponse.json({ error: "Missing ticket" }, { status: 400 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { base, email, token } = requireJiraEnv();

    const url = `${base}/rest/api/3/issue/${encodeURIComponent(ticket)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      const msg = bodyText || `JIRA request failed (${res.status})`;
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const body = await res.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Empty response from JIRA" }, { status: 502 });
    }

    const fields = body.fields || {};
    const key = body.key as string | undefined;
    const title = (fields.summary as string | undefined) || "";
    const status = (fields.status?.name as string | undefined) || null;
    const createdDate = (fields.created as string | undefined)?.slice(0, 10) || null;
    const dueDate = (fields.duedate as string | undefined) || null;
    const assignee =
      (fields.assignee?.displayName as string | undefined) ||
      (fields.assignee?.emailAddress as string | undefined) ||
      null;
    const description =
      (fields.description && typeof fields.description === "string"
        ? (fields.description as string)
        : null) || null;

    const result = {
      key: key || ticket,
      title,
      status,
      createdDate,
      dueDate,
      assignee,
      url: `${base}/browse/${encodeURIComponent(key || ticket)}`,
      summary: title,
      description,
    };

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

