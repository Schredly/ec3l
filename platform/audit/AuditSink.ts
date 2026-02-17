import type { AuditEvent } from "./AuditEvent";

/**
 * AuditSink is an append-only audit interface.
 * Implementations may persist, stream, or forward events.
 */
export interface AuditSink {
  emit(event: AuditEvent): Promise<void>;
}
