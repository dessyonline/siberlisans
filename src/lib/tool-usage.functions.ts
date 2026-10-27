import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin, requireAuth } from "@/lib/auth-middleware.server";
import { mysqlExec, mysqlOne, mysqlQuery, num } from "@/lib/mysql.server";

const toolKey = z.string().min(2).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/);
const eventAction = z.enum(["viewed", "completed", "failed"]);
const toolKind = z.enum(["free", "ai"]);

function ts(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function since(days: number) {
  return ts(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

export type ToolUsageEvent = {
  id: string;
  tool_key: string;
  tool_kind: "free" | "ai";
  event_action: "viewed" | "completed" | "failed";
  duration_ms: number | null;
  error_code: string | null;
  created_at: string;
};

export type ToolQuality = {
  tool_key: string;
  tool_kind: "free" | "ai";
  uses: number;
  users: number;
  success_count: number;
  success_rate: number | null;
  average_duration_ms: number | null;
  failures: number;
  rating: number | null;
  rating_count: number;
};

export type MyToolUsage = {
  totals: { uses: number; successful: number; failed: number; active_tools: number };
  byTool: Array<{ tool_key: string; tool_kind: "free" | "ai"; uses: number; successful: number; failed: number; last_used_at: string }>;
  history: Array<{
    id: string;
    tool_key: string;
    tool_kind: "free" | "ai";
    action: string;
    status: "success" | "failed" | "info";
    created_at: string;
    duration_ms: number | null;
  }>;
};

export type AdminToolAnalytics = {
  periodDays: number;
  totals: { uses: number; uniqueUsers: number; successful: number; failed: number; rated: number };
  tools: ToolQuality[];
  topUsers: Array<{ id: string; email: string | null; display_name: string | null; uses: number; tools: number }>;
  unusedUsers: Array<{ id: string; email: string | null; display_name: string | null; last_seen_at: string | null }>;
  unusedUserCount: number;
};

export const recordToolUsage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        toolKey,
        toolKind: toolKind.default("free"),
        action: eventAction,
        durationMs: z.number().int().min(0).max(86_400_000).optional(),
        errorCode: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Aynı sekmede yenileme/geri-gelme spam'ini azaltır; gerçek kullanım kaydını korur.
    const recent = await mysqlOne<{ id: string }>(
      `SELECT id FROM tool_usage_events
        WHERE user_id=? AND tool_key=? AND event_action=? AND created_at >= ?
        LIMIT 1`,
      [context.userId, data.toolKey, data.action, ts(new Date(Date.now() - 5 * 60 * 1000))],
    );
    if (recent) return { ok: true, deduplicated: true };

    await mysqlExec(
      `INSERT INTO tool_usage_events
        (id,user_id,tool_key,tool_kind,event_action,duration_ms,error_code,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        context.userId,
        data.toolKey,
        data.toolKind,
        data.action,
        data.durationMs ?? null,
        data.errorCode ?? null,
        ts(),
      ],
    );
    return { ok: true, deduplicated: false };
  });

export const saveToolFeedback = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ toolKey, rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await mysqlExec(
      `INSERT INTO tool_feedback (id,user_id,tool_key,rating,comment,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE rating=VALUES(rating), comment=VALUES(comment), updated_at=VALUES(updated_at)`,
      [crypto.randomUUID(), context.userId, data.toolKey, data.rating, data.comment?.trim() || null, ts(), ts()],
    );
    return { ok: true };
  });

export const getMyToolUsage = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<MyToolUsage> => {
    const [events, jobs] = await Promise.all([
      mysqlQuery<ToolUsageEvent>(
        `SELECT id,tool_key,tool_kind,event_action,duration_ms,error_code,created_at
           FROM tool_usage_events WHERE user_id=? AND created_at >= ?
           ORDER BY created_at DESC LIMIT 120`,
        [context.userId, since(90)],
      ),
      mysqlQuery<{ id: string; kind: string; status: string; created_at: string; updated_at: string }>(
        `SELECT id,kind,status,created_at,updated_at FROM ai_jobs
           WHERE user_id=? AND created_at >= ? ORDER BY created_at DESC LIMIT 120`,
        [context.userId, since(90)],
      ),
    ]);

    const buckets = new Map<string, { tool_key: string; tool_kind: "free" | "ai"; uses: number; successful: number; failed: number; last_used_at: string }>();
    const history: MyToolUsage["history"] = [];
    const add = (key: string, kind: "free" | "ai", action: string, status: "success" | "failed" | "info", createdAt: string, duration: number | null, id: string) => {
      if (kind === "ai" && action !== "job") return;
      const current = buckets.get(key) ?? { tool_key: key, tool_kind: kind, uses: 0, successful: 0, failed: 0, last_used_at: createdAt };
      if (createdAt > current.last_used_at) current.last_used_at = createdAt;
      if (action === "viewed" || action === "failed" || action === "job") current.uses++;
      if (status === "success") current.successful++;
      if (status === "failed") current.failed++;
      buckets.set(key, current);
      history.push({ id, tool_key: key, tool_kind: kind, action, status, created_at: createdAt, duration_ms: duration });
    };

    for (const event of events) {
      if (event.tool_kind === "ai") continue;
      add(event.tool_key, event.tool_kind, event.event_action, event.event_action === "completed" ? "success" : event.event_action === "failed" ? "failed" : "info", event.created_at, num(event.duration_ms), event.id);
    }
    for (const job of jobs) {
      const status = job.status === "done" || job.status === "completed" ? "success" : ["failed", "refunded"].includes(job.status) ? "failed" : "info";
      add(job.kind, "ai", "job", status, job.created_at, null, job.id);
    }

    const byTool = [...buckets.values()].sort((a, b) => b.uses - a.uses || b.last_used_at.localeCompare(a.last_used_at));
    const historySorted = history.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 80);
    return {
      totals: {
        uses: byTool.reduce((sum, row) => sum + row.uses, 0),
        successful: byTool.reduce((sum, row) => sum + row.successful, 0),
        failed: byTool.reduce((sum, row) => sum + row.failed, 0),
        active_tools: byTool.length,
      },
      byTool,
      history: historySorted,
    };
  });

export const getToolQualitySummary = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async (): Promise<ToolQuality[]> => {
    const [events, jobs, feedback] = await Promise.all([
      mysqlQuery<{ tool_key: string; tool_kind: "free" | "ai"; event_action: string; duration_ms: unknown; user_id: string }>(
        `SELECT tool_key,tool_kind,event_action,duration_ms,user_id FROM tool_usage_events WHERE created_at >= ?`,
        [since(30)],
      ),
      mysqlQuery<{ tool_key: string; status: string; user_id: string }>(
        `SELECT kind tool_key,status,user_id FROM ai_jobs WHERE created_at >= ?`,
        [since(30)],
      ),
      mysqlQuery<{ tool_key: string; rating: unknown }>(
        `SELECT tool_key,rating FROM tool_feedback WHERE created_at >= ?`,
        [since(90)],
      ),
    ]);
    return buildQuality(events, jobs, feedback);
  });

export const getAdminToolAnalytics = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<AdminToolAnalytics> => {
    const [events, jobs, feedback, profiles] = await Promise.all([
      mysqlQuery<{ tool_key: string; tool_kind: "free" | "ai"; event_action: string; duration_ms: unknown; user_id: string }>(
        `SELECT tool_key,tool_kind,event_action,duration_ms,user_id FROM tool_usage_events WHERE created_at >= ?`,
        [since(30)],
      ),
      mysqlQuery<{ tool_key: string; kind: string; status: string; user_id: string }>(
        `SELECT kind tool_key,kind,status,user_id FROM ai_jobs WHERE created_at >= ?`,
        [since(30)],
      ),
      mysqlQuery<{ tool_key: string; rating: unknown }>(
        `SELECT tool_key,rating FROM tool_feedback WHERE created_at >= ?`,
        [since(90)],
      ),
      mysqlQuery<{ id: string; email: string | null; display_name: string | null; last_seen_at: string | null }>(
        `SELECT id,email,display_name,last_seen_at FROM profiles ORDER BY created_at DESC`,
      ),
    ]);

    const tools = buildQuality(events, jobs, feedback);
    const userCounts = new Map<string, { uses: number; tools: Set<string> }>();
    const usedUserIds = new Set<string>();
    for (const row of events) {
      if (row.tool_kind === "ai") continue;
      const bucket = userCounts.get(row.user_id) ?? { uses: 0, tools: new Set<string>() };
      if (row.event_action === "viewed" || row.event_action === "completed" || row.event_action === "failed") bucket.uses++;
      bucket.tools.add(row.tool_key);
      userCounts.set(row.user_id, bucket);
      usedUserIds.add(row.user_id);
    }
    for (const row of jobs) {
      const bucket = userCounts.get(row.user_id) ?? { uses: 0, tools: new Set<string>() };
      bucket.uses++;
      bucket.tools.add(row.tool_key);
      userCounts.set(row.user_id, bucket);
      usedUserIds.add(row.user_id);
    }

    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const topUsers = [...userCounts.entries()]
      .sort((a, b) => b[1].uses - a[1].uses)
      .slice(0, 20)
      .map(([id, value]) => ({
        id,
        email: profileMap.get(id)?.email ?? null,
        display_name: profileMap.get(id)?.display_name ?? null,
        uses: value.uses,
        tools: value.tools.size,
      }));
    const unusedUsers = profiles
      .filter((p) => !usedUserIds.has(p.id))
      .slice(0, 100)
      .map((p) => ({ id: p.id, email: p.email, display_name: p.display_name, last_seen_at: p.last_seen_at }));
    const successful = tools.reduce((sum, tool) => sum + tool.success_count, 0);
    const failed = tools.reduce((sum, tool) => sum + tool.failures, 0);
    return {
      periodDays: 30,
      totals: {
        uses: tools.reduce((sum, tool) => sum + tool.uses, 0),
        uniqueUsers: usedUserIds.size,
        successful,
        failed,
        rated: feedback.length,
      },
      tools,
      topUsers,
      unusedUsers,
      unusedUserCount: profiles.length - usedUserIds.size,
    };
  });

function buildQuality(
  events: Array<{ tool_key: string; tool_kind: "free" | "ai"; event_action: string; duration_ms: unknown; user_id: string }>,
  jobs: Array<{ tool_key: string; status: string; user_id: string }>,
  feedback: Array<{ tool_key: string; rating: unknown }>,
): ToolQuality[] {
  const map = new Map<string, ToolQuality & { userIds: Set<string>; durationTotal: number; durationCount: number; successCount: number }>();
  const get = (key: string, kind: "free" | "ai") => {
    const current = map.get(key);
    if (current) return current;
    const next = { tool_key: key, tool_kind: kind, uses: 0, users: 0, success_count: 0, success_rate: null, average_duration_ms: null, failures: 0, rating: null, rating_count: 0, userIds: new Set<string>(), durationTotal: 0, durationCount: 0, successCount: 0 };
    map.set(key, next);
    return next;
  };
  for (const row of events) {
    if (row.tool_kind === "ai") continue;
    const item = get(row.tool_key, row.tool_kind);
    if (row.event_action === "viewed" || row.event_action === "failed") item.uses++;
    if (row.event_action === "completed") item.successCount++;
    if (row.event_action === "failed") item.failures++;
    item.userIds.add(row.user_id);
    const duration = num(row.duration_ms);
    if (duration != null) { item.durationTotal += duration; item.durationCount++; }
  }
  for (const row of jobs) {
    const item = get(row.tool_key, "ai");
    item.uses++;
    item.userIds.add(row.user_id);
    if (row.status === "done" || row.status === "completed") item.successCount++;
    if (row.status === "failed" || row.status === "refunded") item.failures++;
  }
  const ratings = new Map<string, { total: number; count: number }>();
  for (const row of feedback) {
    const bucket = ratings.get(row.tool_key) ?? { total: 0, count: 0 };
    bucket.total += num(row.rating) ?? 0;
    bucket.count++;
    ratings.set(row.tool_key, bucket);
  }
  return [...map.values()]
    .map(({ userIds, durationTotal, durationCount, successCount, ...item }) => {
      const rating = ratings.get(item.tool_key);
      return {
        ...item,
        users: userIds.size,
        success_count: successCount,
        success_rate: item.uses ? Math.round((successCount / item.uses) * 100) : null,
        average_duration_ms: durationCount ? Math.round(durationTotal / durationCount) : null,
        rating: rating?.count ? Math.round((rating.total / rating.count) * 10) / 10 : null,
        rating_count: rating?.count ?? 0,
      };
    })
    .sort((a, b) => b.uses - a.uses || a.tool_key.localeCompare(b.tool_key));
}
