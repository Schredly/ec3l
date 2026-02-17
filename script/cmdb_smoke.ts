import { createDevCMDB } from "../platform/cmdb/core";

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const { service, audit } = createDevCMDB();

  const tenant = { tenantId: "t1" as string };

  const governance = {
    changeId: "chg_001",
    actor: { actorId: "u1", actorType: "user" as const },
  };

  // 1) Writes require governance (fail-closed)
  let threw = false;
  try {
    await service.upsertNode(tenant, {
      tenantId: "t1",
      ciId: "ci_1",
      ciType: "server",
      displayName: "Server 1",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } as any);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected governance enforcement to throw for upsertNode without governance.");

  // 2) Create two nodes with governance
  await service.upsertNode(
    tenant,
    {
      tenantId: "t1",
      ciId: "ci_1",
      ciType: "server",
      displayName: "Server 1",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } as any,
    governance
  );

  await service.upsertNode(
    tenant,
    {
      tenantId: "t1",
      ciId: "ci_2",
      ciType: "app",
      displayName: "App 1",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } as any,
    governance
  );

  // 3) Edge must reference existing nodes
  threw = false;
  try {
    await service.upsertEdge(
      tenant,
      {
        tenantId: "t1",
        edgeId: "e_bad",
        edgeType: "depends_on",
        fromCiId: "ci_1",
        toCiId: "ci_DOES_NOT_EXIST",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      } as any,
      governance
    );
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected edge invariant to throw for missing referenced node.");

  // 4) Valid edge
  await service.upsertEdge(
    tenant,
    {
      tenantId: "t1",
      edgeId: "e1",
      edgeType: "depends_on",
      fromCiId: "ci_1",
      toCiId: "ci_2",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } as any,
    governance
  );

  // 5) Audit events emitted
  if (audit.events.length < 3) {
    throw new Error(`Expected >= 3 audit events, got ${audit.events.length}`);
  }

  console.log("CMDB smoke test: OK");
  console.log("Audit events:", audit.events.map((e) => e.eventType));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
