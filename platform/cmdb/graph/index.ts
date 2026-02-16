/**
 * CMDB Graph Module
 *
 * Public exports for the CMDB graph contract.
 *
 * This module provides the core type definitions for a tenant-isolated,
 * storage-agnostic Configuration Management Database graph.
 *
 * @module platform/cmdb/graph
 */

export type {
  CINode,
  CIEdge,
  CMDBGraph,
  CILifecycleState,
  CISource,
} from './types';
