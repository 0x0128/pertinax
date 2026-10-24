import { z } from 'zod';

/**
 * One AI asset in the inventory (inventory/assets/<id>.yaml).
 * Describe what the system *is* and what it can *do*; Pertinax works out which
 * OWASP and ATLAS risks apply and which Promptfoo tests exercise them.
 */

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  /** read: fetches data; write: changes state; execute: runs code or commands. */
  access: z.enum(['read', 'write', 'execute']).default('read'),
  /** Where the tool comes from. MCP and third-party tools widen the supply chain. */
  source: z.enum(['internal', 'mcp', 'third-party']).default('internal'),
});

export const RiskDecisionSchema = z.object({
  status: z.enum(['not-applicable', 'accepted', 'covered-manually']),
  reason: z.string().min(3, 'Explain the decision so a reviewer can follow it'),
  by: z.string().optional(),
  date: z.string().optional(),
  evidence: z.string().optional(),
});

export const AssetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, numbers and dashes'),
  name: z.string(),
  kind: z.enum(['chatbot', 'rag', 'agent', 'mcp-server', 'copilot', 'model-api']),
  description: z.string().optional(),
  owner: z.string(),
  environment: z.enum(['production', 'staging', 'development']).default('production'),
  exposure: z.enum(['public', 'partner', 'internal']).default('internal'),
  tags: z.array(z.string()).default([]),

  model: z
    .object({
      provider: z.string(),
      name: z.string(),
      hosting: z.enum(['saas', 'self-hosted', 'local']).default('saas'),
      fineTuned: z.boolean().default(false),
    })
    .optional(),

  data: z
    .object({
      classification: z.enum(['public', 'internal', 'confidential', 'restricted']).default('internal'),
      personalData: z.boolean().default(false),
    })
    .prefault({}),

  capabilities: z
    .object({
      rag: z.boolean().default(false),
      memory: z.boolean().default(false),
      webAccess: z.boolean().default(false),
      codeExecution: z.boolean().default(false),
      multiAgent: z.boolean().default(false),
      /** The UI renders model output as Markdown or HTML (links, images...). */
      rendersOutput: z.boolean().default(false),
      autonomy: z.enum(['none', 'supervised', 'autonomous']).default('none'),
      tools: z.array(ToolSchema).default([]),
    })
    .prefault({}),

  /** Promptfoo target, passed through unchanged. See https://www.promptfoo.dev/docs/providers/ */
  target: z.record(z.string(), z.unknown()).optional(),
  /** What the application is for. Promptfoo uses it to write realistic attacks. */
  purpose: z.string().optional(),

  testing: z
    .object({
      depth: z.enum(['quick', 'standard', 'deep']).default('standard'),
      numTests: z.number().int().positive().optional(),
      /** Re-test at least this often; older results count as stale. */
      cadenceDays: z.number().int().positive().default(30),
      /** Use Promptfoo's hosted attack generation (needed by some plugins). */
      remoteGeneration: z.boolean().default(true),
      /** Model that writes the attacks when remote generation is off, e.g. ollama:chat:llama3.2 */
      attackProvider: z.string().optional(),
      /** Model that grades the answers, e.g. ollama:chat:llama3.2 */
      graderProvider: z.string().optional(),
      /** Variable that carries retrieved/third-party content, for indirect prompt injection. */
      indirectInjectionVar: z.string().optional(),
      strategies: z.array(z.string()).optional(),
      /** Extra Promptfoo plugins, e.g. "policy" with the rules this asset must follow. */
      includePlugins: z
        .array(z.union([z.string(), z.object({ id: z.string(), config: z.record(z.string(), z.unknown()).optional() })]))
        .default([]),
      excludePlugins: z.array(z.string()).default([]),
    })
    .prefault({}),

  /** Per-risk decisions, keyed by risk id (LLM03, ASI07...). */
  risks: z.record(z.string(), RiskDecisionSchema).default({}),
});

export type Asset = z.infer<typeof AssetSchema>;
export type AssetInput = z.input<typeof AssetSchema>;
export type RiskDecision = z.infer<typeof RiskDecisionSchema>;
