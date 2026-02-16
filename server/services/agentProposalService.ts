import { storage } from "../storage";
import type { TenantContext } from "../tenant";
import type { AgentProposal, InsertAgentProposal, ActorIdentity } from "@shared/schema";
import { formPatchOperationsSchema } from "@shared/schema";
import { agentActor } from "./rbacService";
import { authorize, PERMISSIONS } from "./rbacService";

export class AgentProposalError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AgentProposalError";
    this.statusCode = statusCode;
  }
}

export type ProposalInput = {
  agentId: string;
  proposalType: "form_patch" | "workflow_change" | "approval_comment";
  targetRef: string;
  payload: unknown;
  summary?: string;
  changeId?: string;
  projectId?: string;
};

export async function createProposal(
  ctx: TenantContext,
  input: ProposalInput,
): Promise<AgentProposal> {
  const actor = agentActor(input.agentId);

  if (input.proposalType === "form_patch") {
    const parsed = formPatchOperationsSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new AgentProposalError(
        `Invalid form patch payload: ${parsed.error.message}`,
      );
    }
  }

  let changeId = input.changeId;
  if (!changeId) {
    if (!input.projectId) {
      throw new AgentProposalError(
        "Either changeId or projectId is required to create a proposal",
      );
    }

    const change = await storage.createChange({
      projectId: input.projectId,
      title: `[Agent Proposal] ${input.summary || input.proposalType}`,
      description: `Proposed by agent ${input.agentId}: ${input.proposalType} targeting ${input.targetRef}`,
      modulePath: null,
      moduleId: null,
      environmentId: null,
      baseSha: null,
    });
    changeId = change.id;
  } else {
    const existing = await storage.getChange(changeId);
    if (!existing) {
      throw new AgentProposalError("Change not found", 404);
    }
    if (existing.status !== "Draft") {
      throw new AgentProposalError(
        `Cannot add proposals to a change in status "${existing.status}". Only Draft changes accept new proposals.`,
      );
    }
  }

  const data: InsertAgentProposal = {
    tenantId: ctx.tenantId,
    changeId,
    agentId: input.agentId,
    proposalType: input.proposalType,
    targetRef: input.targetRef,
    payload: input.payload as Record<string, unknown>,
    summary: input.summary ?? null,
  };

  const proposal = await storage.createAgentProposal(data);

  const agentRun = await storage.createAgentRun({
    changeId,
    intent: `agent_proposal:${input.proposalType}`,
  });

  await storage.updateAgentRun(
    agentRun.id,
    "Passed",
    JSON.stringify([input.proposalType]),
    JSON.stringify([
      {
        event: "proposal_created",
        proposalId: proposal.id,
        agentId: input.agentId,
        proposalType: input.proposalType,
        targetRef: input.targetRef,
        timestamp: new Date().toISOString(),
      },
    ]),
  );

  return proposal;
}

export async function getProposalsByChange(
  ctx: TenantContext,
  changeId: string,
): Promise<AgentProposal[]> {
  void ctx;
  return storage.getAgentProposalsByChange(changeId);
}

export async function getProposalsByTenant(
  ctx: TenantContext,
): Promise<AgentProposal[]> {
  return storage.getAgentProposalsByTenant(ctx.tenantId);
}

export async function getProposal(
  ctx: TenantContext,
  id: string,
): Promise<AgentProposal | undefined> {
  void ctx;
  return storage.getAgentProposal(id);
}

export async function submitProposal(
  ctx: TenantContext,
  id: string,
  actor: ActorIdentity,
): Promise<AgentProposal> {
  const proposal = await storage.getAgentProposal(id);
  if (!proposal) throw new AgentProposalError("Proposal not found", 404);
  if (proposal.tenantId !== ctx.tenantId) {
    throw new AgentProposalError("Proposal not found", 404);
  }
  if (proposal.status !== "draft") {
    throw new AgentProposalError(
      `Cannot submit a proposal in status "${proposal.status}"`,
    );
  }

  if (actor.actorType === "agent") {
    throw new AgentProposalError(
      "Agents cannot submit proposals for activation. A human must submit.",
      403,
    );
  }

  const updated = await storage.updateAgentProposalStatus(id, "submitted");
  if (!updated) throw new AgentProposalError("Failed to update proposal", 500);
  return updated;
}

export async function reviewProposal(
  ctx: TenantContext,
  id: string,
  decision: "accepted" | "rejected",
  actor: ActorIdentity,
): Promise<AgentProposal> {
  const proposal = await storage.getAgentProposal(id);
  if (!proposal) throw new AgentProposalError("Proposal not found", 404);
  if (proposal.tenantId !== ctx.tenantId) {
    throw new AgentProposalError("Proposal not found", 404);
  }
  if (proposal.status !== "submitted") {
    throw new AgentProposalError(
      `Cannot review a proposal in status "${proposal.status}". Must be "submitted".`,
    );
  }

  if (actor.actorType === "agent") {
    throw new AgentProposalError(
      "Agents cannot accept or reject proposals. A human must review.",
      403,
    );
  }

  await authorize(ctx, actor, PERMISSIONS.CHANGE_APPROVE, "change", proposal.changeId);

  const updated = await storage.updateAgentProposalStatus(id, decision);
  if (!updated) throw new AgentProposalError("Failed to update proposal", 500);
  return updated;
}
