export type OpaqueId = string;

export type TenantContext = Readonly<{
  tenantId: OpaqueId;
}>;

export type ActorContext = Readonly<{
  actorId: OpaqueId;
  actorType: "user" | "system" | "agent";
}>;

export type GovernanceContext = Readonly<{
  changeId?: OpaqueId;
  actor?: ActorContext;
}>;

export type CMDBReadOptions = Readonly<{
  limit?: number;
  cursor?: string;
}>;

export type CMDBWriteOptions = Readonly<{
  expectedVersion?: number;
}>;
