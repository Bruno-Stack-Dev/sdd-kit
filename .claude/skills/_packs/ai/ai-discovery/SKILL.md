---
name: ai-discovery
description: "Conduz o bloco de IA do discovery quando o PRODUTO usa LLM, agentes, RAG, memória ou modelo local: faz as perguntas certas, preenche o bloco ai: da config e decide quais artefatos AI-* gerar (só os necessários). Acione quando: o discovery ou o /sdd-init detectar uso de IA (sdd ai detect), o usuário disser que o produto terá chatbot, assistente, agente, busca semântica, RAG, geração de texto ou classificação por modelo. Não acione para o uso de IA no desenvolvimento (o próprio Claude Code) — só para IA dentro do produto."
license: MIT
metadata:
  sdd-pack: "ai"
  sdd-version: "3.0.0"
---

# ai-discovery — bloco de IA do discovery

**`sdd`** = a CLI do kit (`node scripts/sdd.mjs` no motor; no projeto, o caminho do `/sdd-init`).

Método comum a todo o pack: [AVALIACAO-DE-TECNOLOGIA.md](../_ai-references/AVALIACAO-DE-TECNOLOGIA.md).

## Quando entra

- No discovery (Bloco 3 em diante), se o produto usa IA; ou no brownfield, se
  `sdd ai detect --json` mostrar `uses_ai: true` (sinais em dependências do projeto).
- Os sinais do `ai detect` são **OBSERVED**; o que o usuário diz que quer é **INTENDED**. Registre
  divergências (ex.: "o código chama dois provedores, a intenção declarada é um só").

## Perguntas (uma rodada, só os gaps)

Não pergunte o que já está no discovery. Agrupe:

1. **Problema e risco** — o que a IA faz no produto? Quem usa o resultado? O que acontece se ela
   errar (informativo, sugestão revisada por humano, ação com efeito colateral, irreversível)?
2. **Precisa mesmo de IA / de agente?** — existe solução determinística? O fluxo é conhecido de
   antemão (workflow) ou o modelo precisa decidir passos e ferramentas (agente)?
3. **Modelos** — provedor em nuvem, modelo local/self-hosted, ou híbrido? Restrições de custo,
   latência, volume, disponibilidade offline?
4. **Conhecimento** — responde sobre documentos próprios (RAG)? Quais fontes, tamanho, frequência de
   atualização, permissões por documento?
5. **Memória** — precisa lembrar entre mensagens (sessão) ou entre sessões (longo prazo)? De quem é
   a memória e por quanto tempo fica?
6. **Saída estruturada e ferramentas** — a saída alimenta código (JSON, classificação, extração)?
   O modelo chama ferramentas/APIs? Quais têm efeito colateral?
7. **Dados** — há PII ou dado sensível? Residência de dados? O provedor pode reter/treinar com os
   dados? Retenção de prompts e respostas? Base legal (LGPD) e consentimento?
8. **Qualidade** — como saberemos que está bom? Existe conjunto de exemplos com resposta esperada?
   Quem define "bom"?
9. **Segurança** — entrada vem de usuários não confiáveis ou de documentos externos (prompt
   injection indireta)? Que ações o modelo pode disparar sem humano?
10. **Operação** — orçamento mensal, SLO de latência, observabilidade exigida, quem responde a
    incidente de IA (resposta ofensiva, vazamento, custo disparado)?

Indefinido fica `<TODO>` — nunca invente.

## Saídas

1. **Bloco `ai:` da config** (`sdd.config.yaml`; o schema é livre, estas chaves são a convenção):

   ```yaml
   ai:
     llm: cloud            # cloud | local | hybrid | none
     agents: workflow      # none | workflow | single-agent | multi-agent
     rag: vector           # none | vector | hybrid | graph
     memory: session       # none | session | long-term
     structured_output: true
     tools_with_side_effects: []   # ferramentas que exigem gate humano
     pii: true
     data_residency: "<TODO>"
     risk: suggestion      # informative | suggestion | side-effect | irreversible
   ```

   Depois: `sdd config validate` e `sdd config render`. Adicione `ai` em `integrations.packs`.
   Ações com efeito colateral do modelo entram também em `human_gates`.

2. **Artefatos AI-* — só os necessários** (templates em `../_ai-templates/`):

   | Artefato | Gere quando |
   |----------|-------------|
   | `AI-ARCHITECTURE.md` | sempre que o produto usa IA |
   | `AI-MODEL-STRATEGY.md` | sempre que o produto usa IA |
   | `AI-EVALS.md` | sempre que o produto usa IA |
   | `AI-SECURITY.md` | sempre que o produto usa IA |
   | `AI-DATA-GOVERNANCE.md` | há PII, dado sensível, residência ou retenção a decidir |
   | `AI-RAG.md` | `rag` ≠ `none` |
   | `AI-MEMORY.md` | `memory` ≠ `none` ou há agentes com estado |
   | `AI-OBSERVABILITY.md` | agentes, ferramentas, custo relevante ou SLO de latência |

   `sdd ai detect --json` sugere a lista a partir das dependências; a decisão final é sua com o
   usuário. Grave em `specs/discovery/`.

3. **Próximas skills** — decisões abertas viram trabalho das skills do pack:
   `ai-architecture-evaluator` (agente × workflow, framework, protocolos), `ai-model-strategy`,
   `ai-rag-memory-designer`, `ai-structured-output-designer`, `ai-evals-designer`,
   `ai-security-reviewer`, `ai-observability-governance`. Cada decisão relevante termina em ADR.

## Regras

- Não escolha framework, modelo ou banco vetorial no discovery — registre requisitos e drivers;
  a escolha acontece nas skills de avaliação, com documentação atual e ADR.
- Não instale nada. O kit não traz nenhuma dependência de IA.
