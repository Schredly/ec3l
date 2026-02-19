-- Add "running" and "completed" states to intent lifecycle
ALTER TYPE wf_intent_status ADD VALUE IF NOT EXISTS 'running' AFTER 'pending';
ALTER TYPE wf_intent_status ADD VALUE IF NOT EXISTS 'completed' AFTER 'running';

-- Add workflow.intent.* telemetry event types
ALTER TYPE telemetry_event_type ADD VALUE IF NOT EXISTS 'workflow.intent.started';
ALTER TYPE telemetry_event_type ADD VALUE IF NOT EXISTS 'workflow.intent.completed';
ALTER TYPE telemetry_event_type ADD VALUE IF NOT EXISTS 'workflow.intent.failed';
