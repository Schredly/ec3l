import { createHash } from "node:crypto";
import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import { buildGraphSnapshot } from "./graphRegistryService";
import { validateGraphSnapshot } from "./graphValidationService";
import { diffGraphSnapshots } from "./graphDiffService";
import type { GraphDiffResult } from "./graphDiffService";
import type {
  GraphSnapshot,
  RecordTypeNode,
  FieldDefinitionNode,
  GraphValidationError,
} from "./graphContracts";
import { createRecordType } from "../services/recordTypeService";
import { emitDomainEvent } from "../services/domainEventService";

// --- Package types ---

export interface GraphPackageField {
  name: string;
  type: string;
  required?: boolean;
}

export interface GraphPackageRecordType {
  key: string;
  name?: string;
  baseType?: string;
  fields: GraphPackageField[];
}

export interface GraphPackageDependency {
  packageKey: string;
  minVersion?: string;
}

export interface GraphPackageSLAPolicy {
  recordTypeKey: string;
  durationMinutes: number;
}

export interface GraphPackageAssignmentRule {
  recordTypeKey: string;
  strategyType: string;
  config?: Record<string, unknown>;
}

export interface GraphPackageWorkflowStep {
  name: string;
  stepType: string;
  config?: Record<string, unknown>;
  ordering: number;
}

export interface GraphPackageWorkflow {
  key: string;
  name: string;
  recordTypeKey: string;
  triggerEvent?: string;
  steps?: GraphPackageWorkflowStep[];
}

export interface GraphPackage {
  packageKey: string;
  version: string;
  dependsOn?: GraphPackageDependency[];
  recordTypes: GraphPackageRecordType[];
  slaPolicies?: GraphPackageSLAPolicy[];
  assignmentRules?: GraphPackageAssignmentRule[];
  workflows?: GraphPackageWorkflow[];
}

export interface InstallResult {
  success: boolean;
  diff: GraphDiffResult;
  validationErrors: GraphValidationError[];
  appliedCount?: number;
  noop?: boolean;
  rejected?: boolean;
  reason?: string;
  checksum?: string;
}

export interface BatchInstallResult {
  success: boolean;
  results: Array<{ packageKey: string; result: InstallResult }>;
}

/**
 * Compute a deterministic SHA-256 checksum from the package's record types.
 * Normalizes by sorting record types by key, fields by name, and stripping
 * optional fields to their canonical form.
 */
export function computePackageChecksum(graphPackage: GraphPackage): string {
  const normalizedTypes = graphPackage.recordTypes
    .map((rt) => ({
      key: rt.key,
      baseType: rt.baseType ?? null,
      fields: [...rt.fields]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({
          name: f.name,
          type: f.type,
          required: f.required ?? false,
        })),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const normalizedSlas = (graphPackage.slaPolicies ?? [])
    .map((s) => ({ recordTypeKey: s.recordTypeKey, durationMinutes: s.durationMinutes }))
    .sort((a, b) => a.recordTypeKey.localeCompare(b.recordTypeKey));

  const normalizedAssignments = (graphPackage.assignmentRules ?? [])
    .map((a) => ({ recordTypeKey: a.recordTypeKey, strategyType: a.strategyType }))
    .sort((a, b) => a.recordTypeKey.localeCompare(b.recordTypeKey));

  const normalizedWorkflows = (graphPackage.workflows ?? [])
    .map((w) => ({
      key: w.key,
      name: w.name,
      recordTypeKey: w.recordTypeKey,
      triggerEvent: w.triggerEvent ?? "record_created",
      steps: (w.steps ?? [])
        .map((s) => ({ name: s.name, stepType: s.stepType, ordering: s.ordering }))
        .sort((a, b) => a.ordering - b.ordering),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  // Backward compatible: when no bindings, hash matches old format (array of types)
  const hasBindings =
    normalizedSlas.length > 0 ||
    normalizedAssignments.length > 0 ||
    normalizedWorkflows.length > 0;

  const payload = hasBindings
    ? {
        recordTypes: normalizedTypes,
        slaPolicies: normalizedSlas,
        assignmentRules: normalizedAssignments,
        workflows: normalizedWorkflows,
      }
    : normalizedTypes;

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Compare two semver strings. Returns:
 *  -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

/**
 * Install a graph package into a project.
 *
 * Safety model:
 * 0. Idempotency: if latest install has same checksum → noop.
 *    Version guard: if new version < latest version → reject (unless allowDowngrade).
 * 1. Build full-tenant snapshot (current state).
 * 2. Project the package onto the snapshot (pure — no DB writes).
 * 3. Validate the projected snapshot (orphan, cycle, duplicate, cross-project).
 * 4. Compute diff between current and projected.
 * 5. If previewOnly or validation fails → return early, zero mutations.
 * 6. Apply mutations in topological order (base types first).
 * 7. Write audit trail row.
 * 8. Emit domain event.
 */
export async function installGraphPackage(
  ctx: TenantContext,
  projectId: string,
  graphPackage: GraphPackage,
  options?: {
    previewOnly?: boolean;
    allowDowngrade?: boolean;
    allowForeignTypeMutation?: boolean;
    environmentId?: string;
    source?: "install" | "promote";
  },
): Promise<InstallResult> {
  const ts = getTenantStorage(ctx);
  const checksum = computePackageChecksum(graphPackage);

  // --- Phase 0: Idempotency + version guard ---
  const latest = await ts.getLatestGraphPackageInstall(
    projectId,
    graphPackage.packageKey,
  );

  if (latest && latest.checksum === checksum) {
    emitDomainEvent(ctx, {
      type: "graph.package_install_noop",
      status: "noop",
      entityId: projectId,
      affectedRecords: { packageKey: graphPackage.packageKey, version: graphPackage.version },
    });
    return {
      success: true,
      diff: { addedRecordTypes: [], removedRecordTypes: [], modifiedRecordTypes: [] },
      validationErrors: [],
      appliedCount: 0,
      noop: true,
      reason: `Package "${graphPackage.packageKey}" v${graphPackage.version} already installed with same checksum`,
      checksum,
    };
  }

  if (latest && !options?.allowDowngrade) {
    if (compareSemver(graphPackage.version, latest.version) < 0) {
      emitDomainEvent(ctx, {
        type: "graph.package_install_rejected",
        status: "rejected",
        entityId: projectId,
        affectedRecords: {
          packageKey: graphPackage.packageKey,
          requestedVersion: graphPackage.version,
          installedVersion: latest.version,
        },
      });
      return {
        success: false,
        diff: { addedRecordTypes: [], removedRecordTypes: [], modifiedRecordTypes: [] },
        validationErrors: [],
        rejected: true,
        reason: `Version "${graphPackage.version}" is lower than installed "${latest.version}". Pass allowDowngrade to override.`,
        checksum,
      };
    }
  }

  // --- Phase 0b: Ownership conflict check ---
  if (!options?.allowForeignTypeMutation) {
    const ownershipErrors = await checkOwnershipConflicts(
      ts,
      projectId,
      graphPackage,
    );
    if (ownershipErrors.length > 0) {
      return {
        success: false,
        diff: { addedRecordTypes: [], removedRecordTypes: [], modifiedRecordTypes: [] },
        validationErrors: ownershipErrors,
        checksum,
      };
    }
  }

  // 1. Build current full-tenant snapshot (includes bindings, all projects)
  const current = await buildGraphSnapshot(ctx);

  // 2. Project package onto snapshot (pure function)
  const projected = projectPackageOntoSnapshot(
    current,
    graphPackage,
    projectId,
    ctx.tenantId,
  );

  // 3. Validate projected snapshot
  const validationErrors = validateGraphSnapshot(projected);

  // 4. Compute diff
  const diff = diffGraphSnapshots(current, projected);

  // 5. Preview mode or validation failures → return early
  if (options?.previewOnly || validationErrors.length > 0) {
    return {
      success: validationErrors.length === 0,
      diff,
      validationErrors,
      checksum,
    };
  }

  // 6. Apply mutations
  const appliedCount = await applyPackage(ctx, projectId, graphPackage);

  // 7. Write audit trail row (global ledger)
  await ts.createGraphPackageInstall({
    projectId,
    packageKey: graphPackage.packageKey,
    version: graphPackage.version,
    checksum,
    installedBy: ctx.userId ?? ctx.agentId ?? null,
    diff: diff as unknown as Record<string, unknown>,
    packageContents: graphPackage as unknown as Record<string, unknown>,
  });

  // 7b. Write environment-scoped state row (if environmentId provided)
  if (options?.environmentId) {
    await ts.createEnvironmentPackageInstall({
      projectId,
      environmentId: options.environmentId,
      packageKey: graphPackage.packageKey,
      version: graphPackage.version,
      checksum,
      installedBy: ctx.userId ?? ctx.agentId ?? null,
      source: options.source ?? "install",
      diff: diff as unknown as Record<string, unknown>,
      packageContents: graphPackage as unknown as Record<string, unknown>,
    });
  }

  // 8. Emit domain event
  emitDomainEvent(ctx, {
    type: "graph.package_installed",
    status: "completed",
    entityId: projectId,
    affectedRecords: {
      packageKey: graphPackage.packageKey,
      version: graphPackage.version,
      checksum,
      diff,
      environmentId: options?.environmentId ?? null,
    } as unknown as Record<string, unknown>,
  });

  return { success: true, diff, validationErrors: [], appliedCount, checksum };
}

// --- Projection (pure function — no DB, no side effects) ---

export function projectPackageOntoSnapshot(
  current: GraphSnapshot,
  graphPackage: GraphPackage,
  projectId: string,
  tenantId: string,
): GraphSnapshot {
  const nodes = [...current.nodes];
  const fields = [...current.fields];
  const edges = [...current.edges];

  const nodesByKey = new Map(nodes.map((n) => [n.key, n]));

  // Index existing fields by record type key for fast lookup
  const fieldNamesByRtKey = new Map<string, Set<string>>();
  for (const f of fields) {
    let names = fieldNamesByRtKey.get(f.recordTypeKey);
    if (!names) {
      names = new Set();
      fieldNamesByRtKey.set(f.recordTypeKey, names);
    }
    names.add(f.name);
  }

  for (const pkgRt of graphPackage.recordTypes) {
    const existing = nodesByKey.get(pkgRt.key);

    if (existing) {
      // Existing type: add fields that don't already exist
      const existingFieldNames = fieldNamesByRtKey.get(pkgRt.key) ?? new Set();
      for (const f of pkgRt.fields) {
        if (!existingFieldNames.has(f.name)) {
          fields.push({
            recordTypeKey: pkgRt.key,
            name: f.name,
            fieldType: f.type,
            required: f.required ?? false,
          });
          existingFieldNames.add(f.name);
        }
      }
    } else {
      // New type: add node, fields, and inheritance edge
      const newNode: RecordTypeNode = {
        id: `pkg-${pkgRt.key}`,
        type: "record_type",
        tenantId,
        version: 1,
        key: pkgRt.key,
        baseType: pkgRt.baseType ?? null,
        status: "active",
        projectId,
      };
      nodes.push(newNode);
      nodesByKey.set(pkgRt.key, newNode);

      if (pkgRt.baseType) {
        edges.push({
          fromType: pkgRt.key,
          toType: pkgRt.baseType,
          relationship: "inherits",
          cardinality: "one-to-one",
        });
      }

      const newFieldNames = new Set<string>();
      for (const f of pkgRt.fields) {
        fields.push({
          recordTypeKey: pkgRt.key,
          name: f.name,
          fieldType: f.type,
          required: f.required ?? false,
        });
        newFieldNames.add(f.name);
      }
      fieldNamesByRtKey.set(pkgRt.key, newFieldNames);
    }
  }

  // --- Project SLA bindings ---
  const slas = [...current.bindings.slas];
  const existingSlaKeys = new Set(slas.map((s) => s.recordTypeKey));
  for (const sla of graphPackage.slaPolicies ?? []) {
    if (!existingSlaKeys.has(sla.recordTypeKey)) {
      slas.push({
        recordTypeKey: sla.recordTypeKey,
        durationMinutes: sla.durationMinutes,
      });
    }
  }

  // --- Project assignment bindings ---
  const assignments = [...current.bindings.assignments];
  const existingAssignKeys = new Set(
    assignments.map((a) => `${a.recordTypeKey}:${a.strategyType}`),
  );
  for (const rule of graphPackage.assignmentRules ?? []) {
    const key = `${rule.recordTypeKey}:${rule.strategyType}`;
    if (!existingAssignKeys.has(key)) {
      assignments.push({
        recordTypeKey: rule.recordTypeKey,
        strategyType: rule.strategyType,
      });
    }
  }

  // --- Project workflow bindings ---
  const workflows = [...current.bindings.workflows];
  const existingWfKeys = new Set(
    workflows.map((w) => `${w.workflowId}:${w.recordTypeKey}`),
  );
  for (const wf of graphPackage.workflows ?? []) {
    const syntheticId = `pkg-wf-${wf.key}`;
    const wfKey = `${syntheticId}:${wf.recordTypeKey}`;
    if (!existingWfKeys.has(wfKey)) {
      workflows.push({
        workflowId: syntheticId,
        workflowName: wf.name,
        recordTypeKey: wf.recordTypeKey,
        triggerType: "record_event",
      });
    }
  }

  return {
    tenantId,
    builtAt: new Date().toISOString(),
    nodes,
    fields,
    edges,
    bindings: {
      workflows,
      slas,
      assignments,
      changePolicies: [...current.bindings.changePolicies],
    },
  };
}

// --- Apply mutations ---

async function applyPackage(
  ctx: TenantContext,
  projectId: string,
  graphPackage: GraphPackage,
): Promise<number> {
  const ts = getTenantStorage(ctx);
  let appliedCount = 0;

  // Sort so base types are created before derived types
  const sorted = topologicalSortTypes(graphPackage.recordTypes);

  for (const pkgRt of sorted) {
    const existing = await ts.getRecordTypeByKey(pkgRt.key);

    if (!existing) {
      // Create new record type via service layer (gets full validation)
      const name = pkgRt.name ?? formatKeyAsName(pkgRt.key);
      await createRecordType(ctx, {
        projectId,
        key: pkgRt.key,
        name,
        baseType: pkgRt.baseType ?? null,
        schema: {
          fields: pkgRt.fields.map((f) => ({
            name: f.name,
            type: f.type,
            required: f.required ?? false,
          })),
        },
      });
      appliedCount++;
    } else {
      // Merge new fields into existing type's schema
      const currentSchema = existing.schema as {
        fields?: Array<{ name: string; type: string; required?: boolean }>;
      } | null;
      const existingFields = currentSchema?.fields ?? [];
      const existingFieldNames = new Set(existingFields.map((f) => f.name));

      const newFields = pkgRt.fields
        .filter((f) => !existingFieldNames.has(f.name))
        .map((f) => ({
          name: f.name,
          type: f.type,
          required: f.required ?? false,
        }));

      if (newFields.length > 0) {
        const mergedSchema = {
          ...(currentSchema ?? {}),
          fields: [...existingFields, ...newFields],
        };
        await ts.updateRecordTypeSchema(existing.id, mergedSchema);
        appliedCount++;
      }
    }
  }

  // --- Apply SLA configs ---
  for (const sla of graphPackage.slaPolicies ?? []) {
    const rt = await ts.getRecordTypeByKey(sla.recordTypeKey);
    if (rt) {
      await ts.updateRecordTypeSlaConfig(rt.id, { durationMinutes: sla.durationMinutes });
      appliedCount++;
    }
  }

  // --- Apply assignment configs ---
  for (const rule of graphPackage.assignmentRules ?? []) {
    const rt = await ts.getRecordTypeByKey(rule.recordTypeKey);
    if (rt) {
      await ts.updateRecordTypeAssignmentConfig(rt.id, {
        type: rule.strategyType,
        ...(rule.config ?? {}),
      });
      appliedCount++;
    }
  }

  // --- Apply workflow definitions + triggers ---
  for (const wf of graphPackage.workflows ?? []) {
    // Deduplicate: skip if a workflow with this name already exists
    const allDefs = await ts.getWorkflowDefinitionsByTenant();
    const existingDef = allDefs.find((d) => d.name === wf.name);
    if (existingDef) continue;

    const def = await ts.createWorkflowDefinition({
      name: wf.name,
      triggerType: "record_event",
      triggerConfig: {
        recordType: wf.recordTypeKey,
        event: wf.triggerEvent ?? "record_created",
      },
      version: 1,
    });

    // Activate the workflow
    await ts.updateWorkflowDefinitionStatus(def.id, "active");

    // Create trigger
    await ts.createWorkflowTrigger({
      workflowDefinitionId: def.id,
      triggerType: "record_event",
      triggerConfig: {
        recordType: wf.recordTypeKey,
        event: wf.triggerEvent ?? "record_created",
      },
    });

    // Create steps if defined
    for (const step of wf.steps ?? []) {
      await ts.createWorkflowStep({
        workflowDefinitionId: def.id,
        stepType: step.stepType as "assignment" | "approval" | "notification" | "decision" | "record_mutation" | "record_lock",
        config: step.config ?? {},
        orderIndex: step.ordering,
      });
    }

    appliedCount++;
  }

  return appliedCount;
}

// --- Helpers ---

export function topologicalSortTypes(
  types: GraphPackageRecordType[],
): GraphPackageRecordType[] {
  const byKey = new Map(types.map((t) => [t.key, t]));
  const sorted: GraphPackageRecordType[] = [];
  const visited = new Set<string>();

  function visit(type: GraphPackageRecordType): void {
    if (visited.has(type.key)) return;
    visited.add(type.key);
    // Visit base type first if it's in the package
    if (type.baseType) {
      const base = byKey.get(type.baseType);
      if (base) visit(base);
    }
    sorted.push(type);
  }

  for (const type of types) {
    visit(type);
  }

  return sorted;
}

// --- Ownership conflict check ---

/**
 * Determine which packageKey "owns" each record type key by scanning
 * the audit trail. A type is owned by the first packageKey whose
 * package_contents.recordTypes includes that key.
 *
 * Returns GraphValidationError[] for any type this package would modify
 * that is owned by a different packageKey.
 */
async function checkOwnershipConflicts(
  ts: ReturnType<typeof getTenantStorage>,
  projectId: string,
  graphPackage: GraphPackage,
): Promise<GraphValidationError[]> {
  const allInstalls = await ts.listGraphPackageInstalls(projectId);
  if (allInstalls.length === 0) return [];

  // Build ownership map: recordTypeKey → first packageKey that created it
  const ownerMap = new Map<string, string>();
  // allInstalls is newest-first; reverse to process oldest-first
  for (let i = allInstalls.length - 1; i >= 0; i--) {
    const install = allInstalls[i];
    const contents = install.packageContents as unknown as {
      recordTypes?: Array<{ key: string }>;
    };
    if (!contents?.recordTypes) continue;
    for (const rt of contents.recordTypes) {
      if (!ownerMap.has(rt.key)) {
        ownerMap.set(rt.key, install.packageKey);
      }
    }
  }

  const errors: GraphValidationError[] = [];
  for (const rt of graphPackage.recordTypes) {
    const owner = ownerMap.get(rt.key);
    if (owner && owner !== graphPackage.packageKey) {
      errors.push({
        code: "PACKAGE_OWNERSHIP_CONFLICT",
        message: `Record type "${rt.key}" is owned by package "${owner}". Pass allowForeignTypeMutation to override.`,
        recordTypeId: rt.key,
        baseTypeKey: null,
        details: { ownerPackageKey: owner, requestingPackageKey: graphPackage.packageKey },
      });
    }
  }

  // Check binding targets (SLA, assignment, workflow) against ownership map
  const packageTypeKeys = new Set(graphPackage.recordTypes.map((rt) => rt.key));
  const bindingTargets = new Set<string>();
  for (const sla of graphPackage.slaPolicies ?? []) bindingTargets.add(sla.recordTypeKey);
  for (const rule of graphPackage.assignmentRules ?? []) bindingTargets.add(rule.recordTypeKey);
  for (const wf of graphPackage.workflows ?? []) bindingTargets.add(wf.recordTypeKey);

  for (const key of bindingTargets) {
    if (packageTypeKeys.has(key)) continue; // already checked via recordType ownership
    const owner = ownerMap.get(key);
    if (owner && owner !== graphPackage.packageKey) {
      errors.push({
        code: "PACKAGE_BINDING_OWNERSHIP_CONFLICT",
        message: `Binding targets record type "${key}" owned by package "${owner}". Pass allowForeignTypeMutation to override.`,
        recordTypeId: key,
        baseTypeKey: null,
        details: { ownerPackageKey: owner, requestingPackageKey: graphPackage.packageKey },
      });
    }
  }

  return errors;
}

// --- Multi-package orchestration ---

/**
 * Topologically sort packages by dependsOn.
 * Packages with no dependencies come first.
 */
export function topologicalSortPackages(
  packages: GraphPackage[],
): GraphPackage[] {
  const byKey = new Map(packages.map((p) => [p.packageKey, p]));
  const sorted: GraphPackage[] = [];
  const visited = new Set<string>();

  function visit(pkg: GraphPackage): void {
    if (visited.has(pkg.packageKey)) return;
    visited.add(pkg.packageKey);
    for (const dep of pkg.dependsOn ?? []) {
      const depPkg = byKey.get(dep.packageKey);
      if (depPkg) visit(depPkg);
    }
    sorted.push(pkg);
  }

  for (const pkg of packages) {
    visit(pkg);
  }

  return sorted;
}

/**
 * Install multiple graph packages in dependency order.
 * Stops on first failure (validation error, rejection, or ownership conflict).
 */
export async function installGraphPackages(
  ctx: TenantContext,
  projectId: string,
  packages: GraphPackage[],
  options?: { previewOnly?: boolean; allowDowngrade?: boolean; allowForeignTypeMutation?: boolean },
): Promise<BatchInstallResult> {
  const sorted = topologicalSortPackages(packages);
  const results: Array<{ packageKey: string; result: InstallResult }> = [];

  for (const pkg of sorted) {
    const result = await installGraphPackage(ctx, projectId, pkg, options);
    results.push({ packageKey: pkg.packageKey, result });

    if (!result.success) {
      return { success: false, results };
    }
  }

  return { success: true, results };
}

function formatKeyAsName(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
