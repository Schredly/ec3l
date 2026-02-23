/**
 * Prompt builder for LLM-powered GraphPackage generation.
 *
 * Constructs system and user prompts that instruct the model to return
 * ONLY valid JSON matching the GraphPackage schema. All constraints
 * (namespace, field counts, version) are embedded in the system prompt.
 */

const SYSTEM_PROMPT = `You are a graph package generator for a configuration management platform.

CRITICAL RULES:
1. Return ONLY valid JSON. No markdown, no code fences, no explanation text.
2. The JSON must match this exact schema:

{
  "packageKey": "vibe.<app_slug>",
  "version": "0.1.0",
  "recordTypes": [
    {
      "key": "<snake_case_key>",
      "name": "<Human Readable Name>",
      "fields": [
        { "name": "<field_name>", "type": "<type>", "required": true/false }
      ]
    }
  ],
  "slaPolicies": [
    { "recordTypeKey": "<key>", "durationMinutes": <positive_integer> }
  ],
  "assignmentRules": [
    { "recordTypeKey": "<key>", "strategyType": "static_group", "config": { "groupKey": "<group>" } }
  ],
  "workflows": [
    {
      "key": "<workflow_key>",
      "name": "<Workflow Name>",
      "recordTypeKey": "<key>",
      "triggerEvent": "record_created",
      "steps": [
        { "name": "<step>", "stepType": "record_mutation"|"notification"|"assignment"|"approval", "config": {}, "ordering": 1 }
      ]
    }
  ]
}

CONSTRAINTS:
- packageKey MUST start with "vibe." followed by a snake_case slug
- version MUST be "0.1.0" unless the user specifies otherwise
- Use 2-6 recordTypes unless the user asks for more or fewer
- Each recordType MUST have at least 1 field
- Field types: "string", "text", "number", "date", "boolean", "choice", "reference"
- recordType keys must be snake_case
- field names must be snake_case
- Include at least one slaPolicies entry for the primary record type
- Include at least one assignmentRules entry
- Include at least one workflow with at least one step
- NEVER use packageKey prefixes "hr." or "itsm." — these are reserved

Return ONLY the JSON object. No other text.`;

/**
 * Build the system prompt for GraphPackage generation.
 */
export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/**
 * Build the user prompt for initial package generation.
 */
export function buildGenerationPrompt(prompt: string, appName?: string): string {
  let userPrompt = `Generate a GraphPackage for: ${prompt}`;
  if (appName) {
    const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    userPrompt += `\n\nUse packageKey: "vibe.${slug}"`;
  }
  return userPrompt;
}

/**
 * Build a repair prompt that feeds schema validation errors back to the model.
 */
export function buildRepairPrompt(
  originalPrompt: string,
  previousOutput: string,
  errors: string,
): string {
  return `Your previous output had schema validation errors. Fix them and return corrected JSON only.

Original request: ${originalPrompt}

Your previous output:
${previousOutput}

Validation errors:
${errors}

Return ONLY the corrected JSON object. No explanation.`;
}

/**
 * Build a refinement prompt that instructs the model to modify an existing
 * GraphPackage based on a natural-language instruction.
 */
export function buildRefinementPrompt(
  existingPackageJson: string,
  refinementInstruction: string,
): string {
  return `You have an existing GraphPackage. Apply the following refinement and return the COMPLETE updated package as JSON only.

Current package:
${existingPackageJson}

Refinement instruction: ${refinementInstruction}

Rules:
- Return the COMPLETE updated JSON object (not just the changed parts).
- Keep the same packageKey and version unless the instruction says to change them.
- Preserve all existing record types, fields, SLA policies, assignment rules, and workflows unless the instruction explicitly removes them.
- Follow the same schema constraints as before (snake_case keys, at least 1 field per recordType, etc.).
- Return ONLY the JSON object. No explanation.`;
}
