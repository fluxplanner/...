import { verifyUserJWT, serviceClient, json, corsHeaders } from "../_shared/auth.ts";

const OWNER_EMAIL = (Deno.env.get("FLUX_OWNER_EMAIL") ||
  "azfermohammed21@gmail.com").toLowerCase();

type JsonRecord = Record<string, unknown>;
type OwnerRow = { id: string; data: JsonRecord | null; updated_at?: string };
type DevAccount = {
  email?: string;
  role?: string;
  perms?: string[];
  userId?: string;
};

function normEmail(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

function safeText(v: unknown, max = 800) {
  return String(v || "").trim().slice(0, max);
}

function asRecord(v: unknown): JsonRecord {
  return v && typeof v === "object" && !Array.isArray(v) ? v as JsonRecord : {};
}

function devAccounts(ownerData: JsonRecord): DevAccount[] {
  const raw = ownerData.devAccounts;
  return Array.isArray(raw) ? raw.filter(Boolean) as DevAccount[] : [];
}

function findDev(ownerData: JsonRecord, email: string) {
  return devAccounts(ownerData).find((d) => normEmail(d.email) === email) || null;
}

function canPushRelease(ownerData: JsonRecord, email: string) {
  if (email === OWNER_EMAIL) return { ok: true, role: "owner" };
  const dev = findDev(ownerData, email);
  if (!dev) return { ok: false, role: "user" };
  const role = String(dev.role || "viewer").toLowerCase();
  const perms = Array.isArray(dev.perms) ? dev.perms : [];
  const ok = perms.includes("release_push") ||
    role === "admin" ||
    role === "editor" ||
    role === "owner" ||
    role === "dev";
  return { ok, role: ok ? "dev" : "viewer" };
}

function normalizePreviewMode(v: unknown) {
  const m = String(v || "all_devs");
  return m === "owner" || m === "selected" || m === "all_devs"
    ? m
    : "all_devs";
}

function normalizePreviewEmails(v: unknown) {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.map(normEmail).filter((x) => x.includes("@"))))
    .slice(0, 100);
}

async function findOwnerRow(db: ReturnType<typeof serviceClient>, authUserId: string) {
  const { data: rows, error } = await db
    .from("user_data")
    .select("id,data,updated_at")
    .limit(5000);
  if (error) throw error;

  const owner = ((rows || []) as OwnerRow[]).find((row) =>
    normEmail(asRecord(row.data).ownerEmail) === OWNER_EMAIL
  );
  if (owner) return owner;

  const { data: ownRow } = await db
    .from("user_data")
    .select("id,data,updated_at")
    .eq("id", authUserId)
    .maybeSingle();
  if (ownRow) return ownRow as OwnerRow;

  return { id: authUserId, data: { ownerEmail: OWNER_EMAIL } } as OwnerRow;
}

async function saveOwnerData(
  db: ReturnType<typeof serviceClient>,
  ownerRow: OwnerRow,
  ownerData: JsonRecord,
) {
  ownerData.ownerEmail = OWNER_EMAIL;
  const { error } = await db.from("user_data").upsert({
    id: ownerRow.id,
    data: ownerData,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}

/** Resolve Auth user id by email (paginated; cap pages for safety). */
async function findUserIdByEmail(
  admin: ReturnType<typeof serviceClient>,
  needle: string,
): Promise<string | null> {
  const n = normEmail(needle);
  if (!n) return null;
  let page = 1;
  const perPage = 200;
  const maxPages = 50;
  for (; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find((u) => normEmail(u.email) === n);
    if (hit?.id) return hit.id;
    if (users.length < perPage) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  const auth = await verifyUserJWT(req);
  if ("error" in auth && auth.error) {
    return json({ error: auth.error }, auth.status, origin);
  }

  const email = normEmail(auth.email);
  const db = serviceClient();

  try {
    const ownerRow = await findOwnerRow(db, auth.userId);
    const ownerData = asRecord(ownerRow.data);
    const platformConfig = asRecord(ownerData.platformConfig);
    const gate = platformConfig.releaseGate || null;
    const pushAuth = canPushRelease(ownerData, email);

    if (req.method === "GET") {
      return json({
        ok: true,
        gate,
        role: pushAuth.role,
        canPush: pushAuth.ok,
        canManagePreview: email === OWNER_EMAIL,
      }, 200, origin);
    }

    let body: JsonRecord;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, origin);
    }

    const action = String(body.action || "");

    if (action === "push_release") {
      if (!pushAuth.ok) return json({ error: "Not authorized" }, 403, origin);
      const buildId = safeText(body.buildId, 90);
      if (!buildId) return json({ error: "buildId required" }, 400, origin);

      const prevGate = asRecord(platformConfig.releaseGate);
      const nextGate = {
        ...prevGate,
        released: buildId,
        pushedAt: Date.now(),
        pushedAtIso: new Date().toISOString(),
        pushedBy: email,
        notes: safeText(body.notes),
      };
      platformConfig.releaseGate = nextGate;
      ownerData.platformConfig = platformConfig;
      await saveOwnerData(db, ownerRow, ownerData);

      return json({
        ok: true,
        gate: nextGate,
        role: pushAuth.role,
        canPush: true,
      }, 200, origin);
    }

    if (action === "sync_platform_to_devs") {
      if (email !== OWNER_EMAIL) {
        return json({ error: "Only the owner can sync platform config to dev accounts" }, 403, origin);
      }
      const targetMode = String(body.targetMode || "all") === "selected"
        ? "selected"
        : "all";
      const requested = normalizePreviewEmails(body.targetEmails);
      const allowedDevEmails = new Set(devAccounts(ownerData).map((d) => normEmail(d.email)));

      const ownerPc = asRecord(ownerData.platformConfig);

      let targets = devAccounts(ownerData);
      if (targetMode === "selected") {
        const allow = new Set(
          requested.filter((e) => allowedDevEmails.has(e)),
        );
        targets = targets.filter((d) => allow.has(normEmail(d.email)));
      }
      if (!targets.length) {
        return json({ error: "No dev accounts matched" }, 400, origin);
      }

      const results: { email: string; ok: boolean; error?: string }[] = [];

      for (const d of targets) {
        const em = normEmail(d.email);
        if (!em || em === OWNER_EMAIL) continue;

        let uid =
          typeof d.userId === "string"
            ? String(d.userId).trim()
            : "";
        if (!uid) {
          uid = (await findUserIdByEmail(db, em)) ?? "";
        }
        if (!uid) {
          results.push({ email: em, ok: false, error: "No Auth user for email" });
          continue;
        }
        if (uid === ownerRow.id) {
          results.push({ email: em, ok: false, error: "Target is owner row" });
          continue;
        }

        const { data: row, error: rerr } = await db.from("user_data").select("id,data")
          .eq("id", uid).maybeSingle();
        if (rerr) {
          results.push({ email: em, ok: false, error: rerr.message });
          continue;
        }

        const existing = asRecord(row?.data);
        const devPc = asRecord(existing.platformConfig);
        const nextPc = { ...devPc, ...ownerPc };
        existing.platformConfig = nextPc;

        const { error: uerr } = await db.from("user_data").upsert({
          id: uid,
          data: existing,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
        if (uerr) {
          results.push({ email: em, ok: false, error: uerr.message });
        } else {
          results.push({ email: em, ok: true });
        }
      }

      return json({
        ok: true,
        targetMode,
        synced: results,
        okCount: results.filter((r) => r.ok).length,
      }, 200, origin);
    }

    if (action === "save_preview_access") {
      if (email !== OWNER_EMAIL) {
        return json({ error: "Only the owner can change preview access" }, 403, origin);
      }
      const allowedDevEmails = new Set(devAccounts(ownerData).map((d) => normEmail(d.email)));
      const requested = normalizePreviewEmails(body.previewEmails);
      const nextPreviewEmails = requested.filter((x) => allowedDevEmails.has(x));
      const prevGate = asRecord(platformConfig.releaseGate);
      const nextGate = {
        ...prevGate,
        previewMode: normalizePreviewMode(body.previewMode),
        previewEmails: nextPreviewEmails,
        previewUpdatedAt: Date.now(),
        previewUpdatedBy: email,
      };
      platformConfig.releaseGate = nextGate;
      ownerData.platformConfig = platformConfig;
      await saveOwnerData(db, ownerRow, ownerData);

      return json({
        ok: true,
        gate: nextGate,
        role: "owner",
        canPush: true,
        canManagePreview: true,
      }, 200, origin);
    }

    return json({ error: "Unknown action" }, 400, origin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Release admin failed" }, 500, origin);
  }
});
