---
adr-id: ADR-0016
titulo: Pack ai ensina critérios e exige evidência atual; nenhum framework de IA no core
status: aceito
data: 2026-09-23
---

# ADR-0016: Pack `ai` por critérios, não por tabela de recomendação

## Contexto
Produtos que usam LLM, agentes, RAG ou memória precisam de discovery, avaliação, segurança e
governança específicos. O ecossistema (frameworks de agentes, protocolos MCP/A2A/AG-UI/ACP,
memória, structured output, serving, red team) muda em semanas: uma tabela "use X para Y" dentro do
kit envelheceria antes do próximo release e induziria decisões sem evidência.

## Decisão
- Novo pack opcional `ai` (`.claude/skills/_packs/ai/`, plugin `sdd-ai`), **conteúdo próprio do
  kit** (MIT, `trust: core` no `skills.lock.json`), sem scripts: 8 skills (`ai-discovery`,
  `ai-architecture-evaluator`, `ai-model-strategy`, `ai-rag-memory-designer`,
  `ai-structured-output-designer`, `ai-evals-designer`, `ai-security-reviewer`,
  `ai-observability-governance`), templates `AI-*` e um método comum
  (`_ai-references/AVALIACAO-DE-TECNOLOGIA.md`).
- O método exige: problema antes da tecnologia (precisa de IA? de agente?), comparação com a
  **opção mínima** (SDK oficial + código próprio), **documentação atual verificada** com versão e
  data (Context7 quando o perfil MCP estiver ativo), critérios ponderados pelos drivers do
  projeto, spike com eval quando a decisão é cara de reverter e **ADR** com gatilhos de
  reavaliação. Nomes de ferramentas aparecem só como "candidatos a verificar".
- Artefatos `AI-*` são gerados **só quando necessários** (tabela de condições em `ai-discovery`).
- `sdd ai detect` detecta IA no produto por dependências (OBSERVED) e sugere artefatos; o doctor
  avisa quando o produto usa IA sem o pack e quando um pack declarado em `integrations.packs` não
  está ativo. Nunca falha por isso.
- Evals das skills do pack entram na suíte com modelo (`eval export-promptfoo` passa a ler
  `_packs/*/*/evals/evals.json`).
- Nenhuma dependência de IA (PydanticAI, LangGraph, ADK, Agno, Cognee, Graphiti, RAGFlow, Letta,
  Mem0, XGrammar, BAML, DSPy, vLLM, SGLang, llama.cpp, E2B, NeMo, Garak, Phoenix…) entra no core.

## Alternativas consideradas
- **Tabela de recomendação por caso de uso** — rejeitada: envelhece rápido e dispensa evidência.
- **Integrações prontas (SDKs no kit)** — rejeitada: acopla o motor a frameworks e amplia a
  superfície de supply chain; o kit é agnóstico de stack.
- **Nada específico de IA** — rejeitada: riscos próprios (prompt injection, agência excessiva,
  dados em prompts/índices, avaliação probabilística) ficariam sem guia.

## Consequências
- Decisões de IA dos projetos ficam rastreáveis (ADR + evidência datada) e reavaliáveis.
- O pack exige mais trabalho do usuário do que uma tabela; é o custo aceito de decidir com dados.
- Avaliação dos gatilhos do `ai detect` é heurística (lista de pacotes); falso negativo só omite
  uma sugestão.
