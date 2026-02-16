import type { CINode, CIEdge } from "../graph";
import type { Page, StoreReadOptions, StoreWriteOptions } from "./types";

/**
 * GraphStore is a storage-only abstraction.
 *
 * Rules (Step 11A-3):
 * - No traversal APIs
 * - No query language
 * - Tenant is explicit on every operation
 * - Nodes and edges are first-class
 * - Store may support optimistic concurrency via expectedVersion
 */
export interface GraphStore {
  // ---- Nodes ----

  getNode(tenantId: string, ciId: string): Promise<{ node: CINode; version: number } | null>;

  listNodes(tenantId: string, opts?: StoreReadOptions): Promise<Page<{ node: CINode; version: number }>>;

  upsertNode(
    tenantId: string,
    node: CINode,
    opts?: StoreWriteOptions
  ): Promise<{ node: CINode; version: number }>;

  deleteNode(tenantId: string, ciId: string, opts?: StoreWriteOptions): Promise<void>;

  // ---- Edges ----

  getEdge(tenantId: string, edgeId: string): Promise<{ edge: CIEdge; version: number } | null>;

  listEdges(tenantId: string, opts?: StoreReadOptions): Promise<Page<{ edge: CIEdge; version: number }>>;

  upsertEdge(
    tenantId: string,
    edge: CIEdge,
    opts?: StoreWriteOptions
  ): Promise<{ edge: CIEdge; version: number }>;

  deleteEdge(tenantId: string, edgeId: string, opts?: StoreWriteOptions): Promise<void>;
}
