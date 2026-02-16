/**
 * CMDB Graph Contract
 *
 * This module defines the core graph primitives for a tenant-isolated,
 * storage-agnostic Configuration Management Database (CMDB).
 *
 * Design Principles:
 * - Tenant isolation is enforced by construction
 * - Storage and persistence are external concerns
 * - ITSM, workflows, and policies are consumers, not owners
 * - Edges are first-class records with their own identity
 *
 * Invariants:
 * - A CINode belongs to exactly one tenant
 * - A CIEdge belongs to exactly one tenant
 * - Cross-tenant edges are prohibited: fromCiId and toCiId must
 *   reference CINodes within the same tenant as the edge
 * - ciId is immutable after creation
 * - edgeId is immutable after creation
 *
 * This contract intentionally excludes:
 * - Storage/persistence mechanisms
 * - Traversal algorithms
 * - Mutation logic
 * - Discovery implementations
 * - ITSM-specific semantics
 */

// ============================================================================
// Enumerations
// ============================================================================

/**
 * Lifecycle state of a Configuration Item.
 *
 * Transitions between states are governed by external policy;
 * this contract only defines the valid states.
 */
export type CILifecycleState = 'planned' | 'active' | 'deprecated' | 'retired';

/**
 * Source of a Configuration Item or Edge.
 *
 * Indicates how the record was introduced into the CMDB.
 * - manual: Created by a human operator
 * - discovery: Created by automated discovery
 * - integration: Created via external system integration
 * - agent: Created by an installed agent
 */
export type CISource = 'manual' | 'discovery' | 'integration' | 'agent';

// ============================================================================
// Core Node Type
// ============================================================================

/**
 * CINode represents a Configuration Item in the CMDB graph.
 *
 * A Configuration Item is any asset, service, component, or resource
 * that is managed within the CMDB. Each CI belongs to exactly one tenant
 * and carries arbitrary attributes.
 *
 * @example
 * ```ts
 * const server: CINode = {
 *   ciId: 'ci-abc123',
 *   ciType: 'server',
 *   tenantId: 'tenant-xyz',
 *   attributes: {
 *     hostname: 'prod-web-01',
 *     ipAddress: '10.0.1.15',
 *     os: 'Ubuntu 22.04',
 *   },
 *   lifecycleState: 'active',
 *   source: 'discovery',
 *   createdAt: new Date('2024-01-15T10:00:00Z'),
 *   updatedAt: new Date('2024-06-20T14:30:00Z'),
 * };
 * ```
 */
export interface CINode {
  /**
   * Unique identifier for the Configuration Item.
   * Immutable after creation.
   */
  readonly ciId: string;

  /**
   * Classification of the Configuration Item.
   *
   * Examples: 'server', 'application', 'database', 'network_device', 'container'.
   * The valid set of types is defined by tenant or platform policy.
   */
  readonly ciType: string;

  /**
   * Tenant to which this Configuration Item belongs.
   * Enforces isolation between tenants.
   */
  readonly tenantId: string;

  /**
   * Arbitrary key-value attributes describing the CI.
   *
   * Schema validation, if any, is an external concern.
   */
  readonly attributes: Readonly<Record<string, unknown>>;

  /**
   * Current lifecycle state of the Configuration Item.
   */
  readonly lifecycleState: CILifecycleState;

  /**
   * How this Configuration Item was introduced into the CMDB.
   */
  readonly source: CISource;

  /**
   * Timestamp when the Configuration Item was created.
   */
  readonly createdAt: Date;

  /**
   * Timestamp when the Configuration Item was last updated.
   */
  readonly updatedAt: Date;
}

// ============================================================================
// Core Edge Type
// ============================================================================

/**
 * CIEdge represents a directed relationship between two Configuration Items.
 *
 * Edges are first-class records with their own identity, not implicit
 * associations. Each edge belongs to exactly one tenant, and both
 * endpoints (fromCiId and toCiId) must belong to the same tenant.
 *
 * INVARIANT: Cross-tenant edges are prohibited.
 * The tenantId of the edge must match the tenantId of both the source
 * and target CINodes. Enforcement is an external concern.
 *
 * @example
 * ```ts
 * const runsOn: CIEdge = {
 *   edgeId: 'edge-def456',
 *   tenantId: 'tenant-xyz',
 *   fromCiId: 'ci-app-001',
 *   toCiId: 'ci-server-001',
 *   relationshipType: 'runs_on',
 *   confidence: 1.0,
 *   source: 'manual',
 *   createdAt: new Date('2024-02-01T09:00:00Z'),
 * };
 * ```
 */
export interface CIEdge {
  /**
   * Unique identifier for the edge.
   * Immutable after creation.
   */
  readonly edgeId: string;

  /**
   * Tenant to which this edge belongs.
   *
   * Must match the tenantId of both fromCiId and toCiId CINodes.
   * Cross-tenant edges are prohibited.
   */
  readonly tenantId: string;

  /**
   * The source Configuration Item of this directed edge.
   * Must reference a CINode within the same tenant.
   */
  readonly fromCiId: string;

  /**
   * The target Configuration Item of this directed edge.
   * Must reference a CINode within the same tenant.
   */
  readonly toCiId: string;

  /**
   * Classification of the relationship.
   *
   * Examples: 'runs_on', 'depends_on', 'contains', 'connected_to', 'owned_by'.
   * The valid set of relationship types is defined by tenant or platform policy.
   */
  readonly relationshipType: string;

  /**
   * Confidence score for this relationship, ranging from 0 to 1.
   *
   * - 1.0: Relationship is confirmed (e.g., manually verified)
   * - 0.0: Relationship is speculative
   *
   * Useful for relationships inferred by discovery or ML systems.
   */
  readonly confidence: number;

  /**
   * How this edge was introduced into the CMDB.
   */
  readonly source: CISource;

  /**
   * Timestamp when the edge was created.
   */
  readonly createdAt: Date;
}

// ============================================================================
// Graph Interface
// ============================================================================

/**
 * CMDBGraph represents a tenant-scoped view of the CMDB graph.
 *
 * This interface is intentionally minimal and read-oriented. It:
 * - Represents a logical graph scoped to a single tenant
 * - Does not assume any particular storage engine
 * - Does not define traversal algorithms
 * - Does not expose mutation logic
 *
 * Mutation, traversal, and query operations are defined by consumers
 * (repositories, services, etc.) that implement or extend this contract.
 *
 * INVARIANT: All nodes and edges in a CMDBGraph share the same tenantId.
 */
export interface CMDBGraph {
  /**
   * The tenant to which this graph is scoped.
   * All nodes and edges in this graph belong to this tenant.
   */
  readonly tenantId: string;

  /**
   * The set of Configuration Items in this graph.
   *
   * Represented as a readonly array to remain storage-agnostic.
   * The actual storage mechanism (Map, Set, database cursor, etc.)
   * is an implementation detail.
   */
  readonly nodes: ReadonlyArray<CINode>;

  /**
   * The set of edges (relationships) in this graph.
   *
   * Represented as a readonly array to remain storage-agnostic.
   */
  readonly edges: ReadonlyArray<CIEdge>;
}

// ============================================================================
// Type Guards (optional utilities for type narrowing)
// ============================================================================

/**
 * Type guard to check if a value is a valid CILifecycleState.
 */
export function isCILifecycleState(value: unknown): value is CILifecycleState {
  return (
    value === 'planned' ||
    value === 'active' ||
    value === 'deprecated' ||
    value === 'retired'
  );
}

/**
 * Type guard to check if a value is a valid CISource.
 */
export function isCISource(value: unknown): value is CISource {
  return (
    value === 'manual' ||
    value === 'discovery' ||
    value === 'integration' ||
    value === 'agent'
  );
}
