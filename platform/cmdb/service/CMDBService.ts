import type { CINode, CIEdge } from "../graph";
import type {
  TenantContext,
  GovernanceContext,
  CMDBReadOptions,
  CMDBWriteOptions,
  OpaqueId,
} from "./types";

/**
 * CMDBService is the ONLY allowed read/write surface for CMDB state.
 *
 * Rules (Step 11A-2):
 * - TenantContext is required for all operations
 * - No traversal APIs
 * - No storage assumptions
 * - Nodes and edges are independent lifecycle entities
 */
export interface CMDBService {
  // ---- Nodes ----

  getNode(
    tenant: TenantContext,
    nodeId: OpaqueId,
    opts?: CMDBReadOptions
  ): Promise<CINode | null>;

  listNodes(
    tenant: TenantContext,
    opts?: CMDBReadOptions
  ): Promise<{
    items: CINode[];
    nextCursor?: string;
  }>;

  upsertNode(
    tenant: TenantContext,
    node: CINode,
    governance?: GovernanceContext,
    opts?: CMDBWriteOptions
  ): Promise<CINode>;

  deleteNode(
    tenant: TenantContext,
    nodeId: OpaqueId,
    governance?: GovernanceContext,
    opts?: CMDBWriteOptions
  ): Promise<void>;

  // ---- Edges ----

  getEdge(
    tenant: TenantContext,
    edgeId: OpaqueId,
    opts?: CMDBReadOptions
  ): Promise<CIEdge | null>;

  listEdges(
    tenant: TenantContext,
    opts?: CMDBReadOptions
  ): Promise<{
    items: CIEdge[];
    nextCursor?: string;
  }>;

  upsertEdge(
    tenant: TenantContext,
    edge: CIEdge,
    governance?: GovernanceContext,
    opts?: CMDBWriteOptions
  ): Promise<CIEdge>;

  deleteEdge(
    tenant: TenantContext,
    edgeId: OpaqueId,
    governance?: GovernanceContext,
    opts?: CMDBWriteOptions
  ): Promise<void>;
}
