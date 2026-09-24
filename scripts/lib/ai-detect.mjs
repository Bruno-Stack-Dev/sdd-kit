// Detecta se o PRODUTO usa IA (LLM, agentes, RAG, memória, serving local) por dependências e
// imports — para o /sdd-init sugerir o pack `ai` e só os artefatos AI-* necessários.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { manifestDependencies } from './manifests.mjs';

// categoria → sinais (nomes de pacote/módulo). Detecção, não recomendação.
const SIGNALS = {
  llm: ['anthropic', '@anthropic-ai/sdk', 'openai', 'google-genai', '@google/genai', 'google-generativeai', 'mistralai', 'cohere', 'groq', 'ollama', 'litellm', '@ai-sdk/', 'ai'],
  agents: ['@anthropic-ai/claude-agent-sdk', 'claude-agent-sdk', 'langgraph', '@langchain/langgraph', 'pydantic-ai', 'pydantic_ai', 'google-adk', 'agent-framework', 'strands-agents', 'agno', 'crewai', 'autogen'],
  rag: ['langchain', 'llama-index', 'llama_index', 'llamaindex', 'ragflow', 'haystack', 'qdrant-client', '@qdrant/js-client-rest', 'pinecone', 'chromadb', 'weaviate', 'pgvector', 'faiss', 'lancedb', 'milvus'],
  memory: ['mem0', 'mem0ai', 'letta', 'cognee', 'graphiti', 'graphiti-core', 'zep'],
  structured_output: ['instructor', 'baml', 'outlines', 'xgrammar', 'zod-to-json-schema'],
  optimization: ['dspy', 'dspy-ai'],
  serving: ['vllm', 'sglang', 'llama-cpp-python', 'llama.cpp', 'transformers', 'text-generation-inference'],
  protocols: ['@modelcontextprotocol/sdk', 'mcp', 'a2a-sdk', '@ag-ui/', 'ag-ui'],
  evals_guardrails: ['promptfoo', 'garak', 'nemoguardrails', 'guardrails-ai', 'ragas', 'deepeval', 'arize-phoenix', 'langfuse', 'opentelemetry'],
  sandbox: ['e2b', '@e2b/code-interpreter', 'e2b-code-interpreter'],
};

function manifestDeps(root) {
  return new Set(manifestDependencies(root).flatMap((m) => m.deps));
}

export function detectAi(root) {
  const deps = manifestDeps(root);
  const found = {};
  for (const [cat, signals] of Object.entries(SIGNALS)) {
    const hits = [...deps].filter((d) => signals.some((s) => (s.endsWith('/') ? d.startsWith(s) : d === s)));
    if (hits.length) found[cat] = hits.sort();
  }
  // `ai` sozinho (Vercel AI SDK) é ambíguo; só conta com outro sinal de LLM ou de agentes.
  if (found.llm?.length === 1 && found.llm[0] === 'ai' && !found.agents) delete found.llm;
  const usesAi = Boolean(found.llm || found.agents || found.rag || found.memory || found.serving);
  const artifacts = ['AI-ARCHITECTURE', 'AI-MODEL-STRATEGY', 'AI-EVALS', 'AI-SECURITY', 'AI-DATA-GOVERNANCE'];
  if (found.rag) artifacts.push('AI-RAG');
  if (found.memory || found.agents) artifacts.push('AI-MEMORY');
  if (found.evals_guardrails?.some((d) => /phoenix|langfuse|opentelemetry/.test(d)) || found.agents) artifacts.push('AI-OBSERVABILITY');
  return { uses_ai: usesAi, signals: found, suggested_artifacts: usesAi ? [...new Set(artifacts)] : [], pack: usesAi ? 'ai' : null };
}

export function hasAiConfig(root) {
  const f = join(root, 'sdd.config.yaml');
  return existsSync(f) && /^ai:/m.test(readFileSync(f, 'utf8'));
}
