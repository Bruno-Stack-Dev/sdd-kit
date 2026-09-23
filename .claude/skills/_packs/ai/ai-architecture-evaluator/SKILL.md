---
name: ai-architecture-evaluator
description: "Avalia a arquitetura de uma aplicação de IA: workflow determinístico × agente único × multiagente, escolha (ou não) de framework de agentes e de protocolos de interoperabilidade (MCP, A2A, AG-UI, ACP), com critérios explícitos, documentação atual verificada, comparação de alternativas e ADR. Acione quando pedirem: qual framework de agentes usar, se precisa de agente, como orquestrar agentes, como expor ferramentas ao modelo, como integrar agentes entre sistemas ou com a UI. Não acione para escolha de modelo (ai-model-strategy) nem de RAG/memória (ai-rag-memory-designer)."
license: MIT
metadata:
  sdd-pack: "ai"
  sdd-version: "3.0.0"
---

# ai-architecture-evaluator

Método obrigatório: [AVALIACAO-DE-TECNOLOGIA.md](../_ai-references/AVALIACAO-DE-TECNOLOGIA.md).
Saída: `specs/discovery/AI-ARCHITECTURE.md` (← `../_ai-templates/AI-ARCHITECTURE.md`) + ADR(s).

## Entradas

- `specs/discovery/` (VISAO, REQUISITOS, ARQUITETURA) e o bloco `ai:` da config.
- Restrições da config: `human_gates`, `forbidden_patterns`, `stack`.

## Passo 1 — Forma do sistema (antes de framework)

Classifique cada capacidade de IA do produto:

| Forma | Quando | Custo de erro |
|-------|--------|---------------|
| Chamada única | transformação/classificação/extração com entrada e saída claras | baixo; fácil de avaliar |
| Workflow (cadeia, roteamento, paralelização, avaliador-otimizador) | passos conhecidos de antemão | médio; cada passo testável |
| Agente único com ferramentas | caminho desconhecido, ferramentas bem definidas | alto; exige limites e gates |
| Multiagente | subproblemas realmente independentes ou contextos que não cabem juntos | o mais alto; custo e depuração crescem |

Escolha a forma **mais simples** que atende. Justifique por escrito cada subida de nível.

## Passo 2 — Framework (ou não)

Alternativas mínimas a comparar: **(a) SDK oficial do provedor + código próprio** e **(b) um ou mais
frameworks**. Exemplos de candidatos a verificar (não é recomendação; o ecossistema muda):
SDKs de agentes dos próprios provedores, LangGraph, PydanticAI, Google ADK, Agno, frameworks
multiagente. Procure também candidatos novos.

Critérios específicos, além dos gerais do método:

- **Controle do loop**: dá para inspecionar e interromper cada passo? Checkpoint e retomada?
- **Estado**: onde fica o estado do agente? Persistível? Compatível com o event log/ADR do projeto?
- **Ferramentas**: definição tipada? Validação de argumentos? Suporte a MCP?
- **Human-in-the-loop**: suporte nativo a pausa para aprovação (mapeia para `human_gates`)?
- **Portabilidade de modelo**: troca de provedor sem reescrever?
- **Observabilidade**: traces por passo/ferramenta, exporta OTel?
- **Testabilidade**: dá para substituir o modelo por fake em teste unitário?

## Passo 3 — Protocolos

Decida por necessidade, não por moda. Verifique a versão atual de cada especificação:

- **MCP** — expor ferramentas/recursos/prompts a clientes de modelo. Útil quando as mesmas
  ferramentas servem a vários clientes/agentes. Riscos: servidores de terceiros (tool poisoning,
  permissões amplas) — aplique allowlist e pin como o kit faz (`docs/mcp/`).
- **A2A** — comunicação entre agentes de sistemas/organizações diferentes. Só se houver agentes
  externos reais para conversar.
- **AG-UI** — streaming de eventos agente ↔ interface (estado, ferramentas, aprovação na UI).
  Considere quando a UI precisa acompanhar o agente em tempo real.
- **ACP** — o nome designa mais de um protocolo (ex.: comunicação entre agentes; integração
  editor ↔ agente de código). Confirme **qual** está em discussão e o estado atual da
  especificação antes de avaliar.

Para cada protocolo adotado, registre versão da especificação, SDK usado e o limite de confiança
(quem é confiável de cada lado).

## Passo 4 — Limites e gates

- Liste as ferramentas do modelo com efeito colateral e o gate de cada uma (humano, política,
  limite de valor/volume). Ações irreversíveis sem gate humano são **bloqueio**.
- Menor privilégio: cada agente só com as ferramentas de que precisa; credenciais por ferramenta,
  nunca no prompt.
- Orçamento por execução: máximo de passos, tokens e tempo.

## Passo 5 — Registrar

Preencha `AI-ARCHITECTURE.md` (forma, componentes, fluxo, limites de confiança, alternativas e
critérios com evidência datada) e um ADR por decisão cara de reverter (forma, framework,
protocolo). Inclua gatilhos de reavaliação. O `@agente-arquiteto-guardian` fiscaliza os ADRs
aceitos — escreva regras verificáveis ("nenhuma ferramenta com escrita fora de `tools/`",
"toda chamada de modelo passa por `ai/client`").

## Qualidade

- Mais de uma alternativa, incluindo a mínima; nenhuma afirmação de capacidade sem fonte e data.
- A forma escolhida é a mais simples que atende, com justificativa para cada nível acima.
- Gates de efeito colateral mapeados para `human_gates` da config.
