import type { CINode, CIEdge } from "../../graph";
import type { GraphStore } from "../../store";
import type { CMDBService } from "../CMDBService";
import type { CMDBReadOptions, CMDBWriteOptions, GovernanceContext, TenantContext } from "../types";
import { CMDBConflict, CMDBInvariantViolation } from "../errors";

function requireTenant(tenant: TenantContext): string {
  if (!tenant?.tenantId) throw new CMDBInvariantViolation("TenantContext.tenantId is required.");
  return tenant.tenantId;
}

function mapWriteOpts(opts?: CMDBWriteOptions) {
  return opts?.expectedVersion != null ? { expectedVersion: opts.expectedVersion } : undefined;
}

function toStoreReadOpts(opts?: CMDBReadOptions) {
  return { limit: opts?.limit, cursor: opts?.cursor };
}

function translateStoreError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith("GRAPHSTORE_CONFLICT:")) {
    throw new CMDBConflict(msg);
  }
  throw err instanceof Error ? err : new Error(msg);
}

/**
 * Minimal CMDBService implementation backed by a GraphStore.
 *
 * Still Step 11A constraints:
 * - No traversal
 * - No query language
 * - Tenant explicit everywhere
 * - Direct invariants only
 *
 * GovernanceContext is accepted but not enforced until Step 11A-4.
 */
export class StoreBackedCMDBService implements CMDBService {
  constructor(private readonly store: GraphStore) {}

  async getNode(tenant: TenantContext, nodeId: string): Promise<CINode | null> {
    const tenantId = requireTenant(tenant);
    const res = await this.store.getNode(tenantId, nodeId);
    return res?.node ?? null;
  }

  async listNodes(tenant: TenantContext, opts?: CMDBReadOptions) {
    const tenantId = requireTenant(tenant);
    const page = await this.store.listNodes(tenantId, toStoreReadOpts(opts));
    return { items: page.items.map((x) => x.node), nextCursor: page.nextCursor };
  }

  async upsertNode(
    tenant: TenantContext,
    node: CINode,
    _governance?: GovernanceContext,
    opts?: CMDBWriteOptions
  ): Promise<CINode> {
    const tenantId = requireTenant(tenant);

    if (node.tenantId !== tenantId) {
      throw new CMDBInvariantViolation(`Node.tenantId (${node.tenantId}) must match TenantContext.tenantId (${tenantId}).`);
    }

    try {
      const res = await this.store.upsertNode(tenantId, node, mapWriteOpts(opts));
      return res.node;
    } catch (e) {
      translateStoreError(e);
    }
  }

  async deleteNode(
    tenant: TenantContext,
    nodeId: string,
    _governance?: GovernanceContext,
    opts?: CMDBWriteOptions
  ): Promise<void> {
    const tenantId = requireTenant(tenant);
    try {
      await this.store.deleteNode(tenantId, nodeId, mapWriteOpts(opts));
    } catch (e) {
      translateStoreError(e);
    }
  }

  async getEdge(tenant: TenantContext, edgeId: string): Promise<CIEdge | null> {
    const tenantId = requireTenant(tenant);
    const res = await this.store.getEdge(tenantId, edgeId);
    return res?.edge ?? null;
  }

  async listEdges(tenant: TenantContext, opts?: CMDBReadOptions) {
    const tenantId = requireTenant(tenant);
    const page = await this.store.listEdges(tenantId, toStoreReadOpts(opts));
    return { items: page.items.map((x) => x.edge), nextCursor: page.nextCursor };
  }

  async upsertEdge(
    tenant: TenantContext,
    edge: CIEdge,
    _governance?: GovernanceContext,
    opts?: CMDBWriteOptions
  ): Promise<CIEdge> {
    const tenantId = requireTenant(tenant);

    if (edge.tenantId !== tenantId) {
      throw new CMDBInvariantViolation(`Edge.tenantId (${edge.tenantId}) must match TenantContext.tenantId (${tenantId}).`);
    }

    // Direct invariant (still no traversal): referenced nodes must exist.
    const from = await this.store.getNode(tenantId, edge.fromCiId);
    const to = await this.store.getNode(tenantId, edge.toCiId);
    if (!from) throw new CMDBInvariantViolation(`Edge.fromCiId (${edge.fromCiId}) must reference an existing CINode.`);
    if (!to) throw new CMDBInvariantViolation(`Edge.toCiId (${edge.toCiId}) must reference an existing CINode.`);

    try {
      const res = await this.store.upsertEdge(tenantId, edge, mapWriteOpts(opts));
      return res.edge;
    } catch (e) {
      translateStoreError(e);
    }
  }

  async deleteEdge(
    tenant: TenantContext,
    edgeId: string,
    _governance?: GovernanceContext,
    opts?: CMDBWriteOptions
  ): Promise<void> {
    const tenantId = requireTenant(tenant);
    try {
      await this.store.deleteEdge(tenantId, edgeId, mapWriteOpts(opts));
    } catch (e) {
      translateStoreError(e);
    }
  }
}
