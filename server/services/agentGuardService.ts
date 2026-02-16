import type { ActorIdentity } from "@shared/schema";

export class AgentGuardError extends Error {
  public readonly statusCode = 403;
  public readonly action: string;

  constructor(action: string) {
    super(
      `Agent actors are not permitted to ${action}. Only human users or system actors may perform this operation.`,
    );
    this.name = "AgentGuardError";
    this.action = action;
  }
}

export function assertNotAgent(actor: ActorIdentity, action: string): void {
  if (actor.actorType === "agent") {
    throw new AgentGuardError(action);
  }
}
