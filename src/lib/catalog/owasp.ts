/**
 * OWASP Top 10 for LLM Applications (2025) and OWASP Top 10 for Agentic Applications
 * (December 2025). Names follow OWASP; summaries are Pertinax's own wording.
 * Full texts: https://genai.owasp.org
 *
 * `promptfooKey` links each risk to the matching entry in Promptfoo's framework
 * mapping (catalog/promptfoo.json), which says which plugins test it.
 */

export type FrameworkId = 'owasp-llm' | 'owasp-agentic';

export interface Risk {
  id: string;
  framework: FrameworkId;
  name: string;
  summary: string;
  promptfooKey: string;
  url: string;
}

const LLM_URL = 'https://genai.owasp.org/llm-top-10/';
const AGENTIC_URL = 'https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications/';

export const OWASP_LLM: Risk[] = [
  ['LLM01', 'Prompt Injection', 'User or third-party input changes the model’s behaviour against the intent of its instructions, directly or through content it reads.'],
  ['LLM02', 'Sensitive Information Disclosure', 'The application reveals personal data, credentials, business data or training data through its answers.'],
  ['LLM03', 'Supply Chain', 'Models, datasets, adapters, plugins or providers you depend on are compromised, outdated or tampered with.'],
  ['LLM04', 'Data and Model Poisoning', 'Training, fine-tuning or retrieval data is manipulated to plant bias, backdoors or wrong behaviour.'],
  ['LLM05', 'Improper Output Handling', 'Model output reaches browsers, shells, databases or other systems without validation or encoding.'],
  ['LLM06', 'Excessive Agency', 'The application can act through tools with more functionality, permissions or autonomy than it needs.'],
  ['LLM07', 'System Prompt Leakage', 'Instructions, secrets or internal rules placed in the system prompt can be extracted by users.'],
  ['LLM08', 'Vector and Embedding Weaknesses', 'Retrieval pipelines leak across tenants, accept poisoned documents or expose embeddings.'],
  ['LLM09', 'Misinformation', 'The model produces false or unsupported content that people or systems trust and act on.'],
  ['LLM10', 'Unbounded Consumption', 'Inputs drive excessive cost, latency or resource use, from denial of service to model extraction.'],
].map(([id, name, summary], i) => ({
  id,
  framework: 'owasp-llm' as const,
  name,
  summary,
  promptfooKey: `owasp:llm:${String(i + 1).padStart(2, '0')}`,
  url: LLM_URL,
}));

export const OWASP_AGENTIC: Risk[] = [
  ['ASI01', 'Agent Goal Hijack', 'An attacker redirects what the agent is trying to achieve through injected instructions or manipulated context.'],
  ['ASI02', 'Tool Misuse and Exploitation', 'The agent uses legitimate tools in unsafe ways, or attackers abuse the tools it can reach.'],
  ['ASI03', 'Identity and Privilege Abuse', 'The agent inherits, escalates or lends credentials and permissions beyond what the task needs.'],
  ['ASI04', 'Agentic Supply Chain Vulnerabilities', 'Third-party tools, MCP servers, agents or prompts loaded at runtime are malicious or compromised.'],
  ['ASI05', 'Unexpected Code Execution', 'The agent generates or runs code, commands or queries that lead to execution the operator did not intend.'],
  ['ASI06', 'Memory and Context Poisoning', 'Persistent memory or retrieved context is seeded with content that steers future decisions.'],
  ['ASI07', 'Insecure Inter-Agent Communication', 'Messages between agents can be spoofed, intercepted or used to inject instructions.'],
  ['ASI08', 'Cascading Failures', 'One faulty or compromised step propagates through chained agents and automated actions.'],
  ['ASI09', 'Human-Agent Trust Exploitation', 'The agent persuades or misleads people into approving harmful actions or trusting wrong output.'],
  ['ASI10', 'Rogue Agents', 'An agent drifts from its intended behaviour or acts autonomously against its principals.'],
].map(([id, name, summary]) => ({
  id,
  framework: 'owasp-agentic' as const,
  name,
  summary,
  promptfooKey: `owasp:agentic:${id.toLowerCase()}`,
  url: AGENTIC_URL,
}));

export const ALL_RISKS: Risk[] = [...OWASP_LLM, ...OWASP_AGENTIC];
export const RISK_BY_ID = new Map(ALL_RISKS.map((r) => [r.id, r]));

export const FRAMEWORK_LABEL: Record<FrameworkId, string> = {
  'owasp-llm': 'OWASP Top 10 for LLM Applications 2025',
  'owasp-agentic': 'OWASP Top 10 for Agentic Applications',
};
