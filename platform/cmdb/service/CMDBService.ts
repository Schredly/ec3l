import type { CINode, CIEdge } from "../graph";
import type {
  TenantContext,
  GovernanceContext,
  CMDBReadOptions,
  CMDBWriteOptions,
  OpaqueId,
} from "./types";

export interface CMDBService {
  getNode(
    tenant: TenantContext,
    nodeId: OpaqueId,
    opts?: CMDBReadOptions
  ): Promise<CINode | null>;

  listNodes(
    tenant: TenantContext,
    opts?: CMDBReadOptions
  ): Promise<{ items: CINode[]; nextCursor?: string }>;

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

  getEdge(
    tenant: TenantContext,
    edgeId: OpaqueId,
    opts?: CMDBReadOptions
  ): Promise<CIEdge | null>;

  listEdges(
    tenant: TenantContext,
    opts?: CMDBReadOptions
  ): Promise<{ items: CIEdge[]; nextCursor?: string }>;

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
