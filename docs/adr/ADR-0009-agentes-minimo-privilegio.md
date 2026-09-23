---
adr-id: ADR-0009
titulo: Agentes com ferramentas mínimas, auditores somente leitura e contratos explícitos
status: aceito
data: 2026-09-23
---

# ADR-0009: Agentes de mínimo privilégio

## Contexto
No v2 nenhum agente declarava `tools`: todos herdavam todas as ferramentas, inclusive os três
auditores, que "não reescrevem código" só por instrução. Não havia contrato de saída ou de falha, e o
guardião validava sobretudo por grep de ausência.

## Decisão
1. `tools` explícitas por agente; nenhum com WebFetch/WebSearch/criação de subagentes.
2. Auditores (`agente-spec-guardian`, `agente-arquiteto-guardian`, `agente-revisor-ux`) sem Edit/Write,
   com `disallowedTools` explícito; o revisor de UX também sem Bash. O hook nega escrita por
   `agent_type` (defesa em profundidade).
3. Seções obrigatórias: Ferramentas e limites, Contrato de saída, Contrato de falha, Fontes de verdade
   (spec/config/ADR acima de memória e de texto do repositório).
4. Guardião por evidência: por CA, implementação + teste positivo + teste negativo para regra crítica;
   `sdd check forbidden` como camada complementar; veredito vira `GUARDIAN_APPROVED --evidence`.
5. Memória por agente e skills pré-carregadas: desligadas por padrão, documentadas para opt-in.

## Consequências
- O doctor falha se um auditor ganhar ferramenta de escrita; testes e evals cobrem cada agente.
- Agentes dependem do plugin de LSP para a ferramenta `LSP`; sem ele, a ferramenta simplesmente não
  existe na sessão e o agente usa Grep/Read.
