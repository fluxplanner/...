import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuthResult {
  userId: string;
  email: string;
  error?: never;
}
export interface AuthError {
  userId?: never;
  email?: never;
  error: string;
  status: number;
}

export async function verifyUserJWT(
  req: Request,
): Promise<AuthResult | AuthError> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Missing Authorization header", status: 401 };
  }
  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { error: "Invalid or expired token", status: 401 };
  }
  return { userId: user.id, email: user.email ?? "" };
}

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Origins allowed to call Edge Functions from the browser (must echo exact Origin for credentialed fetches). */
function resolveCorsOrigin(origin: string): string {
  const trimmed = (origin || "").trim();
  const exact = new Set([
    "https://azfermohammed.github.io",
    "https://fluxplanner.github.io",
    "http://localhost:3000",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5500",
  ]);
  if (exact.has(trimmed)) return trimmed;
  // Any user/org GitHub Pages site (https://<name>.github.io)
  try {
    const u = new URL(trimmed);
    if (
      u.protocol === "https:" && !u.port &&
      /\.github\.io$/i.test(u.hostname) &&
      u.hostname.length > ".github.io".length
    ) {
      return trimmed;
    }
  } catch {
    /* ignore */
  }
  return "https://azfermohammed.github.io";
}

export function corsHeaders(origin: string) {
  const o = resolveCorsOrigin(origin);
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

export function json(data: unknown, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}
