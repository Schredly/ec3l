import type { AuditEvent } from "./AuditEvent";
import type { AuditSink } from "./AuditSink";

export class InMemoryAuditSink implements AuditSink {
  public readonly events: AuditEvent[] = [];

  async emit(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }
}
