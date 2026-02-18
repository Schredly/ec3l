import type { TenantContext } from "../tenant";
import { storage } from "../storage";

export interface AuditFeedEntry {
  id: string;
  timestamp: Date;
  source: "change" | "rbac" | "telemetry";
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  payload: unknown;
}

export async function getAuditFeed(
  ctx: TenantContext,
  opts: { limit?: number } = {},
): Promise<AuditFeedEntry[]> {
  const limit = opts.limit ?? 50;
  const tenantId = ctx.tenantId;

  const [changeEvents, rbacLogs, telemetryEvents] = await Promise.all([
    storage.getChangeEvents(tenantId, limit),
    storage.getRbacAuditLogs(tenantId, limit),
    storage.getExecutionTelemetryEvents(tenantId, { limit }),
  ]);

  const entries: AuditFeedEntry[] = [];

  for (const e of changeEvents) {
    entries.push({
      id: e.id,
      timestamp: e.createdAt,
      source: "change",
      eventType: e.eventType,
      entityType: "change",
      entityId: e.changeId,
      payload: e.payload,
    });
  }

  for (const l of rbacLogs) {
    entries.push({
      id: l.id,
      timestamp: l.timestamp,
      source: "rbac",
      eventType: l.outcome,
      entityType: l.resourceType,
      entityId: l.resourceId,
      payload: {
        actorType: l.actorType,
        actorId: l.actorId,
        permission: l.permission,
        reason: l.reason,
      },
    });
  }

  for (const t of telemetryEvents) {
    entries.push({
      id: t.id,
      timestamp: t.timestamp,
      source: "telemetry",
      eventType: t.eventType,
      entityType: t.executionType,
      entityId: t.executionId,
      payload: {
        actorType: t.actorType,
        actorId: t.actorId,
        status: t.status,
        errorMessage: t.errorMessage,
        workflowId: t.workflowId,
      },
    });
  }

  entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return entries.slice(0, limit);
}
