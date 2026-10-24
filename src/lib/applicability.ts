import type { Asset, RiskDecision } from './schema';
import { ALL_RISKS, type Risk } from './catalog/owasp';

/**
 * Decides which OWASP risks apply to an asset, and why, from what the inventory says
 * the asset is and can do. Rules are deliberately simple and readable: a reviewer
 * should be able to agree or disagree with every line.
 */

export interface Applicability {
  risk: Risk;
  applies: boolean;
  reason: string;
  decision?: RiskDecision;
}

type Rule = (a: Asset) => string | null; // returns the reason it applies, or null

const has = (a: Asset) => {
  const c = a.capabilities;
  const tools = c.tools;
  return {
    tools: tools.length > 0,
    writeTools: tools.some((t) => t.access !== 'read'),
    execTools: tools.some((t) => t.access === 'execute'),
    externalTools: tools.some((t) => t.source !== 'internal') || a.kind === 'mcp-server',
    agentic: a.kind === 'agent' || a.kind === 'mcp-server' || tools.length > 0 || c.autonomy !== 'none',
    sensitiveData: a.data.personalData || ['confidential', 'restricted'].includes(a.data.classification),
  };
};

const toolNames = (a: Asset, filter: (t: Asset['capabilities']['tools'][number]) => boolean = () => true) =>
  a.capabilities.tools.filter(filter).map((t) => t.name).join(', ');

const RULES: Record<string, Rule> = {
  // OWASP LLM Top 10 (2025)
  LLM01: (a) =>
    a.capabilities.rag || a.capabilities.webAccess || a.capabilities.tools.length
      ? 'Takes user input and also reads third-party content (retrieval, web or tools), so both direct and indirect injection apply'
      : 'Every LLM application that takes user input can be prompt-injected',
  LLM02: (a) =>
    has(a).sensitiveData
      ? `Handles ${a.data.personalData ? 'personal data' : `${a.data.classification} data`}`
      : 'Any model can leak what it was given in context, even with low-sensitivity data',
  LLM03: (a) =>
    a.model
      ? `Depends on ${a.model.provider} ${a.model.name}${a.model.hosting === 'saas' ? ' as a service' : ` (${a.model.hosting})`}${has(a).externalTools ? ' and third-party tools' : ''}`
      : 'Depends on a model and libraries you do not fully control',
  LLM04: (a) =>
    a.capabilities.rag
      ? 'Answers are shaped by a retrieval corpus that can be poisoned'
      : a.model?.fineTuned
        ? 'Uses a fine-tuned model whose training data can be poisoned'
        : null,
  LLM05: (a) =>
    a.capabilities.rendersOutput || a.capabilities.codeExecution || has(a).tools
      ? `Model output reaches ${[
          a.capabilities.rendersOutput && 'a rendered UI',
          a.capabilities.codeExecution && 'a code interpreter',
          has(a).tools && 'tool calls',
        ]
          .filter(Boolean)
          .join(', ')}`
      : null,
  LLM06: (a) =>
    has(a).tools || a.capabilities.autonomy !== 'none'
      ? `Can act through tools (${toolNames(a) || 'autonomous actions'})`
      : null,
  LLM07: () => 'Every application with a system prompt can have it extracted',
  LLM08: (a) => (a.capabilities.rag ? 'Uses a vector store for retrieval' : null),
  LLM09: (a) =>
    a.exposure === 'internal'
      ? 'Employees may act on its answers without checking them'
      : 'Users outside the organisation may act on its answers',
  LLM10: (a) =>
    a.exposure === 'public' ? 'Publicly reachable, so cost and availability can be attacked' : 'Any reachable endpoint can be driven to excessive cost or latency',

  // OWASP Agentic Top 10
  ASI01: (a) => (has(a).agentic ? 'Pursues goals with tools, so its goal can be redirected' : null),
  ASI02: (a) => (has(a).tools ? `Has tools that can be misused: ${toolNames(a)}` : null),
  ASI03: (a) =>
    has(a).writeTools || a.capabilities.multiAgent
      ? `Acts with delegated permissions (${toolNames(a, (t) => t.access !== 'read') || 'shared between agents'})`
      : null,
  ASI04: (a) =>
    has(a).externalTools
      ? `Loads tools it does not own (${toolNames(a, (t) => t.source !== 'internal') || 'it is an MCP server consumed by agents'})`
      : null,
  ASI05: (a) =>
    a.capabilities.codeExecution || has(a).execTools
      ? `Can run code or commands (${toolNames(a, (t) => t.access === 'execute') || 'code interpreter'})`
      : null,
  ASI06: (a) =>
    a.capabilities.memory || (has(a).agentic && a.capabilities.rag)
      ? a.capabilities.memory
        ? 'Keeps memory across sessions'
        : 'Takes decisions from retrieved context'
      : null,
  ASI07: (a) => (a.capabilities.multiAgent ? 'Exchanges messages with other agents' : null),
  ASI08: (a) =>
    a.capabilities.multiAgent || (has(a).agentic && a.capabilities.autonomy === 'autonomous')
      ? 'Chains automated steps where one failure can propagate'
      : null,
  ASI09: (a) =>
    has(a).agentic && a.capabilities.autonomy !== 'autonomous'
      ? 'Relies on people to approve or trust what it proposes'
      : null,
  ASI10: (a) => (a.capabilities.autonomy === 'autonomous' ? 'Acts autonomously without per-action approval' : null),
};

export function applicability(asset: Asset): Applicability[] {
  return ALL_RISKS.map((risk) => {
    const reason = RULES[risk.id]?.(asset) ?? null;
    const decision = asset.risks[risk.id];
    if (decision?.status === 'not-applicable') {
      return { risk, applies: false, reason: decision.reason, decision };
    }
    if (reason === null) {
      const notAgent = risk.framework === 'owasp-agentic' && !has(asset).agentic;
      return {
        risk,
        applies: false,
        reason: notAgent ? 'Not an agent: it has no tools or autonomy' : 'The inventory shows no capability this risk depends on',
        decision,
      };
    }
    return { risk, applies: true, reason, decision };
  });
}
