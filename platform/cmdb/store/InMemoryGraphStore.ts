import type { CINode, CIEdge } from "../graph";
import type { GraphStore } from "./GraphStore";
import type { Page, StoreReadOptions, StoreWriteOptions } from "./types";

type VersionedNode = { node: CINode; version: number };
type VersionedEdge = { edge: CIEdge; version: number };

function clampLimit(limit?: number): number {
  if (limit == null) return 200;
  if (limit <= 0) return 1;
  return Math.min(limit, 1000);
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const n = Number.parseInt(cursor, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function encodeCursor(n: number): string {
  return String(n);
}

export class InMemoryGraphStore implements GraphStore {
  private readonly nodesByTenant = new Map<string, Map<string, VersionedNode>>();
  private readonly edgesByTenant = new Map<string, Map<string, VersionedEdge>>();

  private nodes(tenantId: string): Map<string, VersionedNode> {
    let m = this.nodesByTenant.get(tenantId);
    if (!m) {
      m = new Map();
      this.nodesByTenant.set(tenantId, m);
    }
    return m;
  }

  private edges(tenantId: string): Map<string, VersionedEdge> {
    let m = this.edgesByTenant.get(tenantId);
    if (!m) {
      m = new Map();
      this.edgesByTenant.set(tenantId, m);
    }
    return m;
  }

  async getNode(tenantId: string, ciId: string): Promise<VersionedNode | null> {
    return this.nodes(tenantId).get(ciId) ?? null;
  }

  async listNodes(tenantId: string, opts?: StoreReadOptions): Promise<Page<VersionedNode>> {
    const limit = clampLimit(opts?.limit);
    const offset = decodeCursor(opts?.cursor);

    const all = Array.from(this.nodes(tenantId).values());
    const items = all.slice(offset, offset + limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < all.length ? encodeCursor(nextOffset) : undefined,
    };
  }

  async upsertNode(
    tenantId: string,
    node: CINode,
    opts?: StoreWriteOptions
  ): Promise<VersionedNode> {
    const m = this.nodes(tenantId);
    const existing = m.get(node.ciId);

    if (existing && opts?.expectedVersion != null && existing.version !== opts.expectedVersion) {
      // store-level conflict signal; service will translate to CMDBConflict
      throw new Error(`GRAPHSTORE_CONFLICT: node ${node.ciId} version ${existing.version} != expected ${opts.expectedVersion}`);
    }

    const version = (existing?.version ?? 0) + 1;
    const record = { node, version };
    m.set(node.ciId, record);
    return record;
  }

  async deleteNode(tenantId: string, ciId: string, opts?: StoreWriteOptions): Promise<void> {
    const m = this.nodes(tenantId);
    const existing = m.get(ciId);

    if (existing && opts?.expectedVersion != null && existing.version !== opts.expectedVersion) {
      throw new Error(`GRAPHSTORE_CONFLICT: node ${ciId} version ${existing.version} != expected ${opts.expectedVersion}`);
    }

    m.delete(ciId);
  }

  async getEdge(tenantId: string, edgeId: string): Promise<VersionedEdge | null> {
    return this.edges(tenantId).get(edgeId) ?? null;
  }

  async listEdges(tenantId: string, opts?: StoreReadOptions): Promise<Page<VersionedEdge>> {
    const limit = clampLimit(opts?.limit);
    const offset = decodeCursor(opts?.cursor);

    const all = Array.from(this.edges(tenantId).values());
    const items = all.slice(offset, offset + limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < all.length ? encodeCursor(nextOffset) : undefined,
    };
  }

  async upsertEdge(
    tenantId: string,
    edge: CIEdge,
    opts?: StoreWriteOptions
  ): Promise<VersionedEdge> {
    const m = this.edges(tenantId);
    const existing = m.get(edge.edgeId);

    if (existing && opts?.expectedVersion != null && existing.version !== opts.expectedVersion) {
      throw new Error(`GRAPHSTORE_CONFLICT: edge ${edge.edgeId} version ${existing.version} != expected ${opts.expectedVersion}`);
    }

    const version = (existing?.version ?? 0) + 1;
    const record = { edge, version };
    m.set(edge.edgeId, record);
    return record;
  }

  async deleteEdge(tenantId: string, edgeId: string, opts?: StoreWriteOptions): Promise<void> {
    const m = this.edges(tenantId);
    const existing = m.get(edgeId);

    if (existing && opts?.expectedVersion != null && existing.version !== opts.expectedVersion) {
      throw new Error(`GRAPHSTORE_CONFLICT: edge ${edgeId} version ${existing.version} != expected ${opts.expectedVersion}`);
    }

    m.delete(edgeId);
  }
}
