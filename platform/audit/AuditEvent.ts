export type AuditEventType =
  | "CMDB_NODE_UPSERTED"
  | "CMDB_NODE_DELETED"
  | "CMDB_EDGE_UPSERTED"
  | "CMDB_EDGE_DELETED";

export type AuditEvent = Readonly<{
  eventId: string;
  tenantId: string;
  changeId: string;
  actorId: string;
  actorType: "user" | "system" | "agent";
  eventType: AuditEventType;
  entityId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}>;
